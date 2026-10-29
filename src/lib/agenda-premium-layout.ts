/** Presentation policy. It never changes the chosen date, booking rules or saved appointments. */
export function agendaVisibleDays(preferred:number,operatorCount:number){
 return operatorCount>1?1:Math.max(1,Math.min(7,Math.round(preferred)||1));
}
/** Web rows shorter than 15 minutes shrink with their duration, so an hour stays readable at a glance. */
export function agendaSlotRowHeight(web:boolean,scale:number,slotMinutes=15){
 const safeScale=Number.isFinite(scale)&&scale>0?scale:1;
 const base=Math.round((web?60:52)*safeScale);
 // 5/10 minute web grids: an hour takes about the space of 5 rows instead of 12.
 // 20px still fits the one-line card; app rows keep their touch height.
 if(web&&Number.isFinite(slotMinutes)&&slotMinutes>0&&slotMinutes<15)return Math.max(20,Math.round(base*slotMinutes/12));
 // Web rows may go down to 30px: compact cards switch to their one-line layout.
 return Math.max(web?30:40,base);
}
export function toggleAgendaOperator(current:string[]|null,id:string,availableIds:string[]){
 const valid=[...new Set(current?.filter(key=>availableIds.includes(key))??[])];
 if(!availableIds.includes(id))return valid.length?valid:null;
 if(!current)return [id];
 const next=valid.includes(id)?valid.filter(key=>key!==id):[...valid,id];
 return next.length?next:null;
}
