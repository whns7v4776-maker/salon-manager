import { useEffect, useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

const values=new Map<string,boolean>();
const pending=new Map<string,Promise<void>>();
const listeners=new Set<()=>void>();
const emit=()=>listeners.forEach(fn=>fn());
export function nativeCashKey(scope:string,part:string) {
  let hash=2166136261;
  for(let i=0;i<scope.length;i++)hash=Math.imul(hash^scope.charCodeAt(i),16777619);
  return `salonpro.cash.${(hash>>>0).toString(16)}.${part}`;
}
export function loadNativeCashPrivacy(scope:string):Promise<void> {
  if(!scope)return Promise.resolve();
  if(pending.has(scope))return pending.get(scope)!;
  const task=SecureStore.getItemAsync(nativeCashKey(scope,'privacy')).then(raw=>{
    if(!raw){values.set(scope,false);emit();return;}
    const record=JSON.parse(raw);
    if(record.scope!==scope||typeof record.enabled!=='boolean')throw new Error('Configurazione accesso da verificare.');
    values.set(scope,record.enabled);emit();
  }).finally(()=>pending.delete(scope));
  pending.set(scope,task);return task;
}
function subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function useCashDevicePrivacy(scope:string) {
  const enabled=useSyncExternalStore(subscribe,()=>values.get(scope)??null,()=>null);
  useEffect(()=>{void loadNativeCashPrivacy(scope).catch(()=>undefined);},[scope]);
  return {enabled,setEnabled:async(next:boolean)=>{
    if(!scope)throw new Error('Accedi con l’account del titolare.');
    await SecureStore.setItemAsync(nativeCashKey(scope,'privacy'),JSON.stringify({scope,enabled:next}));
    values.set(scope,next);emit();
  }};
}
