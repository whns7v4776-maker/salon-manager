import { PremiumChoiceRow } from './ui/premium-choice-row';
import { PremiumSectionHeading } from './ui/premium-section-heading';
import { premiumSectionAccent } from './premium-section-accent';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text} from './owner-native-premium';
import { popupGlass } from './premium-web-surfaces';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Switch, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { HapticTouchable } from './ui/haptic-touchable';
import type { CustomerPremiumStatus, useCustomerPremium } from '../src/lib/use-customer-premium';
import { badgeModes, defaultCustomerBadgePolicy, describeBadgeRule, validateCustomerBadgePolicy, type CustomerBadgePolicy, type BadgeTierRule } from '../src/lib/customer-badge-policy';

export function CustomerPremiumBadge({status}:{status?:CustomerPremiumStatus}) {
 const {palette:p}=useAccessAppearance();
 if(!status?.tier)return null;
 const title=`${status.label}: ${describeBadgeRule(status.rule)}\n${status.completedVisits} visite completate · ${(status.spentCents/100).toLocaleString('it-IT',{style:'currency',currency:'EUR'})} incassati · ${status.bookings} prenotazioni · ${status.cancellations} annullamenti del cliente · ${status.noShows} assenze`;
 const top=status.tier==='top_premium', standard=status.tier==='standard';
 const fill=standard?p.field:p.night?'rgba(211,188,145,.18)':'rgba(221,201,165,.48)';
 const ink=standard?p.muted:p.night?'#E3D1AE':'#70592E';
 return <View style={{alignSelf:'flex-start',flexDirection:'row',flexWrap:'wrap',gap:5}}>
  <View {...(Platform.OS==='web'?({title} as any):{})} accessible accessibilityLabel={title} style={{flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:8,paddingVertical:5,borderRadius:9,backgroundColor:fill}}><Ionicons name={standard?'person-outline':top?'diamond-outline':status.tier==='frequente'?'repeat-outline':'ribbon-outline'} size={13} color={ink}/><Text style={{fontSize:10,fontWeight:'600',color:ink}}>{status.label}</Text></View>
  {status.cancellationAlert?<View {...({title:`${status.cancellations} annullamenti effettuati dal cliente nel periodo. Le cancellazioni del salone sono escluse.`} as any)} accessibilityLabel={`${status.cancellations} annullamenti del cliente`} style={{padding:5,borderRadius:8,backgroundColor:p.night?'rgba(197,149,99,.18)':'rgba(235,214,181,.50)'}}><Ionicons name="calendar-clear-outline" size={13} color={p.night?'#D4B78C':'#805F32'}/></View>:null}
  {status.noShowAlert?<View {...({title:`${status.noShows} assenze registrate dal salone nel periodo.`} as any)} accessibilityLabel={`${status.noShows} assenze registrate`} style={{padding:5,borderRadius:8,backgroundColor:p.night?'rgba(188,115,123,.18)':'rgba(240,213,217,.50)'}}><Ionicons name="person-remove-outline" size={13} color={p.night?'#DFB1B7':'#91505A'}/></View>:null}
 </View>;
}
export function CustomerPremiumSettings({model,compact=false}:{model:ReturnType<typeof useCustomerPremium>;compact?:boolean}) {
 const {palette:p}=useAccessAppearance();
 const {height}=useWindowDimensions();
 const tones={
  shell:p.night?'#232323':'#E8E5DF',
  section:p.night?'rgba(255,255,255,.045)':'#DDD9D2',
  field:p.night?'rgba(255,255,255,.065)':'#F2EFE9',
  button:p.night?'rgba(255,255,255,.07)':'#D4CEC5',
  standard:p.night?'rgba(211,188,145,.08)':'#E0DCD5',
  border:p.night?p.border:'#C3BBAF',
  chrome:p.night?'#292726':'#DED9D1',
 };
 const [open,setOpen]=useState(false);
 const [enabled,setEnabled]=useState(false);
 const [config,setConfig]=useState<CustomerBadgePolicy>(defaultCustomerBadgePolicy);
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const show=()=>{setConfig(model.summary?.config??defaultCustomerBadgePolicy());setEnabled(model.summary?.enabled??false);setMessage('');setOpen(true);};
 const updateTier=(index:number,patch:Partial<BadgeTierRule>)=>setConfig(current=>({...current,tiers:current.tiers.map((rule,i)=>i===index?{...rule,...patch}:rule)}));
 const save=async()=>{setSaving(true);setMessage('');try{await model.save(enabled,config);setOpen(false);}catch(error){setMessage(error instanceof Error?error.message:'Salvataggio non riuscito.');}finally{setSaving(false);}};
 const command=(label:string,action:()=>void,selected=false)=><HapticTouchable accessibilityRole="button" accessibilityState={{selected}} disabled={saving} onPress={action} style={{flexShrink:0,paddingHorizontal:12,paddingVertical:10,borderRadius:11,backgroundColor:selected?p.action:tones.button,borderWidth:1,borderColor:tones.border}}><Text style={{color:selected?p.actionText:p.ink,fontSize:12,fontWeight:'500'}}>{label}</Text></HapticTouchable>;
 const field=(label:string,value:number,onChange:(value:number)=>void,money=false)=><View style={{gap:6,flexGrow:1,minWidth:135}}><Text style={{color:p.muted,fontSize:12}}>{label}</Text><TextInput accessibilityLabel={label} editable={!saving} value={Number.isNaN(value)?'':String(money?value/100:value)} onChangeText={text=>{const parsed=Number(text.replace(',','.'));onChange(text.trim()===''?NaN:money?Math.round(parsed*100):parsed);}} keyboardType={money?'decimal-pad':'number-pad'} style={{paddingHorizontal:12,paddingVertical:11,borderRadius:11,borderWidth:1,borderColor:tones.border,backgroundColor:tones.field,color:p.ink,fontSize:14}}/></View>;
 const validation=validateCustomerBadgePolicy(config);
 return <>
  <View style={{borderWidth:1,borderColor:p.border,borderRadius:18,padding:compact?20:16,marginBottom:compact?0:14,backgroundColor:p.night?'rgba(35,39,40,.73)':'rgba(255,253,249,.65)',flexDirection:compact?'column':'row',alignItems:compact?'flex-start':'center',gap:compact?14:12,minHeight:compact?224:undefined,flex:compact?1:undefined}}>
   <View style={{width:compact?40:24,height:compact?40:24,borderRadius:12,alignItems:"center",justifyContent:"center",backgroundColor:compact?p.field:"transparent"}}><Ionicons name="ribbon-outline" size={23} color={p.ink}/></View><View style={{flex:1,gap:6}}><Text style={{color:p.ink,fontSize:compact?22:17,lineHeight:compact?28:23,fontFamily:compact?"Georgia":undefined,fontWeight:compact?"400":"500"}}>Badge clienti</Text><Text style={{color:p.muted,fontSize:12}}>Standard, Frequente, Premium e Top Premium · {model.summary?.enabled?'Attivi':'Da configurare'}</Text></View>
   <HapticTouchable accessibilityRole="button" accessibilityLabel="Configura badge clienti" onPress={show} style={{minHeight:40,paddingHorizontal:13,paddingVertical:10,borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field,flexDirection:'row',alignItems:'center',gap:7}}><Ionicons name="options-outline" size={16} color={p.ink}/><Text style={{fontSize:13,fontWeight:'500',color:p.ink}}>Configura badge</Text></HapticTouchable>
  </View>
  <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={open} transparent animationType="fade" onRequestClose={()=>{if(!saving)setOpen(false);}}>
   <View style={[{flex:1,alignItems:'center',justifyContent:'center',padding:16,backgroundColor:p.night?'rgba(0,0,0,.56)':'rgba(50,44,35,.28)'},{backdropFilter:'blur(12px)'} as any]}>
    <View {...({dataSet:{customerBadgeSettings:"true"}} as any)} style={{width:'100%',maxWidth:880,height:Math.max(120,height-48),borderRadius:24,borderWidth:1,borderColor:p.border,backgroundColor:tones.shell,...popupGlass(p),overflow:'hidden'}}>
     <View style={{padding:20,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderBottomColor:tones.border,backgroundColor:tones.chrome}}><View style={{flex:1,gap:5}}><Text style={{fontFamily:'Georgia',fontSize:26,color:p.ink}}>Badge clienti</Text><Text style={{color:p.muted,fontSize:12}}>Regole del salone · classificazione automatica</Text></View>{command('Chiudi',()=>setOpen(false))}</View>
     <ScrollView accessibilityLabel="Impostazioni badge clienti" style={{flex:1,minHeight:0}} contentContainerStyle={{padding:20,gap:20}}>
      <View style={{flexDirection:'row',alignItems:'center',gap:12}}><View style={{flex:1,gap:5}}><PremiumSectionHeading tone={0} style={{fontSize:15,fontWeight:'500',color:p.ink}}>Mostra i badge nella rubrica</PremiumSectionHeading><Text style={{fontSize:12,color:p.muted}}>Il livello più alto raggiunto sostituisce quello precedente.</Text></View><Switch accessibilityLabel="Attiva badge clienti" value={enabled} disabled={saving} onValueChange={setEnabled} trackColor={{false:'#AAA7A1',true:'#B7A281'}} thumbColor="#FFFFFF"/></View>
      <View style={{gap:9}}><PremiumSectionHeading tone={1} style={{color:p.ink,fontSize:14,fontWeight:'500'}}>Periodo di osservazione</PremiumSectionHeading><PremiumChoiceRow style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{[6,12,24,36,0].map(months=><React.Fragment key={months}>{command(months?`${months} mesi`:'Tutto lo storico',()=>setConfig(c=>({...c,windowMonths:months})),config.windowMonths===months)}</React.Fragment>)}</PremiumChoiceRow></View>
      <View style={{padding:14,borderRadius:14,backgroundColor:tones.standard,gap:7}}><Text style={{color:p.ink,fontSize:15,fontWeight:'500'}}>Standard</Text><Text style={{color:p.muted,fontSize:12,lineHeight:18}}>Livello iniziale, quando il cliente non ha ancora raggiunto le soglie dei livelli successivi.</Text></View>
      {config.tiers.map((rule,index)=><View key={rule.id} style={{padding:16,borderRadius:16,borderWidth:1,borderColor:tones.border,backgroundColor:tones.section,gap:13}}>
       <View style={{...premiumSectionAccent(p.night,index),flexDirection:'row',gap:10,alignItems:'center'}}><Ionicons name={rule.id==='top_premium'?'diamond-outline':rule.id==='frequente'?'repeat-outline':'ribbon-outline'} size={20} color={p.ink}/><TextInput accessibilityLabel={`Nome livello ${index+1}`} value={rule.label} maxLength={32} onChangeText={label=>updateTier(index,{label})} editable={!saving} style={{flex:1,minWidth:0,color:p.ink,fontSize:17,fontWeight:'500',paddingVertical:4}}/><Text style={{flexShrink:0,color:p.muted,fontSize:11,marginRight:4}} numberOfLines={1}>Livello {index+1}</Text></View>
       <PremiumChoiceRow style={{flexDirection:'row',flexWrap:'wrap',gap:7}}>{badgeModes.map(mode=><React.Fragment key={mode.id}>{command(mode.label,()=>updateTier(index,{mode:mode.id}),rule.mode===mode.id)}</React.Fragment>)}</PremiumChoiceRow>
       <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>
        {['visits','both','either'].includes(rule.mode)?field(`${rule.label} · Visite completate`,rule.visits,visits=>updateTier(index,{visits})):null}
        {['spend','both','either'].includes(rule.mode)?field(`${rule.label} · Spesa netta (€)`,rule.spendCents,spendCents=>updateTier(index,{spendCents}),true):null}
        {rule.mode==='bookings'?field(`${rule.label} · Prenotazioni`,rule.bookings,bookings=>updateTier(index,{bookings})):null}
       </View>
       <Text style={{color:p.muted,fontSize:12,lineHeight:18}}>{describeBadgeRule(rule)}</Text>
      </View>)}
      <View style={{gap:12,paddingTop:6}}><View style={premiumSectionAccent(p.night,3)}><Text style={{color:p.ink,fontSize:16,fontWeight:'500'}}>Indicatori separati</Text></View><Text style={{color:p.muted,fontSize:12,lineHeight:18}}>Annullamenti del cliente e assenze non cambiano il livello e non bloccano le prenotazioni. Aggiungono un indicatore informativo.</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{field('Soglia annullamenti del cliente',config.cancellationThreshold,cancellationThreshold=>setConfig(c=>({...c,cancellationThreshold})))}{field('Soglia assenze registrate',config.noShowThreshold,noShowThreshold=>setConfig(c=>({...c,noShowThreshold})))}</View></View>
      <Text style={{color:p.muted,fontSize:12,lineHeight:19}}>Una visita con più servizi collegati conta una volta e deve risultare interamente completata. La spesa usa gli incassi netti dei servizi conclusi, sottraendo i rimborsi; preventivi e importi da incassare sono esclusi. Le cancellazioni del salone sono escluse dagli annullamenti del cliente.</Text>
      {model.loading?<ActivityIndicator color={p.ink}/>:!model.ready?<View style={{gap:10}}><Text style={{color:p.muted,fontSize:12}}>Impossibile caricare la configurazione salvata. Riprova prima di salvare.</Text>{command('Riprova',()=>{void model.refresh();})}</View>:null}
      {message||validation?<Text accessibilityLiveRegion="polite" style={{color:p.muted,fontSize:12}}>{message||validation}</Text>:null}
     </ScrollView>
     <View style={{padding:16,borderTopWidth:1,borderTopColor:tones.border,backgroundColor:tones.chrome,flexDirection:'row',justifyContent:'flex-end',gap:10}}>{command('Annulla',()=>setOpen(false))}<HapticTouchable accessibilityRole="button" accessibilityLabel="Salva regole badge clienti" disabled={saving||!model.ready||!!validation} onPress={()=>{void save();}} style={{paddingHorizontal:20,paddingVertical:12,borderRadius:12,backgroundColor:p.action,opacity:!model.ready||validation?.length?0.5:1}}>{saving?<ActivityIndicator color={p.actionText}/>:<Text style={{color:p.actionText,fontSize:13,fontWeight:'600'}}>Salva regole</Text>}</HapticTouchable></View>
    </View>
   </View>
  </Modal>
 </>;
}
