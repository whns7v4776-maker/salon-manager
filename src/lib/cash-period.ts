export const formatCashDate = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('/') : iso;
export const cashIsoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function cashPeriodRange(period: string, start: string, end: string, now = new Date()) {
 if(period==='all') return null;
 const local = (v:string) => {const [y,m,d]=v.split('-').map(Number);return new Date(y,m-1,d);};
 const weekStart=new Date(now.getFullYear(),now.getMonth(),now.getDate());weekStart.setDate(weekStart.getDate()-(weekStart.getDay()+6)%7);
 const from=period==='week'?weekStart:period==='custom'?local(start):new Date(now.getFullYear(),now.getMonth(),period==='month'?1:now.getDate());
 const last=period==='custom'?local(end):new Date(now.getFullYear(),now.getMonth(),now.getDate());
 const until=new Date(last);until.setDate(until.getDate()+1);
 const days=Math.round((Date.UTC(last.getFullYear(),last.getMonth(),last.getDate())-Date.UTC(from.getFullYear(),from.getMonth(),from.getDate()))/86400000)+1;
 const previousFrom=new Date(from);previousFrom.setDate(previousFrom.getDate()-days);
 return {from,until,previousFrom,previousUntil:from,days};
}
