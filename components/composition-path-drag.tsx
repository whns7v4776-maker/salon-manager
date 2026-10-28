import React,{useRef,useState} from 'react';

type Drag={id:string;pointer:number;start:number;delta:number;target:number;tops:Record<string,number>;heights:Record<string,number>};
type Handle=React.HTMLAttributes<HTMLSpanElement>;
/** Pointer capture keeps the opaque phase attached to the cursor; siblings preview the insertion. */
export function CompositionPathDrag({ids,onMove,disabled,render}:{ids:string[];onMove:(id:string,index:number)=>void;disabled?:boolean;render:(id:string,index:number,handle:Handle)=>React.ReactNode}){
 const nodes=useRef(new Map<string,HTMLDivElement>());
 const live=useRef<Drag|null>(null);const [drag,setDrag]=useState<Drag|null>(null);
 const finish=(commit:boolean)=>{const current=live.current;if(!current)return;live.current=null;if(commit&&ids.includes(current.id))onMove(current.id,current.target);setDrag(null);};
 const preview=[...ids];if(drag){const index=preview.indexOf(drag.id);if(index>=0){preview.splice(index,1);preview.splice(drag.target,0,drag.id);}}
 const offsets:Record<string,number>={};let top=0;for(const id of preview){offsets[id]=top;top+=drag?.heights[id]??0;}
 return <><style>{`[data-composition-editor] span.composition-drag-handle,[data-composition-editor] span.composition-drag-handle:hover{cursor:grab!important}[data-composition-editor] span.composition-drag-handle.is-dragging,[data-composition-editor] span.composition-drag-handle:active{cursor:grabbing!important}`}</style>{ids.map((id,index)=>{
 const active=drag?.id===id;
 const shift=drag?(active?drag.delta:offsets[id]-(drag.tops[id]??0)):0;
 const handle:Handle={className:active?'composition-drag-handle is-dragging':'composition-drag-handle',role:'button',tabIndex:0,'aria-label':`Trascina fase ${index+1}`,style:{cursor:disabled?'default':active?'grabbing':'grab',touchAction:'none',userSelect:'none',padding:'8px 4px'},onKeyDown:event=>{if(disabled)return;if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();onMove(id,Math.max(0,Math.min(ids.length-1,index+(event.key==='ArrowUp'?-1:1))));}},onPointerDown:event=>{
 if(disabled||event.button!==0)return;const tops:Record<string,number>={},heights:Record<string,number>={};const first=nodes.current.get(ids[0])?.getBoundingClientRect().top??0;
 ids.forEach(key=>{const rect=nodes.current.get(key)?.getBoundingClientRect();if(rect){tops[key]=rect.top-first;heights[key]=rect.height;}});
 event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);const next={id,pointer:event.pointerId,start:event.clientY,delta:0,target:index,tops,heights};live.current=next;setDrag(next);
 },onPointerMove:event=>{const current=live.current;if(!current||current.pointer!==event.pointerId)return;const delta=event.clientY-current.start;const center=current.tops[current.id]+current.heights[current.id]/2+delta;let target=0;for(const key of ids){if(key!==current.id&&center>current.tops[key]+current.heights[key]/2)target++;}const next={...current,delta,target};live.current=next;setDrag(next);},onPointerUp:()=>finish(true),onPointerCancel:()=>finish(false),onLostPointerCapture:()=>{if(live.current)finish(false);}};
 return <div key={id} ref={node=>{if(node)nodes.current.set(id,node);else nodes.current.delete(id);}} data-composition-phase={id} style={{position:'relative',zIndex:active?10:0,transform:`translateY(${shift}px)`,transition:drag&&!active?'transform 180ms ease':'none',opacity:1,filter:active?'drop-shadow(0 12px 14px rgba(0,0,0,.20))':undefined,willChange:drag?'transform':undefined}}>{render(id,index,handle)}</div>;
 })}</>;
}
