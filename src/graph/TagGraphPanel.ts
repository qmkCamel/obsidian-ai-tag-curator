import { createGraphWorker, TagGraphService, type CompletedRelationship } from "./TagGraphService";
import { BUDGET, DEFAULT_QUERY, runSliced, scopeKey, snapshotKey, type EvidenceGroup, type GraphEdge, type RelationshipQuery } from "./TagRelationshipModel";
import { TagGraphRenderer } from "./TagGraphRenderer";
import type { TagManagementState } from "../management/TagManagementView";
import { normalizeTag } from "../utils/normalizeTag";

export interface TagRelationshipContext { result:CompletedRelationship; group:EvidenceGroup; page:number }
export interface GraphPanelProps {
  state():TagManagementState; language:string; mobile:boolean;
  openFile(path:string):Promise<void>|void; refresh():Promise<void>|void; settings():void;
  showTag(key?:string):void; handoff(context:TagRelationshipContext):void;
}
/** Stable regions: progress never rebuilds controls, the SVG, search or evidence. */
export class TagGraphPanel {
  readonly service:TagGraphService;
  private readonly t:(zh:string,en:string)=>string;
  private readonly status:HTMLElement;
  private readonly error:HTMLElement;
  private readonly summary:HTMLElement;
  private readonly applied:HTMLElement;
  private readonly results:HTMLDetailsElement;
  private readonly table:HTMLElement;
  private readonly details:HTMLElement;
  private readonly canvas:HTMLElement;
  private readonly search:HTMLInputElement;
  private readonly a:HTMLInputElement;
  private readonly b:HTMLInputElement;
  private readonly generateButton:HTMLButtonElement;
  private readonly compareButton:HTMLButtonElement;
  private readonly renderer:TagGraphRenderer;
  private query:RelationshipQuery={...DEFAULT_QUERY};
  private catalog?:CompletedRelationship;
  private graph?:CompletedRelationship;
  private comparison?:CompletedRelationship;
  private lastQuery?:RelationshipQuery;
  private appliedQuery?:RelationshipQuery;
  private group:EvidenceGroup="shared";
  private evidencePage=0;
  private searchPage=0;
  private tablePage=0;
  private selected?:string;
  private key="";
  private scope="";
  private index:TagManagementState["index"]=null;
  private visible=false;
  private alive=true;
  private tableOnly=false;
  private viewToken=0;
  private searchController?:AbortController;
  private localError="";
  private fileMissing=false;
  private originLabel?:string;
  private needsRecompute=false;
  constructor(private readonly host:HTMLElement,private readonly props:GraphPanelProps){
    this.t=(zh,en)=>props.language.startsWith("zh")?zh:en;
    host.classList.add("tag-graph");
    this.service=new TagGraphService(()=>props.state(),()=>this.renderStatus(),()=>createGraphWorker(host.ownerDocument.defaultView!));
    this.summary=this.el(host,"p");this.status=this.el(host,"div",undefined,"tag-graph__status");this.status.setAttribute("role","status");this.status.setAttribute("aria-live","polite");
    this.error=this.el(host,"div",undefined,"tag-graph__error");this.error.setAttribute("role","alert");
    const tools=this.el(host,"div",undefined,"tag-graph__controls");
    this.search=this.input(tools,this.t("搜索全部范围标签","Search all scoped tags"),"search");
    this.search.addEventListener("input",()=>{this.searchPage=0;this.results.open=true;void this.renderSearch();});
    this.select(tools,this.t("浏览来源","Browse source"),[["all",this.t("全部","All")],["frontmatter",this.t("属性","Frontmatter")],["inline",this.t("正文","Inline")]],"all",value=>{this.query.source=value as RelationshipQuery["source"];this.renderStatus();});
    const threshold=this.input(tools,this.t("共同文件阈值","Shared-file threshold"),"number");threshold.min="1";threshold.step="1";threshold.value="2";
    threshold.addEventListener("input",()=>{this.query.threshold=Number(threshold.value);this.renderStatus();});
    this.select(tools,this.t("概览节点上限","Overview node limit"),[["50","50"],["100","100"],["200","200"]],"200",value=>{this.query.limit=Number(value) as 50|100|200;this.renderStatus();});
    const hierarchy=this.input(tools,this.t("叠加直接命名层级","Show direct naming hierarchy"),"checkbox");hierarchy.addEventListener("change",()=>{this.query.hierarchy=hierarchy.checked;this.renderStatus();});
    this.generateButton=this.button(tools,this.t("生成关系","Generate relationships"),()=>void this.generate({...this.query,mode:this.graph?.query.mode==="neighborhood"?"neighborhood":"overview",root:this.graph?.query.root}));
    this.button(tools,this.t("查看范围概览","Scope overview"),()=>void this.generate({...this.query,mode:"overview"}));
    this.button(tools,this.t("应用来源到搜索","Apply source to search"),()=>void this.generate({...this.query,mode:"catalog"}));
    this.button(tools,this.t("取消计算","Cancel calculation"),()=>{this.viewToken++;this.service.cancel();});
    this.button(tools,this.t("使用关系表重试","Retry as relationship table"),()=>{this.tableOnly=true;void this.generate(this.lastQuery??{...this.query,mode:"overview"});});
    this.button(tools,this.t("重试图模式","Retry graph"),()=>{this.tableOnly=false;void this.generate(this.lastQuery??{...this.query,mode:"overview"});});
    const pair=this.el(host,"div",undefined,"tag-graph__controls");this.a=this.input(pair,this.t("精确标签 A","Exact tag A"),"text");this.b=this.input(pair,this.t("精确标签 B","Exact tag B"),"text");
    this.compareButton=this.button(pair,this.t("比较标签对","Compare pair"),()=>void this.generate({...this.query,mode:"compare",a:this.a.value,b:this.b.value}));
    this.applied=this.el(host,"p");
    this.el(host,"p",this.t("共现不等于同义；交并比和覆盖率不是合并建议。浏览来源与证据分组不代表修改范围。","Co-occurrence is not synonymy; Jaccard and coverage are not merge recommendations. Browse sources and evidence groups do not authorize changes."),"tag-graph__muted");
    this.results=this.el(host,"details");this.results.open=true;this.results.setAttribute("aria-label",this.t("完整范围标签","All scoped tags"));
    const graphTools=this.el(host,"div",undefined,"tag-graph__controls");
    this.button(graphTools,this.t("放大","Zoom in"),()=>this.renderer.scale(1.3));this.button(graphTools,this.t("缩小","Zoom out"),()=>this.renderer.scale(1/1.3));this.button(graphTools,this.t("适配视口","Fit graph"),()=>this.renderer.fit());
    this.el(graphTools,"span",this.t("实线：共现；虚线箭头：直接命名层级。位置不表示语义。","Solid: co-occurrence; dashed arrow: direct naming hierarchy. Position carries no semantics."));
    const workspace=this.el(host,"div",undefined,"tag-graph__workspace"),visual=this.el(workspace,"div",undefined,"tag-graph__visual");
    this.canvas=this.el(visual,"div",undefined,"tag-graph__canvas");this.table=this.el(visual,"section");this.details=this.el(workspace,"section",undefined,"tag-graph__details");
    this.button(graphTools,this.t("显示关系表","Show relationship table"),()=>{this.canvas.hidden=true;this.table.hidden=false;this.table.scrollIntoView?.({block:"nearest"});});
    this.button(graphTools,this.t("显示图谱","Show graph"),()=>{this.canvas.hidden=false;this.table.hidden=true;this.canvas.scrollIntoView?.({block:"nearest"});});
    this.renderer=new TagGraphRenderer(this.canvas,id=>void this.selectNode(id),edge=>void this.selectEdge(edge));
    if(props.mobile){tools.hidden=true;pair.hidden=true;graphTools.hidden=true;this.canvas.hidden=true;this.el(host,"p",this.t("关系图目前仅支持桌面。","Relationships currently support desktop only."));this.button(host,this.t("返回标签列表","Back to tags"),()=>props.showTag());}
    this.renderStatus();
  }
  private el<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement,tag:K,text?:string,cls?:string):HTMLElementTagNameMap[K]{const el=parent.ownerDocument.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;parent.append(el);return el;}
  private button(parent:HTMLElement,label:string,action:()=>void):HTMLButtonElement{const b=this.el(parent,"button",label);b.type="button";b.setAttribute("aria-label",label);b.addEventListener("click",action);return b;}
  private input(parent:HTMLElement,label:string,type:string):HTMLInputElement{const wrap=this.el(parent,"label",label);const input=this.el(wrap,"input");input.type=type;input.setAttribute("aria-label",label);return input;}
  private select(parent:HTMLElement,label:string,options:string[][],value:string,action:(value:string)=>void):void{const wrap=this.el(parent,"label",label),select=this.el(wrap,"select");select.setAttribute("aria-label",label);for(const [key,text]of options){const option=this.el(select,"option",text);option.value=key;}select.value=value;select.addEventListener("change",()=>action(select.value));}
  private pager(parent:HTMLElement,page:number,total:number,action:(page:number)=>void):void{const bar=this.el(parent,"div",undefined,"tag-graph__pager");this.button(bar,this.t("上一页","Previous page"),()=>action(page-1)).disabled=page===0;this.el(bar,"span",`${page+1} / ${Math.max(1,Math.ceil(total/50))} (${total})`);this.button(bar,this.t("下一页","Next page"),()=>action(page+1)).disabled=(page+1)*50>=total;}
  show(root?:string,source?:RelationshipQuery["source"]):void{
    this.visible=true;this.host.hidden=false;this.update();if(this.props.mobile)return;
    if(root){if(source)this.query.source=source;void this.generate({...this.query,mode:"neighborhood",root});}
    else if(this.needsRecompute&&!this.serviceBusy()){this.needsRecompute=false;void this.generate(this.appliedQuery??{...this.query,mode:"catalog"});}
    else if(!this.catalog&&!this.serviceBusy())void this.generate({...this.query,mode:"catalog"});
  }
  hide():void{this.visible=false;this.host.hidden=true;this.viewToken++;this.service.cancel();this.searchController?.abort();}
  private serviceBusy():boolean{return ["preparing","counting","layingOut"].includes(this.service.state.phase);}
  private sourceLabel(source:RelationshipQuery["source"]):string{return source==="all"?this.t("全部","All"):source==="inline"?this.t("正文","Inline"):this.t("属性","Frontmatter");}
  update():void{
    const s=this.props.state(),nextScope=scopeKey(s),nextKey=snapshotKey(s),changed=this.key!==nextKey||this.index!==s.index;
    const newIndex=this.index!==s.index || (!!this.catalog&&this.catalog.identity.indexRevision!==(s.indexRevision??0));
    const scopeChanged=!!this.scope&&nextScope!==this.scope;
    if(scopeChanged){this.service.invalidate();this.clear();}
    else if(this.key&&changed){this.service.invalidate();this.viewToken++;}
    this.scope=nextScope;this.key=nextKey;this.index=s.index;this.renderStatus();
    if(changed&&!this.visible&&newIndex&&s.freshness==="ready")this.needsRecompute=true;
    if(changed&&this.visible&&!this.props.mobile&&(newIndex||scopeChanged)&&s.freshness==="ready"){this.needsRecompute=false;void this.generate(this.appliedQuery??{...this.query,mode:"catalog"});}
  }
  private clear():void{this.viewToken++;this.searchController?.abort();this.catalog=undefined;this.graph=undefined;this.comparison=undefined;this.lastQuery=undefined;this.appliedQuery=undefined;this.fileMissing=false;this.results.replaceChildren();this.table.replaceChildren();this.details.replaceChildren();this.host.classList.remove("tag-graph--detail");this.renderer.clear();}
  private renderStatus():void{
    if(!this.alive)return;const s=this.props.state(),t=this.t;
    this.summary.textContent=`${t("范围","Scope")}: ${s.scope.include.map(r=>`${r.path||"/"}${r.recursive?"/**":""}`).join(", ")} · ${t("最后索引","Last indexed")}: ${s.index?.updatedAt??"—"}`;
    const phase:Record<string,string>={idle:t("选择标签开始，不会自动生成概览。","Select a tag to begin; overview is explicit."),preparing:t("正在准备…","Preparing…"),counting:t("正在统计…","Counting…"),layingOut:t("正在布局…","Laying out…"),ready:t("计算完成","Calculation ready"),cancelled:t("已取消；保留有效旧结果","Cancelled; valid previous results retained"),error:t("计算失败；保留有效旧结果","Calculation failed; valid previous results retained"),limited:t("超过计算预算，请缩小范围","Budget exceeded; narrow the scope")};
    const stale=this.fileMissing||s.freshness!=="ready"||[this.graph,this.comparison].some(r=>r&&(r.snapshotKey!==snapshotKey(s)||r.index!==s.index));
    this.status.textContent=`${phase[this.service.state.phase]}${stale?t(" · 基于过期索引／证据，请显式刷新"," · Stale index/evidence; refresh explicitly"):""}`;
    this.host.dataset.phase=this.service.state.phase;
    const errors:Record<string,string>={missing:t("没有索引，请刷新。","No index; refresh explicitly."),source:t("正文来源未采集，请在设置中开启并刷新索引。","Inline source was not collected; enable it in settings and refresh."),threshold:t("阈值必须为正整数，节点上限为 50/100/200。","Use a positive integer threshold and a 50/100/200 node limit."),root:t("根标签不在当前查询中，请返回搜索。","Root is outside the current query; use search."),pair:t("请选择两个不同的精确标签。","Select two different exact tags."),endpoint:t("端点没有合格文件，无法比较；比例不适用。","An endpoint has no eligible files; comparison and ratios are unavailable."),memberships:t("超过 1,000,000 原始成员预算。","More than 1,000,000 raw memberships."),bytes:t("超过 32 MiB 输入预算。","Input exceeds 32 MiB."),pairs:t("超过 10,000,000 标签对更新预算。","More than 10,000,000 pair updates."),timeout:t("超过 10 秒期限。","The 10-second deadline was exceeded."),worker:t("Worker 不可用；可显式使用关系表重试。","Worker unavailable; explicitly retry as a relationship table."),cancelled:""};
    this.error.replaceChildren();const error=this.localError||(errors[this.service.state.error??""]??"");if(error)this.el(this.error,"p",error);
    if(!s.index||this.service.state.error==="source"){this.button(this.error,t("刷新索引","Refresh index"),()=>{void Promise.resolve(this.props.refresh()).catch(e=>{this.localError=String(e);this.renderStatus();});});if(this.service.state.error==="source")this.button(this.error,t("打开设置","Open settings"),()=>this.props.settings());}
    const applied=this.appliedQuery??this.catalog?.query;
    const describe=(r:CompletedRelationship)=>{const q=r.query;return `${q.mode==="overview"?t("概览","Overview"):q.mode==="neighborhood"?`${t("邻域","Neighborhood")} ${q.root}`:q.mode==="compare"?t("比较","Comparison"):t("搜索","Search")}: ${this.sourceLabel(q.source)}, ${t("阈值","threshold")} ${q.threshold}, N=${q.limit}, ${t("层级","hierarchy")} ${q.hierarchy?t("开","on"):t("关","off")} (${r.index?.updatedAt??"—"})`;};
    this.applied.textContent=[...new Set([this.graph,this.comparison,...(!this.graph&&!this.comparison?[this.catalog]:[])].filter((r):r is CompletedRelationship=>!!r).map(describe))].join(" · ");
    if(applied&&["source","threshold","limit","hierarchy"].some(k=>applied[k as keyof RelationshipQuery]!==this.query[k as keyof RelationshipQuery]))this.applied.textContent+=t(" · 新设置尚未应用"," · New settings not applied");
    if(this.generateButton)this.generateButton.disabled=this.serviceBusy();if(this.compareButton)this.compareButton.disabled=this.serviceBusy();
  }
  private async generate(query:RelationshipQuery):Promise<void>{
    if(this.props.mobile||!this.alive)return;
    if(this.serviceBusy()&&JSON.stringify(query)===JSON.stringify(this.lastQuery))return;
    const token=++this.viewToken;this.localError="";this.lastQuery={...query};
    const result=await this.service.generate(query,this.tableOnly);if(!result||!this.alive||token!==this.viewToken)return;
    this.catalog=result;void this.renderSearch();
    if(result.value.kind==="graph"){
      if(!this.tableOnly&&!await this.renderer.render(result.value,()=>this.alive&&token===this.viewToken,performance.now()+BUDGET.milliseconds-result.timing.total)){if(this.alive&&token===this.viewToken){this.localError=this.t("绘制超时或取消；保留上次有效结果。","Drawing timed out or was cancelled; previous valid results retained.");this.renderStatus();}return;}
      if(!this.alive||token!==this.viewToken)return;
      if(this.tableOnly)this.renderer.clear();
      this.results.open=false;this.host.classList.remove("tag-graph--detail");this.graph=result;this.tablePage=0;this.comparison=undefined;this.details.replaceChildren();this.renderTable();this.table.hidden=!this.tableOnly;this.canvas.hidden=this.tableOnly;
    }else if(result.value.kind==="comparison"){
      this.results.open=false;this.comparison=result;this.group="shared";this.evidencePage=0;await this.renderComparison();this.details.scrollIntoView?.({block:"nearest"});
    }
    this.appliedQuery={...query};
    this.renderStatus();
  }
  private async renderSearch():Promise<void>{
    this.searchController?.abort();const controller=new AbortController();this.searchController=controller;
    const data=this.catalog?.data;if(!data){this.results.replaceChildren();return;}
    const search=normalizeTag(this.search.value),matches:number[]=[];
    function* work():Generator<void,void>{for(let i=0;i<data!.tags.length;i++){if(data!.tags[i].includes(search))matches.push(i);yield;}}
    try{await runSliced(work(),controller.signal);}catch{return;}if(controller.signal.aborted||!this.alive)return;
    this.results.replaceChildren();this.el(this.results,"summary",`${this.t("范围内标签","Scoped tags")} (${matches.length}/${data.tags.length}) · ${this.sourceLabel(this.catalog!.query.source)}`);
    if(!matches.length)this.el(this.results,"p",data.tags.length?this.t("没有匹配搜索的标签。","No matching tags."):this.t("当前范围／来源没有标签。","No tags in this scope/source."));
    this.searchPage=Math.min(this.searchPage,Math.max(0,Math.ceil(matches.length/50)-1));
    for(const id of matches.slice(this.searchPage*50,this.searchPage*50+50)){
      const row=this.el(this.results,"div",undefined,"tag-graph__row"),key=data.tags[id];row.dataset.graphTag=key;
      this.button(row,`${key} (${data.files[id].length})`,()=>void this.generate({...this.query,mode:"neighborhood",root:key}));
      this.button(row,this.t(`选择 ${key} 为 A`,`Use ${key} as A`),()=>{this.a.value=key;this.a.focus();});this.button(row,this.t(`选择 ${key} 为 B`,`Use ${key} as B`),()=>{this.b.value=key;this.b.focus();});
    }
    this.pager(this.results,this.searchPage,matches.length,page=>{this.searchPage=page;void this.renderSearch();});
  }
  private renderTable():void{
    const result=this.graph;if(!result||result.value.kind!=="graph")return;const graph=result.value;this.table.replaceChildren();
    this.el(this.table,"h3",this.t("关系表","Relationship table"));
    this.el(this.table,"p",`${this.t("候选 / 合格标签","Candidates / eligible tags")}: ${graph.nodes.length}/${graph.totalTags} · ${this.t("可见 / 候选内关系","Visible / candidate relations")}: ${graph.edges.length}/${graph.candidateEdges} · ${this.t("隐藏节点 / 边","Hidden nodes / edges")}: ${graph.hiddenNodes}/${graph.hiddenEdges} · ${this.t("共现 / 层级","Common / hierarchy")}: ${graph.edges.filter(e=>e.type==="common").length}/${graph.edges.filter(e=>e.type==="hierarchy").length}`);
    if(!graph.edges.some(e=>e.type==="common"))this.el(this.table,"p",this.t("当前候选与阈值下没有共现；可降低阈值后重新生成。","No co-occurrence at this candidate set and threshold; lower the threshold and generate again."));
    if(graph.hiddenNodes||graph.hiddenEdges)this.el(this.table,"p",this.t("显示已截断；未计算候选外的全库边总数。","Display is limited; the total number of edges outside the candidates was not computed."));
    for(const edge of graph.edges.slice(this.tablePage*50,this.tablePage*50+50)){
      const label=`${result.data.tags[edge.a]} ${edge.type==="hierarchy"?"→":"—"} ${result.data.tags[edge.b]} · ${edge.type==="hierarchy"?this.t("直接命名层级","Direct naming hierarchy"):`${this.t("共现","Co-occurrence")} ${edge.shared} · J=${edge.jaccard.toFixed(3)}`}`;
      const button=this.button(this.table,label,()=>void this.selectEdge(edge));button.dataset.relation=edge.id;button.setAttribute("aria-pressed",String(this.selected===edge.id));
    }
    this.pager(this.table,this.tablePage,graph.edges.length,page=>{this.tablePage=page;this.renderTable();});
    const nodes=this.el(this.table,"details");this.el(nodes,"summary",this.t("候选节点（含无边节点）","Candidate nodes (including unconnected nodes)"));
    for(const node of graph.nodes)this.button(nodes,`${node.key} (${node.count})`,()=>void this.selectNode(node.id));
  }
  private async selectNode(id:number):Promise<void>{
    const result=this.graph;if(!result)return;this.host.classList.add("tag-graph--detail");this.originLabel=this.host.ownerDocument.activeElement?.getAttribute("aria-label")??undefined;this.selected=`n-${id}`;this.renderer.highlight(this.selected);this.details.replaceChildren();this.back();this.el(this.details,"h3",result.data.tags[id]);
    this.button(this.details,this.t("在标签列表查看","View in tag list"),()=>this.props.showTag(result.data.tags[id]));
    const region=this.el(this.details,"div");await this.renderFiles(region,result,id,undefined,"node",0);this.details.scrollIntoView?.({block:"nearest"});
  }
  private async selectEdge(edge:GraphEdge):Promise<void>{
    const result=this.graph;if(!result)return;this.host.classList.add("tag-graph--detail");this.originLabel=this.host.ownerDocument.activeElement?.getAttribute("aria-label")??undefined;this.selected=edge.id;this.renderer.highlight(edge.id);this.renderTable();
    if(edge.type==="hierarchy"){
      this.details.replaceChildren();this.back();this.el(this.details,"h3",`${result.data.tags[edge.a]} → ${result.data.tags[edge.b]}`);
      this.el(this.details,"p",this.t("这只表示直接命名结构，不表示共同文件或语义包含。","This describes direct naming structure, not shared files or semantic containment."));
      this.button(this.details,result.data.tags[edge.a],()=>void this.selectNode(edge.a));this.button(this.details,result.data.tags[edge.b],()=>void this.selectNode(edge.b));
      this.button(this.details,this.t("独立比较端点","Compare endpoints independently"),()=>void this.generate({...result.query,mode:"compare",a:result.data.tags[edge.a],b:result.data.tags[edge.b]}));
    }else await this.generate({...result.query,mode:"compare",a:result.data.tags[edge.a],b:result.data.tags[edge.b]});
  }
  private async renderComparison():Promise<void>{
    const result=this.comparison;if(!result||result.value.kind!=="comparison")return;const c=result.value,t=this.t;
    this.host.classList.add("tag-graph--detail");
    const focus=this.details.contains(this.host.ownerDocument.activeElement)?this.host.ownerDocument.activeElement?.getAttribute("aria-label"):null;
    this.details.replaceChildren();this.back();this.el(this.details,"h3",`${result.data.tags[c.a]} / ${result.data.tags[c.b]}`);
    this.el(this.details,"p",`${this.sourceLabel(result.query.source)} · ${result.index?.updatedAt??"—"}`);
    this.el(this.details,"p",`${t("共同 / 仅 A / 仅 B","Shared / only A / only B")}: ${c.shared} / ${c.onlyA} / ${c.onlyB} · ${t("交并比","Jaccard")}: ${c.jaccard.toFixed(3)}`);
    this.el(this.details,"p",`${t("A 的笔记同时含 B","A files also containing B")}: ${c.shared}/${c.countA} (${(c.coverageA*100).toFixed(1)}%) · ${t("B 的笔记同时含 A","B files also containing A")}: ${c.shared}/${c.countB} (${(c.coverageB*100).toFixed(1)}%)`);
    this.button(this.details,t("带入整理","Bring to management"),()=>this.props.handoff({result,group:this.group,page:this.evidencePage}));
    for(const [group,label]of [["shared",t("共同文件","Shared files")],["onlyA",t("仅 A 文件","Only A files")],["onlyB",t("仅 B 文件","Only B files")]] as const){const b=this.button(this.details,label,()=>{this.group=group;this.evidencePage=0;void this.renderComparison();});b.setAttribute("aria-pressed",String(this.group===group));}
    const region=this.el(this.details,"div");await this.renderFiles(region,result,c.a,c.b,this.group,this.evidencePage);
    if(focus)Array.from(this.details.querySelectorAll<HTMLButtonElement>("button")).find(b=>b.getAttribute("aria-label")===focus)?.focus();
  }
  private back():void{this.button(this.details,this.t("返回关系","Back to relationships"),()=>{this.viewToken++;this.service.cancel();this.host.classList.remove("tag-graph--detail");this.details.replaceChildren();const target=Array.from(this.host.querySelectorAll<HTMLElement>("[aria-label]")).find(el=>el.getAttribute("aria-label")===this.originLabel);(target??this.search).focus();});}
  private async renderFiles(region:HTMLElement,result:CompletedRelationship,a:number,b:number|undefined,group:EvidenceGroup,page:number):Promise<void>{
    const token=++this.viewToken;this.el(region,"p",this.t("正在加载文件证据…","Loading file evidence…"));
    const evidence=await this.service.evidence(result,a,b,group,page);if(!evidence||!this.alive||token!==this.viewToken||!region.isConnected)return;
    this.evidencePage=evidence.page;region.replaceChildren();
    for(const path of evidence.paths){const missing=this.props.state().missingPaths?.includes(path);const button=this.button(region,`${path}${missing?this.t("（已不可用）"," (unavailable)"):""}`,()=>{void Promise.resolve().then(()=>this.props.openFile(path)).catch(()=>{this.fileMissing=true;button.disabled=true;button.textContent=`${path} · ${this.t("文件不可用","File unavailable")}`;this.renderStatus();});});button.classList.add("tag-graph__file");button.disabled=!!missing;if(missing){this.fileMissing=true;this.renderStatus();}}
    this.pager(region,evidence.page,evidence.total,next=>{this.evidencePage=next;void this.renderFiles(region,result,a,b,group,next);});
  }
  restore(context:TagRelationshipContext):void{
    const state=this.props.state();if(context.result.identity.scopeKey!==scopeKey(state))return;
    this.comparison=context.result;this.group=context.group;this.evidencePage=context.page;this.show();
    // Loading old evidence would cancel the refresh started by show(). A new
    // index must revalidate both endpoints before showing fresh comparison data.
    if(state.freshness==="ready"&&(context.result.index!==state.index||context.result.identity.indexRevision!==(state.indexRevision??0))){void this.generate({...context.result.query});return;}
    void this.renderComparison();this.renderStatus();
  }
  dispose():void{this.alive=false;this.viewToken++;this.searchController?.abort();this.service.dispose();this.renderer.dispose();this.catalog=undefined;this.graph=undefined;this.comparison=undefined;this.host.replaceChildren();}
}
