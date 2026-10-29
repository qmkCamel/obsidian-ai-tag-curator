import { TagManagementView,type TagManagementState,type TagManagementAdapter } from "../../src/management/TagManagementView";
import { productFixture,seededFixture,denseFixture,indexOf } from "../fixtures/tag-graph-fixtures";
import { TagGraphService } from "../../src/graph/TagGraphService";
import { DEFAULT_QUERY } from "../../src/graph/TagRelationshipModel";

const listeners=new Set<()=>void>(),calls:Array<[string,unknown]>=[];
let state:TagManagementState,view:TagManagementView;
const adapter:TagManagementAdapter={getState:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},commands:{
  refresh:async()=>{update({freshness:"refreshing"});await new Promise(r=>setTimeout(r,150));update({index:{...state.index!,updatedAt:"2026-10-29T00:00:00.000Z"},indexRevision:(state.indexRevision??0)+1,freshness:"ready"});},cancelRefresh:()=>update({freshness:"stale"}),
  saveScopeAndPolicy:async(scope,policy)=>update({scope,policy}),startManual:async(intent)=>{calls.push(["startManual",intent]);},
  openFile:async(path)=>{if(state.missingPaths?.includes(path))throw new Error("missing");calls.push(["openFile",path]);},undo:async(id)=>{calls.push(["undo",id]);},recover:async(id)=>{calls.push(["recover",id]);},openGraphSettings:()=>{calls.push(["settings",null]);}
}};
function update(patch:Partial<TagManagementState>):void{state={...state,...patch};for(const fn of listeners)fn();}
async function mount(options:{size?:1000|10000;dense?:boolean;empty?:boolean;language?:string;dark?:boolean}={}):Promise<void>{
  if(view)await view.onClose();document.querySelector("#preview")!.replaceChildren();calls.length=0;
  document.body.className=options.dark?"theme-dark":"theme-light";document.documentElement.lang=options.language??"en";
  state={index:options.size?seededFixture(options.size):options.dense?denseFixture():options.empty?indexOf([]):productFixture(),freshness:"ready",indexRevision:1,vaultRevision:1,readInlineTags:true,
    scope:{include:[{path:"Project",recursive:true}]},policy:{schemaVersion:1,revision:1,excludedFolders:["Excluded"],protectedTags:[{tag:"topic",mode:"exact"}]},history:[]};
  if(options.size||options.dense)state.scope={include:[{path:"",recursive:true}]};
  view=new TagManagementView({app:{}} as never,{adapter,language:options.language??"en"});await view.onOpen();view.openRelationships();
}
const originalWorker=window.Worker;let workerDelay=0,failWorker=false,activeWorkers=0,created=0,released=0;
// Instrument the real Worker transport; delay is injected only into this synthetic test entrypoint.
window.Worker=class extends originalWorker{
  private timers=new Set<ReturnType<typeof setTimeout>>();
  constructor(url:string|URL,options?:WorkerOptions){if(failWorker)throw new Error("fixture Worker fault");super(url,options);activeWorkers++;created++;}
  postMessage(message:unknown,options?:any):void{if((message as {type?:string}).type==="compute"&&workerDelay){const timer=setTimeout(()=>{this.timers.delete(timer);super.postMessage(message,options);},workerDelay);this.timers.add(timer);}else super.postMessage(message,options);}
  terminate():void{for(const timer of this.timers)clearTimeout(timer);this.timers.clear();super.terminate();activeWorkers--;released++;}
};
const createURL=URL.createObjectURL.bind(URL),revokeURL=URL.revokeObjectURL.bind(URL);const urls=new Set<string>();
URL.createObjectURL=blob=>{const url=createURL(blob);urls.add(url);return url;};URL.revokeObjectURL=url=>{urls.delete(url);revokeURL(url);};
const longTasks:number[]=[];new PerformanceObserver(list=>{for(const entry of list.getEntries())longTasks.push(entry.duration);}).observe({type:"longtask",buffered:true});
const fixture={mount,update,calls,state:()=>state,view:()=>view,close:()=>view.onClose(),fault:(fail:boolean,delay=0)=>{failWorker=fail;workerDelay=delay;},resources:()=>({activeWorkers,created,released,urls:urls.size,listeners:listeners.size}),longTasks,
  async benchmark(size:1000|10000){await mount({size});const panel=(view as any).graphPanel;while(panel.service.state.phase!=="ready")await new Promise(r=>setTimeout(r,10));const samples=[];
    for(let i=0;i<35;i++){panel.service.invalidate();const started=performance.now();await panel.generate({...DEFAULT_QUERY});const completed=performance.now();if(panel.service.state.phase!=="ready")throw new Error(panel.service.state.error??"benchmark failed");if(i>=5)samples.push({...panel.graph.timing,render:completed-started-panel.graph.timing.total,total:completed-started});}return {size,memberships:size*10,samples};},
  async slow(){workerDelay=1500;},
  async responsiveness(){
    await mount({size:10000});const panel=(view as any).graphPanel;while(panel.service.state.phase!=="ready")await new Promise(r=>setTimeout(r,10));
    const samples=[];workerDelay=1800;
    for(let i=0;i<35;i++){
      panel.service.invalidate();const start=performance.now();const task=panel.generate({...DEFAULT_QUERY});const feedback=performance.now()-start;
      while(!activeWorkers&&panel.serviceBusy())await new Promise(r=>setTimeout(r,1));
      if(!panel.serviceBusy())throw new Error("slow task was not running");
      const search=document.querySelector<HTMLInputElement>('[aria-label="Search all scoped tags"]')!,time=performance.now();search.focus();search.value="tag-";search.dispatchEvent(new Event("input",{bubbles:true}));await new Promise(requestAnimationFrame);const interaction=performance.now()-time;
      if(!panel.serviceBusy())throw new Error("interaction happened after completion");const cancelStart=performance.now();panel.service.cancel();await task;const cancel=performance.now()-cancelStart;
      if(i>=5)samples.push({feedback,interaction,cancel});
    }workerDelay=0;return samples;
  },
  metrics:()=>{const panel=(view as any).graphPanel;return {graph:panel?.graph?.value,query:panel?.graph?.query,comparison:panel?.comparison?.value,phase:panel?.service.state.phase,timing:panel?.graph?.timing};}
};
(window as unknown as {graphFixture:typeof fixture}).graphFixture=fixture;
await mount();
