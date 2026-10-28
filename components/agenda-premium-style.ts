import React from 'react';
import {finishNativeAgendaStyles} from './agenda-native-presentation';
import {Platform,StyleSheet} from 'react-native';
import {useAccessAppearance} from './access-premium';

/** Opaque booking surfaces and restrained status colors, shared by web and native. */
export function getAgendaBookingColors(night: boolean) {
  return night ? {
    available: {accent: '#ABCAB7', background: '#27342E', border: '#4F6959', badgeBackground: '#354B3D'},
    forceable: {accent: '#D9C092', background: '#373228', border: '#736345', badgeBackground: '#4B402D'},
    blocked: {accent: '#D9AAA4', background: '#352B2C', border: '#765553', badgeBackground: '#493536'},
    selected: {background: '#293F50', border: '#8DAFCA', accent: '#B5D1E5', badgeBackground: '#B5D1E5', badgeText: '#213341'},
    surface: '#232829', field: '#2D3333', border: '#505753', muted: '#BAC2BB', ink: '#EEEDE5', backdrop: 'rgba(0,0,0,.56)',
  } : {
    available: {accent: '#466D56', background: '#EFF4EF', border: '#B5C9B8', badgeBackground: '#DFEBDD'},
    forceable: {accent: '#846A3F', background: '#F6F1E6', border: '#D3BE94', badgeBackground: '#EDE3CB'},
    blocked: {accent: '#985B56', background: '#F7EDEC', border: '#D9B5AF', badgeBackground: '#EEDAD7'},
    selected: {background: '#E2EDF4', border: '#507D9A', accent: '#406C89', badgeBackground: '#426D87', badgeText: '#FFFFFF'},
    surface: '#FAF8F2', field: '#F0EEE6', border: '#D2CEC1', muted: '#656C63', ink: '#343735', backdrop: 'rgba(35,38,33,.30)',
  };
}

