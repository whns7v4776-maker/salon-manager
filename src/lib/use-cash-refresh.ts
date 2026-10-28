import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
let sequence=0;
// Events received during a read are queued. Reconnect/resume and periodic reads
// recover missed WebSocket events, without blanking the last confirmed state.
export function useCashRefresh(workspaceId:string, refresh:(isCurrent:()=>boolean)=>Promise<unknown>, active=true) {
 const latest=useRef(refresh); latest.current=refresh;
 useEffect(()=>{
  if(!active||!workspaceId)return;
  let stopped=false,running=false,queued=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  const visible=()=>Platform.OS==='web'?typeof document==='undefined'||document.visibilityState!=='hidden':AppState.currentState==='active';
  const run=async()=>{
   if(stopped)return;
   if(running){queued=true;return;}
   running=true;
   try{await latest.current(()=>!stopped);}catch{/* Keep confirmed data; reconnect/fallback retries. */}
   finally{running=false;if(queued&&!stopped){queued=false;schedule();}}
  };
  const schedule=()=>{if(stopped)return;if(timer)clearTimeout(timer);timer=setTimeout(()=>void run(),150);};
  const channel=supabase.channel(`cash-refresh-${workspaceId}-${++sequence}`).on('postgres_changes',{event:'*',schema:'public',table:'cash_sync_revisions',filter:`workspace_id=eq.${workspaceId}`},schedule).subscribe(state=>{if(state==='SUBSCRIBED')schedule();});
  const app=AppState.addEventListener('change',state=>{if(state==='active')schedule();});
  if(Platform.OS==='web'){window.addEventListener('online',schedule);document.addEventListener('visibilitychange',schedule);}
  const fallback=setInterval(()=>{if(visible())schedule();},30000);schedule();
  return()=>{stopped=true;if(timer)clearTimeout(timer);clearInterval(fallback);app.remove();void supabase.removeChannel(channel);if(Platform.OS==='web'){window.removeEventListener('online',schedule);document.removeEventListener('visibilitychange',schedule);}};
 },[workspaceId,active]);
}
