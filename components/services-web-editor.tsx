import { premiumSectionAccent } from './premium-section-accent';
import { popupGlass } from './premium-web-surfaces';
import React from 'react';
import {Platform, Pressable, Text, TextInput, View} from 'react-native';
import {useAccessAppearance} from './access-premium';
import {ServicesSelect} from './services-profession-filter';

/** Group the real controlled fields without changing their handlers or native tree. */
export function ServicesEditorBlock({title,step,wide=false,children}:{title:string;step:string;wide?:boolean;children:React.ReactNode}){
 const {palette:p}=useAccessAppearance();
 if(Platform.OS!=='web')return <>{children}</>;
 if(title==='Conferma')return <View {...{dataSet:{servicesEditorBlock:'true',editorKind:'confirm',editorWide:'true'}}} style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'flex-end',gap:18,padding:18,borderRadius:12,backgroundColor:p.night?'#262623':'#D1C8BA', ...popupGlass(p, 'footer'),borderTopWidth:1,borderColor:p.night?p.line:'#B9AE9C'}}>{children}</View>;
 return <View {...{dataSet:{servicesEditorBlock:'true',editorWide:String(wide),editorKind:title==='Prenotazione online'?'options':title==='Prezzo e assegnazione'?'tariff':title==='Conferma'?'confirm':'standard'}}} style={{gap:12,minWidth:0,padding:0,borderRadius:0,borderWidth:0,borderColor:p.line,backgroundColor:'transparent'}}><View style={{...premiumSectionAccent(p.night,title),flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'baseline',marginBottom:0}}><Text style={{fontSize:11,color:p.muted,letterSpacing:1}}>{step}</Text><Text style={{fontSize:19,lineHeight:25,fontFamily:'Georgia',color:p.ink}}>{title}</Text></View>{children}</View>;
}
export function ServicesEditorStyle(){
 const {palette:p}=useAccessAppearance();
 if(Platform.OS!=='web')return null;
 return React.createElement('style',null,`
 [data-services-editor] { --editor-ink:${p.ink};--editor-muted:${p.muted};color-scheme:${p.night?'dark':'light'};background-color:${popupGlass(p).backgroundColor}!important;background-image:${popupGlass(p).backgroundImage}!important;backdrop-filter:blur(24px) saturate(110%);-webkit-backdrop-filter:blur(24px) saturate(110%);box-shadow:${popupGlass(p).boxShadow};border-color:${p.night?p.border:'#B9AE9C'}!important; }
 ${!p.night?'[data-services-editor] input,[data-services-editor] textarea{background-color:#FFFDF9!important;border-color:rgba(122,100,70,.26)!important;}':''}
 [data-services-editor], [data-services-editor] * { scrollbar-width:thin;scrollbar-color:${p.night?'#777167 #22211F':'#A79B89 #DED7CD'}; }
 [data-services-editor]::-webkit-scrollbar,[data-services-editor] *::-webkit-scrollbar{width:8px;height:8px;background:${p.night?'#22211F':'#DED7CD'};}
 [data-services-editor]::-webkit-scrollbar-track,[data-services-editor] *::-webkit-scrollbar-track,[data-services-editor]::-webkit-scrollbar-corner,[data-services-editor] *::-webkit-scrollbar-corner{background:${p.night?'#22211F':'#DED7CD'};}
 [data-services-editor]::-webkit-scrollbar:hover,[data-services-editor] *::-webkit-scrollbar:hover,[data-services-editor]::-webkit-scrollbar-track:hover,[data-services-editor] *::-webkit-scrollbar-track:hover,[data-services-editor]::-webkit-scrollbar-track:active,[data-services-editor] *::-webkit-scrollbar-track:active{background:${p.night?'#22211F':'#DED7CD'};}
 [data-services-editor]::-webkit-scrollbar-thumb,[data-services-editor] *::-webkit-scrollbar-thumb{background:${p.night?'#777167':'#A79B89'};border:2px solid ${p.night?'#22211F':'#DED7CD'};border-radius:8px;}
 [data-services-editor] input,[data-services-editor] textarea { color:${p.ink}!important;caret-color:${p.ink};text-align:left!important; }
 [data-services-editor] input::placeholder,[data-services-editor] textarea::placeholder { color:${p.muted}!important;opacity:.85; }
 [data-services-editor] :focus,[data-services-editor] :focus-visible {outline:none!important;box-shadow:none!important;}[data-services-editor] input:focus,[data-services-editor] textarea:focus{border-color:${p.night?'#958874':'#9A8E7B'}!important;}
 [data-services-editor] button,[data-services-editor] [role=button]{max-width:100%;} [data-services-editor] input,[data-services-editor] textarea{box-sizing:border-box;}
 [data-services-editor-grid] {display:flex;flex-direction:column;gap:18px;min-width:0;}
 [data-services-editor-block] [dir="auto"] {text-align:left!important;}
 [data-services-editor-block] > * { max-width:100%!important;min-width:0; } [data-services-editor-block]:not([data-editor-kind="confirm"]) > *{align-self:stretch!important;width:100%!important;}
 [data-services-editor-block] > input,[data-services-editor-block] > textarea {width:100%!important;}
 @media(min-width:1100px){[data-services-editor-grid] {display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start;gap:18px!important;}[data-editor-wide="true"]{grid-column:1/-1;}[data-services-editor-grid]:has(>[data-editor-kind="options"])>[data-editor-kind="options"]{grid-column:2;grid-row:1/span 2;}[data-services-editor-grid]:has(>[data-editor-kind="options"])>[data-editor-kind="tariff"]{grid-column:1!important;grid-row:2;}[data-services-editor-grid]>[data-editor-kind="confirm"]{grid-column:1/-1;grid-row:3;}}
 `);
}
export function servicesEditorStyles(base:Record<string,any>,p:{night:boolean;ink:string;muted:string;border:string;line:string;action:string;actionText:string}){
 const styles:any={};const put=(name:string,value:object)=>{if(base[name])styles[name]={...base[name],...value};};
 const field=p.night?'#33312E':'#FFFDF9';const rim=p.night?'#57524A':'rgba(122,100,70,.26)';const section=p.night?'#282725':'rgba(255,255,255,.6)';
 for(const [name,old] of Object.entries(base)){
  const v:any=old;
  if(/HeadingCopy$|HeaderCopy$/.test(name))put(name,{alignItems:'flex-start',width:'100%',textAlign:'left'});
  if(/ModalOverlay$|DialogOverlay$/.test(name))put(name,{backdropFilter:'blur(8px)'});
  if(/Text|Title|Label|Hint|Name|Heading|Subtitle|Copy/.test(name)&&v.textAlign)put(name,{textAlign:'left'});
  if(/Chip|Choice|Preset/.test(name)&&v.borderRadius)put(name,{borderRadius:9,shadowOpacity:0,minHeight:36});
 }
 for(const key of ['input','serviceDescriptionInput','customServiceContactTextarea','customServiceContactWhatsappTextarea','androidEditCustomRoleInput'])put(key,{width:'100%',maxWidth:'100%',alignSelf:'stretch',borderRadius:10,borderWidth:1,borderColor:rim,backgroundColor:field,minHeight:46,paddingHorizontal:13,paddingVertical:11,color:p.ink,textAlign:'left',fontSize:14,fontWeight:'400'});
 for(const key of ['numericPickerField','roleSelectorInput','androidEditValueField','androidEditHalfField','customServiceContactFieldGroup'])put(key,{width:'100%',maxWidth:'100%',alignSelf:'stretch',borderRadius:10,minHeight:46,backgroundColor:field,borderColor:rim});
 for(const key of ['numericPickerFieldText','androidEditValueText','androidEditFieldLabel','customServiceContactFieldLabel'])put(key,{color:p.ink,fontSize:13,fontWeight:'500',letterSpacing:0,textTransform:'none',textAlign:'left'});
 put('androidEditFieldLabel',{marginTop:8,marginBottom:0});
 put('androidEditModalCard',{maxWidth:1040,width:'100%',height:'94%',maxHeight:'94%',paddingBottom:0,backgroundColor:p.night?'#22211F':'#DED7CD'});
 put('androidEditModalHeader',{justifyContent:'flex-start',paddingHorizontal:26,paddingVertical:20,minHeight:92});put('androidEditModalTitleWrap',{alignItems:'flex-start'});put('androidEditModalTitle',{fontFamily:'Georgia',fontWeight:'400',fontSize:27,textAlign:'left'});put('androidEditModalEyebrow',{display:'none'});put('androidEditModalSubtitle',{fontSize:12,textAlign:'left'});
 put('androidEditModalContent',{padding:22});put('androidEditModalScroll',{flex:1,minHeight:0});put('androidEditModalActions',{padding:18,justifyContent:'flex-end',backgroundColor:p.night?'#292724':'#D1C8BA', ...popupGlass(p, 'footer'),gap:10});
 for(const key of ['androidEditSaveButton','androidEditCancelButton'])put(key,{flex:0,minWidth:140,minHeight:44,borderRadius:10,paddingVertical:12,paddingHorizontal:20});
 for(const key of ['serviceClientBadgeEditor','serviceOnlineEditor','servicePhaseEditor','serviceDependenciesEditor','operatorPublicServicesPanel','operatorAvailabilityPanel','androidEditSectionPanel','serviceCreationModeCard'])put(key,{width:'100%',maxWidth:'100%',alignSelf:'stretch',padding:16,borderRadius:12,backgroundColor:section,borderColor:rim,shadowOpacity:0,marginTop:0,marginBottom:0});
 for(const key of ['serviceClientBadgeEditorCompact','serviceOnlineEditorCompact','servicePhaseEditorCompact','serviceDependenciesEditorCompact'])put(key,{width:'100%',maxWidth:'100%',padding:16,marginTop:0,marginBottom:0});
 for(const key of ['serviceClientBadgeIcon','serviceOnlineEditorIcon','serviceDependenciesIcon','servicePhaseIcon','operatorPublicServicesIcon','serviceCreationModeIcon','catalogOrderHeaderIcon','colorSystemStatusIcon','premiumRoleHeaderIcon'])put(key,{display:'none'});
 for(const key of ['servicePhaseHeader','serviceClientBadgeHeader','serviceOnlineEditorHeader','serviceDependenciesHeader','operatorPublicServicesHeader'])put(key,{justifyContent:'flex-start',alignItems:'center',gap:12});
 for(const key of ['serviceClientBadgeTitle','serviceOnlineEditorTitle','servicePhaseTitle','serviceDependenciesTitle','operatorPublicServicesTitle','serviceCreationModeTitle'])put(key,{color:p.ink,fontSize:15,fontWeight:'500',textAlign:'left'});
 for(const key of ['serviceClientBadgePresets','roleChipsWrap','androidEditRoleChipsWrap','serviceDependencyModeRow','operatorPublicServicesModes'])put(key,{justifyContent:'flex-start',gap:8,width:'100%'});
 put('androidEditPriceDurationFields',{flexDirection:'row',gap:12});put('androidEditHalfField',{flex:1});
 put('operatorPhotoEditorButton',{alignSelf:'flex-start',width:'100%',maxWidth:'100%',minHeight:100,borderRadius:12,backgroundColor:section,padding:14,alignItems:'flex-start'});put('desktopWebPhotoEditorButton',{width:'100%',alignSelf:'flex-start'});
 for(const key of ['serviceClientBadgeEditor','serviceOnlineEditor','servicePhaseEditor','serviceDependenciesEditor','serviceClientBadgeEditorCompact','serviceOnlineEditorCompact','servicePhaseEditorCompact','serviceDependenciesEditorCompact'])put(key,{backgroundColor:'transparent',borderWidth:0,borderBottomWidth:1,borderColor:rim,borderRadius:0,padding:0,paddingBottom:16,marginBottom:4});
 for(const key of ['serviceFormActionButtonContainer','desktopWebPrimaryActionContainer'])put(key,{width:'auto',maxWidth:'100%',alignSelf:'flex-end',marginTop:0,padding:0});
 for(const key of ['serviceFormActionButton','desktopWebPrimaryAction'])put(key,{width:'auto',minWidth:180,minHeight:46,borderRadius:10,paddingHorizontal:22,paddingVertical:12,marginTop:0,backgroundColor:p.action});
 put('serviceClientBadgeHeading',{justifyContent:'flex-start',width:'100%'});put('serviceClientBadgePresetWrap',{justifyContent:'flex-start'});
 put('serviceOnlineEditorOffline',{backgroundColor:'transparent',borderRadius:0});
 put('numericPickerFieldText',{textAlign:'left',alignSelf:'flex-start'});put('numericPickerField',{alignItems:'flex-start',justifyContent:'center'});
 for(const key of ['servicePhaseEditor','servicePhaseEditorCompact','serviceDependenciesEditor','serviceDependenciesEditorCompact','serviceDependenciesEditorActive'])put(key,{padding:0,paddingBottom:0,margin:0,marginBottom:0,borderWidth:0,borderBottomWidth:0,backgroundColor:'transparent'});
 put('formCard',{alignItems:'stretch'});put('desktopWebFormCardBody',{alignItems:'stretch',padding:0,width:'100%'});
 for(const key of ['publicCompositionSettingsCard','catalogOrderCard'])put(key,{maxWidth:'100%',width:'100%',backgroundColor:'transparent',padding:0,borderWidth:0});
 for(const key of ['publicCompositionSettingsHeader','catalogOrderHeader'])put(key,{paddingHorizontal:0,paddingTop:0,backgroundColor:'transparent',borderWidth:0});
 for(const key of ['cardTitle','catalogOrderTitle','publicCompositionSettingsTitle'])put(key,{textAlign:'left',fontSize:20,fontFamily:'Georgia',fontWeight:'400'});
 put('publicCompositionSettingRow',{padding:18,borderRadius:12,backgroundColor:section,borderColor:rim});
 for(const key of ['premiumRolePanel','premiumRoleColorCard','colorSystemStatusCard','colorServiceEditorCard'])put(key,{backgroundColor:section,borderColor:rim,borderRadius:14,padding:18,maxWidth:'100%'});
 for(const key of ['premiumRoleSwatch','colorDot'])put(key,{borderRadius:10,shadowOpacity:0});
 put('customServiceContactBody',{padding:0,margin:0,alignItems:'stretch',gap:18});
 for(const key of ['operatorAvailabilityPanel','operatorPublicServicesPanel','androidEditSectionPanel','androidEditDiscountSectionPanel','premiumRolePanel','premiumRoleColorCard','colorSystemStatusCard','colorServiceEditorCard','publicCompositionSettingRow'])put(key,{backgroundColor:section,borderColor:rim,borderRadius:14,padding:18,shadowOpacity:0});
 for(const key of ['operatorPhotoEditorButton','operatorPublicServicesModes','serviceDependencyModeCard','serviceDiscountScheduleField','androidEditValueField'])put(key,{backgroundColor:field,borderColor:rim,borderRadius:11});
 put('androidEditModalActions',{backgroundColor:p.night?'#262623':'#D1C8BA', ...popupGlass(p, 'footer'),borderTopWidth:1,borderColor:rim,marginBottom:0,paddingBottom:18});
 for(const [key,old] of Object.entries(base))if(/^composition|^publicComposition/.test(key)){
 const v:any=old;const patch:any={shadowOpacity:0};
 if(v.backgroundColor&&v.backgroundColor!=='transparent')patch.backgroundColor=/Selected|Active/.test(key)?(p.night?'rgba(216,194,155,.16)':'rgba(52,55,53,.10)'):section;
 if(v.color)patch.color=/Hint|Subtitle|Meta|Caption/.test(key)?p.muted:p.ink;
 if(v.borderColor)patch.borderColor=rim;
 if(v.borderRadius)patch.borderRadius=12;
 put(key,patch);
 }
 for(const key of ['compositionComposerCardEmbedded','compositionComposerCard'])put(key,{backgroundColor:'transparent',borderWidth:0,borderRadius:0,padding:0,maxWidth:'100%',width:'100%'});
 for(const key of ['compositionComposerHeader','compositionComposerSteps','compositionComposerHeaderIcon'])put(key,{display:'none'});
 put('compositionComposerFooter',{backgroundColor:p.night?'#262623':'#D1C8BA', ...popupGlass(p, 'footer'),padding:18,borderRadius:12});
 return styles;
}
export function ServicesEditorGrid({children}:{children:React.ReactNode}){
 const {palette:p}=useAccessAppearance();const [active,setActive]=React.useState(0);
 const blocks=React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{title?:string}>[];
 if(Platform.OS!=='web')return <>{children}</>;
 const sections=blocks.filter(block=>block.props.title!=='Conferma');const actions=blocks.filter(block=>block.props.title==='Conferma');
 if(sections.length<2)return <View style={{gap:20}}>{children}</View>;
 return <View style={{gap:24,minWidth:0}}><View accessibilityRole="tablist" style={{flexDirection:'row',flexWrap:'wrap',gap:6,borderBottomWidth:1,borderColor:p.line,paddingBottom:16}}>{sections.map((block,index)=><Pressable key={index} accessibilityRole="tab" aria-selected={active===index} onPress={()=>setActive(index)} style={{paddingHorizontal:16,paddingVertical:12,borderRadius:11,backgroundColor:active===index?(p.night?'rgba(216,194,155,.16)':'rgba(52,55,53,.10)'):'transparent'}}><Text style={{fontSize:14,color:p.ink}}>{block.props.title}</Text></Pressable>)}</View>{sections.map((block,index)=><View key={index} style={{display:active===index?'flex':'none',minWidth:0}}>{block}</View>)}{actions}</View>;
}

