import { describe,it,expect,vi } from "vitest";
import { TagGraphService,type WorkerHandle } from "../src/graph/TagGraphService";
import { DEFAULT_QUERY,RelationshipError,type RelationshipQuery } from "../src/graph/TagRelationshipModel";
import { handFixture,snapshot,seededFixture } from "./fixtures/tag-graph-fixtures";

class ControlledWorker {
  onmessage:((event:{data:unknown})=>void)|null=null;onerror:((event?:unknown)=>void)|null=null;onmessageerror:((event?:unknown)=>void)|null=null;
  messages:any[]=[];identity="";released=0;captured?:((event:{data:unknown})=>void)|null;
  postMessage(message:any):void{this.messages.push(message);this.identity=message.identity;if(message.type==="batch")queueMicrotask(()=>this.onmessage?.({data:{type:"ack",identity:this.identity,sequence:message.sequence}}));}
  send(message:Record<string,unknown>):void{this.onmessage?.({data:{identity:this.identity,...message}});}
  handle():WorkerHandle{return{worker:this as unknown as Worker,release:()=>{this.captured=this.onmessage;this.released++;}};}
}
const until=async(predicate:()=>boolean)=>{for(let i=0;i<300;i++){if(predicate())return;await new Promise(r=>setTimeout(r,2));}throw new Error("condition timed out");};
describe("bounded graph task coordinator",()=>{
  it("keeps the snapshot read-only and table fallback has the same exact values",async()=>{
    const state=snapshot(handFixture()),before=JSON.stringify(state),notify=vi.fn();
    const service=new TagGraphService(()=>state,notify,()=>{throw new RelationshipError("worker");});
    expect(await service.generate(DEFAULT_QUERY)).toBeUndefined();expect(service.state).toMatchObject({phase:"error",error:"worker"});
    const result=await service.generate(DEFAULT_QUERY,true);expect(result?.value.kind).toBe("graph");expect(JSON.stringify(state)).toBe(before);expect(notify).toHaveBeenCalled();service.dispose();
  });
  it("uses ack backpressure and releases the worker on a successful result",async()=>{
    const w=new ControlledWorker(),service=new TagGraphService(()=>snapshot(seeded),()=>{},()=>w.handle());
    const promise=service.generate(DEFAULT_QUERY);await until(()=>w.messages.some(m=>m.type==="compute"));
    expect(w.messages.filter(m=>m.type==="batch").every(m=>m.records.length<=4096)).toBe(true);
    const dtoText=JSON.stringify(w.messages);expect(dtoText).not.toContain("examples");expect(dtoText).not.toContain("namingSignals");
    w.send({type:"result",value:{kind:"catalog"},timing:{counting:1,layout:0}});expect((await promise)?.timing.counting).toBe(1);expect(w.released).toBe(1);service.dispose();
  });
  it("drops old progress, errors and coordinates after replacement",async()=>{
    const state=snapshot(handFixture()),workers:ControlledWorker[]=[];
    const service=new TagGraphService(()=>state,()=>{},()=>{const w=new ControlledWorker();workers.push(w);return w.handle();});
    const first=service.generate(DEFAULT_QUERY);await until(()=>!!workers[0]?.messages.some(m=>m.type==="compute"));const old=workers[0].onmessage!,identity=workers[0].identity;
    const second=service.generate({...DEFAULT_QUERY,threshold:1});await until(()=>!!workers[1]?.messages.some(m=>m.type==="compute"));workers[1].send({type:"result",value:{kind:"catalog"},timing:{}});
    expect(await first).toBeUndefined();expect(await second).toBeDefined();
    for(const type of ["progress","error","result"])old({data:{type,identity,phase:"counting",code:"worker",value:{nodes:["old"]}}});
    expect(service.state.phase).toBe("ready");expect(workers.map(w=>w.released)).toEqual([1,1]);service.dispose();
  });
  it("rejects same-index vault changes and cleans crashed/closed workers over 20 cycles",async()=>{
    const state=snapshot(handFixture());
    for(let i=0;i<20;i++){
      const w=new ControlledWorker(),service=new TagGraphService(()=>state,()=>{},()=>w.handle());
      const run=service.generate(DEFAULT_QUERY);await until(()=>w.messages.some(m=>m.type==="compute"));
      if(i===0){state.vaultRevision!++;w.send({type:"result",value:{kind:"catalog"},timing:{}});service.invalidate();}
      else if(i%2)w.onerror?.();else service.dispose();
      expect(await run).toBeUndefined();expect(w.released).toBe(1);expect(w.onmessage).toBeNull();service.dispose();
    }
  });
  it("cancels a preparation slice without waiting for all input and bounds the deadline",async()=>{
    const state=snapshot(seeded),service=new TagGraphService(()=>state,()=>{},()=>{throw new Error("must not start worker");},async()=>{service.cancel();});
    expect(await service.generate(DEFAULT_QUERY,true)).toBeUndefined();expect(service.state.phase).toBe("cancelled");service.dispose();
  });
  it("version-binds comparison and evidence groups; source changes never bypass provenance",async()=>{
    const state=snapshot(handFixture()),service=new TagGraphService(()=>state,()=>{},()=>{throw new Error("not used");});
    const q:RelationshipQuery={...DEFAULT_QUERY,mode:"compare",a:"ai",b:"python"};const result=await service.generate(q,true);
    expect(result?.value).toMatchObject({shared:2,onlyA:1,onlyB:1});
    const shared=service.evidence(result!,0,2,"shared",0),different=service.evidence(result!,0,2,"onlyA",0);
    expect(await shared).toBeUndefined();expect((await different)?.paths).toEqual(["3.md"]);
    state.readInlineTags=false;expect(await service.generate({...q,source:"inline"},true)).toBeUndefined();expect(service.state.error).toBe("source");service.dispose();
  });
  it("terminates an unresponsive worker at the whole-task deadline",async()=>{
    vi.useFakeTimers();
    try{const state=snapshot(handFixture()),w=new ControlledWorker(),service=new TagGraphService(()=>state,()=>{},()=>w.handle());
      const run=service.generate(DEFAULT_QUERY);await vi.advanceTimersByTimeAsync(10_001);expect(await run).toBeUndefined();expect(service.state).toMatchObject({phase:"limited",error:"timeout"});expect(w.released).toBe(1);service.dispose();
    }finally{vi.useRealTimers();}
  });
});
const seeded=seededFixture(10000);
