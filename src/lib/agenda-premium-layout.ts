/** Presentation policy. It never changes the chosen date, booking rules or saved appointments. */
export function agendaVisibleDays(preferred:number,operatorCount:number){
 return operatorCount>1?1:Math.max(1,Math.min(7,Math.round(preferred)||1));
}
/** A slot row has the same physical height for 5/10/15 minute schedules. */
export function agendaSlotRowHeight(web:boolean,scale:number){
 const safeScale=Number.isFinite(scale)&&scale>0?scale:1;
 // Web rows may go down to 30px: compact cards switch to their one-line layout.
 return Math.max(web?30:40,Math.round((web?60:52)*safeScale));
}
export function toggleAgendaOperator(current:string[]|null,id:string,availableIds:string[]){
 const valid=[...new Set(current?.filter(key=>availableIds.includes(key))??[])];
 if(!availableIds.includes(id))return valid.length?valid:null;
 if(!current)return [id];
 const next=valid.includes(id)?valid.filter(key=>key!==id):[...valid,id];
 return next.length?next:null;
}
