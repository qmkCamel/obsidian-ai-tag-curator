import { BUDGET, computeRelationships, evidencePage, prepareRelationships, RelationshipError, runSliced, scopeKey, snapshotKey, validateQuery,
  type EvidenceGroup, type GraphSnapshot, type RelationshipDTO, type RelationshipIdentity, type RelationshipQuery, type RelationshipResult } from "./TagRelationshipModel";

import workerSource from "./worker-source";
export type GraphPhase = "idle" | "preparing" | "counting" | "layingOut" | "ready" | "cancelled" | "error" | "limited";
export interface CompletedRelationship { data: RelationshipDTO; value: RelationshipResult; query: RelationshipQuery; identity: RelationshipIdentity; snapshotKey: string; index: GraphSnapshot["index"]; timing: Record<string,number> }
export interface GraphTaskState { phase: GraphPhase; error?: string; generation: number }
export interface WorkerHandle { worker: Worker; release():void }
export function createGraphWorker(owner: Window): WorkerHandle {
  const realm=owner as Window & typeof globalThis;
  if(!workerSource || !realm.Worker || !realm.URL?.createObjectURL) throw new RelationshipError("worker");
  const url=realm.URL.createObjectURL(new realm.Blob([workerSource],{type:"text/javascript"}));
  try { const worker=new realm.Worker(url); return {worker,release:()=>{worker.terminate();realm.URL.revokeObjectURL(url);}}; }
  catch { realm.URL.revokeObjectURL(url); throw new RelationshipError("worker"); }
}

