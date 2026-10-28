import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { publicSupabase, supabase } from './supabase';

export type PlaqueFinish = 'none' | 'satin' | 'glass' | 'metal';
export type SalonPlaque = { path: string; finish: PlaqueFinish; mode?: 'text'|'logo'; source?: 'upload'|'ai'|'unknown'; font?: string };
export type PlaqueStatus = { state: 'idle'|'generating'|'ready'|'error'; jobId?: string; unlimited?:boolean;
  processing?:'adapted'|'preserved'|'restored'|'uncertain'; previewUrl?: string; approvedPath?: string; finish: PlaqueFinish; error?: string };
const cache = new Map<string, { value: SalonPlaque|null; at: number }>();
const listeners = new Set<() => void>();
const pending = new Map<string, Promise<void>>();
export const plaqueUrl = (path: string) => publicSupabase.storage.from('salon-logo-approved').getPublicUrl(path).data.publicUrl;
/** Display the complete approved artwork without the generator's empty canvas. */
export const plaqueArtworkUrl=(path:string)=>`${plaqueUrl(path).split('/storage/v1/object/public/')[0]}/functions/v1/salon-logo-plaque?asset=${encodeURIComponent(path)}`;
export function setSalonPlaqueCache(id: string, value: SalonPlaque|null) {
  cache.set(id,{value,at:Date.now()}); listeners.forEach(fn=>fn());
}
export function useSalonPlaque(id?: string) {
  const [,update] = useState(0);
  useEffect(()=>{
    if(!id || !/^[0-9a-f-]{36}$/i.test(id)) return;
    let alive=true;
    const notify=()=>{ if(alive) update(v=>v+1); };
    listeners.add(notify);
    const refresh=()=>{
      if(Date.now()-(cache.get(id)?.at??0)<60_000 || pending.has(id)) return;
      const work=(async()=>{
        const previous=cache.get(id);
        const controller=new AbortController();
        const timeout=setTimeout(()=>controller.abort(),12_000);
        try {
          const {data,error}=await publicSupabase.rpc('get_salon_logo_plaque_v1',{p_workspace_id:id}).abortSignal(controller.signal);
          if(!error && cache.get(id)===previous) setSalonPlaqueCache(id,data?.path||data?.mode==='text'?{path:data.path??'',finish:data.finish,mode:data.mode,source:data.source,font:data.font}:null);
        } finally { clearTimeout(timeout); pending.delete(id); }
      })();
      pending.set(id,work); void work.catch(()=>{});
    };
    refresh();
    const retry=setInterval(refresh,15_000);
    const subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();});
    return ()=>{alive=false;listeners.delete(notify);subscription.remove();clearInterval(retry);};
  },[id]);
  // Undefined means unresolved, not an authoritative absence of branding.
  return id?cache.get(id)?.value:undefined;
}
export async function plaqueRequest<T>(workspaceId: string, action: string, payload: Record<string,unknown>={}): Promise<T> {
  const controller=new AbortController();
  let timeout:ReturnType<typeof setTimeout>;
  const deadline=new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{
    controller.abort();reject(new Error(action==='prepare'
      ? 'Preparazione non completata in tempo. La foto è ancora qui: riprova senza caricarla di nuovo.'
      : action==='generate'?'Invio senza conferma. Verifico se la creazione è partita: non avviare un’altra prova.'
      : ['approve','saveOriginal','saveText','saveLogoFinish'].includes(action)
        ? 'Conferma non ricevuta in tempo. Il salvataggio potrebbe essere riuscito: riapri la sezione per verificare.'
        : 'Risposta non ricevuta in tempo. Riprova tra poco.'));
  },25_000);});
  try {
  const {data,error}=await Promise.race([supabase.functions.invoke('salon-logo-plaque',{
    body:{workspaceId,action,...payload}, signal:controller.signal,
  }),deadline]);
  if(error) {
    let message='Connessione non disponibile. Riprova: la targhetta attuale resta invariata.';
    try { const response=await error.context?.json(); if(response?.error) message=response.error; } catch {}
    throw new Error(message);
  }
  if(data?.error && action!=='status') throw new Error(data.error);
  return data;
  } finally { clearTimeout(timeout!); }
}
