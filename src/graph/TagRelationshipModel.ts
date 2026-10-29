import type { TagIndex } from "../index/TagIndex";
import type { TagScope } from "../management/TagScope";
import { pathInScope } from "../management/TagScope";
import { normalizeTag } from "../utils/normalizeTag";

export type Source = "all" | "frontmatter" | "inline";
export type EvidenceGroup = "shared" | "onlyA" | "onlyB" | "node";
export interface RelationshipQuery {
  mode: "catalog" | "overview" | "neighborhood" | "compare";
  source: Source; threshold: number; limit: 50 | 100 | 200; hierarchy: boolean;
  root?: string; a?: string; b?: string;
}
export const DEFAULT_QUERY: RelationshipQuery = { mode: "overview", source: "all", threshold: 2, limit: 200, hierarchy: false };
export interface GraphSnapshot {
  index: TagIndex | null; indexRevision?: number; vaultRevision?: number; readInlineTags?: boolean;
  scope: TagScope; policy: { revision: number; excludedFolders: string[] };
}
export interface RelationshipIdentity { indexRevision: number; vaultRevision: number; policyRevision: number; scopeKey: string; readInlineTags: boolean; queryKey: string; generation: number }
export interface RelationshipDTO { tags: string[]; paths: string[]; files: number[][]; rawMemberships: number; bytes: number }
export interface GraphNode { id: number; key: string; count: number; x?: number; y?: number }
export type GraphEdge = { id: string; a: number; b: number; type: "hierarchy" } | { id: string; a: number; b: number; type: "common"; shared: number; jaccard: number };
export interface GraphResult { kind: "graph"; nodes: GraphNode[]; edges: GraphEdge[]; totalTags: number; candidateEdges: number; hiddenNodes: number; hiddenEdges: number; pairUpdates: number }
export interface Comparison { kind: "comparison"; a: number; b: number; countA: number; countB: number; shared: number; onlyA: number; onlyB: number; jaccard: number; coverageA: number; coverageB: number }
export type RelationshipResult = GraphResult | Comparison | { kind: "catalog" };
export const BUDGET = { memberships: 1_000_000, bytes: 32 * 1024 * 1024, pairs: 10_000_000, milliseconds: 10_000, slice: 4, batch: 4096 };
export class RelationshipError extends Error {
  constructor(public readonly code: "missing" | "source" | "threshold" | "root" | "pair" | "endpoint" | "memberships" | "bytes" | "pairs" | "timeout" | "worker" | "cancelled") { super(code); }
}
export const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export const scopeKey = (s: GraphSnapshot): string => JSON.stringify([s.scope, s.policy.excludedFolders]);
export function snapshotKey(s: GraphSnapshot): string { return JSON.stringify([s.indexRevision, s.vaultRevision, s.policy.revision, scopeKey(s), s.readInlineTags !== false]); }
export function validateQuery(q: RelationshipQuery): void {
  if (!Number.isSafeInteger(q.threshold) || q.threshold < 1 || ![50, 100, 200].includes(q.limit)) throw new RelationshipError("threshold");
  if (q.mode === "compare" && normalizeTag(q.a ?? "") === normalizeTag(q.b ?? "")) throw new RelationshipError("pair");
}

/** Bottom-up merge sort with resumable inner loops, including million-member inputs. */
export function* sorted<T>(input: readonly T[], compare: (a: T, b: T) => number): Generator<void, T[]> {
  let a: T[] = [], b: T[] = [];
  for (const value of input) { a.push(value); yield; }
  for (let width = 1; width < a.length; width *= 2) {
    for (let lo = 0; lo < a.length; lo += width * 2) {
      let i = lo, j = Math.min(lo + width, a.length); const mid = j, end = Math.min(lo + width * 2, a.length);
      for (let k = lo; k < end; k++) { b[k] = i < mid && (j >= end || compare(a[i], a[j]) <= 0) ? a[i++] : a[j++]; yield; }
    }
    [a, b] = [b, a];
  }
  return a;
}

