import { premiumWebCardStyles } from './premium-web-surfaces';
import { Platform, StyleSheet } from 'react-native';
import type { useAccessAppearance } from './access-premium';
type Palette=ReturnType<typeof useAccessAppearance>['palette'];
const sans=Platform.OS==='ios'?'System':'sans-serif';
export function nativeRequestsStyles<T extends Record<string,any>>(base:T,p:Palette):T & Record<string,any>{

 const result:Record<string,any>={};
 for(const [key,original] of Object.entries(base)){
  const v={...StyleSheet.flatten(original)};
  const semantic=/Danger|Destructive|Reject|Success|Pending|Countdown|Unread|BadgeOn|ToggleOn|ToggleOff|Status|Disabled/.test(key);
  if(!semantic){
   if(v.color)v.color=/Hint|Meta|Subtitle|Label|Eyebrow|Service|Message|NoteText/.test(key)?p.muted:p.ink;
   if(v.backgroundColor&&v.backgroundColor!=='transparent')v.backgroundColor=p.field;
   if(v.borderColor)v.borderColor=p.border;
  }
  if(semantic && !/Unread|Disabled/.test(key)){
   const danger=/Danger|Destructive|Reject/.test(key),success=/Success|BadgeOn|ToggleOn/.test(key);
   const ink=danger?(p.night?'#E6A4A4':'#963D42'):success?(p.night?'#B3CBB4':'#426C4B'):(p.night?'#D7C49D':'#80633C');
   if(v.color)v.color=ink;
   if(v.backgroundColor)v.backgroundColor=danger?(p.night?'rgba(174,108,117,.14)':'rgba(246,226,229,.5)'):success?(p.night?'rgba(137,166,141,.14)':'rgba(226,236,223,.5)'):(p.night?'rgba(179,151,112,.14)':'rgba(245,231,213,.5)');
   if(v.borderColor)v.borderColor=p.border;
  }
  if(/Active$|Selected$|^selected$/.test(key)){
   if(v.backgroundColor)v.backgroundColor=p.action;
   if(v.borderColor)v.borderColor=p.action;
   if(v.color)v.color=p.actionText;
  }
  for(const edge of ['borderTopColor','borderBottomColor','borderLeftColor','borderRightColor'])if(v[edge])v[edge]=p.line;
  if(v.fontFamily)v.fontFamily=sans;
  if(v.fontWeight==='900'||v.fontWeight==='800')v.fontWeight='600';
  if(v.shadowRadius){v.shadowOpacity=0;v.elevation=0;}
  result[key]=v;
 }
 const patch=(key:string,value:any)=>result[key]={...result[key],...value};
 const glass=p.night?'rgba(38,41,43,.82)':'rgba(255,253,250,.68)';
 patch('container',{backgroundColor:'transparent'});
 patch('content',{paddingTop:Platform.OS==='web'?18:undefined,paddingBottom:Platform.OS==='web'?24:152});
 patch('heroCard',{backgroundColor:'transparent',borderWidth:0,padding:0,paddingHorizontal:0,paddingBottom:0,shadowOpacity:0,elevation:0});
 if(Platform.OS==='web'){
  patch('heroStatsGrid',{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10});
  patch('heroStatsColumn',{display:'contents'});
  patch('heroStatCard',{minHeight:90,paddingVertical:14,borderWidth:1,borderColor:p.border,borderRadius:18});
  patch('heroStatNumber',{fontSize:27,lineHeight:32,marginBottom:4,color:p.ink,fontWeight:'600'});
  patch('heroStatLabel',{fontSize:12,lineHeight:17,color:p.muted,fontWeight:'400'});
  patch('heroStatCardBlue',{backgroundColor:p.night?'rgba(154,139,180,.13)':'rgba(232,224,242,.45)'});
  patch('heroStatCardMint',{backgroundColor:p.night?'rgba(143,174,151,.13)':'rgba(224,237,226,.45)'});
  patch('heroStatCardOrange',{backgroundColor:p.night?'rgba(185,160,130,.13)':'rgba(243,230,213,.45)'});
  patch('heroStatCardRed',{backgroundColor:p.night?'rgba(185,137,148,.13)':'rgba(243,225,230,.45)'});
  patch('webAccordionSection',{borderRadius:20,padding:14});
  patch('directRequestList',{display:'flex',gap:16});
  patch('requestVisualGroup',{display:'flex',flexDirection:'column',gap:12,alignItems:'stretch'});

  for(const key of ['desktopColumnLeft','desktopColumnRight','desktopColumnStack','webAccordionColumn','webAccordionColumnStack'])patch(key,{display:'contents'});
  patch('autoAcceptToggle',{alignSelf:'center',width:'auto',minWidth:0,maxWidth:'100%',paddingHorizontal:20,paddingVertical:10});
  patch('autoAcceptToggleText',{width:'auto',maxWidth:'100%',flexShrink:1});

 }

 patch('accordionSection',{backgroundColor:glass,borderColor:p.border,borderWidth:1,borderRadius:19,padding:12,marginBottom:10,shadowOpacity:0,elevation:0});
 patch('accordionTitle',{color:p.ink,fontFamily:sans,fontSize:16,lineHeight:22,fontWeight:'600'});
 patch('compactRequestCard',{backgroundColor:glass,borderColor:p.border,borderRadius:18,padding:14,shadowOpacity:0,elevation:0});
 patch('compactRequestCardUnread',{backgroundColor:p.night?'rgba(145,126,171,.11)':'rgba(235,228,245,.4)',borderColor:p.border,borderLeftColor:p.border,shadowOpacity:0});
 patch('compactRequestName',{color:p.ink,fontSize:17,lineHeight:23,fontWeight:'600'});
 patch('compactRequestService',{color:p.ink,fontSize:13,lineHeight:19,fontWeight:'400'});
 for(const key of ['compactDecisionPrimary','dayClusterPreviewDecisionAccept','requestDetailPrimaryAction','ownerRequestDialogButton'])patch(key,{backgroundColor:p.action,borderColor:p.action,minHeight:44,borderRadius:13});
 for(const key of ['compactDecisionPrimaryText','dayClusterPreviewDecisionAcceptText','requestDetailPrimaryActionText','ownerRequestDialogButtonText'])patch(key,{color:p.actionText,fontWeight:'600'});
 for(const key of ['compactDecisionSecondary','dayClusterPreviewDecisionReject'])patch(key,{backgroundColor:'transparent',borderColor:p.night?'#C3747480':'#C3747460',borderWidth:1,minHeight:44,borderRadius:13});
 for(const key of ['compactDecisionSecondaryText','dayClusterPreviewDecisionRejectText'])patch(key,{color:p.night?'#E6A4A4':'#963D42',fontWeight:'600'});
 patch('compactDecisionAdvanced',{backgroundColor:'transparent',borderWidth:0,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:p.line,borderRadius:0,minHeight:40,paddingHorizontal:0});
 patch('compactDecisionAdvancedTitle',{color:p.ink,fontSize:13,fontWeight:'400'});
 for(const key of ['requestDetailSheet','manualAcceptSheet','ownerRequestDialogSheet'])patch(key,{backgroundColor:p.night?'#202325':'#F5F1EB',borderColor:p.border,borderWidth:1,borderRadius:25});
 patch('autoAcceptCard',{backgroundColor:glass,borderColor:p.border,borderWidth:1,borderRadius:19,shadowOpacity:0});
 patch('nativeSectionHeader',{flexDirection:'row',alignItems:'center',gap:6,minHeight:48});
 patch('nativeSectionToggle',{flex:1,minWidth:0,minHeight:48,justifyContent:'center',paddingVertical:4,paddingLeft:2});
 patch('nativeSectionHeading',{flexDirection:'row',alignItems:'center',gap:8});
 patch('nativeSectionCount',{minWidth:26,paddingHorizontal:7,height:25,borderRadius:8,backgroundColor:p.field,alignItems:'center',justifyContent:'center'});
 patch('nativeSectionCountText',{fontSize:12,fontWeight:'600',color:p.muted,fontVariant:['tabular-nums']});
 patch('nativeSectionUnread',{fontSize:11,lineHeight:16,color:p.night?'#D7C49D':'#80633C',marginTop:2});
 patch('nativeSectionChevron',{width:36,height:44,alignItems:'center',justifyContent:'center',flexShrink:0});
 patch('compactRequestMeta',{color:p.muted,fontSize:12,lineHeight:18,fontWeight:'500'});
 const sage=p.night?'rgba(143,171,150,.16)':'rgba(218,234,220,.50)';
 patch('logicalRequestTimelineCard',{backgroundColor:p.night?'rgba(255,255,255,.035)':'rgba(255,255,255,.45)',borderColor:p.border,paddingHorizontal:12,paddingVertical:11,gap:5});
 patch('logicalRequestTimelineHeading',{justifyContent:'flex-start',gap:8,paddingBottom:7,marginBottom:2,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:p.line});
 patch('logicalRequestTimelineEyebrow',{color:p.ink,fontSize:11,lineHeight:16,fontWeight:'600',letterSpacing:1,textAlign:'left'});
 patch('logicalRequestTimelineRow',{minHeight:31,gap:8});
 if(Platform.OS==='web'){patch('logicalRequestTimelineRow',{flexWrap:'wrap',alignItems:'center'});patch('logicalRequestTimelineService',{flexBasis:'50%',minWidth:0});patch('logicalRequestTimelineTime',{flexShrink:0,whiteSpace:'nowrap'});patch('logicalRequestTimelinePause',{flexShrink:0,whiteSpace:'nowrap'});}
 patch('logicalRequestTimelineDot',{width:5,height:5,backgroundColor:p.night?'#D8C29B':'#8F6D3B'});
 patch('logicalRequestTimelineService',{color:p.ink,fontSize:12,lineHeight:18,fontWeight:'500'});
 patch('logicalRequestTimelineTime',{color:p.ink,fontSize:12,lineHeight:18,fontWeight:'600',fontVariant:['tabular-nums']});
 patch('compactActionChip',{backgroundColor:p.night?'rgba(166,158,143,.13)':'rgba(236,229,217,.48)',borderWidth:StyleSheet.hairlineWidth,borderColor:p.border,minHeight:34,borderRadius:11});
 // Contact actions share the row equally, icon + label, like the rest of the back office.
 patch('compactActionChip',{flex:1,flexGrow:1,flexBasis:0,alignSelf:'stretch',flexDirection:'row',gap:7,minHeight:Platform.OS==='web'?38:44,paddingHorizontal:14,borderRadius:13});
 patch('compactActionsRow',{flexWrap:'nowrap',gap:8,marginTop:10});
 patch('requestDetailField',{width:undefined,flexGrow:1,flexBasis:'45%',minWidth:0});
 patch('compactDecisionBlock',{paddingHorizontal:14,paddingBottom:14,paddingTop:12,marginTop:0,gap:10,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:p.line,backgroundColor:'transparent'});
 for(const key of ['requestDetailPrimaryAction','requestDetailSecondaryAction'])patch(key,{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8});
 patch('compactActionChipText',{fontSize:13,lineHeight:18,fontWeight:'600'});
 patch('compactActionChipWhatsapp',{backgroundColor:sage,borderColor:p.border});
 patch('compactActionChipWhatsappText',{color:p.night?'#C3D8C6':'#416A4B'});
 // One accent for the whole page: soft gold for "on/selected", neutral glass for the switch-off action.
 const activeFill=p.night?'rgba(255,255,255,.07)':'rgba(255,255,255,.9)';
 const activeInk=p.ink;
 const activeBorder=p.night?'rgba(255,255,255,.30)':'rgba(40,40,38,.30)';
 const stopFill=p.field;
 const stopInk=p.ink;
 const stopBorder=p.border;
 for(const key of ['autoAcceptBadgeOn','autoAcceptLiveRow','guidedSlotChipActive'])patch(key,{backgroundColor:activeFill,borderColor:activeBorder,borderWidth:1,shadowOpacity:0,elevation:0});
 for(const key of ['autoAcceptBadgeTextOn','autoAcceptLiveText','guidedSlotChipTextActive'])patch(key,{color:activeInk});
 patch('guidedSlotChoiceDescriptionActive',{color:p.muted});
 patch('guidedSlotRadio',{width:24,height:24,borderRadius:12,borderWidth:1.5,borderColor:p.night?'#8C948F':'#8A958D',backgroundColor:'transparent',flexShrink:0});
 patch('guidedSlotRadioActive',{backgroundColor:activeFill,borderColor:activeInk,borderWidth:2});
 patch('guidedSlotRecommendedBadge',{backgroundColor:p.night?'rgba(155,181,158,.16)':'rgba(242,248,240,.8)',borderRadius:7});
 patch('guidedSlotChip',{paddingHorizontal:13,paddingVertical:11,gap:10,minHeight:68});
 patch('guidedSlotChoiceCopy',{gap:4});
 patch('guidedSlotChoiceTitleRow',{gap:5});
 patch('guidedSlotChoiceDescription',{fontSize:12,lineHeight:17});
 patch('guidedSlotRecommendedBadge',{backgroundColor:p.night?'rgba(213,191,151,.18)':'rgba(236,220,189,.65)',borderWidth:1,borderColor:p.night?'rgba(213,191,151,.38)':'rgba(161,133,84,.35)',paddingHorizontal:7,paddingVertical:2,borderRadius:6});
 patch('guidedSlotRecommendedBadgeText',{color:p.night?'#E1CFAC':'#725B34',fontSize:10,lineHeight:13,fontWeight:'600'});
 patch('autoAcceptToggleOn',{backgroundColor:stopFill,borderColor:stopBorder,borderWidth:1,shadowOpacity:0,elevation:0});
 patch('autoAcceptToggleTextOn',{color:stopInk});
 patch('autoAcceptToggleOff',{backgroundColor:activeFill,borderColor:activeBorder,borderWidth:1,shadowOpacity:0,elevation:0});
 patch('autoAcceptToggleTextOff',{color:activeInk});
 patch('autoAcceptToggle',{borderRadius:14,minHeight:44,minWidth:0,maxWidth:'100%',alignSelf:'stretch',paddingHorizontal:14});
 patch('autoAcceptTitle',{fontSize:18,lineHeight:24,fontWeight:'600',color:p.ink});
 patch('guidedSlotOptionLabel',{fontSize:13,lineHeight:19,color:p.muted,fontWeight:'600'});
 // Counts stay legible against both translucent cards and the light backdrop.
 for(const key of ['nativeSectionCount','requestVisualGroupCount','archiveYearCount','archiveMonthCount','archiveMonthChevronCount'])patch(key,{backgroundColor:p.night?'rgba(221,216,205,.13)':'rgba(212,204,190,.38)',borderWidth:1,borderColor:p.night?'rgba(232,226,213,.24)':'rgba(136,125,107,.3)',color:p.ink,borderRadius:8,minWidth:26,paddingHorizontal:7});
 patch('nativeSectionCountText',{color:p.ink,fontWeight:'600'});
 patch('accordionHeaderText',{justifyContent:'flex-start'});
 patch('accordionTitle',{...result.accordionTitle,textAlign:'left',letterSpacing:0});
 patch('accordionReadAction',{borderTopWidth:0,paddingTop:0,marginTop:6});
 patch('accordionUnreadBadgeFloating',{position:'absolute',top:-6,right:12,paddingVertical:3,paddingHorizontal:7,minWidth:24,minHeight:22,borderRadius:11,zIndex:2,backgroundColor:'#D94A54',borderWidth:1,borderColor:p.night?'#26292B':'#FFFDFA',alignItems:'center',justifyContent:'center'});
 patch('accordionUnreadBadgeText',{color:'#FFFFFF',fontSize:11,lineHeight:14,fontWeight:'600'});
 patch('accordionHeader',{...result.accordionHeader,paddingTop:8});
 for(const key of ['requestDetailClose'])patch(key,{width:82,height:40,borderRadius:13,backgroundColor:p.field,borderWidth:1,borderColor:p.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5});
 for(const key of ['requestDetailTitle','manualAcceptTitle'])patch(key,{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:24,lineHeight:30,fontWeight:'400',color:p.ink});
 patch('requestDetailHandle',{backgroundColor:p.line});
 for(const key of ['requestDetailField','manualAcceptOperatorChip','manualAcceptDurationCard'])patch(key,{backgroundColor:p.field,borderColor:p.border,borderRadius:16});
 patch('card',{backgroundColor:glass,borderColor:p.border,borderRadius:19});
 patch('selected',{backgroundColor:p.action,borderColor:p.action});
 patch('save',{backgroundColor:p.action});patch('saveText',{color:p.actionText});
 patch('sheet',{backgroundColor:p.night?'#202325':'#F5F1EB',borderColor:p.border});
 patch('ownerRequestDialogCancel',{backgroundColor:p.field});patch('ownerRequestDialogCancelText',{color:p.ink});
 if(base.stepIndex && base.headingIcon){
  patch('panel',{backgroundColor:p.night?'rgba(36,40,40,.55)':'rgba(255,253,249,.42)',borderColor:p.border,borderWidth:1,borderRadius:18,padding:13,shadowOpacity:0,elevation:0});
  patch('headingIcon',{backgroundColor:p.night?'rgba(196,191,180,.12)':'rgba(225,217,200,.48)',borderWidth:1,borderColor:p.border,borderRadius:11});
  patch('title',{color:p.ink,fontSize:15,lineHeight:21,fontWeight:'600'});
  patch('description',{color:p.muted,fontSize:12,lineHeight:18,fontWeight:'400'});
  patch('step',{backgroundColor:p.night?'rgba(255,255,255,.035)':'rgba(255,255,255,.4)',borderColor:p.border,borderWidth:1,borderRadius:14,padding:12});
  patch('stepIndex',{color:p.ink,backgroundColor:p.night?'rgba(196,191,180,.14)':'rgba(225,217,200,.6)',fontSize:12,fontWeight:'600',borderRadius:9});
  patch('stepTitle',{color:p.ink,fontSize:13,lineHeight:19,fontWeight:'600'});
  patch('stepDescription',{color:p.muted,fontSize:12,lineHeight:18,fontWeight:'400'});
  patch('note',{backgroundColor:'transparent',borderColor:p.line});
 }
 if(Platform.OS==='web'){
  for(const key of ['requestDetailOverlay','manualAcceptOverlay','ownerRequestDialogOverlay'])patch(key,{justifyContent:'center',alignItems:'center',padding:20});
  for(const key of ['requestDetailSheet','manualAcceptSheet','ownerRequestDialogSheet'])patch(key,{width:'100%',maxWidth:760,alignSelf:'center',borderRadius:25});
  for(const key of ['requestDetailPrimaryAction','requestDetailSecondaryAction'])patch(key,{flex:undefined,flexGrow:0,flexShrink:1,flexBasis:'auto',paddingHorizontal:16,alignSelf:'flex-start'});
  patch('requestDetailActions',{flexWrap:'wrap'});
 }
 if(Platform.OS==='web'){patch('autoAcceptToggle',{alignSelf:'flex-start',width:'auto',minWidth:0,maxWidth:'100%',paddingHorizontal:20,paddingVertical:10});patch('autoAcceptToggleText',{width:'auto',maxWidth:'100%',flexShrink:1});}
 // Rule cards: settings rows — medallion, title + info, description, switch on the right; choices as compact lists.
 const lift=p.night?'rgba(46,49,50,.92)':'rgba(255,253,250,.92)';
 patch('autoAcceptCard',{alignItems:'stretch',backgroundColor:lift,borderWidth:1,borderColor:p.border,borderRadius:19,paddingHorizontal:16,paddingVertical:16,marginBottom:12,shadowColor:'#000',shadowOpacity:p.night?.3:.08,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:3});
 patch('autoAcceptHeaderRow',{flexDirection:'row',alignItems:'flex-start',justifyContent:'flex-start',gap:12,paddingRight:64});
 patch('autoAcceptHeaderTextWrap',{flexGrow:1,flexShrink:1,flexBasis:0,minWidth:0,width:undefined,alignItems:'flex-start',paddingRight:0,gap:2});
 patch('autoAcceptTitle',{textAlign:'left',paddingHorizontal:0,marginBottom:0,fontSize:16,lineHeight:22});
 patch('autoAcceptHint',{textAlign:'left',fontWeight:'400',color:p.muted,fontSize:12,lineHeight:18});
 patch('autoAcceptLiveRow',{alignSelf:'flex-start',marginTop:6});
 patch('autoAcceptBadge',{display:'none'});
 const track={position:'absolute',top:20,right:16,width:54,height:32,minHeight:32,minWidth:0,maxWidth:54,borderRadius:16,paddingHorizontal:4,paddingVertical:0,marginTop:0,alignSelf:'auto',justifyContent:'center',alignItems:'stretch',shadowOpacity:0,elevation:0};
 patch('autoAcceptToggle',track);
 // Neutral switch: light track when on (dark mode), dark track when on (light mode) — no yellow.
 patch('autoAcceptToggleOn',{backgroundColor:p.night?'#9C8461':'#7A6446',borderColor:p.night?'#9C8461':'#7A6446',borderWidth:1});
 patch('autoAcceptToggleOff',{backgroundColor:p.field,borderColor:p.border,borderWidth:1});
 patch('guidedSlotOptionGroup',{alignItems:'stretch',gap:8,marginTop:16});
 patch('guidedSlotOptionLabel',{textAlign:'left',fontSize:11,lineHeight:16,letterSpacing:.8,textTransform:'uppercase',color:p.muted,fontWeight:'600'});
 patch('guidedSlotChip',{borderRadius:14,borderWidth:1,borderColor:p.border,backgroundColor:p.field,minHeight:58});
 patch('guidedSlotChipActive',{backgroundColor:activeFill,borderColor:activeBorder});
 patch('guidedSlotRecommendedBadge',{backgroundColor:p.night?'rgba(255,255,255,.08)':'rgba(40,40,38,.06)',borderColor:p.border});
 patch('guidedSlotRecommendedBadgeText',{color:p.muted});
 if(result.archiveMonthList)Object.assign(result.archiveMonthList,{backgroundColor:'transparent',padding:0,gap:8,borderWidth:0});
 if(result.archiveMonthSection)Object.assign(result.archiveMonthSection,{backgroundColor:p.field,borderWidth:1,borderColor:p.border,borderRadius:14,overflow:'hidden'});
 if(result.archiveMonthHeader)Object.assign(result.archiveMonthHeader,{paddingHorizontal:14,paddingVertical:12,minHeight:54,backgroundColor:'transparent',borderWidth:0});
 if(result.archiveMonthTitle)Object.assign(result.archiveMonthTitle,{fontSize:14,lineHeight:20,fontWeight:'500'});
 if(result.archiveMonthChevronCount)Object.assign(result.archiveMonthChevronCount,{minWidth:28,textAlign:'center',paddingHorizontal:8,paddingVertical:4,borderRadius:8,backgroundColor:p.field,borderWidth:1,borderColor:p.border,color:p.ink,fontSize:12});
 return premiumWebCardStyles(result,p) as T & Record<string,any>;
}
