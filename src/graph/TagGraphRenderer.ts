import { select } from "d3-selection";
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from "d3-zoom";
import { runSliced, type GraphEdge, type GraphResult } from "./TagRelationshipModel";

const NS="http://www.w3.org/2000/svg";
export class TagGraphRenderer {
  private svg?:SVGSVGElement;
  private zoomer?:ZoomBehavior<SVGSVGElement,unknown>;
  private controller?:AbortController;
  private selected?:string;
  constructor(private readonly host:HTMLElement,private readonly node:(id:number)=>void,private readonly edge:(edge:GraphEdge)=>void){}
  async render(result:GraphResult,canCommit:()=>boolean=()=>true,deadline?:number):Promise<boolean>{
    this.controller?.abort();const controller=new AbortController();this.controller=controller;
    const doc=this.host.ownerDocument,svg=doc.createElementNS(NS,"svg"),group=doc.createElementNS(NS,"g");
    svg.setAttribute("viewBox","-450 -250 900 500");svg.setAttribute("aria-label","Tag relationships / 标签关系");svg.setAttribute("role","img");svg.append(group);
    const nodes=new Map(result.nodes.map(n=>[n.id,n]));const self=this;
    function* build():Generator<void,void>{
      for(const edge of result.edges){
        const a=nodes.get(edge.a)!,b=nodes.get(edge.b)!;const path=doc.createElementNS(NS,"path");
        const x=a.x??0,y=a.y??0,u=b.x??0,v=b.y??0;
        const dx=u-x,dy=v-y,length=Math.hypot(dx,dy)||1,offset=edge.type==="hierarchy"?12:0;
        path.setAttribute("d",`M ${x} ${y} Q ${(x+u)/2-dy/length*offset} ${(y+v)/2+dx/length*offset} ${u} ${v}`);
        path.setAttribute("class",`tag-graph__edge tag-graph__edge--${edge.type}`);path.dataset.relation=edge.id;
        path.style.strokeWidth=String(edge.type==="common"?Math.min(6,1+Math.sqrt(edge.shared)):2);
        const title=doc.createElementNS(NS,"title");title.textContent=`${a.key} ${edge.type==="hierarchy"?"→":"—"} ${b.key}`;path.append(title);
        path.addEventListener("click",()=>self.edge(edge));group.append(path);
        if(edge.type==="hierarchy"){
          const arrow=doc.createElementNS(NS,"path"),endX=u-dx/length*16,endY=v-dy/length*16;
          arrow.setAttribute("d",`M ${endX-dx/length*8-dy/length*4} ${endY-dy/length*8+dx/length*4} L ${endX} ${endY} L ${endX-dx/length*8+dy/length*4} ${endY-dy/length*8-dx/length*4}`);
          arrow.setAttribute("class","tag-graph__arrow");arrow.addEventListener("click",()=>self.edge(edge));group.append(arrow);
        }yield;
      }
      for(const node of result.nodes){
        const item=doc.createElementNS(NS,"g"),circle=doc.createElementNS(NS,"circle"),label=doc.createElementNS(NS,"text"),title=doc.createElementNS(NS,"title");
        item.dataset.relation=`n-${node.id}`;item.setAttribute("class","tag-graph__node");item.setAttribute("transform",`translate(${node.x??0},${node.y??0})`);
        circle.setAttribute("r",String(Math.min(15,4+Math.sqrt(node.count))));label.setAttribute("y","-19");label.setAttribute("text-anchor","middle");label.textContent=node.key.length>22?`${node.key.slice(0,22)}…`:node.key;title.textContent=`${node.key} (${node.count})`;
        item.append(circle,label,title);item.addEventListener("click",()=>self.node(node.id));group.append(item);yield;
      }
    }
    try{await runSliced(build(),controller.signal,deadline);}catch{ return false; }
    if(controller.signal.aborted||!canCommit())return false;
    this.detach();this.svg=svg;
    // Own the pointer lifecycle: D3's default window drag/wheel timers outlive detached views.
    this.zoomer=zoom<SVGSVGElement,unknown>().filter(()=>false).extent([[-450,-250],[450,250]]).scaleExtent([0.15,8]).on("zoom",event=>group.setAttribute("transform",event.transform.toString()));
    select(svg).call(this.zoomer);
    let drag:{id:number;x:number;y:number;transform:ReturnType<typeof zoomTransform>}|undefined,moved=false;
    svg.addEventListener("pointerdown",event=>{if(event.button!==0)return;moved=false;drag={id:event.pointerId,x:event.clientX,y:event.clientY,transform:zoomTransform(svg)};});
    svg.addEventListener("pointermove",event=>{if(!drag||drag.id!==event.pointerId)return;const box=svg.getBoundingClientRect(),dx=event.clientX-drag.x,dy=event.clientY-drag.y;moved ||= Math.abs(dx)+Math.abs(dy)>4;if(moved&&!svg.hasPointerCapture(event.pointerId))svg.setPointerCapture(event.pointerId);select(svg).call(this.zoomer!.transform,zoomIdentity.translate(drag.transform.x+dx*900/box.width,drag.transform.y+dy*500/box.height).scale(drag.transform.k));});
    const end=(event:PointerEvent)=>{if(drag?.id===event.pointerId){if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);drag=undefined;}};
    svg.addEventListener("pointerup",end);svg.addEventListener("pointercancel",end);
    svg.addEventListener("click",event=>{if(moved){event.preventDefault();event.stopPropagation();moved=false;}},true);
    svg.addEventListener("wheel",event=>{event.preventDefault();const box=svg.getBoundingClientRect();select(svg).call(this.zoomer!.scaleBy,Math.exp(-event.deltaY*.002),[(event.clientX-box.left)/box.width*900-450,(event.clientY-box.top)/box.height*500-250]);},{passive:false});
    this.host.replaceChildren(svg);this.fit();this.highlight(this.selected);return true;
  }
  highlight(id?:string):void{this.selected=id;this.host.querySelectorAll<SVGElement>("[data-relation]").forEach(el=>el.classList.toggle("is-selected",el.dataset.relation===id));}
  scale(factor:number):void{if(this.svg&&this.zoomer)select(this.svg).call(this.zoomer.scaleBy,factor);}
  fit():void{if(!this.svg||!this.zoomer)return;const box=this.svg.querySelector("g")?.getBBox();if(!box)return;const scale=Math.min(2,800/Math.max(1,box.width),400/Math.max(1,box.height));select(this.svg).call(this.zoomer.transform,zoomIdentity.scale(scale).translate(-box.x-box.width/2,-box.y-box.height/2));}
  private detach():void{if(this.svg)select(this.svg).on(".zoom",null);this.svg=undefined;this.zoomer=undefined;}
  clear():void{this.controller?.abort();this.detach();this.host.replaceChildren();}
  dispose():void{this.clear();}
}
