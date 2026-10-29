import type { TagIndex, TagSource } from "../../src/index/TagIndex";
import type { GraphSnapshot } from "../../src/graph/TagRelationshipModel";
export function indexOf(files:Array<{path:string;tags:string[];source?:TagSource}>):TagIndex{
  const index:TagIndex={updatedAt:"2026-10-28T00:00:00.000Z",tags:Object.create(null)};
  for(const file of files)for(const tag of file.tags){const usage=index.tags[tag]??={tag,normalized:tag,count:9999,examples:[],namingSignals:{depth:1,hasHierarchy:false},files:[]};usage.files.push({path:file.path,count:99,sources:[file.source??"frontmatter"]});}
  return index;
}
export function snapshot(index:TagIndex):GraphSnapshot{return{index,indexRevision:1,vaultRevision:1,readInlineTags:true,scope:{include:[{path:"",recursive:true}]},policy:{revision:1,excludedFolders:[]}};}
export const handFixture=()=>indexOf([{path:"1.md",tags:["AI","python"]},{path:"2.md",tags:["ai","python","ai/tools"]},{path:"3.md",tags:["ai","ai/tools"]},{path:"4.md",tags:["python"]}]);
export function seededFixture(size:1000|10000):TagIndex{
  let seed=42;const permutation=Array.from({length:size},(_,i)=>i);
  for(let i=size-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[permutation[i],permutation[j]]=[permutation[j],permutation[i]];}
  return indexOf(Array.from({length:size},(_,i)=>({path:`Notes/${String(i).padStart(5,"0")}.md`,tags:Array.from({length:10},(_,n)=>`tag-${String(permutation[(i+n*97)%size]).padStart(5,"0")}`)})));
}
export const denseFixture=()=>indexOf(Array.from({length:1000},(_,i)=>({path:`${i}.md`,tags:Array.from({length:200},(_,t)=>`tag-${t}`)})));
export const productFixture=()=>indexOf([
  ...Array.from({length:100},(_,i)=>({path:`Project/${String(i).padStart(3,"0")}.md`,tags:["topic",...(i<10?["topic/special"]:[])]})),
  {path:"Project/name-a.md",tags:["note","长中文标签/用于窄窗口检验的长名称-with-english"]},
  {path:"Project/name-b.md",tags:["notes"]},
  {path:"Project/source.md",tags:["only-body","topic"],source:"inline" as const},
  {path:"Project/legacy.md",tags:["legacy"],source:"metadata" as const},
  {path:"Excluded/private.md",tags:["secret"]}
]);
