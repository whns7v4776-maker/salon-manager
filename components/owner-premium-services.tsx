import {OwnerWebPageTitle} from './owner-web-page-title';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { nativeServicesStyles } from './services-native-premium';
import { popupGlass, premiumWebCardStyles } from './premium-web-surfaces';
import { ServicesEditorStyle, servicesEditorStyles } from './services-web-editor';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useAccessAppearance } from './access-premium';
export type ServicesWebSection='catalog'|'operators'|'settings';
export function ServicesWebHeader({section,onSection,onCreate,services,operators}:{section:ServicesWebSection;onSection:(value:ServicesWebSection)=>void;onCreate:()=>void;services:number;operators:number}) {
 const {palette:p}=useAccessAppearance();const {width}=useWindowDimensions();
 if(Platform.OS!=='web')return null;
 return <View style={{gap:20,paddingBottom:20}}>
 {React.createElement('style',null,`
 @media(min-width:1200px) { [data-services-part="settings-top"]:not([style*="display: none"]) { display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:18px;align-items:start; } }
 [data-services-edit-close] [dir="auto"] { color:${p.ink}!important; }
 [data-services-operator-card] { background:${p.night?'rgba(30,33,34,.73)':'rgba(255,253,249,.65)'}!important; border-color:${p.border}!important; box-shadow:none!important; transform:none!important; }
 [aria-label^="Archivia tutti i servizi"] [dir="auto"], [data-services-part="availability"] [dir="auto"] { color:${p.ink}!important; }
 [data-services-operator-card] [dir="auto"] { color:${p.ink}!important; }
 [data-services-part="filters"] [role="button"] { background:${p.field}!important;border-color:${p.border}!important;box-shadow:none!important;transform:none!important; }
 [data-services-part="filters"] [role="button"] [dir="auto"] { color:${p.ink}!important; }
 [data-services-part="filters"] [role="button"][aria-selected="true"] { background:${p.action}!important; }
 [data-services-part="filters"] [role="button"][aria-selected="true"] [dir="auto"] { color:${p.actionText}!important; }
 `)}
  <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:16}}><View style={{gap:5,flex:1,minWidth:0}}><OwnerWebPageTitle>Servizi</OwnerWebPageTitle><Text style={{color:p.muted,fontSize:13,lineHeight:19}}>Il tuo listino, le persone e le loro competenze.</Text></View><Text style={{color:p.muted,fontSize:12}}>{services} servizi online · {operators} operatori</Text></View>
  <View style={{flexDirection:'row',flexWrap:'wrap',gap:12,alignItems:'center',justifyContent:'space-between'}}>
   <View accessibilityRole="tablist" style={{flexDirection:'row',flexWrap:'wrap',padding:4,gap:3,borderRadius:16,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}>{([['catalog','Listino'],['operators','Operatori'],['settings','Organizzazione']] as const).map(([id,label])=><Pressable key={id} accessibilityRole="tab" accessibilityState={{selected:section===id}} aria-selected={section===id} onPress={()=>onSection(id)} style={{paddingHorizontal:16,paddingVertical:11,borderRadius:12,backgroundColor:section===id?p.action:'transparent'}}><Text style={{fontSize:13,fontWeight:'500',color:section===id?p.actionText:p.ink}}>{label}</Text></Pressable>)}</View>
   {section!=='settings'?<Pressable accessibilityRole="button" onPress={onCreate} style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingVertical:12,borderRadius:12,backgroundColor:p.action}}><Ionicons name="add" size={18} color={p.actionText}/><Text style={{color:p.actionText,fontSize:13,fontWeight:'500'}}>{section==='operators'?'Nuovo operatore':'Nuovo servizio'}</Text></Pressable>:null}
  </View>
 </View>;
}
export function ServicesWebForm({open,onClose,title,children,bare=false}:{bare?:boolean;open:boolean;onClose:()=>void;title:string;children:React.ReactNode}){
 const {palette:p}=useAccessAppearance();const {height}=useWindowDimensions();
 if(Platform.OS!=='web')return <>{children}</>;
 if(bare)return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={open} transparent animationType="fade" onRequestClose={onClose}><View style={{flex:1,padding:24,alignItems:'center',justifyContent:'center',backgroundColor:p.night?'rgba(0,0,0,.45)':'rgba(40,35,29,.26)',backdropFilter:'blur(8px)'} as any}><View {...{dataSet:{servicesEditor:'true',servicesBareFrame:'true'}}} style={{width:'100%',maxWidth:980,height:Math.max(120,height-48),backgroundColor:p.night?'#22211F':'#DED7CD',borderRadius:24,borderWidth:1,borderColor:p.border,overflow:'hidden'}}><ServicesEditorStyle/>{React.createElement('style',null,'[data-service-creation-host]{padding:0!important;justify-content:flex-start!important;flex:1!important;min-height:0;}[data-service-creation-host]>div{flex:1!important;height:100%;min-height:0;}')}{children}</View></View></Modal>;
 return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={open} transparent animationType="fade" onRequestClose={onClose}><View style={{flex:1,alignItems:'center',justifyContent:'center',padding:24,backgroundColor:p.night?'rgba(0,0,0,.45)':'rgba(40,35,29,.26)',backdropFilter:'blur(8px)'} as any}><View {...{dataSet:{servicesEditor:'true'}}} accessibilityViewIsModal style={{width:'100%',maxWidth:920,height:Math.max(120,height-48),backgroundColor:p.night?'#202222':'#EDE9E2',borderWidth:1,borderColor:p.border,borderRadius:24,overflow:'hidden'}}><View style={{flexDirection:'row',alignItems:'center',gap:16,padding:20,borderBottomWidth:1,borderBottomColor:p.line}}><Text accessibilityRole="header" style={{flex:1,color:p.ink,fontSize:25,fontFamily:'Georgia'}}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Chiudi ${title}`} onPress={onClose} style={{borderRadius:11,padding:10,backgroundColor:p.field,borderWidth:1,borderColor:p.border}}><Text style={{color:p.ink}}>Chiudi ×</Text></Pressable></View><ServicesEditorStyle/><ScrollView style={{flex:1}} contentContainerStyle={{padding:22}} keyboardShouldPersistTaps="handled">{children}</ScrollView><View style={{flexDirection:'row',justifyContent:'flex-end',paddingHorizontal:22,paddingVertical:16,borderTopWidth:1,borderColor:p.night?p.line:'#B9AE9C',backgroundColor:p.night?'#262623':'#D1C8BA', ...popupGlass(p, 'footer')}}><Pressable accessibilityRole="button" onPress={onClose} style={{paddingHorizontal:22,paddingVertical:12,borderRadius:11,backgroundColor:p.action}}><Text style={{color:p.actionText,fontSize:13,fontWeight:'600'}}>Chiudi</Text></Pressable></View></View></View></Modal>;
}
export function useServicesWebStyles<T extends Record<string,any>>(base:T):T {
 const {palette:p}=useAccessAppearance();const {height}=useWindowDimensions();
 return React.useMemo(()=>{
  if(Platform.OS!=='web')return nativeServicesStyles(base,p);
  const result:any={...base};
  for(const [name,value] of Object.entries(base)){
   const source:any=value;const next:any={...source};
   if(source.shadowOpacity!==undefined){next.shadowOpacity=0;next.elevation=0;}
   if(source.color&&!/error|danger|delete|discount|warning|swatch|colorPreview/i.test(name))next.color=/hint|subtitle|caption|helper|eyebrow|counter/i.test(name)?p.muted:p.ink;
   if(source.backgroundColor&&source.backgroundColor!=='transparent'&&!/swatch|accentRail|jewel|badgeColor|colorPreview|danger|delete|error/i.test(name))next.backgroundColor=p.field;
   if(source.borderColor)next.borderColor=p.border;
   if(source.borderTopColor)next.borderTopColor=p.border;
   if(source.backgroundColor&&/Active|Selected/.test(name)&&!/Hovered|Disabled|Saving/.test(name)){next.backgroundColor=p.night?'rgba(216,194,155,.14)':'rgba(182,161,125,.16)';next.borderColor=p.action;}
   if(Number(source.fontWeight)>600)next.fontWeight='500';
   if(/Knob$/.test(name))next.backgroundColor='#F7F3EB';
   result[name]=next;
  }
  const set=(name:string,extra:object)=>{if(base[name])result[name]={...result[name],...extra};};
  set('successDialogShell',{maxWidth:480});
  set('successDialogCard',{borderRadius:22,padding:24,paddingHorizontal:24,paddingTop:24,paddingBottom:24});
  set('successDialogHandle',{display:'none'});
  set('successDialogTitle',{fontFamily:'Georgia',fontSize:23,lineHeight:29,fontWeight:'400'});
  set('successDialogBody',{fontSize:14,lineHeight:22,color:p.muted,marginBottom:22});
  set('confirmDialogActions',{justifyContent:'center',flexWrap:'wrap',gap:10});
  for(const key of ['confirmDialogSecondaryButton','confirmDialogPrimaryButton'])set(key,{flex:undefined,flexGrow:0,flexShrink:0,flexBasis:'auto',minWidth:110,minHeight:44,borderRadius:10,paddingHorizontal:18,paddingVertical:11});
  set('confirmDialogPrimaryButton',{backgroundColor:p.action});
  set('confirmDialogPrimaryButtonText',{color:p.actionText,fontSize:14,fontWeight:'500'});
  set('confirmDialogSecondaryButtonText',{fontSize:14,fontWeight:'500'});
  set('confirmDialogPremiumDeleteButton',{minWidth:158,backgroundColor:p.night?'#A82A3A':'#B42336',borderColor:p.night?'#CD5B68':'#B42336'});
  set('confirmDialogPremiumDeleteContent',{width:'auto',gap:8});
  set('confirmDialogPremiumDeleteIcon',{width:18,height:18,borderWidth:0,borderRadius:0});
  set('confirmDialogPremiumDeleteText',{color:'#FFFFFF',flex:undefined,flexShrink:0,maxWidth:undefined,fontSize:14,lineHeight:20,fontWeight:'500'});
  set('androidEditModalClose',{borderRadius:12,borderWidth:1,borderColor:p.border,backgroundColor:p.field});
  set('androidEditModalOverlay',{justifyContent:'center',padding:24});
  set('container',{backgroundColor:'transparent'});set('heroCard',{display:'none'});set('desktopTopGrid',{marginTop:0,marginBottom:0,gap:0});set('content',{paddingTop:24});set('pageShell',{maxWidth:1440});
  for(const key of ['serviceCardGlassGlow','serviceCardTintGlow','serviceCardDiagonalHighlight','serviceCardTopSheen','serviceCardInnerStroke','serviceCardHoverShadow','serviceRoleEmblemDepth','serviceRoleEmblemShine'])set(key,{display:'none'});
  set('itemCard',{backgroundColor:p.night?'rgba(30,33,34,.73)':'rgba(255,253,249,.65)',borderColor:p.border,borderRadius:18,shadowOpacity:0});
  set('itemCardWebHovered',{transform:[],shadowOpacity:0});set('operatorCardWebHovered',{transform:[],shadowOpacity:0});
  for(const key of ['serviceGridRow','roleSectionHeader','serviceRoleFiltersNative'])set(key,{backgroundColor:'transparent'});
  set('serviceRoleEmblemFace',{backgroundColor:p.field});set('serviceName',{fontFamily:'Georgia',fontSize:22,color:p.ink});
  set('formCard',{minHeight:0,height:'100%',width:'100%',maxWidth:'100%',flex:undefined,flexGrow:0,flexShrink:0,flexBasis:'auto',backgroundColor:'transparent',padding:0,borderWidth:0});
  set('expandHeaderButton',{display:'none'});set('desktopWebFormCardBody',{padding:0});
  set('servicesListSectionTop',{maxWidth:'100%',backgroundColor:'transparent',borderWidth:0,shadowOpacity:0,paddingHorizontal:0});
  set('servicesListSectionTitle',{display:'none'});set('servicesListSectionSubtitle',{display:'none'});
  set('serviceAvailabilitySectionHeader',{backgroundColor:p.field,borderColor:p.border});set('serviceRoleGroupHeader',{backgroundColor:'transparent'});
  set('androidEditModalBackdrop',{backgroundColor:p.night?'rgba(0,0,0,.55)':'rgba(40,35,29,.3)',justifyContent:'center',padding:24});
  set('androidEditModalCard',{backgroundColor:p.night?'#202222':'#EDE9E2',maxHeight:'94%',borderRadius:24,borderColor:p.border});
  for(const key of ['serviceOnlineToggle','serviceDiscountToggleTrack'])set(key,{backgroundColor:p.night?'#777773':'#AAA7A1'});
  for(const key of ['serviceOnlineToggleActive','serviceDiscountToggleTrackActive','serviceDependenciesToggleActive','servicePhaseToggleActive'])set(key,{backgroundColor:p.night?'#C9B58E':'#998565'});
  for(const key of ['serviceCreationModeChoiceActive','serviceCreationModeCompositionChoiceActive','serviceClientBadgePresetSelected','serviceRoleFilterChipNativeAllActive'])set(key,{backgroundColor:p.action,borderColor:p.border});
  for(const key of ['serviceCreationModeChoiceTitleActive','serviceCreationModeChoiceTextActive','serviceClientBadgePresetTextSelected'])set(key,{color:p.actionText});
  set('operatorsListCard',{maxWidth:1440,width:'100%',padding:0,marginTop:0});
  set('listTitle',{display:'none'});
  for(const key of ['buttonDark','androidEditSaveButton','customServiceContactSaveButton','operatorSaveButton'])set(key,{backgroundColor:p.action,borderColor:p.border});
  for(const key of ['buttonDarkText','androidEditSaveButtonText','customServiceContactSaveButtonText','operatorSaveButtonText'])set(key,{color:p.actionText});
  for(const key of ['serviceRoleFilterChipNativeActive','serviceClientBadgePresetActive'])set(key,{backgroundColor:p.action,borderColor:p.border});
  for(const key of ['serviceRoleFilterChipTextNativeActive','serviceClientBadgePresetTextActive'])set(key,{color:p.actionText});
  for(const key of ['input','catalogSearchInput'])set(key,{color:p.ink,backgroundColor:p.field,borderColor:p.border});
  const editor=servicesEditorStyles(result,p);
  return premiumWebCardStyles({...result,...editor,androidEditModalCard:{...result.androidEditModalCard,...editor.androidEditModalCard,height:Math.max(120,height-48),maxHeight:Math.max(120,height-48)}},p);
 },[base,p,height]);
}

export function ServicesWebCard({name,role,price,originalPrice,duration,online,linked,phases,badge,promotion,accent,onEdit,onArchive,onDelete}:{name:string;role:string;badge?:string;promotion?:string;accent?:string;price:number;originalPrice?:number;duration:number;online:boolean;linked:string;phases?:{initialDurationMinutes:number;processingDurationMinutes:number;finalDurationMinutes?:number}|null;onEdit:()=>void;onArchive:()=>void;onDelete:()=>void}){
 const {palette:p}=useAccessAppearance();const [actions,setActions]=React.useState(false);
 const money=(value:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:2}).format(value);
 const action=(label:string,icon:React.ComponentProps<typeof Ionicons>['name'],callback:()=>void,danger=false)=><Pressable accessibilityRole="button" accessibilityLabel={`${label} ${name}`} onPress={callback} style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}><Ionicons name={icon} size={15} color={danger?'#B66E79':p.ink}/><Text style={{color:danger?'#B66E79':p.ink,fontSize:12}}>{label}</Text></Pressable>;
 return <View {...{dataSet:{premiumServiceCard:'true'}}} style={{flex:1,minWidth:0,borderRadius:18,borderWidth:1,borderColor:p.border,backgroundColor:p.night?'rgba(30,33,34,.73)':'rgba(255,253,249,.65)',padding:18,gap:12}}>
  <View {...{dataSet:{premiumServiceCardHeading:'true'}}} style={{flexDirection:'row',flexWrap:'wrap',gap:14,alignItems:'flex-start'}}><View style={{flex:1,minWidth:150,gap:7}}><View style={{flexDirection:'row',alignItems:'center',gap:7}}><View style={{width:8,height:8,borderRadius:4,backgroundColor:accent??(p.night?'#C7B391':'#B29C79')}}/><Text style={{color:p.muted,fontSize:12}}>{role||'Servizio'}{!online?' · Archiviato':''}</Text></View><Text style={{color:p.ink,fontSize:22,lineHeight:28,fontFamily:'Georgia'}}>{name}</Text></View><View style={{alignItems:'flex-end',gap:5}}>{originalPrice&&originalPrice>price?<Text style={{color:p.muted,fontSize:12,textDecorationLine:'line-through'}}>{money(originalPrice)}</Text>:null}<Text {...{dataSet:{premiumCardAmount:'true'}}} style={{color:p.ink,fontSize:22,fontFamily:'Georgia'}}>{money(price)}</Text><Text style={{color:p.muted,fontSize:12}}>{duration} min</Text></View></View>
  {badge||promotion?<Text style={{color:p.muted,fontSize:12,lineHeight:18}}>{[badge,promotion].filter(Boolean).join(' · ')}</Text>:null}
  {linked?<Text style={{color:p.muted,fontSize:12,lineHeight:18}}>{linked}</Text>:null}
  {phases?<View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{[['Lavoro',phases.initialDurationMinutes],['Posa',phases.processingDurationMinutes],['Finale',phases.finalDurationMinutes]].filter(([,minutes])=>!!minutes).map(([label,minutes])=><View key={label} style={{paddingHorizontal:10,paddingVertical:7,borderWidth:1,borderColor:p.border,borderRadius:9,backgroundColor:p.field}}><Text style={{color:p.muted,fontSize:11}}>{label} · {minutes} min</Text></View>)}</View>:null}
  <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:'auto'}}>{action('Modifica','create-outline',onEdit)}<Pressable accessibilityRole="button" accessibilityLabel={`Altre azioni ${name}`} accessibilityState={{expanded:actions}} onPress={()=>setActions(value=>!value)} style={{paddingHorizontal:12,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:p.border,backgroundColor:p.field}}><Ionicons name="ellipsis-horizontal" size={17} color={p.ink}/></Pressable>{actions?<>{action(online?'Archivia':'Rendi online','archive-outline',onArchive)}{action('Elimina','trash-outline',onDelete,true)}</>:null}</View>
 </View>;
}

export function ServicesWebRegion({visible,part,children}:{visible:boolean;part:string;children:React.ReactNode}) {
 return <View {...(Platform.OS==='web'?{dataSet:{servicesPart:part}}:{})} style={visible?undefined:{display:'none'}}>{children}</View>;
}
