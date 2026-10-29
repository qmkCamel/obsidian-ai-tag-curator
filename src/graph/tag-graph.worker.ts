import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, type SimulationNodeDatum } from "d3-force";
import { BUDGET, computeRelationships, RelationshipError, runSliced, type RelationshipDTO, type RelationshipQuery } from "./TagRelationshipModel";

let data: RelationshipDTO = { tags:[], paths:[], files:[], rawMemberships:0, bytes:0 };
let identity = "";
const port = self as unknown as { onmessage: ((event: MessageEvent) => void) | null; postMessage(message: unknown): void };
port.onmessage = event => {
  const m = event.data;
  if (m.type === "start") { identity=m.identity; data={tags:[],paths:[],files:[],rawMemberships:m.rawMemberships,bytes:m.bytes}; return; }
  if (m.identity !== identity) return;
  if (m.type === "batch") {
    for (const record of m.records as Array<["tag"|"path"|"member",string|number,number?]>) {
      if(record[0]==="tag") { data.tags.push(record[1] as string); data.files.push([]); }
      else if(record[0]==="path") data.paths.push(record[1] as string);
      else data.files[record[1] as number].push(record[2]!);
    }
    port.postMessage({type:"ack",identity,sequence:m.sequence}); return;
  }
  if(m.type==="compute") void compute(m.query,m.remaining);
};
async function compute(query: RelationshipQuery, remaining: number): Promise<void> {
  const deadline=performance.now()+Math.min(remaining,BUDGET.milliseconds), signal=new AbortController().signal;
  try {
    port.postMessage({type:"progress",identity,phase:"counting"});
    const started=performance.now(), value=await runSliced(computeRelationships(data,query),signal,deadline);
    const counting=performance.now()-started; let layout=0;
    if(value.kind==="graph") {
      port.postMessage({type:"progress",identity,phase:"layingOut"}); const time=performance.now();
      const nodes=value.nodes.map(n=>({...n})) as Array<SimulationNodeDatum & typeof value.nodes[number]>;
      const links=value.edges.map(e=>({source:e.a,target:e.b})); let seed=42;
      const simulation=forceSimulation(nodes).stop().randomSource(()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296))
        .force("link",forceLink(links).id((n)=> (n as typeof nodes[number]).id).distance(85))
        .force("charge",forceManyBody().strength(-100)).force("center",forceCenter(0,0))
        .force("collision",forceCollide(18));
      try { for(let tick=0;tick<300;tick++) { if(performance.now()>deadline)throw new RelationshipError("timeout"); simulation.tick(); } }
      finally { simulation.stop(); }
      value.nodes=nodes.map(n=>({id:n.id,key:n.key,count:n.count,x:n.x,y:n.y})); layout=performance.now()-time;
    }
    port.postMessage({type:"result",identity,value,timing:{counting,layout}});
  } catch(error) { port.postMessage({type:"error",identity,code:error instanceof RelationshipError ? error.code : "worker"}); }
}