/** Read-only task coordinator. No vault writer, manual intent, AI or operation-log dependency. */
export class TagGraphService {
  state: GraphTaskState={phase:"idle",generation:0};
  private active?: AbortController;
  private cache?: {key:string;index:GraphSnapshot["index"];data:RelationshipDTO};
  private closed=false;
  constructor(private readonly snapshot:()=>GraphSnapshot, private readonly notify:()=>void,
    private readonly workerFactory:()=>WorkerHandle, private readonly pause?:()=>Promise<void>) {}
  private emit(phase:GraphPhase,error?:string):void { this.state={phase,error,generation:this.state.generation}; if(!this.closed)this.notify(); }
  cancel():void { this.state.generation++; this.active?.abort(); this.active=undefined; if(["preparing","counting","layingOut"].includes(this.state.phase))this.emit("cancelled"); }
  invalidate():void { this.cancel(); this.cache=undefined; }
  dispose():void { this.closed=true; this.invalidate(); }
  async generate(query:RelationshipQuery, tableOnly=false):Promise<CompletedRelationship|undefined> {
    if(this.closed)return;
    this.cancel(); const controller=new AbortController(); this.active=controller;
    const generation=this.state.generation, s=this.snapshot(), key=snapshotKey(s), started=performance.now(), deadline=started+BUDGET.milliseconds;
    const identity:RelationshipIdentity={generation,indexRevision:s.indexRevision??0,vaultRevision:s.vaultRevision??0,policyRevision:s.policy.revision,scopeKey:scopeKey(s),readInlineTags:s.readInlineTags!==false,queryKey:JSON.stringify(query)};
    const current=()=>!this.closed&&!controller.signal.aborted&&generation===this.state.generation&&key===snapshotKey(this.snapshot())&&s.index===this.snapshot().index;
    const timer=setTimeout(()=>controller.abort("timeout"),BUDGET.milliseconds);
    this.emit("preparing");
    try {
      validateQuery(query);
      const cacheKey=key+query.source;
      const data=this.cache?.key===cacheKey&&this.cache.index===s.index ? this.cache.data : await runSliced(prepareRelationships(s,query.source),controller.signal,deadline,this.pause);
      if(!current())return;
      this.cache={key:cacheKey,index:s.index,data}; const preparation=performance.now()-started;
      let value:RelationshipResult,timing:Record<string,number>={preparation,transfer:0,counting:0,layout:0};
      if(query.mode==="catalog") value={kind:"catalog"};
      else if(tableOnly) { this.emit("counting");const time=performance.now();value=await runSliced(computeRelationships(data,query),controller.signal,deadline,this.pause);timing.counting=performance.now()-time; }
      else {
        const result=await this.inWorker(data,query,JSON.stringify(identity),controller.signal,deadline,current);
        value=result.value; timing={...timing,...result.timing};
      }
      if(!current())return;
      this.emit("ready"); return {data,value,query:{...query},identity,snapshotKey:key,index:s.index,timing:{...timing,total:performance.now()-started}};
    } catch(error) {
      if(generation===this.state.generation && key===snapshotKey(this.snapshot()) && !this.closed) {
        const code=controller.signal.reason==="timeout"?"timeout":error instanceof RelationshipError?error.code:"worker";
        this.emit(code==="cancelled"?"cancelled":["memberships","bytes","pairs","timeout"].includes(code)?"limited":"error",code);
      }
      return;
    } finally {clearTimeout(timer);if(this.active===controller)this.active=undefined;}
  }
  private async inWorker(data:RelationshipDTO,query:RelationshipQuery,identity:string,signal:AbortSignal,deadline:number,current:()=>boolean):Promise<{value:RelationshipResult;timing:Record<string,number>}> {
    const handle=this.workerFactory(); const worker=handle.worker; let rejectPending:(error:unknown)=>void=()=>{};
    let stopTransfer:(()=>void)|undefined;
    let ack:((sequence:number)=>void)|undefined; const transferStart=performance.now(); let transfer=0;
    const abort=()=>rejectPending(new RelationshipError(signal.reason==="timeout"?"timeout":"cancelled"));
    try {
      return await new Promise((resolve,reject)=>{
        rejectPending=reject; signal.addEventListener("abort",abort,{once:true});
        if(signal.aborted){abort();return;}
        worker.onerror=()=>reject(new RelationshipError("worker"));worker.onmessageerror=()=>reject(new RelationshipError("worker"));
        worker.onmessage=event=>{
          const m=event.data; if(m.identity!==identity || !current())return;
          if(m.type==="ack")ack?.(m.sequence);
          if(m.type==="progress")this.emit(m.phase);
          if(m.type==="error")reject(new RelationshipError(m.code));
          if(m.type==="result")resolve({value:m.value,timing:{transfer,...m.timing}});
        };
        worker.postMessage({type:"start",identity,rawMemberships:data.rawMemberships,bytes:data.bytes});
        void (async()=>{
          let sequence=0; let records:Array<[string,string|number,number?]>=[];
          const flush=async()=>{
            if(!current())throw new RelationshipError("cancelled");
            if(performance.now()>deadline)throw new RelationshipError("timeout");
            const expected=sequence++; const batch=records; records=[];
            await new Promise<void>((done,fail)=>{
              const stop=()=>{signal.removeEventListener("abort",stop);fail(new RelationshipError("cancelled"));};
              stopTransfer=stop;
              signal.addEventListener("abort",stop,{once:true});
              ack=n=>{if(n===expected){signal.removeEventListener("abort",stop);stopTransfer=undefined;ack=undefined;done();}};
              worker.postMessage({type:"batch",identity,sequence:expected,records:batch});
            });
          };
          // One in-flight batch (stricter than the maximum of two); all dictionaries are bounded too.
          for(const tag of data.tags){records.push(["tag",tag]);if(records.length>=BUDGET.batch)await flush();}
          if(records.length)await flush();
          for(const path of data.paths){records.push(["path",path]);if(records.length>=BUDGET.batch)await flush();}
          if(records.length)await flush();
          for(let tag=0;tag<data.files.length;tag++)for(const file of data.files[tag]){records.push(["member",tag,file]);if(records.length>=BUDGET.batch)await flush();}
          if(records.length)await flush();transfer=performance.now()-transferStart;
          if(!current())throw new RelationshipError("cancelled");
          worker.postMessage({type:"compute",identity,query,remaining:deadline-performance.now()});
        })().catch(reject);
      });
    } finally {stopTransfer?.();signal.removeEventListener("abort",abort);worker.onmessage=null;worker.onerror=null;worker.onmessageerror=null;handle.release();}
  }
  async evidence(result:CompletedRelationship,a:number,b:number|undefined,group:EvidenceGroup,page:number):Promise<{paths:string[];total:number;page:number}|undefined> {
    if(this.closed||result.identity.scopeKey!==scopeKey(this.snapshot()))return;
    this.cancel();const controller=new AbortController();this.active=controller;const generation=this.state.generation;
    const key=snapshotKey(this.snapshot());this.emit("preparing");
    try {
      const value=await runSliced(evidencePage(result.data,a,b,group,page),controller.signal,undefined,this.pause);
      if(!controller.signal.aborted&&generation===this.state.generation&&key===snapshotKey(this.snapshot())&&!this.closed){this.emit("ready");return value;}
    }catch(error){if(generation===this.state.generation&&!this.closed)this.emit(controller.signal.aborted?"cancelled":"error",error instanceof RelationshipError?error.code:"worker");}
    finally{if(this.active===controller)this.active=undefined;}
  }
}