type Palette=ReturnType<typeof useAccessAppearance>['palette'];
export const AGENDA_PREMIUM_GRID_RADIUS=20;
/** One shared object per theme, including portal menus. Geometry is preserved unless explicitly listed. */
export const AgendaPremiumStyleContext=React.createContext<Record<string,any>|null>(null);
export function createAgendaPremiumStyles<T extends Record<string,any>>(base:T,p:Palette):T{
 const web=Platform.OS==='web',out:Record<string,any>={};
 for(const [key,original] of Object.entries(base)){
  const v={...StyleSheet.flatten(original)} as Record<string,any>;
  const semantic=/danger|delete|error|warning|success|conflict|blocked|pending|status|accent|tint|swatch|shadow|previewBadge/i.test(key);
  const selected=/Active$|Selected$|Enabled$/.test(key)&&!/Inactive|Disabled/.test(key);
  const primary=/(?:PrimaryButton|SaveButton|SaveText|SubmitButton|ConfirmButton|ActionButtonAccept|DarkButton)/i.test(key)&&!/Disabled|Inactive/.test(key);
  if(!semantic){
   if(v.color)v.color=/caption|subtitle|hint|description|meta|note|secondary|placeholder/i.test(key)?p.muted:p.ink;
   if(v.backgroundColor&&v.backgroundColor!=='transparent')v.backgroundColor=selected||primary?p.action:p.field;
   for(const edge of ['borderColor','borderTopColor','borderBottomColor','borderLeftColor','borderRightColor'])if(v[edge]&&v[edge]!=='transparent')v[edge]=p.line;
   if(v.color&&(selected||primary))v.color=p.actionText;
  }
  if(v.shadowOpacity)v.shadowOpacity=0;
  if(v.elevation&&!/Overlay|Drag|Resize|Ghost/i.test(key))v.elevation=0;
  if(/(?:Modal|Dialog|Popup|Confirmation|Details).*Card$|Sheet$|Dialog$|suggestionBox/.test(key)&&v.backgroundColor){v.backgroundColor=p.night?'rgba(28,32,34,.98)':'rgba(252,249,245,.98)';v.borderColor=p.border;v.borderRadius=22;if(web){v.backdropFilter='blur(24px)';v.boxShadow='0 20px 70px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.24)';}}
  if(/backdrop|modalOverlay/i.test(key)&&v.backgroundColor){v.backgroundColor=p.night?'rgba(0,0,0,.48)':'rgba(40,36,30,.28)';if(web)v.backdropFilter='blur(9px)';}
  if(web&&/(?:modalOverlay|ModalBackdrop|CalendarBackdrop)/i.test(key)&&v.backgroundColor){v.justifyContent='center';v.alignItems='center';v.paddingTop=24;v.paddingBottom=24;}
  if(web&&/Overlay$/.test(key)&&v.flex===1&&v.justifyContent==='flex-end'){v.justifyContent='center';v.alignItems='center';v.paddingBottom=24;}
  if(/input|TextArea/i.test(key)&&v.fontSize){v.backgroundColor=p.field;v.borderColor=p.border;v.color=p.ink;v.borderRadius=11;}
  if(/Title$|Heading$/.test(key)&&!/Appointment|Slot|Lane|Day/.test(key)&&v.fontSize>=20){v.fontFamily=web?'Georgia':Platform.OS==='android'?'serif':'Georgia';v.fontWeight='400';}
  if(/Title$/.test(key)&&/Modal|Popup|Dialog|Block|Details|calendar/.test(key)&&v.fontSize>=18){v.fontFamily=web?'Georgia':Platform.OS==='android'?'serif':'Georgia';v.fontWeight='400';}
  if(/^operatorLaneBlock/.test(key)&&v.fontWeight&&!/Title$/.test(key))v.fontWeight='500';
  out[key]=v;
 }
 const patch=(key:string,v:Record<string,any>)=>{if(out[key])Object.assign(out[key],v);};
 // Nested time selection is a solid sheet, never the translucent field fill.
 const booking=getAgendaBookingColors(p.night);
 // Booking editors share one opaque surface and field treatment across platforms.
 patch('quickBookingNestedOverlay',{backgroundColor:booking.backdrop,justifyContent:web?'center':'flex-end',padding:web?24:8,paddingBottom:web?24:0,...(web?{backdropFilter:'none'}:{})});
 patch('quickBookingNestedKeyboardShell',{maxHeight:'100%',maxWidth:820});
 for(const key of ['quickBookingNestedCard','quickBookingNestedCardService','quickBookingNestedCardCustomer'])patch(key,{backgroundColor:booking.surface,borderColor:booking.border,opacity:1,shadowOpacity:0,...(web?{backdropFilter:'none',boxShadow:'0 20px 60px rgba(0,0,0,.28)'}:{})});
 patch('quickBookingNestedField',{backgroundColor:booking.field,color:booking.ink,borderColor:booking.border,minHeight:48,borderRadius:12});
 patch('quickCustomerFieldLabel',{color:booking.ink,fontWeight:'500',lineHeight:18});
 for(const key of ['quickBookingNestedEyebrow','quickBookingNestedIntroText','quickBookingNestedIntroTextCustomer','quickCustomerRequiredHint'])patch(key,{color:booking.muted});
 patch('quickCustomerFormNotice',{backgroundColor:booking.field,color:booking.muted});
 patch('quickCustomerFormFooter',{backgroundColor:booking.surface,borderTopColor:booking.border,paddingTop:14});
 for(const key of ['quickServiceCreationModeButton','quickServiceSaveModeButton'])patch(key,{backgroundColor:booking.field,borderColor:booking.border});

 patch('quickBookingLanePickerOverlay',{backgroundColor:booking.backdrop});
 patch('quickBookingLanePickerCard',{backgroundColor:booking.surface,borderColor:booking.border,opacity:1,shadowColor:'#000000',shadowOpacity:p.night?.32:.16,elevation:24,...(web?{backdropFilter:'none',boxShadow:'0 20px 60px rgba(0,0,0,.28)'}:{})});
 patch('quickBookingLanePickerHeader',{borderBottomColor:booking.border});
 patch('quickBookingLanePickerHandle',{backgroundColor:booking.muted});
 for(const key of ['quickBookingLanePickerTitle','quickBookingTimePickerOptionTime'])patch(key,{color:booking.ink});
 for(const key of ['quickBookingLanePickerEyebrow','quickBookingLanePickerMeta'])patch(key,{color:booking.muted});
 patch('quickBookingLanePickerNotice',{backgroundColor:booking.field,borderColor:booking.border,color:booking.muted,fontWeight:'500'});
 for(const [suffix,tone] of [['Free',booking.available],['Forceable',booking.forceable],['Blocked',booking.blocked]] as const){
  patch(`quickBookingTimePickerOption${suffix}`,{backgroundColor:tone.background,borderColor:tone.border,opacity:1});
  patch(`quickBookingTimePickerOptionStatus${suffix}`,{color:tone.accent});
 }
 patch('quickBookingTimePickerOptionSelected',{backgroundColor:booking.selected.background,borderColor:booking.selected.border,shadowOpacity:0,elevation:0});
 patch('quickBookingTimePickerOptionTextSelected',{color:booking.ink});
 patch('quickBookingTimePickerOptionStatus',{fontWeight:'500',fontSize:10,lineHeight:13});
 for(const key of ['screen','container','pageShell','heroCard','bookingCard','bookingHeader','inlinePlannerCard'])patch(key,{backgroundColor:'transparent',shadowOpacity:0,borderWidth:0});
 // The list below the grid shares the same glass, type hierarchy and quiet state colors.
 patch('agendaExplorerCard',{backgroundColor:p.surface,borderRadius:20,padding:16,borderWidth:1,borderColor:p.border,marginTop:10,marginBottom:10});
 patch('agendaExplorerEyebrow',{fontSize:10,lineHeight:14,fontWeight:'500',letterSpacing:1.1,color:p.muted});
 patch('agendaExplorerTitleCompact',{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontSize:23,lineHeight:30,fontWeight:'400',color:p.ink});
 patch('agendaExplorerHeader',{marginBottom:13});
 patch('agendaViewGrid',{gap:8});
 patch('agendaViewCard',{borderRadius:15,minHeight:78,paddingHorizontal:13,paddingVertical:12,shadowOpacity:0});
 patch('agendaViewEyebrow',{fontSize:10,lineHeight:14,fontWeight:'500',letterSpacing:.2});
 patch('agendaViewTitle',{fontSize:16,lineHeight:21,fontWeight:'600'});
 patch('agendaViewMeta',{fontSize:11,lineHeight:16,fontWeight:'400'});
 patch('agendaViewCountText',{fontSize:13,fontWeight:'600'});
 patch('daySectionCard',{backgroundColor:p.surface,borderWidth:1,borderColor:p.border,borderRadius:20,padding:16});
 patch('daySectionTitle',{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontWeight:'400',fontSize:20,lineHeight:26});
 patch('daySectionSubtitle',{fontSize:12,lineHeight:17,fontWeight:'400',color:p.muted});
 patch('timelineCard',{backgroundColor:p.field,borderRadius:16,borderWidth:1,borderColor:p.line,paddingHorizontal:14,paddingVertical:14,...(web?{boxShadow:'none'}:{})});
 patch('timelineCardCompact',{borderRadius:16,paddingHorizontal:12,paddingVertical:12});
 patch('timelineCardTopSheen',{opacity:0});patch('timelineCardInnerStroke',{opacity:0});
 patch('timelineClient',{fontSize:16,lineHeight:22,fontWeight:'600'});
 patch('timelineTop',{flexDirection:'row',alignItems:'flex-start',gap:12,marginBottom:14});
 patch('timelineTitleRow',{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8});
 patch('timelineMain',{flex:1,minWidth:0,gap:8});
 patch('timelineMetaRow',{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8,marginTop:0});
 patch('statusRow',{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:14});
 patch('actionsRow',{flexDirection:'row',flexWrap:'wrap',gap:12,marginTop:0});
 patch('appointmentActionText',{fontSize:14,lineHeight:20,fontWeight:'500',textAlign:'left',flexShrink:1});
 patch('appointmentSecondaryAction',{minHeight:48,padding:12,borderRadius:13,backgroundColor:p.field,borderColor:p.line});

 patch('timelineTitleRow',{gap:6});
 patch('timelineHourPill',{borderRadius:10,backgroundColor:p.surface,borderWidth:1,borderColor:p.border,paddingHorizontal:9,paddingVertical:7});
 patch('timelineHourText',{fontSize:13,lineHeight:18,fontWeight:'500',color:p.ink});
 if(web){
  patch('timelineTop',{gap:12,marginBottom:12});
  patch('timelineTopCompact',{marginBottom:12});
  patch('timelineHourPill',{width:64,marginRight:0,flexShrink:0,alignItems:'center'});
  patch('timelineMain',{minWidth:0,gap:8});
  patch('timelineTitleRow',{marginBottom:0,gap:6});
  patch('timelineMetaRow',{marginTop:0,gap:12,alignItems:'center'});
  patch('timelineOperator',{flexShrink:1});
  patch('timelineServicePill',{paddingVertical:4,shadowOpacity:0});
 }
 patch('timelineMeta',{fontSize:12,lineHeight:17,fontWeight:'400',color:p.muted});
 patch('timelineOperator',{fontSize:12,lineHeight:17,fontWeight:'400',color:p.muted});
 patch('timelineAppointmentKindBadge',{backgroundColor:p.night?'rgba(166,144,190,.14)':'rgba(229,219,239,.6)',borderColor:p.line});
 patch('timelineAppointmentKindBadgeText',{fontWeight:'500',fontSize:11,lineHeight:15,color:p.night?'#D2BFDF':'#735C83'});
 patch('statusBadge',{paddingHorizontal:8,paddingVertical:4});
 patch('statusBadgePending',{backgroundColor:p.night?'rgba(194,164,110,.13)':'rgba(241,229,205,.7)'});
 patch('statusBadgeTextPending',{color:p.night?'#D8BE8B':'#80683E'});
 patch('statusBadgeDone',{backgroundColor:p.night?'rgba(112,160,139,.13)':'rgba(221,235,226,.7)'});
 patch('statusBadgeTextDone',{color:p.night?'#A7CDB8':'#48715A'});
 patch('statusBadgeText',{fontSize:11,lineHeight:16,fontWeight:'500'});
 patch('appointmentCompletionButton',{borderRadius:12,minHeight:44,paddingVertical:11});
 patch('appointmentSecondaryAction',{borderRadius:12,minHeight:44,paddingVertical:11,backgroundColor:p.field,borderColor:p.line});
 patch('appointmentActionText',{fontSize:13,lineHeight:19,fontWeight:'500'});
 patch('searchCard',{borderRadius:20,borderColor:p.border,borderWidth:1,backgroundColor:p.surface});
 patch('utilitySectionHeaderRow',{minHeight:62});
 patch('utilitySectionToggleTextWrap',{paddingLeft:40});
 patch('searchTitle',{fontSize:17,lineHeight:23,fontWeight:'600',color:p.ink});
 patch('sectionHint',{fontSize:12,lineHeight:18,fontWeight:'400',color:p.muted});
 patch('listContent',{paddingTop:web?22:12,paddingBottom:128});
 patch('bookingCard',{paddingHorizontal:0,paddingTop:0,marginTop:0,borderRadius:0});
 patch('heroCard',{display:'none'});patch('bookingHeader',{display:'none'});
 patch('weekPlannerVisualShift',{marginLeft:0,marginRight:0});
 patch('weekPlannerSectionHeader',{padding:0});
 patch('weekPlannerSectionTitle',{display:'none'});patch('stepPill',{display:'none'});
 patch('weekPlannerSectionTitleRow',{display:'none',minHeight:0});
 patch('weekPlannerDateTitleRow',{alignItems:'flex-start',margin:0,padding:0});
 patch('weekPlannerTitle',{textAlign:'left',fontSize:17,lineHeight:24,fontWeight:'400',fontFamily:web?'Georgia':Platform.OS==='android'?'serif':'Georgia',color:p.ink});
 patch('weekPlannerInlineNavRow',{marginHorizontal:0,marginVertical:8,paddingHorizontal:0});
 patch('weekPlannerControlDeck',{width:'100%',maxWidth:'100%',backgroundColor:p.surface,borderColor:p.border,borderRadius:14,shadowOpacity:0});
 patch('weekPlannerControlDensity',{backgroundColor:'transparent',minHeight:50,paddingHorizontal:10});
 for(const key of ['weekPlannerControlDaysIcon','weekPlannerControlDensityIcon'])patch(key,{backgroundColor:'transparent'});
 // Round the painted surfaces themselves. The interaction host stays visible
 // so drag previews, the live-time badge and resize returns retain their bounds.
 patch('weekPlannerTableShell',{borderRadius:AGENDA_PREMIUM_GRID_RADIUS,borderWidth:1,borderColor:p.night?'rgba(237,230,215,.08)':'rgba(52,55,53,.08)',backgroundColor:p.night?'rgba(22,27,28,.46)':'rgba(221,213,198,.46)',...(web?{boxShadow:p.night?'0 8px 28px rgba(0,0,0,.12),inset 0 1px 0 rgba(255,255,255,.035)':'0 8px 28px rgba(58,48,31,.055),inset 0 1px 0 rgba(255,255,255,.25)'}:{})});
 // The header and slots share this scroll viewport. Keep overflowing lanes
 // inside the calendar instead of letting the header paint beyond its edge.
 if(web)patch('weekPlannerGridScroller',{overflow:'hidden',overflowX:'auto',overflowY:'hidden',borderTopRightRadius:AGENDA_PREMIUM_GRID_RADIUS-1,borderBottomRightRadius:AGENDA_PREMIUM_GRID_RADIUS-1});
 for(const key of ['weekPlannerTimeColumn','weekPlannerTimeColumnOverflow'])patch(key,{borderTopLeftRadius:AGENDA_PREMIUM_GRID_RADIUS-1,borderBottomLeftRadius:AGENDA_PREMIUM_GRID_RADIUS-1,backgroundColor:'transparent'});
 for(const key of ['weekPlannerDayHeader','weekPlannerDayHeaderActive','weekPlannerDayHeaderClosed','weekPlannerDayHeaderHoliday'])patch(key,{backgroundColor:'transparent',borderRadius:0,borderColor:p.line});
 for(const key of ['weekPlannerDayNumberLabel','weekPlannerDayWeekLabel','weekPlannerDayWeekLabelClosed','weekPlannerDayNumberLabelClosed','weekPlannerDayNumberLabelActive','weekPlannerDayWeekLabelActive'])patch(key,{color:p.ink});
 for(const key of ['weekPlannerLaneHeaderCard','weekPlannerLaneHeaderCardPremium','weekPlannerLaneHeaderPlaceholderCard','weekPlannerLaneHeaderPlaceholderCardPremium'])patch(key,{padding:0,paddingHorizontal:0,paddingVertical:0,paddingTop:0,paddingBottom:0,paddingLeft:0,paddingRight:0,borderRadius:0,shadowOpacity:0,elevation:0,borderWidth:0,borderTopWidth:0,borderLeftWidth:0,borderRightWidth:0,borderBottomWidth:0,borderBottomColor:'transparent',...(web?{boxShadow:'none'}:{})});
 for(const key of ['weekPlannerLaneHeaderGlow','weekPlannerLaneHeaderInnerStroke'])patch(key,{opacity:0});
 for(const key of ['weekPlannerCell','weekPlannerSlot','weekPlannerSlotAvailable','weekPlannerCellAvailable','weekPlannerCellPast','weekPlannerSlotPast'])patch(key,{borderRadius:0,borderWidth:0,borderColor:p.line,backgroundColor:'transparent'});
 patch('weekPlannerCell',{borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:p.night?'rgba(237,230,215,.035)':'rgba(55,51,43,.045)'});
 for(const key of ['weekPlannerOperatorLaneCell','weekPlannerDayColumn'])patch(key,{borderRightWidth:StyleSheet.hairlineWidth,borderRightColor:p.night?'rgba(237,230,215,.10)':'rgba(55,51,43,.09)'});
 // Pauses retain their scheduling state while sharing the transparent grid surface.
 for(const key of ['weekPlannerCellLunchBreak','weekPlannerLunchBreakLabelWrapForced'])patch(key,{backgroundColor:'transparent',borderColor:p.line,shadowOpacity:0,elevation:0,...(web?{boxShadow:'none',backgroundImage:'none'}:{})});
 patch('weekPlannerCellTextLunchBreak',{color:p.night?'#E5CBA4':'#69502F',fontWeight:'700',fontSize:10,lineHeight:14});
 patch('weekPlannerLunchBreakAction',{opacity:1});
 patch('weekPlannerLunchBreakLabelWrap',{width:'100%',height:'100%',alignItems:'center',justifyContent:'center'});
 patch('weekPlannerLunchBreakActionPast',{opacity:.6});
 patch('weekPlannerCellTextPast',{display:'none'});
 patch('weekPlannerCellPast',{backgroundColor:'transparent',...(web?{backgroundImage:'none'}:{})});
 // The live row is a translucent wash within the grid, without a separate tile.
 patch('weekPlannerCellLive',{backgroundColor:p.night?'rgba(218,190,112,.12)':'rgba(255,244,190,.38)',borderWidth:0,borderRadius:0,borderColor:'transparent',shadowOpacity:0,elevation:0,...(web?{boxShadow:'none'}:{})});
 patch('weekPlannerCellTextLiveCompact',{color:p.ink,fontSize:10,lineHeight:12,fontWeight:'700',letterSpacing:0});
 patch('weekPlannerCellTextBlocked',{color:p.night?'#D7B896':'#8B5533'});
 // Fine, spaced hatching belongs to each unavailable cell, behind appointment cards.
 // It uses no inset frames and keeps every measured row and lane unchanged.
 if(web)for(const key of ['weekPlannerCellPast','weekPlannerCellOutside','weekPlannerCellOutsideEmpty','weekPlannerCellClosedDay','weekPlannerCellDisabledLane','weekPlannerCellUnavailableWeb','weekPlannerCellBlocked'])patch(key,{
  backgroundColor:p.night?'rgba(8,12,13,.23)':'rgba(107,103,92,.08)',
  backgroundImage:'none',
  borderRadius:0,boxShadow:'none'
 });
 patch('weekAppointmentBlock',{borderRadius:10,...(web?{boxShadow:'0 2px 7px rgba(30,40,33,.045)'}:{})});
 for(const key of ['weekAppointmentGlassGlow','weekAppointmentTopSheen','weekAppointmentInnerStroke'])patch(key,{opacity:0});
 patch('weekAppointmentDragIndicatorWeb',{backgroundColor:'transparent',borderWidth:0,shadowOpacity:0,...(web?{boxShadow:'none'}:{})});
 patch('weekAppointmentDragIndicatorWebText',{color:p.ink,fontSize:18,lineHeight:20,fontWeight:'600'});
 // A drop target is a single transparent outline, without an inner frame.
 patch('weekDragTargetHighlight',{borderRadius:10,borderWidth:1,borderColor:p.night?'rgba(166,218,181,.65)':'rgba(98,160,119,.58)',backgroundColor:p.night?'rgba(166,218,181,.16)':'rgba(166,218,181,.20)',shadowOpacity:0,elevation:0,...(web?{boxShadow:'none'}:{})});
 patch('weekDragTargetHighlightWarning',{borderColor:p.night?'rgba(242,193,143,.70)':'rgba(201,144,87,.62)',backgroundColor:p.night?'rgba(242,193,143,.16)':'rgba(242,193,143,.21)',shadowOpacity:0});
 for(const key of ['weekDragTargetHighlightOverlap','weekDragTargetHighlightInvalid'])patch(key,{borderColor:p.night?'rgba(218,143,135,.65)':'rgba(165,79,71,.58)',backgroundColor:p.night?'rgba(218,143,135,.09)':'rgba(165,79,71,.07)',shadowOpacity:0});
 for(const key of ['weekDragTargetHighlightSheen','weekDragTargetHighlightInnerGlow'])patch(key,{opacity:0,borderWidth:0,backgroundColor:'transparent'});
 const markerColor=p.night?'rgba(216,194,155,.32)':'rgba(52,55,53,.24)';
 for(const key of Object.keys(out))if(/^weekPlanner/.test(key)&&/ConfiguredMarker(Line|Lead)/.test(key))patch(key,{backgroundColor:markerColor,shadowOpacity:0});
 patch('weekPlannerLaneHeaderRow',{marginTop:0,marginBottom:0});
 patch('weekPlannerConfiguredMarkerLine',{height:1.5,top:-.25,backgroundColor:markerColor});
 patch('weekPlannerConfiguredMarkerLineWeb',{height:1.5,top:-.25,left:0,right:0,borderTopWidth:0,backgroundColor:'transparent',clipPath:'polygon(0 50%,clamp(38px,13%,140px) 0,calc(100% - clamp(38px,13%,140px)) 0,100% 50%,calc(100% - clamp(38px,13%,140px)) 100%,clamp(38px,13%,140px) 100%)',backgroundImage:`linear-gradient(to right,transparent,${markerColor} clamp(38px,13%,140px),${markerColor} calc(100% - clamp(38px,13%,140px)),transparent)`});
 patch('weekPlannerCellHourGuide',{top:0,bottom:undefined,height:1,backgroundColor:p.night?'rgba(226,218,202,.18)':'rgba(91,83,69,.17)'});
 // Inset labels only: lane origins and drag coordinates retain the original widths.
 patch('weekPlannerTimeBoundaryChip',{paddingLeft:8,paddingRight:0});
 // Web rows start after the header's 1 px separator. Center each label on
 // that boundary rather than using the legacy 40% label-height offset.
 if(web)for(const key of ['weekPlannerTimeBoundaryRowFirst','weekPlannerTimeBoundaryRowMiddle','weekPlannerTimeBoundaryRowFooter'])patch(key,{top:1-(out.weekPlannerTimeBoundaryRow?.height??20)/2});
 patch('weekPlannerTimeText',{left:7,width:undefined,right:0});
 patch('weekPlannerAndroidCompactTimeLabel',{left:7,width:undefined,right:0});
 patch('weekPlannerTimeLabelMinor',{color:p.muted,fontSize:web?11:10,lineHeight:14,fontWeight:'400'});
 patch('weekPlannerTimeLabelHour',{color:p.ink,fontSize:web?12:10,fontWeight:'500'});
 patch('weekPlannerTimeLabelMarker',{color:p.ink,fontWeight:'500'});
 patch('weekPlannerTimeTextMinor',{color:p.muted,fontSize:web?11:10,lineHeight:14,fontWeight:'400'});
 patch('weekPlannerTimeTextHour',{color:p.ink,fontSize:web?12:11,lineHeight:15,fontWeight:'500'});
 patch('weekStickyOperatorHeaderOverlayWeb',{backgroundColor:p.night?'rgba(28,32,34,.64)':'rgba(250,247,241,.64)',backdropFilter:'blur(18px)'});
 // The current-time indicator uses the same action tone as the controls.
 patch('weekPlannerCurrentTimeRailGlow',{top:-1,height:4,backgroundColor:'rgba(237,155,148,.08)'});
 patch('weekPlannerCurrentTimeLine',{height:1.25,backgroundColor:'#ED9B94'});
 for(const key of ['weekPlannerCurrentTimeBadge','weekPlannerLiveTimeButton'])patch(key,{backgroundColor:p.action,borderColor:p.action,shadowColor:p.action});
 patch('weekPlannerCurrentTimeBadge',{borderRadius:6,backgroundColor:'#91413F',borderColor:'#91413F'});
 patch('weekPlannerLiveTimeButton',{borderRadius:100,borderWidth:1,borderColor:'rgba(255,255,255,.20)',backgroundColor:'#262C2C',overflow:'hidden'});
 patch('weekPlannerCurrentTimeBadgeText',{color:'#FFF3EF',fontWeight:'600'});
 patch('weekPlannerLiveTimeButtonDot',{backgroundColor:p.actionText,borderColor:p.action});
 const draftFill=p.night?'#A9C8B4':'#426A53',draftInk=p.night?'#1D3426':'#FFFFFF';
 for(const key of ['weekReorganizationFloatingApply','weekReorganizationApplyButton'])patch(key,{backgroundColor:draftFill,borderWidth:1,borderColor:p.night?'#D2E5D8':'#355A44'});
 for(const key of ['weekReorganizationFloatingApplyText','weekReorganizationFloatingApplyTextNative','weekReorganizationApplyText'])patch(key,{color:draftInk,fontWeight:'600'});
 for(const key of ['weekReorganizationFloatingCancel','weekReorganizationCancelButton'])patch(key,{backgroundColor:p.night?'#4C3032':'#F3DEDD',borderWidth:1,borderColor:p.night?'#865759':'#D5A6A3'});
 patch('weekReorganizationCancelText',{color:p.night?'#F1BFBB':'#913F3D'});
 patch('operatorLaneBlockKeyboardWrap',{maxWidth:web?600:undefined});
 patch('operatorLaneBlockCard',{borderRadius:22,backgroundColor:p.night?'rgba(28,32,34,.98)':'rgba(252,249,245,.98)',borderColor:p.border});
 patch('operatorLaneBlockContent',{paddingHorizontal:18,paddingTop:16,paddingBottom:16});
 patch('operatorLaneBlockIcon',{width:38,height:38,borderRadius:12});
 patch('operatorLaneBlockEyebrow',{marginTop:9,letterSpacing:1.2});
 patch('operatorLaneBlockTitle',{fontSize:24,lineHeight:30});
 patch('operatorLaneBlockSubtitle',{fontSize:13,lineHeight:19,marginBottom:15});
 patch('operatorLaneBlockFieldRow',{gap:8,marginBottom:12});
 patch('operatorLaneBlockField',{minHeight:54,paddingHorizontal:8,borderRadius:12});
 patch('operatorLaneBlockFieldValue',{fontSize:14,lineHeight:19});
 patch('operatorLaneBlockChoiceRow',{flexWrap:'wrap',gap:8,marginBottom:12});
 patch('operatorLaneBlockChoice',{flex:undefined,flexGrow:1,flexShrink:1,flexBasis:'30%',minWidth:92,minHeight:46,paddingHorizontal:8,paddingVertical:9,borderRadius:12,gap:6});
 patch('operatorLaneBlockChoiceText',{flexShrink:1,fontSize:13,lineHeight:18});
 patch('operatorLaneBlockChoiceTextSelected',{flexShrink:1,fontSize:13,lineHeight:18});
 patch('operatorLaneBlockReasonChip',{flexShrink:0,minHeight:40,paddingHorizontal:12});
 patch('operatorLaneBlockReasonInput',{minHeight:48,fontSize:14,borderRadius:12,paddingHorizontal:10});
 if(web)patch('operatorLaneBlockHandle',{display:'none'});
 patch('operatorLaneBlockActions',{justifyContent:'center',flexWrap:'wrap',paddingHorizontal:18,paddingTop:12,paddingBottom:web?18:16});
 for(const key of ['operatorLaneBlockCancelButton','operatorLaneBlockSaveButton'])patch(key,{flex:undefined,flexGrow:0,flexShrink:0,flexBasis:'auto',minHeight:44,paddingHorizontal:20,paddingVertical:11,borderRadius:12});
 if(web)patch('calendarModalOverlay',{justifyContent:'center',alignItems:'center',paddingTop:20,paddingBottom:20});
 patch('calendarModalCard',{maxWidth:400,padding:18,borderWidth:1,borderColor:p.border});
 patch('calendarTitle',{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontSize:23,lineHeight:30,fontWeight:'400'});
 patch('calendarNavButton',{width:40,height:40,borderRadius:12,borderWidth:1,borderColor:p.border});
 patch('calendarWeekLabel',{fontSize:12,fontWeight:'400',color:p.muted});
 patch('calendarDayCell',{aspectRatio:1,borderRadius:12});
 patch('calendarDayText',{fontSize:15,fontWeight:'500'});
 patch('calendarDayCellClosed',{backgroundColor:p.night?'rgba(189,119,104,.10)':'rgba(189,119,104,.08)',borderColor:p.line});
 patch('calendarDayTextClosed',{color:p.muted});
 patch('calendarDayCellFull',{backgroundColor:p.night?'rgba(178,169,144,.16)':'rgba(178,169,144,.2)',borderColor:p.border});
 patch('calendarDayTextFull',{color:p.ink});
 patch('calendarFooterText',{fontSize:13,lineHeight:19,fontWeight:'400',color:p.muted});
 if(web)patch('weekAppointmentDetailsOverlay',{justifyContent:'center',alignItems:'center'});
 patch('weekAppointmentDetailsCard',{width:'100%',maxWidth:web?640:'100%',borderRadius:22,backgroundColor:p.night?'#202526':'#F8F5EF',borderColor:p.line,paddingHorizontal:18,paddingTop:18,paddingBottom:16});
 patch('weekAppointmentDetailsHeaderRowCentered',{justifyContent:'flex-start'});
 patch('weekAppointmentDetailsHeaderTextWrapCentered',{width:undefined,minWidth:0,flex:1,paddingHorizontal:0,paddingRight:48,alignItems:'flex-start'});
 patch('weekAppointmentDetailsTextCentered',{textAlign:'left'});
 patch('weekAppointmentDetailsBodyCentered',{alignItems:'stretch',flexDirection:'row',flexWrap:'wrap',gap:12});
 patch('weekAppointmentDetailsRowCentered',{width:undefined,flexBasis:'45%',flexGrow:1,alignItems:'flex-start',minWidth:100});
 patch('weekAppointmentDetailsLabel',{color:p.muted,fontWeight:'500'});
 patch('weekAppointmentDetailsValue',{fontSize:15,lineHeight:21,fontWeight:'500'});
 patch('weekAppointmentDetailsBody',{padding:14,borderRadius:16,borderWidth:1,borderColor:p.line,backgroundColor:p.night?'rgba(255,255,255,.025)':'rgba(255,255,255,.45)',marginBottom:12});
 patch('weekAppointmentDetailsScrollContent',{paddingHorizontal:2,paddingBottom:4});
 patch('weekAppointmentDetailsActionsRow',{gap:10,marginTop:0,marginBottom:12});
 patch('weekAppointmentDetailsActionButton',{minHeight:44,borderRadius:12,paddingVertical:11});
 patch('weekAppointmentDetailsActionButtonAccept',{backgroundColor:p.night?'#304144':'#E2EAEB',borderWidth:1,borderColor:p.border});
 patch('weekAppointmentDetailsActionButtonAcceptText',{color:p.night?'#BED0D2':'#50696E',fontSize:14,lineHeight:20,fontWeight:'600',textAlign:'center'});
 patch('weekAppointmentDetailsActionButtonDuration',{backgroundColor:p.night?'#443D2E':'#F0E6D0',borderWidth:1,borderColor:p.border});
 patch('weekAppointmentDetailsActionButtonDurationText',{color:p.night?'#DEC89B':'#816944',fontSize:14,lineHeight:20,fontWeight:'600',textAlign:'center'});
 patch('weekAppointmentDetailsActionButtonReject',{backgroundColor:p.night?'#422F34':'#F3E3E4',borderWidth:1,borderColor:p.night?'#78545C':'#D9B5BA'});
 patch('weekAppointmentDetailsActionButtonRejectText',{color:p.night?'#DCABB0':'#98525C',fontSize:14,lineHeight:20,fontWeight:'600',textAlign:'center'});

 patch('weekAppointmentDetailsScrollContent',{gap:14});
 patch('weekAppointmentLateReminderButton',{minHeight:48,paddingHorizontal:14,paddingVertical:12,borderRadius:13,marginTop:0,marginBottom:14,backgroundColor:p.night?'#443D30':'#F0E5CF',borderColor:p.night?'#6E624B':'#DDCBA7',gap:10});
 patch('weekAppointmentLateReminderButtonText',{fontSize:14,lineHeight:20,fontWeight:'600',textAlign:'left',color:p.ink});
 patch('weekAppointmentDetailsActionsRow',{gap:12,marginBottom:14,flexWrap:'wrap'});
 patch('weekAppointmentDetailsEditButton',{backgroundColor:p.night?'#304044':'#E3EBEC',borderColor:p.border});
 patch('weekAppointmentDetailsDeleteButton',{backgroundColor:p.night?'#422F34':'#F3E3E4',borderColor:p.night?'#78545C':'#D9B5BA'});
 patch('appointmentCompletionButton',{backgroundColor:p.night?'#304436':'#E2EBDD',borderColor:p.night?'#526C59':'#B6C9B5',minHeight:48,marginTop:0,marginBottom:14,padding:12,borderRadius:13});
 patch('appointmentCompletionButtonText',{color:p.ink,fontSize:14,lineHeight:20,fontWeight:'600'});
 patch('webWeekDragConfirmationMessageContent',{paddingVertical:16});
 patch('webWeekDragConfirmationActions',{gap:12,paddingTop:16,flexWrap:'wrap'});

 patch('weekAppointmentServiceEditButton',{minHeight:46,paddingVertical:10,paddingHorizontal:12,borderRadius:12,marginTop:0,marginBottom:12,backgroundColor:p.field,borderColor:p.line});
 patch('weekAppointmentServiceEditText',{fontSize:14,fontWeight:'500'});
 if(web){
  patch('weekAppointmentDetailsScrollContent',{gap:12,paddingHorizontal:0,paddingBottom:8});
  for(const key of ['weekAppointmentServiceEditButton','weekAppointmentNoShowButton','weekAppointmentLateReminderButton','appointmentCompletionButton','weekAppointmentDetailsActionsRow']) patch(key,{marginTop:0,marginBottom:0,minHeight:46,shadowOpacity:0,boxShadow:'none',backgroundImage:'none'});
  patch('weekAppointmentDetailsClose',{marginTop:12});
  patch('weekAppointmentDetailsHeaderTextWrapCentered',{paddingRight:0});
  patch('weekAppointmentDetailsBodyCentered',{gap:14});
 }
 patch('weekPhasedSummary',{padding:10,borderRadius:12,backgroundColor:p.night?'rgba(130,165,191,.10)':'#ECF0F2',borderColor:p.night?'rgba(130,165,191,.23)':'#D8E2E8'});
 patch('weekPhasedSummaryTitle',{fontSize:12,fontWeight:'600'});
 patch('weekAppointmentAdvancedSectionHeader',{marginTop:2,marginBottom:10});
 patch('weekAppointmentAdvancedSectionLabel',{color:p.night?'#D6B9CB':'#875F75',fontSize:10,letterSpacing:1.4,fontWeight:'600'});
 for(const key of ['weekReorganizationOpenButton','weekPhasedTimeEditButton','weekPhasedTimeEditButtonWeb'])patch(key,{padding:12,minHeight:62,borderRadius:14,backgroundColor:p.field,borderColor:p.line,marginTop:0,marginBottom:10});
 patch('weekReorganizationOpenIcon',{backgroundColor:p.night?'rgba(177,135,160,.15)':'#F0E8EE',borderRadius:11});
 for(const key of ['weekPhasedTimeEditIcon','weekPhasedTimeEditIconWeb'])patch(key,{backgroundColor:p.night?'rgba(130,165,191,.15)':'#E7EDF2',borderRadius:11});
 for(const key of ['weekReorganizationOpenTitle','weekPhasedTimeEditTitle'])patch(key,{fontSize:14,lineHeight:20,fontWeight:'600'});
 for(const key of ['weekReorganizationOpenText','weekPhasedTimeEditHint'])patch(key,{fontSize:12,lineHeight:17,fontWeight:'400',color:p.muted});
 patch('appointmentCompletionButton',{backgroundColor:p.action,borderColor:p.action});
 patch('appointmentCompletionButtonDone',{backgroundColor:p.night?'rgba(91,144,113,.15)':'#E9F6EF',borderColor:p.night?'rgba(147,192,166,.3)':'#BDDCCB'});
 patch('weekAppointmentDetailsPrimaryButton',{backgroundColor:p.field,borderColor:p.border,borderWidth:1,alignSelf:'center',minWidth:100,minHeight:44,paddingHorizontal:22,borderRadius:12});
 patch('weekAppointmentDetailsPrimaryButtonText',{color:p.ink,fontWeight:'500'});
 patch('weekPhasedTimeRow',{backgroundColor:p.field,borderColor:p.line,borderRadius:14});
 patch('weekPhasedTimeRowProcessing',{backgroundColor:p.night?'rgba(124,166,134,.12)':'#E8EFE8',borderColor:p.night?'rgba(124,166,134,.30)':'#BFD0C0'});
 patch('weekPhasedTimeRowIndex',{backgroundColor:p.night?'rgba(130,165,191,.16)':'#E6EDF2'});
 patch('weekPhasedTimeRowIndexText',{color:p.night?'#B5CDDE':'#496A83'});
 patch('weekPhasedTimeSave',{backgroundColor:p.action,borderColor:p.action,borderRadius:12,minHeight:44});
 patch('weekPhasedTimeSaveText',{color:p.actionText,fontWeight:'600'});
 patch('weekPhasedTimeCancel',{backgroundColor:p.field,borderColor:p.line,borderRadius:12,minHeight:44});
 patch('weekPhasedTimeCancelText',{color:p.ink});
 for(const key of Object.keys(out))if(/^weekPhaseOrganizer|^quickCompositionPause/.test(key)&&out[key].fontWeight)patch(key,{fontWeight:/Title$/.test(key)?'600':'500'});
 if(web)patch('weekPhaseOrganizerOverlay',{justifyContent:'center',alignItems:'center',paddingVertical:24,paddingBottom:24});
 patch('weekPhaseOrganizerCard',{backgroundColor:p.night?'#202526':'#F8F5EF',borderWidth:1,borderColor:p.line,borderRadius:22});
 patch('weekPhaseOrganizerTitle',{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontSize:24,lineHeight:29,fontWeight:'400'});
 patch('weekPhaseOrganizerTimingLabel',{fontSize:13,lineHeight:18});
 patch('weekPhaseOrganizerOperatorTitle',{fontSize:11,lineHeight:16,fontWeight:'600',letterSpacing:.8,color:p.muted});
 patch('weekPhaseOrganizerOperatorList',{gap:10,paddingRight:2,paddingBottom:2});
 patch('weekPhaseOrganizerOperatorChip',{minWidth:200,maxWidth:240,minHeight:74,padding:12,borderRadius:14,borderWidth:1,borderColor:p.line,backgroundColor:p.field,flexDirection:'row',alignItems:'center',gap:10});
 patch('weekPhaseOrganizerOperatorChipRecommended',{backgroundColor:p.field,borderColor:p.line});
 patch('weekPhaseOrganizerOperatorChipSelected',{backgroundColor:p.night?'rgba(124,166,134,.13)':'#E7EEE6',borderColor:p.night?'rgba(178,212,187,.44)':'#A9C0AC'});
 patch('quickCompositionPauseValueText',{fontSize:13,lineHeight:18,fontWeight:'500'});
 // Semantic opening states must survive the neutral palette adapter.
 patch('scheduleToggleChipOpen',{backgroundColor:p.night?'rgba(117,175,130,.18)':'#E5F2E7',borderWidth:1,borderColor:p.night?'rgba(150,201,160,.34)':'#BFD8C4'});
 patch('scheduleToggleChipClosed',{backgroundColor:p.night?'rgba(196,120,119,.18)':'#F8E6E5',borderWidth:1,borderColor:p.night?'rgba(220,157,153,.34)':'#E6BFBC'});
 patch('scheduleToggleTextOpen',{color:p.night?'#B9E2C1':'#2E6340'});
 patch('scheduleToggleTextClosed',{color:p.night?'#EEC0BC':'#95433F'});
 patch('scheduleRowDesktop',{alignItems:'center'});
 patch('scheduleRowStackedMobile',{maxWidth:'100%',paddingVertical:10,paddingHorizontal:12,gap:8,marginBottom:8,borderRadius:16});
 patch('scheduleDayLabel',{fontSize:13,lineHeight:18,fontWeight:'500'});
 patch('scheduleDayMeta',{fontSize:12,lineHeight:17,fontWeight:'400',color:p.muted});
 patch('scheduleDayInfo',{flex:undefined,flexBasis:'auto',flexGrow:0,flexShrink:0});
 patch('scheduleDayInfoWideMobile',{minHeight:38});
 patch('scheduleDayInfoDesktopCompact',{minHeight:38});
 patch('scheduleToggleChip',{minHeight:36,paddingVertical:8});
 patch('scheduleTimeChip',{minHeight:36,paddingVertical:8});
 patch('quickBookingStepActive',{backgroundColor:p.night?'rgba(216,194,155,.07)':'rgba(174,150,112,.07)',borderColor:p.night?'rgba(216,194,155,.42)':'rgba(119,97,67,.35)',borderWidth:1,shadowOpacity:0});
 patch('quickBookingStepComplete',{backgroundColor:p.field,borderColor:p.line});
 patch('quickBookingActiveStepLabel',{color:p.night?'#D8C29B':'#776143',fontWeight:'500'});
 patch('quickBookingActiveStepTitle',{color:p.ink,fontWeight:'600'});
 patch('weekPhaseOrganizerItem',{borderWidth:1,borderRadius:16});
 patch('weekPhaseOrganizerAddPauseButton',{backgroundColor:'transparent',borderWidth:0,minHeight:34,paddingHorizontal:2});
 patch('weekPhaseOrganizerAddPauseText',{fontSize:12,lineHeight:16,fontWeight:'500'});
 patch('weekPhaseOrganizerCapacitySummaryMessage',{fontSize:12,lineHeight:17});
 // The broad transparent hit target retains the existing resize geometry;
 // only a small inset grip is painted at the bottom of the appointment.
 for(const key of ['weekAppointmentResizeIndicator','weekAppointmentResizeIndicatorWeb','weekAppointmentResizeIndicatorNative'])patch(key,{backgroundColor:'transparent',borderWidth:0,borderTopWidth:0,shadowOpacity:0,...(web?{boxShadow:'none'}:{})});
 patch('weekAppointmentResizeIndicatorVisual',{left:'50%',right:undefined,top:undefined,bottom:5,marginLeft:-18,width:36,height:6,borderRadius:999,borderWidth:0});
 patch('weekAppointmentResizeGripBar',{width:26,height:2.5,backgroundColor:'rgba(69,82,72,.60)',...(web?{boxShadow:'0 1px 0 rgba(255,255,255,.45)'}:{})});
 return web ? out as T : finishNativeAgendaStyles(out as T,p);
}