export function ServiceCreationKindPicker({value,onChange}:{value:'single'|'composition';onChange:(value:'single'|'composition')=>void}){
 const {palette:p}=useAccessAppearance();
 return <View style={{gap:8,marginBottom:0}}><Text style={{color:p.muted,fontSize:12}}>Tipologia del servizio</Text><View accessibilityRole="radiogroup" style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{([['single','Servizio','Una prestazione, anche con posa.'],['composition','Composizione','Più servizi in un unico percorso.']] as const).map(([key,title,description])=><Pressable key={key} accessibilityRole="radio" accessibilityState={{checked:value===key}} onPress={()=>onChange(key)} style={{flex:1,minWidth:Platform.OS==='web'?200:120,padding:12,gap:4,borderRadius:12,borderWidth:1,borderColor:p.night?'rgba(216,194,155,.22)':'#B9AE9C',backgroundColor:value===key?(p.night?'rgba(216,194,155,.16)':'rgba(52,55,53,.10)'):'transparent'}}><Text style={{color:p.ink,fontSize:16,fontWeight:'500'}}>{title}</Text>{Platform.OS==='web'?<Text style={{color:p.muted,fontSize:12,lineHeight:18}}>{description}</Text>:null}</Pressable>)}</View></View>;
}
export function ServicesOptionRow({title,description,value,onChange}:{title:string;description:string;value:boolean;onChange:(value:boolean)=>void}){
 const {palette:p}=useAccessAppearance();
 return <View style={{width:'100%',minHeight:88,flexDirection:'row',alignItems:'center',gap:18,paddingVertical:15,borderBottomWidth:1,borderBottomColor:p.line}}><View style={{flex:1,minWidth:0,gap:5}}><Text style={{color:p.ink,fontSize:14,lineHeight:20,fontWeight:'500'}}>{title}</Text><Text style={{color:p.muted,fontSize:12,lineHeight:18}}>{description}</Text></View><View style={{width:52,alignItems:'center',justifyContent:'center',flexShrink:0}}><Pressable accessibilityRole="switch" accessibilityLabel={title} accessibilityState={{checked:value}} aria-checked={value} onPress={()=>onChange(!value)} style={{width:46,height:26,padding:3,borderRadius:13,justifyContent:'center',alignItems:value?'flex-end':'flex-start',backgroundColor:value?(p.night?'#C7B38D':'#8B795E'):(p.night?'#565650':'#B6B0A6')}}><View style={{width:20,height:20,borderRadius:10,backgroundColor:'#F7F3EC',boxShadow:'0 1px 3px rgba(0,0,0,.16)'}}/></Pressable></View></View>;
}
export function ServiceWebLabelEditor({value,onChange}:{value:string;onChange:(value:string)=>void}){
 const {palette:p}=useAccessAppearance();const presets=['Più richiesto','Più conveniente','Consigliato','Novità','Premium'];const [custom,setCustom]=React.useState(!!value&&!presets.includes(value));
 return <View style={{gap:12,paddingBottom:20,borderBottomWidth:1,borderColor:p.line}}><Text style={{color:p.ink,fontSize:14,fontWeight:'500'}}>Etichetta del servizio</Text><Text style={{color:p.muted,fontSize:12,lineHeight:18}}>Facoltativa, visibile nel listino dei clienti.</Text><ServicesSelect fullWidth label="Etichetta del servizio" value={custom?'custom':value} entries={[{value:'',label:'Nessuna etichetta'},...presets.map(text=>({value:text,label:text})),{value:'custom',label:'Personalizzata'}]} onChange={next=>{setCustom(next==='custom');onChange(next==='custom'?'':next);}}/>{custom?<TextInput accessibilityLabel="Testo etichetta personalizzata" value={value} onChangeText={onChange} maxLength={26} placeholder="Scrivi un’etichetta breve" placeholderTextColor={p.muted} style={{color:p.ink,fontSize:13,minHeight:44,borderWidth:1,borderColor:p.border,borderRadius:10,paddingHorizontal:12}}/>:null}<View style={{flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:12,paddingTop:4}}><Text style={{color:p.muted,fontSize:11}}>Anteprima</Text>{value?<View style={{paddingHorizontal:10,paddingVertical:5,borderRadius:6,borderWidth:1,borderColor:p.night?'#8D8373':'#A99C87',backgroundColor:p.night?'rgba(216,194,155,.04)':'rgba(156,138,106,.05)'}}><Text style={{color:p.ink,fontSize:11,letterSpacing:.3}}>{value}</Text></View>:<Text style={{color:p.muted,fontSize:12}}>Nessuna etichetta</Text>}</View></View>;
}