/** Borrows only memberships; never reads examples, snippets, note bodies or provider state. */
export function* prepareRelationships(s: GraphSnapshot, source: Source): Generator<void, RelationshipDTO> {
  if (!s.index) throw new RelationshipError("missing");
  if (source === "inline" && s.readInlineTags === false) throw new RelationshipError("source");
  const rows = new Map<string, Set<number>>(), pathIds = new Map<string, number>();
  const paths: string[] = []; let rawMemberships = 0, bytes = 128;
  const encoder = new TextEncoder();
  const addBytes = (n: number) => { bytes += n; if (bytes > BUDGET.bytes) throw new RelationshipError("bytes"); };
  for (const property in s.index.tags) {
    if (!Object.prototype.hasOwnProperty.call(s.index.tags, property)) continue;
    const usage = s.index.tags[property]; const key = normalizeTag(usage.normalized || usage.tag);
    if(key.length>BUDGET.bytes)throw new RelationshipError("bytes");
    for (const file of usage.files) {
      if (++rawMemberships > BUDGET.memberships) throw new RelationshipError("memberships");
      yield;
      if (!key || !pathInScope(file.path, s.scope) || s.policy.excludedFolders.some(p => p === "" || file.path.startsWith(`${p}/`))) continue;
      if (source !== "all" && !file.sources.includes(source)) continue;
      if(file.path.length>BUDGET.bytes)throw new RelationshipError("bytes");
      let row = rows.get(key);
      if (!row) { addBytes(encoder.encode(JSON.stringify(key)).length + 8); row = new Set(); rows.set(key, row); }
      let id = pathIds.get(file.path);
      if (id === undefined) { addBytes(encoder.encode(JSON.stringify(file.path)).length + 1); id = paths.length; paths.push(file.path); pathIds.set(file.path, id); }
      if (!row.has(id)) { addBytes(16); row.add(id); }
    }
    yield;
  }
  const keys: string[] = []; for (const key of rows.keys()) { keys.push(key); yield; }
  const tags = yield* sorted(keys, compareText), files: number[][] = [];
  for (const key of tags) { const ids: number[] = []; for (const id of rows.get(key)!) { ids.push(id); yield; } files.push(yield* sorted(ids, (a,b) => a-b)); }
  return { tags, paths, files, rawMemberships, bytes };
}

