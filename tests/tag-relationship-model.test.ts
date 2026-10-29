import { describe,it,expect } from "vitest";
import { DEFAULT_QUERY,prepareRelationships,computeRelationships,evidencePage,runSliced,RelationshipError,type RelationshipQuery,type GraphResult,type Comparison } from "../src/graph/TagRelationshipModel";
import { handFixture,indexOf,snapshot,denseFixture,seededFixture } from "./fixtures/tag-graph-fixtures";
function drain<T>(g:Generator<void,T>):T{for(;;){const r=g.next();if(r.done)return r.value;}}
const data=(index=handFixture())=>drain(prepareRelationships(snapshot(index),"all"));
const graph=(q:Partial<RelationshipQuery>={},d=data())=>drain(computeRelationships(d,{...DEFAULT_QUERY,...q})) as GraphResult;
describe("exact read-only tag relationships",()=>{
  it("matches the four-file hand calculation, stable order and duplicate sources",()=>{
    const index=handFixture();index.tags.ai.files.push({path:"1.md",count:999,sources:["inline","frontmatter"]});
    const before=JSON.stringify(index),d=data(index),g=graph({threshold:1,hierarchy:true},d);
    expect(g.nodes.map(n=>[n.key,n.count])).toEqual([["ai",3],["ai/tools",2],["python",3]]);
    expect(g.edges.filter(e=>e.type==="common").map(e=>[e.shared,e.jaccard])).toEqual([[2,2/3],[2,.5],[1,.25]]);
    expect(graph({},d).edges).toHaveLength(2);expect(g.edges.filter(e=>e.type==="hierarchy")).toHaveLength(1);expect(JSON.stringify(index)).toBe(before);
  });
  it("applies exact folder boundaries and provenance without counting metadata as inline",()=>{
    const s=snapshot(indexOf([{path:"Area/a.md",tags:["a"]},{path:"Area/a.md",tags:["b"],source:"inline"},{path:"Area/child/m.md",tags:["meta"],source:"metadata"},{path:"Area2/a.md",tags:["outside"]}]));
    s.scope={include:[{path:"Area",recursive:true}]};expect(drain(prepareRelationships(s,"inline")).tags).toEqual(["b"]);
    s.policy.excludedFolders=["Area/child"];expect(drain(prepareRelationships(s,"all")).tags).toEqual(["a","b"]);
    s.readInlineTags=false;expect(()=>drain(prepareRelationships(s,"inline"))).toThrow("source");
  });
  it.each([0,-1,1.5,NaN,Infinity])("rejects invalid threshold %s",threshold=>expect(()=>graph({threshold})).toThrow("threshold"));
  it("creates only real direct parents, even without shared files",()=>{
    const d=data(indexOf([{path:"a.md",tags:["ai"]},{path:"b.md",tags:["ai/tools"]},{path:"c.md",tags:["ai/missing/python"]}]));
    expect(graph({hierarchy:true},d).edges).toEqual([{id:"h-0-2",type:"hierarchy",a:0,b:2}]);
  });
  it("keeps exact counts with 250 tags in one file and limits edges after candidates",()=>{
    const d=data(indexOf([{path:"all.md",tags:Array.from({length:250},(_,i)=>`tag-${String(i).padStart(3,"0")}`)}]));
    const g=graph({threshold:1},d);expect(g.nodes).toHaveLength(200);expect(g.edges).toHaveLength(800);expect(g.candidateEdges).toBe(19900);expect(g.hiddenNodes).toBe(50);expect(g.hiddenEdges).toBe(19100);
    expect(g.edges.every(e=>e.type==="common"&&e.shared===1)).toBe(true);
    const reversed=indexOf([{path:"all.md",tags:[...d.tags].reverse()}]);expect(graph({threshold:1},data(reversed))).toEqual(g);
  });
  it("search-independent neighborhoods retain a low-frequency root and no-edge roots",()=>{
    const d=data(indexOf([...Array.from({length:210},(_,i)=>({path:`${i}.md`,tags:[`tag-${i}`,"hub"]})),{path:"rare.md",tags:["rare","hub"]}]));
    const g=graph({mode:"neighborhood",root:"#RARE",threshold:1},d);expect(g.nodes.map(n=>n.key)).toEqual(["hub","rare"]);
    expect(graph({mode:"neighborhood",root:"rare"},d).nodes.map(n=>n.key)).toEqual(["rare"]);expect(()=>graph({mode:"neighborhood",root:"missing"},d)).toThrow("root");
  });
  it("compares outside graph/threshold, including zero overlap, and rejects identical/missing endpoints",()=>{
    const d=data(indexOf([{path:"a.md",tags:["a"]},{path:"b.md",tags:["b"]}]));
    const c=drain(computeRelationships(d,{...DEFAULT_QUERY,mode:"compare",a:"a",b:"b"})) as Comparison;
    expect([c.shared,c.onlyA,c.onlyB,c.jaccard,c.coverageA,c.coverageB]).toEqual([0,1,1,0,0,0]);expect(graph({},d).edges).toEqual([]);
    expect(()=>drain(computeRelationships(d,{...DEFAULT_QUERY,mode:"compare",a:"#A",b:"a"}))).toThrow("pair");
    expect(()=>drain(computeRelationships(d,{...DEFAULT_QUERY,mode:"compare",a:"a",b:"gone"}))).toThrow("endpoint");
  });
  it("reports asymmetric coverage with disjoint, complete, stable paginated evidence",()=>{
    const d=data(indexOf(Array.from({length:133},(_,i)=>({path:`${String(i).padStart(3,"0")}.md`,tags:["a",...(i<10?["b"]:[])]}))));
    const c=drain(computeRelationships(d,{...DEFAULT_QUERY,mode:"compare",a:"a",b:"b"})) as Comparison;
    expect([c.shared,c.onlyA,c.onlyB,c.coverageB]).toEqual([10,123,0,1]);expect(c.coverageA).toBe(10/133);
    const pages=[0,1,2].map(p=>drain(evidencePage(d,0,1,"onlyA",p)));expect(pages.map(p=>p.paths.length)).toEqual([50,50,23]);expect(new Set(pages.flatMap(p=>p.paths)).size).toBe(123);
    const hundred=data(indexOf(Array.from({length:100},(_,i)=>({path:`${i}.md`,tags:["a",...(i<10?["b"]:[])]}))));
    const expected=drain(computeRelationships(hundred,{...DEFAULT_QUERY,mode:"compare",a:"a",b:"b"})) as Comparison;expect([expected.shared,expected.onlyA,expected.onlyB,expected.jaccard,expected.coverageA,expected.coverageB]).toEqual([10,90,0,.1,.1,1]);
  });
  it("supports prototype-like keys as plain data and never reads snippets",()=>{
    const index=indexOf([{path:"safe.md",tags:["__proto__","constructor","<script>"]}]);Object.defineProperty(index.tags.constructor,"examples",{get(){throw new Error("snippet read");}});
    expect(data(index).tags).toEqual(["<script>","__proto__","constructor"]);
  });
  it("stops exact dense counting at budget, including table fallback",()=>expect(()=>graph({},data(denseFixture()))).toThrow("pairs"));
  it("rejects raw memberships before filtered copies, and byte budget before oversized input",()=>{
    const index=indexOf([{path:"a.md",tags:["a"]}]);index.tags.a.files=Array(1_000_001).fill(index.tags.a.files[0]);expect(()=>data(index)).toThrow("memberships");
    expect(()=>data(indexOf([{path:"x".repeat(33*1024*1024),tags:["a"]}]))).toThrow("bytes");
  });
  it("has deterministic 1k/10k fixtures with exactly ten memberships per file",()=>{for(const size of [1000,10000] as const){const index=seededFixture(size);expect(Object.keys(index.tags)).toHaveLength(size);expect(Object.values(index.tags).reduce((n,t)=>n+t.files.length,0)).toBe(size*10);}});
  it("yields, cancels, and bounds the total deadline",async()=>{
    const c=new AbortController();let paused=0;
    function* endless():Generator<void,void>{while(true)yield;}
    await expect(runSliced(endless(),c.signal,performance.now()+1000,async()=>{paused++;c.abort();})).rejects.toBeInstanceOf(RelationshipError);expect(paused).toBe(1);
    await expect(runSliced(endless(),new AbortController().signal,0)).rejects.toThrow("timeout");
  });
});
