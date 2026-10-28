import { Platform, StyleSheet } from 'react-native';
import { premiumNotificationBannerStyles } from './premium-notification-banner';
import type { useAccessAppearance } from './access-premium';
type Palette=ReturnType<typeof useAccessAppearance>['palette'];
/** Presentation only. No callbacks, navigation, timers or gesture geometry. */
export function nativeHomeStyles<T extends Record<string,any>>(base:T,p:Palette):T{
 if(Platform.OS==='web')return base;
 const result:Record<string,any>={};
 for(const [key,value] of Object.entries(base)){
  const s={...StyleSheet.flatten(value)};
  if(s.color&&!/error|danger|warning|Status|Phase/.test(key))s.color=/Text|Caption|Label|Hint|Role|Meta|Description/.test(key)?p.muted:p.ink;
  if(s.fontFamily)s.fontFamily=Platform.OS==='ios'?'System':'sans-serif';
  if(s.fontWeight && Number(s.fontWeight)>600)s.fontWeight='500';
  if(s.backgroundColor&&!/error|danger|warning|Status|Phase/.test(key)&&s.backgroundColor!=='transparent')s.backgroundColor=p.field;
  if(s.borderColor&&!/error|danger|warning|Status|Phase/.test(key))s.borderColor=p.border;
  if(s.shadowRadius){s.shadowOpacity=.025;s.shadowRadius=6;}
  result[key]=s;
 }
 const patch=(key:string,v:any)=>result[key]={...result[key],...v};
 patch('container',{backgroundColor:'transparent'});
 patch('content',{paddingBottom:152});
 patch('sectionCard',{backgroundColor:p.surface,borderColor:p.border,borderWidth:1,borderRadius:19,padding:15,marginBottom:12});
 for(const key of ['priorityCard','priorityCardGlassBlue','priorityCardAndroidPremium','priorityCardGlassBlueAndroid'])patch(key,{backgroundColor:p.night?'rgba(131,117,163,.16)':'rgba(234,228,247,.64)',borderColor:p.border,borderWidth:1,borderRadius:17,padding:14,marginBottom:0,marginTop:0,shadowOpacity:0});
 for(const key of ['priorityTitle','priorityTitleGlassBlue','priorityTitleAndroidPremium'])patch(key,{color:p.ink,fontFamily:Platform.OS==='ios'?'System':'sans-serif',fontSize:17,lineHeight:23,fontWeight:'600',textAlign:'left',alignSelf:'stretch'});
 for(const key of ['priorityText','priorityTextGlassBlue','priorityTextAndroidPremium'])patch(key,{color:p.muted,fontSize:12,lineHeight:18,fontWeight:'400',textAlign:'left'});
 for(const key of ['priorityEyebrow','priorityEyebrowGlassBlue','priorityEyebrowAndroidPremium'])patch(key,{color:p.muted,fontSize:9,lineHeight:13,letterSpacing:1.2,textAlign:'left',alignSelf:'stretch'});
 patch('sectionCardDark',{backgroundColor:p.night?'rgba(179,145,93,.10)':'rgba(246,233,211,.5)',borderColor:p.border,borderWidth:1,borderRadius:17,padding:14,marginBottom:12});
 patch('sectionTitleDark',{color:p.ink}); patch('sectionTextDark',{color:p.muted});
 for(const key of ['operatorModalCard','customerInsightModalCard'])patch(key,{backgroundColor:p.night?'#202325':'#F5F1EB',borderColor:p.border});
 patch('operatorModalBackdrop',{backgroundColor:'rgba(0,0,0,.38)'});
 // Native sheets use the same compact surface and typography as the renewed app.
 for(const key of ['operatorModalCard','customerInsightModalCard'])patch(key,{borderRadius:24,paddingHorizontal:14,paddingTop:6,paddingBottom:8,minHeight:0,maxHeight:'90%',shadowOpacity:0,elevation:0});
 patch('operatorModalBackdrop',{paddingHorizontal:0,paddingTop:24,paddingBottom:0});
 patch('operatorModalHeader',{alignItems:'flex-start',gap:10,marginBottom:10});
 patch('operatorModalHeaderTextWrap',{flex:1,minWidth:0});
 patch('operatorModalText',{fontSize:13,lineHeight:19,fontWeight:'400',color:p.muted});
 patch('operatorModalEyebrow',{fontSize:10,lineHeight:14,letterSpacing:1,color:p.muted});
 patch('operatorModalToolbar',{flexDirection:'row',flexWrap:'wrap',gap:8,paddingVertical:8,marginBottom:8,borderBottomWidth:0});
 patch('operatorModalScopeRow',{flexDirection:'row',flexWrap:'wrap',gap:6});
 for(const key of ['operatorModalScopeChip','operatorModalToolbarButton','customerInsightFilterChip','customerInsightPickerChip'])patch(key,{borderRadius:12,minHeight:40,paddingHorizontal:11,paddingVertical:8,borderWidth:1,borderColor:p.border});
 patch('operatorModalScrollContent',{paddingBottom:8,gap:10});
 for(const key of ['profileEditorCard','profileModuleCard'])patch(key,{backgroundColor:p.field,borderColor:p.border,borderWidth:1,borderRadius:18,padding:14});
 for(const key of ['profileEditorTitle','profileModuleTitle'])patch(key,{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontWeight:'400',color:p.ink});

 for(const key of ['operatorModalScopeChipActive','customerInsightPickerChipActive','customerInsightFilterChipActive'])patch(key,{backgroundColor:p.action,borderColor:p.action});
 for(const key of ['operatorModalScopeChipTextActive','customerInsightPickerChipTitleActive','customerInsightPickerChipMetaActive','customerInsightFilterChipTextActive','customerInsightFilterChipCountActive'])patch(key,{color:p.actionText});
 // Keep headings, data and actions distinct without adding heavy blur layers.
 for(const key of ['operatorModalTitle','customerInsightModalTitle'])patch(key,{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:24,lineHeight:30,fontWeight:'400',color:p.ink});
 for(const key of ['operatorModalCloseButton','customerInsightModalCloseButton'])patch(key,{backgroundColor:p.field,borderColor:p.border,borderRadius:13,width:82,height:40,flexDirection:'row',gap:5});
 const lavender=p.night?'rgba(149,132,179,.13)':'rgba(233,225,244,.48)';
 const sage=p.night?'rgba(137,166,141,.13)':'rgba(226,236,223,.5)';
 const blue=p.night?'rgba(127,153,170,.12)':'rgba(223,233,240,.5)';
 const sand=p.night?'rgba(179,151,112,.12)':'rgba(245,231,213,.52)';
 for(const key of ['operatorModalBoard','customerInsightProfileCard'])patch(key,{backgroundColor:p.surface,borderColor:p.border,borderWidth:1,borderRadius:20,padding:16});
 for(const key of ['operatorModalBoardAvatar','operatorModalCounterPill'])patch(key,{backgroundColor:sage});
 patch('operatorModalCounterPillSoft',{backgroundColor:lavender});
 patch('operatorModalBoardEmpty',{backgroundColor:'transparent',borderWidth:0,borderTopWidth:StyleSheet.hairlineWidth,borderColor:p.line,borderRadius:0,marginTop:14,paddingTop:14});
 patch('customerInsightSearchInput',{backgroundColor:p.field,color:p.ink,borderColor:p.border,fontSize:15,minHeight:48});
 for(const key of ['customerInsightMetricCard','customerInsightStatCard'])patch(key,{backgroundColor:blue,borderColor:p.border,borderRadius:17});
 patch('customerInsightServicesCard',{backgroundColor:lavender});
 patch('customerInsightTimelineContent',{backgroundColor:p.field,borderColor:p.border,borderRadius:17});
 patch('customerInsightDateBadge',{backgroundColor:sand,borderColor:p.border});
 patch('customerInsightNextCard',{backgroundColor:sage});
 patch('operatorModalTimelineContent',{backgroundColor:p.field,borderColor:p.border});
 for(const key of ['profileEditorCard','accessCard','qrCard'])patch(key,{backgroundColor:p.surface,borderColor:p.border,borderRadius:20});
 for(const key of ['accessCardGlow','qrCardGlow'])patch(key,{opacity:0});
 patch('clientAccessPrimaryButton',{backgroundColor:p.action});patch('clientAccessPrimaryButtonText',{color:p.actionText});

 for(const key of ['operatorModalCard','customerInsightModalCard'])patch(key,{height:'94%',maxHeight:'94%',paddingBottom:0});
 patch('operatorModalScroll',{flex:1,flexGrow:1,minHeight:0,maxHeight:undefined});
 // Home insights: compact identities and calm data, with room for long content.
 patch('operatorModalTitle',{fontSize:23,lineHeight:29});
 patch('operatorModalText',{fontSize:12,lineHeight:17,marginTop:3});
 patch('operatorModalEyebrow',{fontSize:10,lineHeight:14,fontWeight:'500',letterSpacing:.8});
 patch('operatorModalHeader',{marginBottom:6});
 patch('operatorModalCloseButton',{width:36,height:36,minWidth:36,borderRadius:12,justifyContent:'center',alignItems:'center'});
 patch('operatorModalToolbar',{paddingTop:4,paddingBottom:6,marginBottom:4,gap:6});
 patch('operatorModalScopeRow',{width:'100%',gap:5});
 patch('operatorModalScopeChip',{flex:1,minHeight:36,paddingVertical:7,paddingHorizontal:8});
 patch('operatorModalScopeChipText',{fontSize:12,lineHeight:17,fontWeight:'500'});
 patch('operatorModalToolbarButton',{minHeight:36,paddingVertical:7,flexGrow:1});
 patch('operatorModalToolbarButtonText',{fontSize:12,fontWeight:'500'});
 patch('operatorModalScrollContent',{paddingTop:2,paddingBottom:8,gap:8});
 patch('operatorModalBoard',{padding:12,borderRadius:17});
 patch('operatorModalBoardHeader',{marginBottom:0,gap:8,alignItems:'center',flexWrap:'wrap'});
 patch('operatorModalBoardIdentity',{minWidth:130});
 patch('operatorModalBoardAvatar',{width:34,height:34,borderRadius:12});
 patch('operatorModalBoardName',{fontSize:15,lineHeight:20,fontWeight:'500',marginBottom:1});
 patch('operatorModalBoardRole',{fontSize:11,lineHeight:16,fontWeight:'400'});
 patch('operatorModalBoardCounters',{gap:5});
 for(const key of ['operatorModalCounterPill','operatorModalCounterPillSoft'])patch(key,{minWidth:48,paddingHorizontal:7,paddingVertical:5,borderRadius:11});
 for(const key of ['operatorModalCounterValue','operatorModalCounterValueSoft'])patch(key,{fontSize:16,lineHeight:20,fontWeight:'600'});
 for(const key of ['operatorModalCounterLabel','operatorModalCounterLabelSoft'])patch(key,{fontSize:9,lineHeight:13,fontWeight:'400',textTransform:'none'});
 patch('operatorModalBoardEmpty',{marginTop:9,paddingTop:9,paddingBottom:0,paddingHorizontal:0,alignItems:'flex-start'});
 patch('operatorModalBoardEmptyTitle',{fontSize:12,lineHeight:17,fontWeight:'500',marginBottom:2});
 patch('operatorModalBoardEmptyText',{fontSize:11,lineHeight:16,fontWeight:'400',textAlign:'left'});
 patch('customerInsightPickerScroll',{minHeight:62,marginBottom:6});
 patch('customerInsightPickerRow',{gap:7,paddingBottom:4,paddingRight:4});
 patch('customerInsightPickerChip',{minHeight:54,minWidth:126,paddingHorizontal:11,paddingVertical:8,borderRadius:12});
 patch('customerInsightPickerChipTitle',{fontSize:13,lineHeight:18,fontWeight:'500',marginBottom:2});
 patch('customerInsightPickerChipMeta',{fontSize:11,lineHeight:15,fontWeight:'400'});
 patch('customerInsightBoard',{backgroundColor:'transparent',borderWidth:0,paddingHorizontal:0,paddingVertical:0});
 patch('customerInsightBoardHeader',{flexDirection:'column',gap:8,marginBottom:10});
 patch('customerInsightBoardIdentity',{flex:0,width:'100%',minWidth:0});
 patch('customerInsightBoardName',{fontFamily:Platform.OS==='ios'?'Georgia':'serif',fontSize:22,lineHeight:28,fontWeight:'400',marginBottom:3,color:p.ink});
 patch('customerInsightBoardContacts',{fontSize:12,lineHeight:18,fontWeight:'400',color:p.muted});
 patch('customerInsightSpendBadge',{alignSelf:'stretch',flexDirection:'row',justifyContent:'space-between',gap:8,minWidth:0,paddingHorizontal:12,paddingVertical:8,borderRadius:12,backgroundColor:sage,borderColor:p.border});
 patch('customerInsightSpendBadgeValue',{fontSize:18,lineHeight:24,fontWeight:'600',marginBottom:0,color:p.ink});
 patch('customerInsightSpendBadgeLabel',{fontSize:11,lineHeight:17,fontWeight:'400',color:p.muted});
 patch('customerInsightStatsGrid',{gap:6,marginBottom:10});
 patch('customerInsightStatCard',{width:'31%',minWidth:0,paddingHorizontal:6,paddingVertical:8,borderRadius:12,backgroundColor:blue});
 patch('customerInsightStatValue',{fontSize:18,lineHeight:24,fontWeight:'600',marginBottom:2,color:p.ink});
 patch('customerInsightStatLabel',{fontSize:10,lineHeight:15,fontWeight:'400',color:p.muted});
 patch('customerInsightHighlightsRow',{gap:7,marginBottom:10});
 patch('customerInsightHighlightCard',{padding:10,borderRadius:13,backgroundColor:p.field});
 patch('customerInsightHighlightLabel',{fontSize:10,lineHeight:14,letterSpacing:.5,fontWeight:'500'});
 patch('customerInsightHighlightValue',{fontSize:12,lineHeight:18,fontWeight:'500'});
 patch('customerInsightHighlightSubvalue',{fontSize:11,lineHeight:16,fontWeight:'400'});
 for(const key of ['customerInsightServicesCard','customerInsightTimelineCard'])patch(key,{padding:12,borderRadius:15,marginBottom:10,backgroundColor:p.field});
 patch('customerInsightSectionTitle',{fontSize:15,lineHeight:21,fontWeight:'500',marginBottom:8});
 // Profile modules follow the web's restrained fields and section hierarchy.
 patch('profileEditorCard',{backgroundColor:'transparent',borderWidth:0,padding:0,paddingHorizontal:0,paddingVertical:0,marginTop:0});
 patch('profileEditorTitle',{fontSize:22,lineHeight:28,marginBottom:4});
 patch('profileEditorCaption',{fontSize:12,lineHeight:18,marginBottom:12});
 patch('profileModuleStack',{gap:10});
 patch('profileModuleCard',{backgroundColor:p.field,borderColor:p.border,borderWidth:1,borderRadius:16,padding:12});
 patch('profileModuleHeader',{gap:8,marginBottom:10,flexWrap:'wrap'});
 patch('profileModuleEyebrow',{fontSize:10,lineHeight:14,letterSpacing:.7,fontWeight:'500',color:p.muted,marginBottom:3});
 patch('profileModuleTitle',{fontSize:18,lineHeight:24,letterSpacing:0,marginBottom:3});
 patch('profileModuleCaption',{fontSize:12,lineHeight:18,fontWeight:'400'});
 patch('profileModuleBadge',{paddingHorizontal:8,paddingVertical:4,borderRadius:9});
 patch('profileModuleBadgeComplete',{backgroundColor:sage,borderColor:p.border});
 patch('profileModuleBadgeIncomplete',{backgroundColor:sand,borderColor:p.border});
 for(const key of ['profileModuleBadgeText','profileModuleBadgeTextComplete','profileModuleBadgeTextIncomplete'])patch(key,{fontSize:10,lineHeight:15,fontWeight:'500',color:p.muted});
 patch('profileEditorWrap',{gap:10});
 patch('formColumn',{flex:1,minWidth:130});
 patch('fieldLabel',{fontSize:12,lineHeight:17,fontWeight:'500',marginTop:8,marginBottom:4,color:p.muted});
 patch('accountInput',{minHeight:44,paddingVertical:10,paddingHorizontal:12,borderRadius:11,fontSize:14,lineHeight:20,fontWeight:'400',backgroundColor:p.field,borderColor:p.border,color:p.ink});
 patch('accountInputLocked',{opacity:.65,backgroundColor:p.field});
 patch('profileSaveButton',{backgroundColor:p.action,minHeight:46,borderRadius:13,paddingVertical:10,marginTop:12});
 for(const key of ['previewButtonText','profileSaveButtonEyebrow'])patch(key,{color:p.actionText,fontWeight:'500'});
 return result as T;
}
export function nativeBarStyles<T extends Record<string,any>>(base:T,p:Palette,compactWeb=false):T{
 const banner=premiumNotificationBannerStyles(p.night);
 const themedBase=base.liveRequestBanner?{...base,
  liveRequestBanner:{...base.liveRequestBanner,...banner.surface},
  liveRequestBannerIconWrap:{...base.liveRequestBannerIconWrap,...banner.icon},
  liveRequestBannerTitle:{...base.liveRequestBannerTitle,...banner.title},
  liveRequestBannerBody:{...base.liveRequestBannerBody,...banner.body},
  liveRequestBannerHint:{...base.liveRequestBannerHint,...banner.body},
 }:base;
 if(Platform.OS==='web'&&!compactWeb)return themedBase as T;
 return {...themedBase,
 ...(compactWeb?{
  tabBarFixedRow:{...base.tabBarFixedRow,paddingHorizontal:4},
  tabBarItem:{...base.tabBarItem,flexShrink:0},
  tabBarItemContent:{...base.tabBarItemContent,minHeight:50},
  tabBarIconStack:{...base.tabBarIconStack,width:30,height:30,minWidth:30,minHeight:30,aspectRatio:1,flexShrink:0},
  tabBarIconLayer:{...base.tabBarIconLayer,width:30,height:30,minWidth:30,minHeight:30,flexShrink:0},
  tabBarLabelLayer:{...base.tabBarLabelLayer,flexShrink:0},
 }:{}),
 tabBar:{...base.tabBar,backgroundColor:p.night?'rgba(30,33,35,.94)':compactWeb?'rgba(250,247,241,.88)':'rgba(250,247,241,.68)',borderColor:p.border,shadowOpacity:.05,...(compactWeb?{minWidth:0,maxWidth:620,backdropFilter:'blur(18px) saturate(1.2)',boxShadow:p.night?'0 8px 24px rgba(0,0,0,.28)':'0 8px 24px rgba(73,54,35,.10)'}:{}),...(Platform.OS!=='web'?{minWidth:0,maxWidth:620,borderRadius:999,borderWidth:1}: {})},
 animatedIndicator:{...base.animatedIndicator,...(compactWeb?{borderRadius:19,backdropFilter:'blur(20px) saturate(1.3)',backgroundImage:p.night?'linear-gradient(150deg,rgba(255,255,255,.14),rgba(255,255,255,.035) 58%,rgba(216,194,155,.055))':'linear-gradient(145deg,rgba(255,255,255,.35),rgba(255,255,255,.03) 48%,rgba(190,159,112,.12))',boxShadow:p.night?'inset 0 1px 0 rgba(255,255,255,.12)':'inset 0 1px 0 rgba(255,255,255,.75), inset 0 -1px 0 rgba(130,112,82,.18)'}:{}),backgroundColor:p.night?'rgba(216,194,155,.24)':'rgba(207,184,143,.58)',borderColor:p.night?'rgba(234,225,207,.24)':'rgba(142,116,76,.68)',borderWidth:1,shadowColor:'#665237',shadowOpacity:p.night?0:.14,shadowRadius:7,shadowOffset:{width:0,height:2}},
 animatedIndicatorGlow:{...base.animatedIndicatorGlow,opacity:0},animatedIndicatorGlass:{...base.animatedIndicatorGlass,backgroundColor:p.night?'rgba(255,255,255,.035)':'rgba(255,255,255,.10)',...(p.night?{borderWidth:0}: {})},animatedIndicatorHighlight:{...base.animatedIndicatorHighlight,opacity:p.night?0:.65,backgroundColor:'rgba(255,255,255,.14)'},animatedIndicatorLowlight:{...base.animatedIndicatorLowlight,opacity:p.night?0:.35},
 animatedIndicatorInnerStroke:{...base.animatedIndicatorInnerStroke,...(p.night?{opacity:0,borderWidth:0}: {})},
 tabBarLabelStack:{...base.tabBarLabelStack,display:'flex'},tabBarLabel:{...base.tabBarLabel,fontFamily:Platform.OS==='ios'?'System':'sans-serif',...(compactWeb?{fontWeight:'600',letterSpacing:-0.1}:{})},tabBarLabelActive:{...base.tabBarLabelActive,color:p.night?'#FFFFFF':'#24221F',...(p.night?{textShadowColor:'rgba(255,255,255,.28)',textShadowRadius:5,textShadowOffset:{width:0,height:0}}:{})},tabBarLabelInactive:{...base.tabBarLabelInactive,color:p.muted}
 };
}
