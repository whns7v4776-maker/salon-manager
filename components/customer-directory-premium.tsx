import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { popupGlass } from './premium-web-surfaces';
import { CustomerPremiumBadge } from './customer-premium-settings';
import type { CustomerPremiumStatus } from '../src/lib/use-customer-premium';
import React, { useState } from 'react';
import { Modal, Platform, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';

import { HapticTouchable } from './ui/haptic-touchable';
import { useAccessAppearance } from './access-premium';
import { OwnerStartupSkeletonItem, OwnerStartupSkeletonPulse } from '../src/context/OwnerStartupLoadingContext';
export function CustomerDirectorySummary({total,cancelled,loading}:{total:number;cancelled:number;loading:boolean}){
 const {palette:p}=useAccessAppearance();
 return <View style={{flexDirection:'row',borderWidth:1,borderColor:p.border,borderRadius:19,backgroundColor:p.night?'rgba(38,41,43,.82)':'rgba(255,253,250,.68)',marginBottom:12,paddingVertical:14}}>{[{label:'Clienti totali',value:total,tint:'#9BB39B'},{label:'Annullate dal cliente',value:cancelled,tint:'#C296A4'}].map((v,i)=><View key={v.label} style={{flex:1,alignItems:'center',gap:5,borderLeftWidth:i?1:0,borderLeftColor:p.line}}>{loading?<OwnerStartupSkeletonPulse><OwnerStartupSkeletonItem style={{width:44,height:30,borderRadius:8,backgroundColor:p.line}}/></OwnerStartupSkeletonPulse>:<Text {...{dataSet:{premiumDirectoryCount:'true'}}} style={{fontSize:27,lineHeight:32,fontWeight:'600',color:p.ink,fontVariant:['tabular-nums']}}>{v.value}</Text>}<View style={{flexDirection:'row',alignItems:'center',gap:5}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:v.tint}}/><Text style={{fontSize:11,color:p.muted}}>{v.label}</Text></View></View>)}</View>;
}
export type DirectoryVisit={last:string;next:string;recent:{title:string;date:string;searchDate?:string;price?:number;operator?:string;status?:string}[]};
export function CustomerDirectoryRow({premium,name,initials,color,status,unread,visit,table=false,selected=false,onSelect,onOptions,onCall,onMessage}:{premium?:CustomerPremiumStatus;name:string;initials:string;color:string;status:string;unread:boolean;visit?:DirectoryVisit;table?:boolean;selected?:boolean;onSelect:()=>void;onOptions:()=>void;onCall:()=>void;onMessage:()=>void}){
 const {palette:p}=useAccessAppearance();
 const action=(icon:React.ComponentProps<typeof Ionicons>['name'],label:string,fn:()=>void)=><HapticTouchable accessibilityRole="button" accessibilityLabel={label} onPress={fn} immediatePress style={{width:30,height:30,borderRadius:11,borderWidth:1,borderColor:p.border,backgroundColor:p.field,alignItems:'center',justifyContent:'center'}}><Ionicons name={icon} size={16} color={p.ink}/></HapticTouchable>;
 return <View style={{flexDirection:'row',alignItems:!table&&Platform.OS!=='web'?'flex-start':'center',gap:10,paddingHorizontal:table?12:Platform.OS==='web'?10:3,paddingVertical:table?12:Platform.OS==='web'?11:6,backgroundColor:selected?(p.night?'rgba(201,184,157,.12)':'rgba(204,190,171,.24)'):'transparent',borderRadius:table?13:18,minHeight:table?70:Platform.OS==='web'?90:68,height:undefined,width:'100%'}}>
 <HapticTouchable accessibilityRole="button" accessibilityLabel={`Dettagli di ${name}`} onPress={onSelect} immediatePress style={{flex:table?2.1:1,flexDirection:'row',alignItems:!table&&Platform.OS!=='web'?'flex-start':'center',gap:10,minWidth:0,alignSelf:'stretch',justifyContent:'flex-start'}}>
  <View style={{width:table?40:Platform.OS==='web'?46:42,height:table?40:Platform.OS==='web'?46:42,borderRadius:24,borderWidth:1,borderColor:`${color}55`,backgroundColor:`${color}${p.night?'32':'26'}`,alignItems:'center',justifyContent:'center',...(Platform.OS==='web'?{boxShadow:'inset 0 1px 0 rgba(255,255,255,.24)'}:{})}}><Text style={{color:p.ink,fontSize:15,fontWeight:'500'}}>{initials}</Text></View>
  <View style={{flex:1,minWidth:0,gap:5}}><View style={{flexDirection:'row',alignItems:'center',gap:6}}><Text numberOfLines={Platform.OS==='web'?undefined:2} adjustsFontSizeToFit minimumFontScale={Platform.OS==='web'?0.88:0.72} ellipsizeMode="clip" style={{flex:1,minWidth:0,textAlign:"left",flexWrap:"wrap",lineHeight:22,color:p.ink,fontFamily:Platform.OS==='android'?'serif':'Georgia',fontSize:table?15:17}}>{name}</Text>{unread?<View style={{width:6,height:6,borderRadius:3,backgroundColor:'#AA8DC4'}}/>:null}</View>{!table?<Text numberOfLines={Platform.OS==='web'?undefined:1} style={{fontSize:11,lineHeight:16,color:p.muted}}>Ultima visita · {visit?.last || '—'}</Text>:null}</View>
 </HapticTouchable>
 {table?<><Text style={{flex:1,color:p.muted,fontSize:12}}>{visit?.last||'—'}</Text><Text style={{flex:1.4,color:p.ink,fontSize:12}}>{visit?.next||'—'}</Text></>:null}
 <View style={{flex:table ? .9 : undefined,alignItems:table?'flex-start':'flex-end',gap:7}}><CustomerPremiumBadge status={premium}/><View style={{paddingVertical:4,paddingHorizontal:9,borderRadius:20,backgroundColor:status==='Attivo'?(p.night?'rgba(141,172,149,.17)':'rgba(214,229,209,.6)'):unread?(p.night?'rgba(169,139,196,.17)':'rgba(232,219,244,.7)'):(p.night?'rgba(188,115,123,.15)':'rgba(245,224,227,.6)')}}><Text style={{color:p.ink,fontSize:10}}>{status}</Text></View>{!table?<View style={{flexDirection:'row',gap:5}}>{Platform.OS==='web'?<>{action('call-outline',`Chiama ${name}`,onCall)}{action('chatbubble-outline',`WhatsApp ${name}`,onMessage)}</>:action('eye-outline',`Dettagli di ${name}`,onSelect)}{action('ellipsis-horizontal',`Gestisci ${name}`,onOptions)}</View>:null}</View>
 {table?action('ellipsis-horizontal',`Gestisci ${name}`,onOptions):null}
 </View>;
}
export function CustomerDirectoryBoard<T extends {id:string;full_name:string;phone?:string|null;email?:string|null}>({items,renderRow,renderDetails,visits}:{items:T[];renderRow:(item:T,selected:boolean,onSelect:()=>void)=>React.ReactNode;renderDetails:(item:T)=>React.ReactNode;visits:Map<string,DirectoryVisit>}){
 const {palette:p}=useAccessAppearance();
 const {height}=useWindowDimensions();
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [tab,setTab]=useState<'info'|'visits'>('info');
 const [detailHeight,setDetailHeight]=useState(520);
 const [windowOpen,setWindowOpen]=useState(false);
 const [query,setQuery]=useState('');
 const selected=items.find(x=>x.id===selectedId)||items[0];
 const surface={borderWidth:1,borderColor:p.border,borderRadius:20,backgroundColor:p.night?'rgba(35,39,37,.95)':'rgba(248,246,240,.95)'};
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const filtered=items.filter(item=>normalize([item.full_name,item.phone,item.email].join(' ')).includes(normalize(query)));
 const columns=<View style={{flexDirection:'row',paddingHorizontal:12,paddingVertical:13,gap:10}}>{[['Cliente',2.1],['Ultima visita',1],['Prossimo appuntamento',1.4],['Stato',.9]].map(([label,flex])=><Text key={label} style={{flex:flex as number,fontSize:11,color:p.muted}}>{label}</Text>)}<View style={{width:30}}/></View>;
 const rows=(list:T[],inWindow=false)=>list.map(item=><View key={item.id} style={{borderTopWidth:1,borderTopColor:p.line}}>{renderRow(item,selected?.id===item.id,()=>{setSelectedId(item.id);if(inWindow)setWindowOpen(false);})}</View>);
 const command=(label:string,icon:React.ComponentProps<typeof Ionicons>['name'],action:()=>void)=><HapticTouchable accessibilityRole="button" accessibilityLabel={label} onPress={action} style={{paddingHorizontal:12,paddingVertical:9,borderRadius:11,backgroundColor:p.field,flexDirection:'row',alignItems:'center',gap:7}}><Ionicons name={icon} size={16} color={p.ink}/><Text style={{fontSize:12,color:p.ink}}>{label}</Text></HapticTouchable>;
 return <>
  <View style={{flexDirection:'row',alignItems:'flex-start',gap:14}}>
   <View style={[surface,{flex:1.9,minWidth:0,height:detailHeight,padding:10}]}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4,paddingBottom:4}}><Text style={{fontSize:12,color:p.muted}}>{items.length} clienti</Text>{command('Apri finestra','expand-outline',()=>setWindowOpen(true))}</View>
    {columns}
    <ScrollView accessibilityLabel="Elenco rubrica clienti" style={{flex:1,minHeight:0}}>{!windowOpen?rows(items):null}</ScrollView>
   </View>
   {selected?<View onLayout={event=>{const next=Math.round(event.nativeEvent.layout.height);if(next>0&&Math.abs(next-detailHeight)>1)setDetailHeight(next);}} style={[surface,{flex:1,minWidth:280,padding:14}]}>
    <View style={{flexDirection:'row',gap:4,padding:4,borderRadius:13,backgroundColor:p.field,marginBottom:20}}>{([['info','Informazioni'],['visits','Appuntamenti']] as const).map(([key,label])=><HapticTouchable key={key} accessibilityRole="tab" accessibilityState={{selected:tab===key}} onPress={()=>setTab(key)} style={{flex:1,paddingVertical:10,borderRadius:10,backgroundColor:tab===key?p.action:'transparent'}}><Text style={{textAlign:'center',fontSize:12,fontWeight:'500',color:tab===key?p.actionText:p.muted}}>{label}</Text></HapticTouchable>)}</View>
    {tab==='info'?renderDetails(selected):<CustomerAppointmentList key={selected.id} name={selected.full_name} items={visits.get(selected.id)?.recent||[]}/>}
   </View>:null}
  </View>
  <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={windowOpen} transparent animationType="fade" onRequestClose={()=>setWindowOpen(false)}>
   <View style={[{flex:1,alignItems:'center',justifyContent:'center',padding:16,backgroundColor:p.night?'rgba(0,0,0,.56)':'rgba(50,44,35,.28)'},{backdropFilter:'blur(12px)'} as any]}>
    <HapticTouchable accessibilityLabel="Chiudi finestra rubrica" onPress={()=>setWindowOpen(false)} style={{position:'absolute',inset:0} as any}/>
    <View style={{width:'100%',maxWidth:1120,height:Math.max(120,height-48),borderRadius:24,overflow:'hidden',borderWidth:1,borderColor:p.border,backgroundColor:p.night?'#202423':'#F7F4EE',...popupGlass(p)}}>
     <View style={{padding:20,flexDirection:'row',alignItems:'center',gap:14,borderBottomWidth:1,borderBottomColor:p.line}}><Text style={{flex:1,fontFamily:'Georgia',fontSize:25,color:p.ink}}>Rubrica clienti</Text>{command('Chiudi','close',()=>setWindowOpen(false))}</View>
     <PremiumSearchToolbar><View style={{margin:16,marginBottom:8,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:8,borderRadius:13,backgroundColor:p.field,borderWidth:1,borderColor:p.border}}><Ionicons name="search-outline" size={18} color={p.muted}/><TextInput accessibilityLabel="Cerca nella finestra clienti" value={query} onChangeText={setQuery} placeholder="Cerca cliente, telefono o email…" placeholderTextColor={p.muted} style={{flex:1,minWidth:0,paddingVertical:13,fontSize:14,color:p.ink}}/>{query?command('Svuota','close',()=>setQuery('')):null}</View></PremiumSearchToolbar>
     <View style={{paddingHorizontal:16}}>{columns}</View>
     <ScrollView accessibilityLabel="Rubrica clienti a tutta altezza" style={{flex:1,minHeight:0}} contentContainerStyle={{paddingHorizontal:16,paddingBottom:16}}>{filtered.length?rows(filtered,true):<Text style={{padding:20,color:p.muted}}>Nessun cliente trovato.</Text>}</ScrollView>
    </View>
   </View>
  </Modal>
 </>;
}

