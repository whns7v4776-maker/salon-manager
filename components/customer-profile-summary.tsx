import {NativeReadableText as Text} from './owner-native-premium';
import { CustomerPremiumBadge } from './customer-premium-settings';
import type { CustomerPremiumStatus } from '../src/lib/use-customer-premium';
import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { HapticTouchable } from './ui/haptic-touchable';
type Action={label:string;icon:React.ComponentProps<typeof Ionicons>['name'];onPress:()=>void;disabled?:boolean};
export function CustomerProfileSummary({premium,name,initials,color,phone,email,status,limits,cancellations,actions,onEdit,onOptions,onBenefits,children}:{premium?:CustomerPremiumStatus;name:string;initials:string;color:string;phone:string;email:string;status:string;limits:string;cancellations:number;actions:Action[];onEdit:()=>void;onOptions:()=>void;onBenefits:()=>void;children?:React.ReactNode}){
 const {palette:p}=useAccessAppearance();
 const tone=(label:string)=>{
   if(label==='WhatsApp')return p.night?{ink:'#BCD1BA',wash:'#304134'}:{ink:'#4D6A50',wash:'#E2EBDD'};
   if(label==='Instagram'||label==='Vantaggi')return p.night?{ink:'#D2BED5',wash:'#3A323D'}:{ink:'#79617E',wash:'#EEE7EE'};
   if(label==='Invia invito')return p.night?{ink:'#DEC89B',wash:'#443D2E'}:{ink:'#816944',wash:'#F0E6D0'};
   return p.night?{ink:'#BED0D2',wash:'#304144'}:{ink:'#50696E',wash:'#E2EAEB'};
 };
 const button=(a:Action)=><HapticTouchable key={a.label} webHoverLift accessibilityRole="button" accessibilityLabel={`${a.label} ${name}`} disabled={a.disabled} onPress={a.onPress} style={{flexGrow:1,flexBasis:'45%',minWidth:110,minHeight:42,paddingHorizontal:12,paddingVertical:11,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:tone(a.label).wash,flexDirection:'row',alignItems:'center',gap:8,opacity:a.disabled?0.4:1}}><Ionicons name={a.icon} size={18} color={tone(a.label).ink}/><Text style={{fontSize:12,color:tone(a.label).ink,flexShrink:1}}>{a.label}</Text></HapticTouchable>;
 return <View style={{gap:20,padding:2}}>
  <View style={{flexDirection:'row',alignItems:'flex-start',gap:12}}><View style={{width:52,height:52,borderRadius:27,backgroundColor:`${color}28`,borderWidth:1,borderColor:`${color}55`,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:19,color:p.ink}}>{initials}</Text></View><View style={{flex:1,minWidth:0,gap:8}}><Text style={{fontFamily:'Georgia',fontSize:22,lineHeight:27,color:p.ink}}>{name}</Text><View style={{alignSelf:'flex-start',borderRadius:20,paddingHorizontal:9,paddingVertical:4,backgroundColor:status==='Inibito'?(p.night?'rgba(190,116,124,.18)':'rgba(237,212,216,.5)'):(p.night?'rgba(138,171,146,.17)':'rgba(213,230,216,.6)')}}><Text style={{fontSize:10,color:p.ink}}>{status}</Text></View></View><HapticTouchable accessibilityRole="button" accessibilityLabel={`Opzioni ${name}`} onPress={onOptions} style={{width:32,height:32,borderRadius:10,alignItems:'center',justifyContent:'center'}}><Ionicons name="ellipsis-horizontal" size={21} color={p.muted}/></HapticTouchable></View>
  <CustomerPremiumBadge status={premium}/>
  <View style={{gap:6}}><Text selectable style={{fontSize:14,color:p.ink}}>{phone||'Telefono non disponibile'}</Text><Text selectable style={{fontSize:12,lineHeight:18,color:p.muted}}>{email||'Email non indicata'}</Text></View>
  <View style={{flexDirection:'row',gap:8}}>{button({label:'Modifica',icon:'create-outline',onPress:onEdit})}{button({label:'Vantaggi',icon:'layers-outline',onPress:onBenefits})}</View>
  <View style={{borderTopWidth:1,borderTopColor:p.line,paddingTop:16,gap:12}}><Text style={{fontSize:10,fontWeight:'600',letterSpacing:1,color:p.muted}}>PRENOTAZIONI</Text><Text style={{fontSize:13,lineHeight:19,color:p.ink}}>{limits}</Text><View style={{flexDirection:'row',alignItems:'center',gap:8}}><Ionicons name="calendar-clear-outline" size={17} color={cancellations?(p.night?'#D6A2AB':'#9C5B65'):p.muted}/><Text style={{fontSize:12,color:p.muted}}>{cancellations?`${cancellations} appuntamenti annullati`:'Nessun appuntamento annullato'}</Text></View></View>
  {children}
  <View style={{borderTopWidth:1,borderTopColor:p.line,paddingTop:16,gap:12}}><Text style={{fontSize:10,fontWeight:'600',letterSpacing:1,color:p.muted}}>CONTATTA IL CLIENTE</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{actions.map(button)}</View></View>
 </View>;
}