function* intersection(a: readonly number[], b: readonly number[]): Generator<void, number> {
  let i = 0, j = 0, count = 0;
  while (i < a.length && j < b.length) { if (a[i] === b[j]) { count++; i++; j++; } else if (a[i] < b[j]) i++; else j++; yield; }
  return count;
}
export function* computeRelationships(d: RelationshipDTO, q: RelationshipQuery): Generator<void, RelationshipResult> {
  validateQuery(q);
  if (q.mode === "catalog") return { kind: "catalog" };
  const ids = new Map<string, number>(); for (let i = 0; i < d.tags.length; i++) { ids.set(d.tags[i], i); yield; }
  if (q.mode === "compare") {
    const a = ids.get(normalizeTag(q.a ?? "")), b = ids.get(normalizeTag(q.b ?? ""));
    if (a === undefined || b === undefined || !d.files[a].length || !d.files[b].length) throw new RelationshipError("endpoint");
    const shared = yield* intersection(d.files[a], d.files[b]), countA = d.files[a].length, countB = d.files[b].length;
    return { kind: "comparison", a, b, countA, countB, shared, onlyA: countA-shared, onlyB: countB-shared,
      jaccard: shared/(countA+countB-shared), coverageA: shared/countA, coverageB: shared/countB };
  }
  let pairUpdates = 0;
  const update = () => { if (++pairUpdates > BUDGET.pairs) throw new RelationshipError("pairs"); };
  let candidates: number[];
  if (q.mode === "neighborhood") {
    const root = ids.get(normalizeTag(q.root ?? "")); if (root === undefined) throw new RelationshipError("root");
    const neighbors: Array<{ id: number; shared: number; j: number }> = [];
    for (let i = 0; i < d.tags.length; i++) {
      if (i === root) continue;
      const shared = yield* intersection(d.files[root], d.files[i]);
      for (let n=0; n<shared; n++) { update(); yield; }
      if (shared >= q.threshold) neighbors.push({ id: i, shared, j: shared/(d.files[root].length+d.files[i].length-shared) });
      yield;
    }
    const order = yield* sorted(neighbors, (a,b) => b.shared-a.shared || b.j-a.j || compareText(d.tags[a.id], d.tags[b.id]));
    candidates = [root, ...order.slice(0,49).map(n => n.id)];
  } else {
    const all: number[] = []; for (let i=0; i<d.tags.length; i++) { all.push(i); yield; }
    candidates = (yield* sorted(all, (a,b) => d.files[b].length-d.files[a].length || compareText(d.tags[a],d.tags[b]))).slice(0,q.limit);
  }
  candidates = yield* sorted(candidates, (a,b) => a-b);
  const byFile = new Map<number, number[]>();
  for (const id of candidates) for (const file of d.files[id]) { let list = byFile.get(file); if (!list) { list=[]; byFile.set(file,list); } list.push(id); yield; }
  const counts = new Map<number, Map<number, number>>();
  for (const list of byFile.values()) for (let i=0; i<list.length; i++) for (let j=i+1; j<list.length; j++) {
    update(); let row=counts.get(list[i]); if (!row) { row=new Map(); counts.set(list[i],row); } row.set(list[j], (row.get(list[j])??0)+1); yield;
  }
  const common: Extract<GraphEdge,{type:"common"}>[] = [], hierarchy: GraphEdge[] = [], candidateSet = new Set(candidates);
  for (const [a,row] of counts) for (const [b,shared] of row) { if (shared >= q.threshold) common.push({ id:`c-${a}-${b}`, a,b,type:"common",shared,jaccard:shared/(d.files[a].length+d.files[b].length-shared) }); yield; }
  if (q.hierarchy) for (const b of candidates) {
    const cut=d.tags[b].lastIndexOf("/"); const a=cut < 0 ? undefined : ids.get(d.tags[b].slice(0,cut));
    if (a !== undefined && candidateSet.has(a)) hierarchy.push({id:`h-${a}-${b}`,a,b,type:"hierarchy"}); yield;
  }
  const ordered = yield* sorted(common, (a,b) => b.shared-a.shared || b.jaccard-a.jaccard || a.a-b.a || a.b-b.b);
  const edges = [...hierarchy, ...ordered.slice(0,800-hierarchy.length)];
  return { kind:"graph",nodes:candidates.map(id=>({id,key:d.tags[id],count:d.files[id].length})),edges,totalTags:d.tags.length,
    candidateEdges:common.length+hierarchy.length,hiddenNodes:d.tags.length-candidates.length,hiddenEdges:common.length+hierarchy.length-edges.length,pairUpdates };
}

/** Evidence is calculated on demand, with no per-edge path copies. */
export function* evidencePage(d: RelationshipDTO, a: number, b: number | undefined, group: EvidenceGroup, page: number): Generator<void, {paths:string[];total:number;page:number}> {
  const left=d.files[a]??[],right=b === undefined ? [] : d.files[b]??[]; let i=0,j=0; const paths:string[]=[];
  if (group === "node") { for (const id of left) { paths.push(d.paths[id]); yield; } }
  else while (i<left.length || j<right.length) {
    const x=left[i]??Infinity,y=right[j]??Infinity;
    if (x===y) { if(group==="shared")paths.push(d.paths[x]); i++;j++; }
    else if(x<y) { if(group==="onlyA")paths.push(d.paths[x]); i++; }
    else { if(group==="onlyB")paths.push(d.paths[y]);j++; } yield;
  }
  const ordered=yield* sorted(paths,compareText), bounded=Math.max(0,Math.min(page,Math.ceil(paths.length/50)-1));
  return {paths:ordered.slice(bounded*50,bounded*50+50),total:paths.length,page:bounded};
}

export async function runSliced<T>(work: Generator<void,T>, signal: AbortSignal, deadline=performance.now()+BUDGET.milliseconds, pause:()=>Promise<void>=()=>new Promise(resolve=>setTimeout(resolve,0))):Promise<T> {
  try {
    for (;;) {
      if(signal.aborted) throw new RelationshipError("cancelled");
      const start=performance.now(); if(start>deadline) throw new RelationshipError("timeout");
      do { const next=work.next(); if(next.done)return next.value; } while(performance.now()-start<BUDGET.slice && !signal.aborted);
      await pause();
    }
  } finally { work.return(undefined as T); }
}