function CustomerAppointmentList({items,name}:{items:DirectoryVisit['recent'];name:string}) {
 const {palette:p}=useAccessAppearance();
 const {height}=useWindowDimensions();
 const [query,setQuery]=useState('');
 const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const matching=items.filter(item=>normalize([item.title,item.date,item.searchDate,item.operator,item.status,item.price?.toFixed(2)].join(' ')).includes(normalize(query)));
 return <View style={{gap:12}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:10}}><Text style={{fontFamily:'Georgia',fontSize:22,color:p.ink,flex:1}}>Appuntamenti</Text><Text style={{fontSize:12,color:p.muted}}>{matching.length}{query?` / ${items.length}`:''}</Text></View>
  <PremiumSearchToolbar><View style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:11,borderRadius:12,backgroundColor:p.field,borderWidth:1,borderColor:p.border}}>
   <Ionicons name="search-outline" size={17} color={p.muted}/><TextInput accessibilityLabel={`Cerca appuntamenti di ${name}`} value={query} onChangeText={setQuery} placeholder="Cerca servizio, data o operatore…" placeholderTextColor={p.muted} style={{flex:1,minWidth:0,paddingVertical:12,fontSize:12,color:p.ink}}/>
   {query?<HapticTouchable accessibilityRole="button" accessibilityLabel="Cancella ricerca appuntamenti" onPress={()=>setQuery('')} style={{padding:4}}><Ionicons name="close" size={17} color={p.muted}/></HapticTouchable>:null}
  </View></PremiumSearchToolbar>
  <ScrollView accessibilityLabel={`Appuntamenti di ${name}`} style={{maxHeight:Math.max(200,Math.min(520,height-430)),minHeight:0,flexShrink:1}} contentContainerStyle={{gap:10,paddingBottom:4,paddingRight:4}}>
   {matching.length?matching.map((item,index)=><View key={`${item.searchDate}-${index}`} style={{padding:13,borderRadius:13,borderWidth:1,borderColor:p.border,backgroundColor:p.field,gap:8}}>
    <View style={{flexDirection:'row',gap:8,alignItems:'flex-start'}}><Text style={{color:p.ink,fontSize:14,lineHeight:19,fontWeight:'500',flex:1}}>{item.title}</Text>{typeof item.price==='number'&&Number.isFinite(item.price)?<Text style={{color:p.ink,fontSize:13,fontWeight:'600'}}>{item.price.toLocaleString('it-IT',{style:'currency',currency:'EUR'})}</Text>:null}</View>
    <View style={{flexDirection:'row',gap:6,alignItems:'center'}}><Ionicons name="calendar-outline" size={13} color={p.muted}/><Text style={{color:p.muted,fontSize:12}}>{item.date}</Text></View>
    {item.operator?<Text style={{color:p.muted,fontSize:12}}>Operatore · {item.operator}</Text>:null}
    {item.status?<Text style={{color:p.night?'#B9D7BF':'#40684A',fontSize:10}}>{item.status}</Text>:null}
   </View>):<Text style={{color:p.muted,fontSize:12,padding:12}}>{query?'Nessun appuntamento corrisponde alla ricerca.':'Nessun appuntamento registrato.'}</Text>}
  </ScrollView>
 </View>;
}
