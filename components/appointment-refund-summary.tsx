import {useAccessAppearance} from './access-premium';
import React,{useState} from 'react';
import {Platform,Text,View} from 'react-native';
import {supabase} from '../src/lib/supabase';
import {useCashRefresh} from '../src/lib/use-cash-refresh';
type Item={appointmentId:string;customer:string;service:string;refundDueCents:number};
export function AppointmentRefundSummary({workspaceId,active}:{workspaceId:string;active:boolean}){
 const {palette:p}=useAccessAppearance();const web=Platform.OS==='web';
 const [snapshot,setSnapshot]=useState<{workspace:string;items:Item[]}>({workspace:'',items:[]});
 const [error,setError]=useState(false);
 useCashRefresh(workspaceId,async isCurrent=>{const {data,error}=await supabase.rpc('owner_appointment_refund_summary_v1');if(!isCurrent())return;setError(!!error);if(!error)setSnapshot({workspace:workspaceId,items:Array.isArray(data)?data:[]});},active);
 const items=snapshot.workspace===workspaceId?snapshot.items:[];
 if(!items.length&&!error)return null;
 return <View style={{backgroundColor:web?p.field:'#fff7ed',borderRadius:20,padding:18,gap:10,borderWidth:1,borderColor:web?p.border:'#fed7aa'}}><Text style={{fontSize:18,fontWeight:'700',color:web?p.ink:'#9a3412'}}>Rimborsi da verificare</Text>
 <Text style={{fontSize:14,lineHeight:20,color:web?p.muted:'#7c4a28'}}>Incassi superiori al prezzo aggiornato. Nessun rimborso viene eseguito automaticamente. Per i pagamenti Stripe, gestisci il rimborso da Stripe.</Text>
 {error?<Text accessibilityRole="alert">Verifica temporaneamente non disponibile. I dati verranno aggiornati alla riconnessione.</Text>:null}
 {items.map(item=><View key={item.appointmentId} style={{gap:3,paddingVertical:7}}><Text style={{fontWeight:'600',fontSize:16,color:web?p.ink:'#431407'}}>{item.customer}</Text><Text style={{fontSize:14,color:web?p.muted:'#7c4a28'}}>{item.service}</Text><Text style={{fontSize:18,fontWeight:'700',color:web?p.ink:'#9a3412'}}>{(item.refundDueCents/100).toLocaleString('it-IT',{style:'currency',currency:'EUR'})}</Text></View>)}
 </View>;
}
