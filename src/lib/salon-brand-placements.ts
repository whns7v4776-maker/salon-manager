import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { publicSupabase, supabase } from './supabase';

export type SalonBrandPlacement = {workspaceId:string;eligible:boolean;ownerEnabled:boolean;frontendEnabled:boolean;path:string|null};
const cache=new Map<string,{value:SalonBrandPlacement;at:number}>();
const pending=new Map<string,Promise<void>>();
const errors=new Map<string,string>();
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
const setError=(id:string,message:string)=>{errors.set(id,message);emit();};
const valid=(data:any,id:string):data is SalonBrandPlacement=>data?.workspaceId===id&&typeof data.eligible==='boolean'&&typeof data.ownerEnabled==='boolean'&&typeof data.frontendEnabled==='boolean'&&(data.path===null||typeof data.path==='string');
export function invalidateSalonBrandPlacement(workspaceId:string) {
 const previous=cache.get(workspaceId);
 if(previous)cache.set(workspaceId,{...previous,at:0});
 emit();
}
export function useSalonBrandPlacement(workspaceId?:string) {
 const [,render]=useState(0);
 const refresh=useCallback(async(force=false)=>{
  if(!workspaceId)return;
  if(!force&&Date.now()-(cache.get(workspaceId)?.at??0)<60000)return;
  const active=pending.get(workspaceId);if(active)return active;
  const task=(async()=>{
   const previous=cache.get(workspaceId);
   const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
   try{
    const result=await publicSupabase.rpc('get_salon_brand_placements',{p_workspace_id:workspaceId}).abortSignal(controller.signal);
    if(result.error?.code==='PGRST202'||result.error?.code==='42883')throw new Error('server_update_required');
    if(result.error||!valid(result.data,workspaceId))throw new Error('brand_unavailable');
    if(cache.get(workspaceId)===previous){cache.set(workspaceId,{value:result.data,at:Date.now()});setError(workspaceId,'');emit();}
   }catch(error){setError(workspaceId,error instanceof Error&&error.message==='server_update_required'?'Questa impostazione sarà disponibile dopo l’aggiornamento del server.':'Impossibile caricare la visibilità dell’insegna. Riprova.');}
   finally{clearTimeout(timeout);pending.delete(workspaceId);}
  })();pending.set(workspaceId,task);return task;
 },[workspaceId]);
 useEffect(()=>{
  let alive=true;const changed=()=>{if(alive){render(n=>n+1);if(workspaceId&&cache.get(workspaceId)?.at===0)void refresh(true);}};listeners.add(changed);void refresh();
  const poll=setInterval(()=>{if(Platform.OS==='web'?!document.hidden:AppState.currentState==='active')void refresh();},30000);
  const focus=()=>{void refresh(true);};const subscription=AppState.addEventListener('change',state=>{if(state==='active')focus();});
  if(Platform.OS==='web')window.addEventListener('focus',focus);
  return()=>{alive=false;listeners.delete(changed);clearInterval(poll);subscription.remove();if(Platform.OS==='web')window.removeEventListener('focus',focus);};
 },[refresh,workspaceId]);
 const save=useCallback(async(ownerEnabled:boolean,frontendEnabled:boolean)=>{
  if(!workspaceId)throw new Error('Salone non disponibile.');
  const result=await supabase.rpc('set_owner_salon_brand_placements',{p_workspace_id:workspaceId,p_owner_enabled:ownerEnabled,p_frontend_enabled:frontendEnabled});
  if(result.error||!valid(result.data,workspaceId))throw new Error('Visibilità non salvata. Verifica di avere una targhetta IA approvata e riprova.');
  cache.set(workspaceId,{value:result.data,at:Date.now()});setError(workspaceId,'');emit();
 },[workspaceId]);
 return {value:workspaceId?cache.get(workspaceId)?.value:undefined,error:workspaceId?errors.get(workspaceId)??'':'',refresh,save};
}
