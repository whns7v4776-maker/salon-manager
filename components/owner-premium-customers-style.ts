import { CustomerPremiumScope } from './customer-premium-context';
import { premiumWebCardStyles } from './premium-web-surfaces';
import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useAccessAppearance } from './access-premium';
export { CustomerPremiumScope } from './customer-premium-context';
type Palette=ReturnType<typeof useAccessAppearance>['palette'];
/** Native presentation only. The original stylesheet remains the web contract. */
export function nativeCustomersStyles<T extends Record<string,any>>(base:T,p:Palette):T & Record<string,any> {

 const result:Record<string,any>={};
 const glass=p.night?'rgba(38,41,43,.80)':'rgba(255,253,250,.67)';
 for(const [key,original] of Object.entries(base)){
  const v={...StyleSheet.flatten(original)};
  const danger=/Danger|Destructive|Error|Alert|Delete|Block/.test(key),success=/Success|Active|Approved|Unlock/.test(key),selected=/Selected$|Primary$|Submit$|Save$/i.test(key);
  if(v.color)v.color=/Hint|Subtitle|Description|Meta|Email|Telefono|Footnote|Placeholder/.test(key)?p.muted:p.ink;
  if(v.backgroundColor&&v.backgroundColor!=='transparent')v.backgroundColor=p.field;
  for(const edge of ['borderColor','borderTopColor','borderBottomColor','borderLeftColor','borderRightColor'])if(v[edge])v[edge]=p.border;
  if(danger){if(v.backgroundColor)v.backgroundColor=p.night?'rgba(188,115,123,.14)':'rgba(245,224,227,.55)';if(v.color)v.color=p.night?'#E6B1B6':'#954750';}
  else if(success){if(v.backgroundColor)v.backgroundColor=p.night?'rgba(141,172,149,.16)':'rgba(221,235,222,.55)';if(v.color)v.color=p.night?'#C1D6C4':'#42684A';}
  if(selected){if(v.backgroundColor)v.backgroundColor=p.action;if(v.color)v.color=p.actionText;}
  if(v.fontWeight==='900'||v.fontWeight==='800')v.fontWeight='600';
  if(v.fontFamily)v.fontFamily=Platform.OS==='ios'?'System':'sans-serif';
  if(v.shadowRadius){v.shadowOpacity=0;v.elevation=0;}
  if(Platform.OS==='web' && /^(toggle|switchTrack)$/.test(key)) {
   v.backgroundColor=p.night?'#555E58':'#A9B3AC';
  }
  if(Platform.OS==='web' && /^(thumb|toggleKnob|switchThumb)$/.test(key)) {
   v.backgroundColor='#FFFFFF';
   v.shadowColor='#17231B';v.shadowOpacity=0.18;v.shadowRadius=2;v.shadowOffset={width:0,height:1};
  }
  result[key]=v;
 }
 const patch=(key:string,value:any)=>result[key]={...result[key],...value};
 patch('container',{backgroundColor:'transparent'});
 patch('clienteSecondaryColumn',{backgroundColor:'transparent',borderWidth:0});
 patch('clienteCardBodyDesktop',{backgroundColor:'transparent'});
 patch('searchHeaderRow',{justifyContent:'flex-start'});
 patch('searchTitle',{textAlign:'left'});
 patch('searchSubtitle',{textAlign:'left',fontWeight:'400'});
 patch('clienteContactStack',{backgroundColor:'transparent',borderWidth:0});
 patch('heroCard',{backgroundColor:'transparent',borderWidth:0,paddingHorizontal:0,paddingBottom:12,shadowOpacity:0,elevation:0});
 patch('listContent',{paddingTop:Platform.OS==='web'?18:54,paddingBottom:Platform.OS==='web'?24:152});
 for(const key of ['bookingCard','searchCard','reminderCard','customerRemindersGuideCard'])patch(key,{backgroundColor:glass,borderWidth:1,borderColor:p.border,borderRadius:20,paddingHorizontal:14,shadowOpacity:0,elevation:0});
 for(const key of ['clienteCard','clienteCardNativePremium'])patch(key,{backgroundColor:glass,borderColor:p.border,borderTopColor:p.border,borderRadius:18,shadowOpacity:0,elevation:0});
 patch('clienteCardUnread',{backgroundColor:p.night?'rgba(151,134,176,.13)':'rgba(236,227,244,.50)',borderColor:p.border});
 for(const key of ['clienteCardDepthFar','clienteCardDepthSoft','clienteCardDepthMid','clienteCardDepthNear','clienteCardTopHighlight','clienteCardTopHighlightNative','clienteCardInnerStroke','clienteCardInnerStrokeNative'])patch(key,{opacity:0});
 patch('bookingCard',{backgroundColor:'transparent',borderWidth:0,paddingHorizontal:0,paddingVertical:0,paddingTop:0,paddingBottom:0,marginBottom:0});
 patch('clienteNome',{fontSize:17,lineHeight:23,fontWeight:'600',color:p.ink});
 patch('clienteNomeDesktop',{fontSize:16,lineHeight:22,fontWeight:'600',color:p.ink});
 patch('webManagementOverlay',{flex:1,alignItems:'center',justifyContent:'center',padding:20,backgroundColor:p.night?'rgba(0,0,0,.54)':'rgba(40,35,29,.28)'});
 patch('webManagementSheet',{width:'100%',maxWidth:560,backgroundColor:p.night?'#202426':'#F5F1EB',borderWidth:1,borderColor:p.border,borderRadius:24,padding:20,gap:16});
 patch('webManagementTitle',{flex:1,fontSize:23,lineHeight:29,fontFamily:'Georgia',fontWeight:'400',color:p.ink});
 patch('webManagementClose',{width:82,height:40,borderRadius:13,backgroundColor:p.field,borderColor:p.border,borderWidth:1,flexDirection:'row',gap:5,alignItems:'center',justifyContent:'center'});
 patch('webManagementActionButton',{flexGrow:0,flexBasis:'auto',minWidth:0,minHeight:44,paddingHorizontal:12,paddingVertical:10,borderWidth:1,borderColor:p.border});

 patch('clienteInitialBadge',{backgroundColor:p.night?'rgba(199,185,162,.17)':'rgba(211,196,175,.45)',borderColor:p.border});
 for(const key of ['searchTitle','bookingTitle','reminderTitle','customerRemindersGuideTitle'])patch(key,{fontSize:19,lineHeight:25,fontWeight:'500',color:p.ink});
 for(const key of ['input','searchInput','searchInputNative'])patch(key,{backgroundColor:p.field,borderColor:p.border,color:p.ink,borderWidth:1,borderRadius:13,minHeight:46});
 for(const key of ['clientOverviewCard'])patch(key,{minHeight:88,paddingVertical:12,borderWidth:1,borderColor:p.border,borderRadius:17});
 patch('clientOverviewCount',{fontSize:27,lineHeight:32,marginBottom:3,color:p.ink});
 patch('clientOverviewLabel',{fontSize:11,lineHeight:16,fontWeight:'500',color:p.muted});
 patch('clientOverviewLabelWrap',{minHeight:18});
 for(const key of ['onlinePolicySheet','customerEditorModalCard','customerNoteModalCard','customerTimingModalCard','successDialogCard'])patch(key,{backgroundColor:p.night?'#202426':'#F5F1EB',borderColor:p.border,borderWidth:1,borderTopLeftRadius:25,borderTopRightRadius:25});
 // Feedback remains a neutral premium surface; only the small icon signals caution.
 patch('feedbackDialogCardError',{backgroundColor:p.night?'#202426':'#F5F1EB',borderColor:p.border,shadowOpacity:0,elevation:0});
 patch('feedbackDialogIconWrapError',{backgroundColor:p.field});
 patch('feedbackDialogEyebrowError',{color:p.muted});
 patch('feedbackDialogTitleError',{color:p.ink});
 patch('feedbackDialogBodyError',{color:p.muted});
 for(const key of ['successDialogButton','feedbackDialogButtonError'])patch(key,{backgroundColor:p.action,borderColor:p.border});
 patch('successDialogButtonText',{color:p.actionText});
 patch('ownerStartupClientCard',{minHeight:164,width:'100%',backgroundColor:glass,borderColor:p.border,borderRadius:18,padding:14,alignItems:'flex-start'});
 patch('ownerStartupClientAvatar',{width:48,height:48,borderRadius:24});
 for(const key of ['ownerStartupClientAvatar','ownerStartupClientName','ownerStartupClientMeta','ownerStartupClientCountFill'])patch(key,{backgroundColor:p.night?'rgba(219,212,197,.14)':'rgba(185,175,158,.24)'});
 for(const [key,value] of Object.entries(result)){
  if(/PrimaryText$|SubmitText$|SaveText$|TextSelected$/i.test(key))value.color=p.actionText;
 }
 if(Platform.OS==='web'){
  patch('searchCard',{backgroundColor:'transparent',borderWidth:0,paddingHorizontal:0,shadowOpacity:0,elevation:0});
  patch('clientOverviewRow',{alignSelf:'flex-start',width:'100%',maxWidth:540,gap:10});
  patch('clientOverviewCard',{minHeight:64,paddingVertical:9,paddingHorizontal:14,borderRadius:16});
  patch('clientOverviewCount',{fontSize:23,lineHeight:27,marginBottom:1});
  patch('formFieldsWrap',{width:'100%',gap:0});
  patch('formFieldsWrapDesktop',{width:'100%',maxWidth:'100%',alignSelf:'stretch'});
  patch('inputDesktopWide',{width:'100%',maxWidth:'100%',textAlign:'left',minHeight:46});
  patch('input',{textAlign:'left'});
  patch('actionRow',{width:'100%',alignSelf:'stretch',flexDirection:'row',flexWrap:'wrap',justifyContent:'center',alignItems:'center',gap:10,marginTop:18});
  patch('actionColumnDesktop',{width:'100%',maxWidth:'100%',alignSelf:'stretch',flexDirection:'row',justifyContent:'center',alignItems:'center'});
  for(const key of ['primaryButtonInlineDesktop','secondaryButtonDesktop'])patch(key,{width:'auto',flex:undefined,flexGrow:0,flexShrink:0,flexBasis:'auto',minHeight:44,paddingHorizontal:18,paddingVertical:12});
  patch('primaryButtonInline',{backgroundColor:p.action,minHeight:44});
  patch('primaryButtonText',{color:p.actionText});
  patch('secondaryButton',{backgroundColor:p.field,borderWidth:1,borderColor:p.border,minHeight:44});
  for(const key of ['actionRow','actionColumnDesktop'])patch(key,{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',gap:12});





  for(const key of ['onlinePolicySheet','customerEditorModalCard','customerNoteModalCard','customerTimingModalCard','successDialogCard'])patch(key,{width:'100%',maxWidth:760,alignSelf:'center',borderRadius:25});
  for(const key of ['primaryButtonInline','secondaryButton','customerNoteModalPrimaryButton','customerNoteModalSecondaryButton','customerTimingSaveButton','onlinePolicySaveButton'])patch(key,{flex:undefined,flexGrow:0,flexBasis:'auto',width:'auto',maxWidth:'100%',alignSelf:'flex-start',paddingHorizontal:16});
 }
 if(Platform.OS==='web'){  for(const key of ['primaryButtonInline','primaryButtonInlineDesktop'])patch(key,{width:240,maxWidth:'100%',alignSelf:'center',minHeight:46});}

 for(const key of ['customerEditorTitle','customerEditorTitleKeyboardOpen','customerTimingTitle','onlinePolicyTitle','customerNoteModalTitle','title'])if(result[key])patch(key,{fontFamily:Platform.OS==='ios'?'Georgia':'Georgia',fontSize:23,lineHeight:29,fontWeight:'400',color:p.ink});
 for(const key of ['card','sheet','customerEditorModalCard','customerTimingModalCard','onlinePolicySheet','customerNoteModalCard'])if(result[key])patch(key,{backgroundColor:p.night?'rgba(29,33,34,.98)':'rgba(248,245,240,.97)',borderWidth:1,borderColor:p.border,shadowOpacity:0,elevation:0});
 for(const key of ['customerEditorHeaderRow','onlinePolicyHeader','customerTimingHeader','header'])if(result[key])patch(key,{paddingHorizontal:18,paddingVertical:16,borderBottomWidth:1,borderBottomColor:p.line,gap:12});
 for(const key of ['customerNoteModalActions','onlinePolicyFooterActions','customerEditorActionRow','footerActions'])if(result[key])patch(key,{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',alignItems:'center',gap:10});
 for(const key of ['onlinePolicySave','onlinePolicyCancel','customerNoteModalPrimaryButton','customerNoteModalSecondaryButton','customerEditorSaveButton','customerEditorCancelButton'])if(result[key])patch(key,{flex:undefined,flexGrow:0,flexBasis:'auto',alignSelf:'center',minHeight:44,paddingVertical:11,paddingHorizontal:16,borderRadius:12});
 for(const key of ['onlinePolicySave','customerNoteModalPrimaryButton','customerEditorSaveButton'])if(result[key])patch(key,{backgroundColor:p.action});
 for(const key of ['onlinePolicySaveText','customerNoteModalPrimaryText','customerEditorSaveButtonText'])if(result[key])patch(key,{color:p.actionText});

 // Customer dialogs: one surface hierarchy, with restrained semantic accents.
 const sectionGlass=p.night?'rgba(255,255,255,.035)':'rgba(255,255,255,.48)';
 const selectedGlass=p.night?'rgba(157,179,159,.08)':'rgba(218,232,219,.28)';
 for(const [key,value] of Object.entries(result)){
  if(/^(customerTiming|onlinePolicy|customerEditor|rules)/.test(key)){
   if(/(Card|Panel|Group|Notice|Note|RepeatRule)$/.test(key)&&value.backgroundColor)Object.assign(value,{backgroundColor:sectionGlass,borderColor:p.border,borderWidth:1,borderRadius:16,shadowOpacity:0,elevation:0});
   if(/(Icon|MiniIcon)$/.test(key))Object.assign(value,{backgroundColor:p.field,borderColor:p.border,borderWidth:1,borderRadius:12});
   if(/Selected$|Active$/.test(key)&&value.backgroundColor)value.backgroundColor=selectedGlass;
   if(/(Title|Text|Description)Selected$/.test(key))value.color=p.ink;
  }
 }
 for(const key of ['selected','choiceSelected'])if(result[key])patch(key,{backgroundColor:selectedGlass,borderColor:p.border});
 for(const key of ['rulesRow','onlinePolicyModeOption'])if(result[key])patch(key,{minHeight:54,borderRadius:14,paddingHorizontal:14,paddingVertical:12,backgroundColor:sectionGlass,borderWidth:1,borderColor:p.border});
 for(const key of ['rulesGroup','onlinePolicySection','customerTimingServiceCard'])if(result[key])patch(key,{padding:16,gap:12,borderRadius:18,backgroundColor:sectionGlass});
 for(const key of ['customerTimingNotice','onlinePolicyCompositionNote','onlinePolicyServiceRuleNote'])if(result[key])patch(key,{padding:12,borderRadius:14,backgroundColor:p.field});
 for(const key of ['customerEditorFooter','customerEditorFooterWeb','onlinePolicyFooter'])if(result[key])patch(key,{backgroundColor:'transparent',padding:18,borderTopWidth:1,borderTopColor:p.line});
 for(const key of ['customerTimingHeaderIcon','onlinePolicyHeaderIcon'])if(result[key])patch(key,{width:40,height:40,borderRadius:13,backgroundColor:p.field,borderWidth:1,borderColor:p.border});
 for(const key of ['customerEditorModalCardWeb','customerEditorModalCard','onlinePolicySheet'])if(result[key]&&Platform.OS==='web')patch(key,{maxWidth:680,paddingHorizontal:0});

 patch('webManagementSheet',{maxWidth:480,padding:20,gap:18});
 patch('webManagementActionsRow',{width:'100%',flexDirection:'column',flexWrap:'nowrap',gap:6});
 patch('webManagementActionButton',{width:'100%',flexBasis:'auto',flexGrow:0,minHeight:50,paddingHorizontal:14,paddingVertical:12,flexDirection:'row',alignItems:'center',justifyContent:'flex-start',gap:12,borderRadius:13,borderWidth:1,borderColor:p.border,backgroundColor:p.field});
 for(const key of ['Benefits','Payment','Edit','Timing','Limit']){
  patch('webManagementActionButton'+key,{backgroundColor:p.field,borderColor:p.border});
  patch('webManagementActionLabel'+key,{color:p.ink,fontSize:14,fontWeight:'500'});
 }
 patch('webManagementActionButtonBlock',{marginTop:12,backgroundColor:p.night?'rgba(184,129,121,.09)':'rgba(240,219,215,.38)'});
 patch('webManagementActionButtonDelete',{backgroundColor:'transparent',borderColor:p.border});
 patch('webManagementActionLabelDelete',{color:p.night?'#D8A5A0':'#964F48'});

 for(const key of ['customerTimingModalCard','customerEditorModalCard','customerEditorModalCardWeb','onlinePolicySheet','customerNoteModalCard'])if(result[key])patch(key,{backgroundColor:p.night?'#1D2122':'#F8F5F0',borderWidth:1,borderColor:p.border});
 if(result.save)patch('save',{alignSelf:'center',minWidth:200,maxWidth:'100%',paddingHorizontal:20,minHeight:44});
 patch('customerTimingAutosaveText',{color:p.muted,fontSize:12,fontWeight:'400'});

 patch('webManagementOverlay',{backdropFilter:'blur(16px)',WebkitBackdropFilter:'blur(16px)'});
 patch('webManagementSheet',{maxWidth:520,padding:22,backgroundColor:p.night?'rgba(29,33,34,.94)':'rgba(248,245,240,.94)'});
 patch('webManagementActionsRow',{flexDirection:'row',flexWrap:'wrap',gap:10});
 patch('webManagementActionButton',{width:'auto',flexBasis:'46%',flexGrow:1,minHeight:70,flexDirection:'row',gap:10,paddingHorizontal:14,paddingVertical:15,borderRadius:16,backgroundColor:p.night?'rgba(255,255,255,.035)':'rgba(255,255,255,.48)'});
 // Muted glass tints distinguish destinations without colouring the labels.
 const managementTints={
  Benefits: [156,137,177],
  Payment: [181,159,116],
  Edit: [126,153,174],
  Timing: [129,165,147],
  Limit: [166,143,132],
 } as const;
 for(const [key,rgb] of Object.entries(managementTints)){
  patch('webManagementActionButton'+key,{
   backgroundColor:`rgba(${rgb.join(',')},${p.night ? .16 : .17})`,
   borderColor:`rgba(${rgb.join(',')},${p.night ? .30 : .28})`,
   ...(Platform.OS==='web'?{boxShadow:'inset 0 1px 0 rgba(255,255,255,.055)'}:{}),
  });
 }
 patch('webManagementActionButtonDelete',{backgroundColor:p.night?'rgba(180,118,121,.10)':'rgba(190,124,127,.12)',borderColor:p.night?'rgba(200,143,146,.26)':'rgba(180,118,121,.25)'});
 patch('webManagementActionButtonBlock',{marginTop:6});
 patch('webManagementActionButtonDelete',{marginTop:6});
 for(const key of ['clienteCard','clienteCardNativePremium','clienteCardWebStatic'])patch(key,{borderRadius:22,padding:16,backgroundColor:p.night?'rgba(38,42,42,.78)':'rgba(255,253,248,.76)',borderWidth:1,borderColor:p.border});
 patch('clienteSecondaryColumn',{backgroundColor:'transparent',borderWidth:0,padding:0,gap:8});
 patch('clienteTopRow',{gap:12});
 patch('clienteNome',{fontSize:18,lineHeight:24,fontWeight:'600'});
 patch('clienteNomeDesktop',{fontSize:17,lineHeight:23,fontWeight:'600'});
 patch('clienteTelefone',{fontSize:13,color:p.muted});
 patch('clienteContactStack',{gap:3});
 patch('customerInfoButton',{backgroundColor:'transparent',borderWidth:0});
 patch('searchHeaderRowWithGuide',{paddingLeft:34,paddingRight:34,minHeight:34});

 // Customer card: identity, concise status, then the original contact actions.
 for(const key of ['clienteCard','clienteCardNativePremium','clienteCardWebStatic'])patch(key,{borderRadius:22,padding:0,overflow:'hidden',borderWidth:1,borderColor:p.border,backgroundColor:p.night?'rgba(37,41,42,.84)':'rgba(255,253,249,.78)'});
 patch('clienteMain',{paddingHorizontal:16,paddingTop:16,paddingBottom:0,gap:12});
 patch('clienteMainDesktop',{paddingHorizontal:16,paddingTop:16,paddingBottom:0});
 patch('clienteTopRow',{alignItems:'center',gap:12,marginBottom:12});
 patch('clienteTopRowDesktop',{alignItems:'center',gap:12,marginBottom:12});
 patch('clienteInitialBadge',{width:50,height:50,borderRadius:25,shadowOpacity:0,elevation:0});
 patch('clienteInitialBadgeDesktop',{width:46,height:46,borderRadius:23});
 patch('clienteInitialText',{fontSize:17,fontWeight:'600',letterSpacing:.3});
 patch('clienteInitialTextDesktop',{fontSize:16,fontWeight:'600',letterSpacing:.3});
 for(const key of ['statusBadgesRow','statusBadgesRowDesktop','statusLimitsColumn','statusLimitsColumnDesktop','customerRulesCompact','customerRuleCompactCopy'])if(result[key])patch(key,{backgroundColor:'transparent',borderWidth:0,shadowOpacity:0,paddingHorizontal:0,paddingVertical:0});
 patch('statusBadgesRow',{marginTop:0,marginBottom:10,gap:8});
 patch('statusBadgesRowDesktop',{marginTop:0,marginBottom:10,gap:8});
 patch('customerContactFooter',{paddingHorizontal:16,paddingVertical:11,marginTop:10,borderTopWidth:1,borderTopColor:p.line,backgroundColor:p.night?'rgba(255,255,255,.018)':'rgba(247,242,233,.35)'});
 patch('webManagementActionsRow',{justifyContent:'center'});
 patch('webManagementActionButtonDelete',{width:150,flexBasis:'auto',flexGrow:0,flexShrink:0,minHeight:44,paddingVertical:10,paddingHorizontal:16,justifyContent:'center',alignSelf:'center',marginTop:8,borderRadius:13});
 // Footer utilities share the directory hierarchy; flexible copy instead of absolute rails.
 for(const key of ['communicationCard','communicationCardDesktop'])patch(key,{backgroundColor:glass,borderColor:p.border,borderRadius:20,padding:16,minHeight:86,flexDirection:'row',gap:14,alignItems:'center'});
 for(const key of ['communicationLeadDesktop','communicationActionRailDesktop','sideRailWideWeb','headerMetaWideWeb'])if(result[key])patch(key,{position:'relative',left:undefined,right:undefined,top:undefined,bottom:undefined,width:undefined});
 for(const key of ['communicationContent','communicationContentDesktop','headerText','headerTextWideWeb'])if(result[key])patch(key,{position:'relative',left:undefined,right:undefined,top:undefined,bottom:undefined,flex:1,alignItems:'flex-start',minWidth:0});
 for(const key of ['communicationTextDesktop','centerTextWideWeb'])if(result[key])patch(key,{textAlign:'left'});
 patch('communicationTitle',{fontSize:17,lineHeight:23,fontWeight:'500'});
 patch('communicationDescription',{fontSize:12,lineHeight:18,fontWeight:'400'});
 patch('communicationIcon',{backgroundColor:p.night?'rgba(155,139,181,.14)':'rgba(218,208,233,.40)',width:42,height:42,borderRadius:13});
 patch('communicationButton',{backgroundColor:p.field,borderWidth:1,borderColor:p.border,minHeight:40});
 patch('communicationButtonText',{color:p.ink});
 if(result.headerWideWeb&&result.cardWideWeb){
  patch('headerWideWeb',{minHeight:84,paddingHorizontal:16,paddingVertical:16});
  patch('header',{paddingHorizontal:16,paddingVertical:16,borderBottomWidth:0});
  patch('card',{backgroundColor:glass});
  patch('title',{fontSize:17,lineHeight:23,fontWeight:'500',fontFamily:Platform.OS==='ios'?'System':'sans-serif'});
  patch('description',{fontSize:12,lineHeight:18,fontWeight:'400'});
  patch('expandButton',{backgroundColor:p.field,borderColor:p.border});
  if(Platform.OS==='web'){
   patch('status',{minHeight:29,paddingHorizontal:12,paddingVertical:6,borderRadius:10,borderWidth:1,alignItems:'center',justifyContent:'center',marginRight:5});
   patch('statusActive',{backgroundColor:p.night?'rgba(139,174,148,.20)':'rgba(211,231,215,.72)',borderColor:p.night?'rgba(168,199,174,.32)':'rgba(115,151,123,.28)'});
   patch('statusInactive',{backgroundColor:p.field,borderColor:p.border});
   patch('statusText',{fontSize:12,lineHeight:16,fontWeight:'600'});
   patch('headerMetaWideWeb',{gap:14});
   patch('saveButton',{backgroundColor:p.action,width:220,maxWidth:'100%',alignSelf:'center',minHeight:44,paddingHorizontal:20});
   patch('saveButtonText',{color:p.actionText,fontSize:13,fontWeight:'600'});
   patch('toggleActive',{backgroundColor:p.night?'#739C80':'#648C71'});
   patch('toggleKnob',{backgroundColor:'#FFFFFF',shadowOpacity:0});
   patch('toggleRowActive',{backgroundColor:p.night?'rgba(139,174,148,.14)':'rgba(220,235,223,.60)',borderColor:p.night?'rgba(168,199,174,.32)':'rgba(115,151,123,.28)'});
   patch('preview',{backgroundColor:'transparent',borderWidth:0,borderTopWidth:1,borderTopColor:p.line,borderLeftWidth:3,borderLeftColor:p.night?'#739C80':'#88A78E',borderRadius:0,padding:18,marginTop:12});
   patch('previewEyebrow',{color:p.muted,fontSize:10,fontWeight:'500',letterSpacing:1});
   patch('previewTitle',{color:p.ink,fontFamily:'Georgia',fontSize:22,lineHeight:28,fontWeight:'400',marginTop:0});
   patch('previewMessage',{color:p.ink,fontSize:14,lineHeight:22,fontWeight:'400',marginTop:9});
  }
 }
 for(const key of ['primary','secondary'])if(result[key])patch(key,{alignSelf:'center',paddingHorizontal:18,minHeight:44,width:'auto',maxWidth:'100%'});
 if(result.button&&result.buttonText){patch('button',{backgroundColor:p.action,alignSelf:'center',minHeight:42,paddingHorizontal:18,paddingVertical:11});patch('buttonText',{color:p.actionText});patch('secondary',{backgroundColor:p.field,borderWidth:1,borderColor:p.border});}
 if(result.panel)patch('panel',{backgroundColor:sectionGlass,padding:16,gap:14,borderColor:p.border});
 if(result.card&&result.label&&result.input)patch('card',{backgroundColor:sectionGlass,borderColor:p.border,padding:16,gap:12});
 if(Platform.OS==='web'&&result.headerWideWeb&&result.cardWideWeb){
  patch('headerWideWeb',{display:'grid',gridTemplateColumns:'42px minmax(0,1fr)',alignItems:'start'});
  patch('headerMetaWideWeb',{gridColumn:'2',flexDirection:'row',flexWrap:'wrap',justifyContent:'flex-start'});
  patch('card',{padding:0,gap:0,borderRadius:20});
  patch('header',{minHeight:86,paddingHorizontal:16,paddingVertical:16,gap:14});
  patch('headerWideWeb',{minHeight:86,paddingHorizontal:16,paddingVertical:16,gap:14});
  patch('title',{fontSize:17,lineHeight:23,fontWeight:'500',fontFamily:'sans-serif'});
  patch('description',{fontSize:12,lineHeight:18,fontWeight:'400',marginTop:3});
 }
 patch('communicationDescription',{fontSize:12,lineHeight:18,fontWeight:'400',marginTop:3});
 if(Platform.OS==='web'){for(const key of ['communicationCard','communicationCardDesktop'])patch(key,{display:'grid',gridTemplateColumns:'42px minmax(0,1fr)',alignItems:'start'});patch('communicationActionRailDesktop',{gridColumn:'2',alignItems:'flex-start'});}
 if(result.sendText){
  patch('card',{maxWidth:760,backgroundColor:p.night?'rgba(28,32,33,.98)':'rgba(248,245,240,.98)',borderRadius:24});
  patch('content',{padding:20,gap:14});
  patch('footer',{padding:16,gap:10,borderTopWidth:1,borderTopColor:p.line,backgroundColor:'transparent',flexWrap:'wrap'});
  patch('sectionLabel',{fontSize:12,lineHeight:18,fontWeight:'500',color:p.ink});
  patch('title',{fontFamily:'Georgia',fontSize:24,lineHeight:30,fontWeight:'400'});
  for(const key of ['input','textarea'])patch(key,{backgroundColor:p.field,borderColor:p.border,color:p.ink,borderRadius:13,fontSize:14,paddingHorizontal:14,paddingVertical:12});
  patch('sendButton',{backgroundColor:p.action,borderRadius:12,minHeight:44,paddingHorizontal:20});patch('sendText',{color:p.actionText});patch('saveText',{color:p.ink});patch('saveButton',{backgroundColor:p.field,borderColor:p.border});
  patch('templateButton',{backgroundColor:p.field,borderRadius:11,paddingHorizontal:12});
  patch('templateText',{color:p.ink,fontSize:12});
  patch('recipientHeader',{marginTop:14});
 }
 result.__premiumIcon={color:p.ink};
 return premiumWebCardStyles(result,p) as T & Record<string,any>;
}

export function useCustomerPremiumStyles<T extends Record<string,any>>(base:T):T & Record<string,any> {
 const enabled=React.useContext(CustomerPremiumScope);
 const {palette}=useAccessAppearance();
 return React.useMemo(()=>enabled?nativeCustomersStyles(base,palette):base,[base,enabled,palette]);
}
export function useCustomerPremiumAppearance(){
 const enabled=React.useContext(CustomerPremiumScope);
 const {palette}=useAccessAppearance();
 return enabled?palette:null;
}

/** Scoped visual tokens for legacy inline benefits styles; no data or action changes. */
export function useCustomerPremiumColor(){
 const p=useCustomerPremiumAppearance();
 return React.useCallback((original:string,role='color')=>{
  if(!p)return original;
  if(/border/i.test(role))return /^#(b56e86|b8758c|c5839a)$/i.test(original)?(p.night?'#9BB39F':'#6B8A72'):p.border;
  if(role==='placeholderTextColor')return p.muted;
  if(role==='thumbColor')return p.night?'#E7E8E0':'#FFFFFF';
  if(/background|^bg$/.test(role)){
   if(/^#(fbeef3|f6e4eb|ead8e1|f3d9e3)$/i.test(original))return p.night?'rgba(150,177,154,.22)':'rgba(205,225,208,.65)';
   if(/^#(953651|963b57|ad4865|253d61)$/i.test(original))return p.action;
   return p.field;
  }
  if(role==='true')return p.night?'#6E8C79':'#8EAE99';
  if(role==='false')return p.night?'#555E58':'#A9B3AC';
  if(/^#(fff|ffffff)$/i.test(original))return p.actionText;
  if(/^#b42318$/i.test(original))return p.night?'#E0A5AC':'#994951';
  if(/^#(176b53|176b52)$/i.test(original))return p.night?'#BDD0C0':'#4F7058';
  if(/^#(526477|667085|7d6a75|77818f|7b8493|475569)$/i.test(original))return p.muted;
  return p.ink;
 },[p]);
}
