import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect,useSyncExternalStore} from 'react';
import {Platform} from 'react-native';
import type {OwnerNavigationPreference} from './owner-navigation-layout';

const KEY='salonpro:owner-navigation:device:v1';
type Snapshot={preference:OwnerNavigationPreference;hydrated:boolean;saving:boolean;error:string|null};
let snapshot:Snapshot={preference:'auto',hydrated:false,saving:false,error:null};
const listeners=new Set<()=>void>();
let hydration:Promise<void>|null=null,revision=0,writeQueue:Promise<void>=Promise.resolve();
const publish=(next:Partial<Snapshot>)=>{snapshot={...snapshot,...next};listeners.forEach(fn=>fn());};
const valid=(value:unknown):value is OwnerNavigationPreference=>value==='auto'||value==='bottom'||value==='sidebar';
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function loadOwnerNavigationPreference():Promise<void> {
  if(snapshot.hydrated)return Promise.resolve();
  if(hydration)return hydration;
  const version=revision;
  hydration=AsyncStorage.getItem(KEY).then(value=>{
    if(revision===version)publish({preference:valid(value)?value:'auto',hydrated:true,error:null});
  }).catch(()=>{if(revision===version)publish({hydrated:true,error:'Non ho potuto leggere la preferenza. Per ora uso la modalità automatica.'});});
  return hydration;
}
export function setOwnerNavigationPreference(preference:OwnerNavigationPreference):Promise<void> {
  if(!valid(preference))return Promise.reject(new Error('Modalità di navigazione non valida.'));
  const version=++revision;
  publish({preference,hydrated:true,saving:true,error:null});
  const save=writeQueue.catch(()=>undefined).then(()=>AsyncStorage.setItem(KEY,preference));
  writeQueue=save;
  return save.then(()=>{if(revision===version)publish({saving:false,error:null});}).catch(error=>{
    if(revision===version)publish({saving:false,error:'Scelta applicata a questa sessione, ma non salvata sul dispositivo. Riprova.'});
    throw error;
  });
}
export function useOwnerNavigationPreference() {
  const state=useSyncExternalStore(subscribe,()=>snapshot,()=>snapshot);
  useEffect(()=>{if(Platform.OS!=='web')void loadOwnerNavigationPreference();},[]);
  return {...state,setPreference:setOwnerNavigationPreference};
}
