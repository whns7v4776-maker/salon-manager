import { useIsFocused } from '@react-navigation/native';
import { OwnerBrandMark } from './salon-brand-mark';
import React, { memo, useEffect, useState } from 'react';
import { Platform, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { SalonCodeBadge } from './ui/salon-code-badge';
import { HapticTouchable } from './ui/haptic-touchable';
import { NativeSettingsPopup } from './native-settings-popup';
import { AccessBackdrop, AccessWordmark, useAccessAppearance } from './access-premium';

type Props={ today:string; income:string; appointments:string; unpaid:string; clients:string; pending:string; pendingCash:string; legacyCash:string; available:number|null; operatorSummary:string; customerSummary:string; onOperators:()=>void; onCustomers:()=>void; onAgenda:()=>void; onRequests:()=>void; onAdmin:()=>void; priority:React.ReactNode; reminder:React.ReactNode; details:Record<'results'|'indicators'|'invite',React.ReactNode>; profile:React.ReactNode; shop:React.ReactNode; admin:React.ReactNode; onProfile:()=>void; onInvite:()=>void; onAvailability:()=>void; };
const serif=Platform.OS==='ios'?'Georgia':'serif';
const sans=Platform.OS==='ios'?'System':'sans-serif';
export const NativeHomeClock=memo(function HomeClock({today}:{today:string}){
 const {palette:p}=useAccessAppearance();
 const format=()=>new Intl.DateTimeFormat('it-IT',{hour:'2-digit',minute:'2-digit'}).format(new Date());
 const [clock,setClock]=useState(format);
 useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const tick=()=>{setClock(format());timer=setTimeout(tick,60000-Date.now()%60000+20);};tick();return()=>clearTimeout(timer);},[]);
 const date=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'}).format(new Date(`${today}T12:00:00`));
 return <Text style={{color:p.muted,fontFamily:sans,fontSize:11,letterSpacing:.6}}>{date.toLocaleUpperCase('it')} · {clock}</Text>;
});
/** Small raised disc behind an icon: solid fill, warm rim, top light and a soft drop. */
/** `accent` (6-digit hex) gives a section its own muted colour: tinted disc, matching ring and icon. */
export function NativeMedal({icon,size=40,tint,iconSize,accent}:{icon:React.ComponentProps<typeof Ionicons>['name'];size?:number;tint?:string;iconSize?:number;accent?:string}){
 const {palette:p}=useAccessAppearance();
 return <View style={{width:size,height:size,borderRadius:size/2,backgroundColor:accent?`${accent}${p.night?'2E':'24'}`:tint??(p.night?'#3A352C':'#F3E7D3'),borderWidth:1,borderColor:accent?`${accent}${p.night?'73':'66'}`:p.night?'rgba(216,194,155,.3)':'rgba(150,118,72,.26)',alignItems:'center',justifyContent:'center',shadowColor:p.night?'#000000':'#6E542E',shadowOpacity:p.night?.35:.16,shadowRadius:5,shadowOffset:{width:0,height:3},elevation:2}}>
  <View pointerEvents="none" style={{position:'absolute',top:1,left:size*.18,right:size*.18,height:size*.42,borderTopLeftRadius:size/2,borderTopRightRadius:size/2,backgroundColor:p.night?'rgba(255,255,255,.07)':'rgba(255,255,255,.55)'}}/>
  <Ionicons name={icon} size={iconSize??Math.round(size*.48)} color={accent??p.ink}/>
 </View>;
}
function Glass({children,tint,style}:{children:React.ReactNode;tint?:string;style?:any}){
 const {palette:p}=useAccessAppearance();
 return <View style={[s.glass,{backgroundColor:tint??(p.night?'rgba(38,41,43,.9)':'rgba(255,253,250,.86)'),borderColor:p.border,shadowOpacity:p.night?.28:.08,shadowRadius:14,shadowOffset:{width:0,height:6},elevation:3},style]}>{children}</View>;
}
function Availability({value}:{value:number|null}){
 const {palette:p}=useAccessAppearance(); const valid=value!==null; const pct=Math.max(0,Math.min(100,value??0));
 // Luminous ring: gradient arc over a soft halo, with a bright bead where the arc ends.
 const size=58,c=size/2,r=23,circ=2*Math.PI*r,arc=circ*pct/100;
 const angle=(pct/100)*2*Math.PI-Math.PI/2,bx=c+r*Math.cos(angle),by=c+r*Math.sin(angle);
 const hi=p.night?'#D9F2D2':'#7FA486',lo=p.night?'#7FB08A':'#4F6E57',glow=p.night?'#9FD6A6':'#6E9A76';
 return <View style={{alignItems:'center',width:74}} accessibilityLabel={valid?`Disponibilità stimata ${pct}%`:'Disponibilità non disponibile'}><View style={[{width:size,height:size,alignItems:'center',justifyContent:'center'},Platform.OS==='web'&&valid?({filter:`drop-shadow(0 0 6px ${p.night?'rgba(159,214,166,.45)':'rgba(110,154,118,.30)'})`} as any):null]}><Svg width={size} height={size} style={StyleSheet.absoluteFill}>
  <Defs><LinearGradient id="availabilityArc" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={hi}/><Stop offset="1" stopColor={lo}/></LinearGradient><RadialGradient id="availabilityCore" cx="50%" cy="45%" r="55%"><Stop offset="0" stopColor={glow} stopOpacity={p.night?.16:.12}/><Stop offset="1" stopColor={glow} stopOpacity={0}/></RadialGradient></Defs>
  <Circle cx={c} cy={c} r={r-3} fill="url(#availabilityCore)"/>
  <Circle cx={c} cy={c} r={r} fill="none" stroke={p.night?'#ffffff14':'#DCE1D6'} strokeWidth={3}/>
  {valid&&pct>0?<>
   {[9,6].map((w,i)=><Circle key={w} cx={c} cy={c} r={r} fill="none" stroke={glow} strokeOpacity={p.night?(i?.16:.07):(i?.12:.05)} strokeWidth={w} strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" rotation={-90} origin={`${c},${c}`}/>)}
   <Circle cx={c} cy={c} r={r} fill="none" stroke="url(#availabilityArc)" strokeWidth={3.5} strokeDasharray={`${arc} ${circ}`} strokeLinecap="round" rotation={-90} origin={`${c},${c}`}/>
   <Circle cx={bx} cy={by} r={5} fill={glow} fillOpacity={p.night?.28:.2}/>
   <Circle cx={bx} cy={by} r={2.6} fill={p.night?'#F2FFF0':'#FFFFFF'} stroke={hi} strokeWidth={1}/>
  </>:null}
 </Svg><Text style={{color:p.ink,fontFamily:sans,fontSize:15,fontWeight:'600',fontVariant:['tabular-nums']}}>{valid?`${pct}%`:'—'}</Text></View><Text style={{color:p.muted,fontFamily:sans,fontSize:11,marginTop:3}}>Disponibilità*</Text></View>;
}
export const OwnerPremiumNativeHome=memo(function OwnerPremiumNativeHome(props:Props){
 const {palette:p,toggle}=useAccessAppearance();
 const focused=useIsFocused();
 const [open,setOpen]=useState<'results'|'indicators'|'invite'|null>(null);
 const quick=(title:string,icon:React.ComponentProps<typeof Ionicons>['name'],hint:string,action:()=>void)=><NativeHomeQuickAction title={title} icon={icon} hint={hint} onPress={action}/>;
 const heading=(title:string)=> <Text accessibilityRole="header" style={[s.heading,{color:p.ink}]}>{title}</Text>;
 const peopleRow=(label:string,icon:React.ComponentProps<typeof Ionicons>['name'],value:string,onPress:()=>void)=><Pressable accessibilityRole="button" accessibilityLabel={`Apri ${label}`} onPress={onPress} style={({pressed})=>[s.peopleRow,{opacity:pressed?.6:1}]}><NativeMedal icon={icon} size={36} iconSize={18}/><Text style={[s.rowTitle,{color:p.ink,marginLeft:3}]}>{label}</Text><Text numberOfLines={1} style={[s.rowSummary,{color:p.muted}]}>{value}</Text><Ionicons name="chevron-forward" size={15} color={p.muted}/></Pressable>;
 return <View style={{gap:12}}>
 {focused?<StatusBar barStyle={p.night?'light-content':'dark-content'}/>:null}
 {props.reminder}
 <View style={s.brandRow}><Pressable accessibilityLabel="SalonPro" onLongPress={props.onAdmin} style={{width:154,height:64,justifyContent:'center'}}><OwnerBrandMark compact /></Pressable><Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={p.night?'Attiva tema chiaro':'Attiva tema scuro'} hitSlop={8} style={[s.theme,{backgroundColor:p.field,borderColor:p.border}]}><Ionicons name={p.night?'sunny-outline':'moon-outline'} size={19} color={p.ink}/></Pressable></View>
 <View style={{gap:5}}><NativeHomeClock today={props.today}/><Text accessibilityRole="header" style={[s.title,{color:p.ink}]}>Il tuo salone, oggi.</Text></View>
 <Glass style={{padding:15}}><View style={s.incomeRow}><View style={{flex:1,minWidth:0,gap:3}}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.85} style={[s.income,{color:p.ink}]}>{props.income}</Text><Text style={[s.copy,{color:p.muted}]}>Incassi confermati</Text></View><Availability value={props.available}/></View><View style={{height:StyleSheet.hairlineWidth,backgroundColor:p.line,marginVertical:13}}/><View style={{flexDirection:'row'}}>{([{label:'Appuntamenti',value:props.appointments,icon:'calendar-outline',tint:p.night?'rgba(216,194,155,.16)':'#F0E5D1'},{label:'Da saldare',value:props.unpaid,icon:'receipt-outline',tint:p.night?'rgba(201,150,88,.2)':'#F8E6C8'},{label:'Clienti',value:props.clients,icon:'people-outline',tint:p.night?'rgba(216,194,155,.16)':'#F0E5D1'}] as const).map((item,i)=><View key={item.label} style={[s.mini,{borderLeftWidth:i?StyleSheet.hairlineWidth:0,borderLeftColor:p.line}]}><NativeMedal icon={item.icon} size={32} iconSize={16} tint={item.tint}/><View style={{flex:1,minWidth:0}}><Text style={[s.miniValue,{color:p.ink}]}>{item.value}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.7} style={[s.miniLabel,{color:p.muted}]}>{item.label}</Text></View></View>)}</View></Glass>
 <View style={s.sectionRow}>{heading('Adesso')}<Pressable accessibilityRole="button" onPress={props.onAgenda} style={{flexDirection:'row',alignItems:'center',minHeight:34}}><Text style={[s.copy,{color:p.muted}]}>Agenda</Text><Ionicons name="chevron-forward" size={15} color={p.muted}/></Pressable></View>
 {props.priority}
 <Glass><Pressable onPress={props.onRequests} accessibilityRole="button" accessibilityLabel="Apri richieste da confermare" style={s.notice}>{props.pending==='0'||props.pending==='—'?<View style={{width:10,height:10,borderWidth:1.4,borderRadius:5,borderColor:p.muted}}/>:<View style={{width:10,height:10,borderRadius:5,backgroundColor:'#C9505A'}}/>}<Text style={[s.copy,{color:p.ink,flex:1,fontSize:14,lineHeight:20}]}>{props.pending==='0'?'Nessuna richiesta da confermare':props.pending==='1'?'1 richiesta da confermare':`${props.pending} richieste da confermare`}</Text><Ionicons name="chevron-forward" size={16} color={p.muted}/></Pressable></Glass>
 {heading('La giornata')}
 <Glass>{peopleRow('Operatori','person-outline',props.operatorSummary,props.onOperators)}<View style={{height:StyleSheet.hairlineWidth,backgroundColor:p.line,marginHorizontal:15}}/>{peopleRow('Clienti','people-outline',props.customerSummary,props.onCustomers)}</Glass>
 {heading('Il tuo salone')}
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>
 {quick('Risultati','stats-chart-outline','Incassi e prenotazioni',()=>setOpen('results'))}
 {quick('Indicatori','pie-chart-outline','Servizi e andamento',()=>setOpen('indicators'))}
 {quick('Profilo salone','storefront-outline','Dati e personalizzazione',props.onProfile)}
 {quick('Invita i clienti','qr-code-outline','Link e codice QR',()=>{props.onInvite();setOpen('invite');})}
 {quick('Orari e disponibilità','calendar-outline','Settimana, ferie ed eccezioni',props.onAvailability)}
 {props.shop}
 </View>
 <Text style={{color:p.muted,fontFamily:sans,fontSize:12,lineHeight:17,textAlign:'center',marginTop:1}}>* Disponibilità stimata sulle fasce dell’agenda</Text>
 <View style={{display:'none'}}>{props.profile}</View>
 {props.admin}
 {open ? <NativeSettingsPopup premiumWeb compact title={open==='results'?'Risultati del salone':open==='indicators'?'Indicatori':'Invita i tuoi clienti'} icon={open==='invite'?'qr-code-outline':open==='results'?'stats-chart-outline':'pie-chart-outline'} onClose={()=>setOpen(null)}>{props.details[open]}</NativeSettingsPopup> : null}
 </View>;
});
export function NativeHomeIndicators({service,duration,average}:{service:string;duration:string;average:string}){
 const {palette:p}=useAccessAppearance();
 const items=[{label:'Servizio più richiesto',value:service,icon:'cut-outline'},{label:'Durata del servizio top',value:duration,icon:'time-outline'},{label:'Incasso medio confermato',value:average,icon:'wallet-outline'}] as const;
 return <Glass>{items.map((item,index)=><View key={item.label} style={{padding:16,flexDirection:'row',alignItems:'center',gap:14,borderTopWidth:index?StyleSheet.hairlineWidth:0,borderTopColor:p.line}}><NativeMedal icon={item.icon} size={40} iconSize={20}/><View style={{flex:1,gap:3}}><Text style={{color:p.muted,fontFamily:sans,fontSize:13}}>{item.label}</Text><Text style={{color:p.ink,fontFamily:sans,fontSize:21,lineHeight:27,fontWeight:'600',fontVariant:['tabular-nums']}}>{item.value}</Text></View></View>)}</Glass>;
}
export function NativeHomeInvite({name,link,code,qr,warning,enabled,onShare,onPrint}:{name:string;link:string;code:string;qr:React.ReactNode;warning:string|null;enabled:boolean;onShare:()=>void;onPrint:()=>void}){
 const {palette:p}=useAccessAppearance();
 const button=(label:string,icon:React.ComponentProps<typeof Ionicons>['name'],primary:boolean,action:()=>void)=><HapticTouchable accessibilityRole="button" accessibilityLabel={label} onPress={action} disabled={!enabled} pressScale={.975} pressOpacity={.98} style={{minHeight:48,borderRadius:15,borderWidth:1,borderColor:p.border,backgroundColor:primary?p.action:p.field,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:12,opacity:enabled?1:.45}}><Ionicons name={icon} size={18} color={primary?p.actionText:p.ink}/><Text style={{fontFamily:sans,fontSize:13,fontWeight:'600',color:primary?p.actionText:p.ink}}>{label}</Text></HapticTouchable>;
 return <View style={{gap:12}}>
 {warning?<Glass tint={p.night?'rgba(181,146,113,.13)':'rgba(245,230,214,.6)'} style={{padding:14}}><Text style={{color:p.ink,fontSize:13,lineHeight:19}}>{warning}</Text></Glass>:null}
 <Glass style={{padding:14,gap:10}}><Text style={{color:p.muted,fontFamily:sans,fontSize:12,fontWeight:'500'}}>Link di prenotazione</Text><Text style={[s.heading,{color:p.ink,fontSize:24}]}>{name}</Text><Text style={{color:p.muted,fontFamily:sans,fontSize:12,lineHeight:18}}>Invita i clienti a prenotare nella tua area dedicata.</Text><View style={{padding:12,borderRadius:13,backgroundColor:p.field,borderWidth:StyleSheet.hairlineWidth,borderColor:p.border}}><Text selectable numberOfLines={2} style={{color:p.ink,fontSize:13,lineHeight:19}}>{link.replace(/^https?:\/\//,'').replace(/\?.*$/,'').replace(/\/{2,}/g,'/')}</Text></View>{button('Condividi link cliente','share-outline',true,onShare)}</Glass>
 <Glass style={{padding:14,alignItems:'center',gap:8}}><Text style={[s.heading,{color:p.ink}]}>Inquadra e accedi</Text><Text style={{color:p.muted,fontFamily:sans,fontSize:12}}>Senza digitare il codice</Text><View style={{padding:14,borderRadius:18,backgroundColor:'#FFFFFF',marginVertical:4}}>{qr}</View><Text style={{color:p.muted,fontSize:11,letterSpacing:1}}>Codice salone</Text><SalonCodeBadge code={code} premium/><Text style={{color:p.muted,fontFamily:sans,fontSize:11,lineHeight:17,textAlign:'center'}}>Il cliente può anche inserire questo codice nell’app per associare il salone.</Text></Glass>
 {button('Stampa il QR per il salone','print-outline',false,onPrint)}
 </View>;
}
export function NativeHomeResults({pending,legacy,settled,bookings,unpaid,focus}:{pending:string;legacy:string;settled:string;bookings:string;unpaid:string;focus:React.ReactNode}){
 const {palette:p}=useAccessAppearance();
 const amounts=[{label:'Da saldare',hint:'In Cassa',value:pending,icon:'wallet-outline',tint:p.night?'rgba(216,194,155,.10)':'rgba(240,229,209,.62)'},{label:'Da verificare',hint:'Storico incassi',value:legacy,icon:'time-outline',tint:p.night?'rgba(201,150,88,.14)':'rgba(250,233,206,.7)'}] as const;
 return <View style={{gap:18}}>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{amounts.map(item=><Glass key={item.label} tint={item.tint} style={{flexGrow:1,flexBasis:item.value.length>10?'100%':150,minWidth:0,padding:14,gap:8}}><NativeMedal icon={item.icon} size={36} iconSize={18}/><Text style={{fontFamily:sans,fontSize:12,color:p.muted}}>{item.label}</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.85} style={{fontFamily:sans,fontSize:25,lineHeight:32,fontWeight:'600',letterSpacing:-.6,color:p.ink,fontVariant:['tabular-nums']}}>{item.value}</Text><Text style={{fontFamily:sans,fontSize:12,color:p.muted}}>{item.hint}</Text></Glass>)}</View>
 <View style={{gap:10}}><Text accessibilityRole="header" style={[s.heading,{color:p.ink}]}>Appuntamenti</Text><Glass style={{paddingVertical:18,flexDirection:'row'}}>{[{label:'Saldati',value:settled},{label:'Prenotazioni',value:bookings},{label:'Non saldati',value:unpaid}].map((item,i)=><View key={item.label} style={{flex:1,alignItems:'center',gap:5,borderLeftWidth:i?StyleSheet.hairlineWidth:0,borderLeftColor:p.line}}><Text style={{fontFamily:sans,fontSize:25,fontWeight:'600',fontVariant:['tabular-nums'],color:p.ink}}>{item.value}</Text><Text style={{fontFamily:sans,fontSize:12,color:p.muted}}>{item.label}</Text></View>)}</Glass></View>
 {focus}
 </View>;
}
export function NativeHomeQuickAction({title,icon,hint,onPress,attention=false}:{title:string;icon:React.ComponentProps<typeof Ionicons>['name'];hint:string;onPress:()=>void;attention?:boolean}){
 const {palette:p}=useAccessAppearance();
 return <Pressable accessibilityRole="button" accessibilityLabel={`Apri ${title}${attention?', attività da gestire':''}`} onPress={onPress} style={({pressed})=>({width:'48%',flexGrow:1,minHeight:112,padding:14,borderRadius:19,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'rgba(48,49,47,.9)':'rgba(255,253,250,.88)',opacity:pressed?.65:1,gap:7,shadowColor:'#302419',shadowOpacity:p.night?.28:.08,shadowRadius:14,shadowOffset:{width:0,height:6},elevation:3})}><View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start'}}><NativeMedal icon={icon} size={40} iconSize={20}/>{attention?<View style={{width:7,height:7,borderRadius:4,backgroundColor:'#D94E58'}}/>:<Ionicons name="chevron-forward" size={14} color={p.muted}/>}</View><Text style={{fontFamily:sans,fontSize:15,fontWeight:'600',color:p.ink}}>{title}</Text><Text style={{fontFamily:sans,fontSize:12,lineHeight:17,color:p.muted}}>{hint}</Text></Pressable>;
}
export function NativeHomeBackdrop(){const {palette:p}=useAccessAppearance();return <View pointerEvents="none" style={StyleSheet.absoluteFill}><AccessBackdrop/><View style={[StyleSheet.absoluteFill,{backgroundColor:p.night?'rgba(0,0,0,.46)':'rgba(248,245,240,.16)'}]}/></View>;}
const s=StyleSheet.create({glass:{borderWidth:1,borderRadius:19,shadowColor:'#302419',shadowOffset:{width:0,height:3},shadowRadius:9},brandRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',height:64},theme:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:18,borderWidth:1},title:{fontFamily:serif,fontSize:27,lineHeight:34,letterSpacing:-.6},heading:{fontFamily:serif,fontSize:21,lineHeight:27},incomeRow:{flexDirection:'row',alignItems:'center',gap:12},income:{fontFamily:sans,fontSize:32,lineHeight:40,fontWeight:'600',fontVariant:['tabular-nums'],letterSpacing:-1},copy:{fontFamily:sans,fontSize:12,lineHeight:18},mini:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:5},miniIcon:{width:29,height:29,alignItems:'center',justifyContent:'center',borderRadius:15},miniValue:{fontFamily:sans,fontSize:19,fontWeight:'600',lineHeight:24,fontVariant:['tabular-nums']},miniLabel:{fontFamily:sans,fontSize:11,lineHeight:15},sectionRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:-6},peopleRow:{minHeight:58,padding:13,flexDirection:'row',alignItems:'center',gap:9},rowTitle:{fontFamily:sans,fontSize:15},rowSummary:{fontFamily:sans,fontSize:13,flex:1,textAlign:'right'},notice:{minHeight:43,paddingHorizontal:13,paddingVertical:10,flexDirection:'row',alignItems:'center',gap:10},finance:{fontFamily:sans,fontSize:17,fontWeight:'600',lineHeight:23,fontVariant:['tabular-nums']}});
