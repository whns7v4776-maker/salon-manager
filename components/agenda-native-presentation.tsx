import React from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent, type ViewProps } from 'react-native';
import Svg, { Defs, LinearGradient, Polygon, Rect, Stop } from 'react-native-svg';
import { useAccessAppearance } from './access-premium';

type Palette = ReturnType<typeof useAccessAppearance>['palette'];

/** Native-only finishing layer. No scheduling geometry or gesture handlers live here. */
export function finishNativeAgendaStyles<T extends Record<string, any>>(styles: T, p: Palette): T {
  if (Platform.OS === 'web') return styles;
  const out = { ...styles };
  const patch = (key: string, value: Record<string, any>) => {
    if (out[key]) (out as Record<string, any>)[key] = { ...StyleSheet.flatten(out[key]), ...value };
  };
  patch('weekPlannerTableShell', { overflow: 'hidden', borderRadius: 20, borderTopWidth: 1, backgroundColor: p.night ? '#1C2021' : '#F3EEE5' });
  for (const key of ['weekPlannerCellPast', 'weekPlannerCellOutside', 'weekPlannerCellOutsideEmpty', 'weekPlannerCellClosedDay', 'weekPlannerCellDisabledLane', 'weekPlannerCellUnavailableWeb', 'weekPlannerCellBlocked']) patch(key, { backgroundColor: 'transparent', borderRadius: 0 });
  patch('weekPlannerCell', { borderBottomWidth: 1, borderBottomColor: p.night ? 'rgba(237,230,215,.10)' : 'rgba(55,51,43,.10)' });
  patch('sectionBlock', { marginBottom: 0, paddingBottom: 0 });
  patch('weekPlannerSectionHeader', { padding: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0 });
  patch('weekPlannerInlineNavRow', { marginVertical: 0 });
  // One quiet separator below the header; each operator gets a fine vertical edge.
  for (const key of ['weekPlannerLaneHeaderCard', 'weekPlannerLaneHeaderCardPremium', 'weekPlannerLaneHeaderPlaceholderCard', 'weekPlannerLaneHeaderPlaceholderCardPremium']) {
    patch(key, { paddingHorizontal: 0, paddingVertical: 0, paddingTop: 0, paddingBottom: 0, borderBottomWidth: 0, borderRightWidth: 0, borderRightColor: 'transparent' });
  }
  patch('weekPlannerLaneHeaderRow', { marginTop: 0, marginBottom: 0, borderBottomWidth: 0, borderBottomColor: p.night ? 'rgba(216,194,155,.28)' : 'rgba(52,55,53,.20)' });
  for (const key of ['weekPlannerTimeBoundaryRowFirst', 'weekPlannerTimeBoundaryRowMiddle', 'weekPlannerTimeBoundaryRowFooter']) {
    patch(key, { top: 1 - (styles.weekPlannerTimeBoundaryRow?.height ?? 20) / 2 });
  }
  patch('weekPlannerTimeColumnNativeMask', { width: 48, marginLeft: 0, paddingLeft: 0, backgroundColor: 'transparent' });
  patch('weekPlannerGridScroller', { overflow: 'hidden', borderTopRightRadius: 19, borderBottomRightRadius: 19 });
  for (const key of ['weekPlannerDayHeader', 'weekPlannerDayHeaderActive', 'weekPlannerDayHeaderClosed', 'weekPlannerDayHeaderHoliday']) patch(key, { borderBottomWidth: 0 });
  patch('weekPlannerTimeBoundaryChip', { paddingLeft: 8, paddingRight: 7, backgroundColor: 'transparent' });
  patch('weekPlannerTimeBoundaryText', { fontSize: 10, lineHeight: 14, letterSpacing: 0, fontVariant: ['tabular-nums'] });
  for (const key of ['weekPlannerTimeLabelHour', 'weekPlannerTimeLabelMinor', 'weekPlannerTimeLabelMarker']) patch(key, { fontSize: 10, lineHeight: 14, letterSpacing: 0 });
  patch('weekPlannerConfiguredMarkerLead', { width: 0, height: 0 });
  patch('weekPlannerConfiguredMarkerLine', { height: 1, top: 0, left: 0, right: 0, borderRadius: 1, elevation: 0, backgroundColor: p.night ? 'rgba(216,194,155,.27)' : 'rgba(52,55,53,.21)' });
  patch('weekPlannerCellHourGuide', { height: StyleSheet.hairlineWidth, top: 0, backgroundColor: p.night ? 'rgba(216,194,155,.17)' : 'rgba(52,55,53,.14)' });
  patch('weekAppointmentResizeIndicatorVisual', { height: 4, bottom: 3 });
  patch('weekAppointmentResizeGripBar', { height: 2, backgroundColor: p.night ? 'rgba(244,237,220,.60)' : 'rgba(69,82,72,.60)' });
  for (const key of ['quickBookingModeCard', 'quickSectionBlock', 'quickBookingModeCardNativeWide', 'quickSectionBlockNativeWide']) {
    patch(key, { padding: 10, borderRadius: 18, marginBottom: 8, backgroundColor: p.night ? '#252A2B' : '#F0EDE6', borderWidth: 1, borderColor: p.line });
  }
  patch('quickBookingModeChoiceRow', { flexDirection: 'row', flexWrap: 'nowrap', gap: 7 });
  patch('quickBookingModeChoice', { flex: 1, minWidth: 0, minHeight: 44, paddingHorizontal: 7, paddingVertical: 10, gap: 5, borderRadius: 12 });
  patch('quickBookingModeChoiceText', { fontSize: 12, lineHeight: 17, flexShrink: 1 });
  patch('quickBookingModeChoiceTextActive', { color: p.actionText });
  patch('quickServiceRoleFilterPanel', { flexDirection: 'row', backgroundColor: 'transparent', borderWidth: 0, padding: 0, paddingHorizontal: 0, paddingVertical: 0, marginBottom: 0, minHeight: 40 });
  patch('quickServiceRoleFilterRowNative', { flexDirection: 'row', flexWrap: 'nowrap', gap: 7, paddingHorizontal: 0, paddingVertical: 0, alignItems: 'center' });
  patch('quickServiceRoleFilterChip', { flexShrink: 0, minHeight: 40, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 9, gap: 5 });
  patch('quickServiceRoleFilterDot', { display: 'none' });
  patch('quickServiceRoleFilterCount', { backgroundColor: 'transparent', padding: 0, minWidth: 0 });
  patch('quickServiceRoleFilterCountText', { fontSize: 11, lineHeight: 16 });
  patch('quickSectionHeaderRow', { gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 });
  patch('quickSectionHeaderActions', { flexDirection: 'row', flexWrap: 'nowrap', gap: 6 });
  patch('quickBookingScroll', { backgroundColor: 'transparent' });
  patch('quickBookingContent', { backgroundColor: 'transparent', paddingTop: 2, paddingBottom: 4 });
  patch('quickBookingContentBounded', { paddingBottom: 4 });
  patch('footer', { borderWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderColor: 'transparent', paddingTop: 4, marginTop: 0 });
  patch('quickBookingFooterActions', { borderTopWidth: 0, marginTop: 0, paddingTop: 8 });
  patch('quickBookingStatusBar', { borderRadius: 13, marginBottom: 0 });
  return out;
}

function useDecorationSize() {
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const onLayout = React.useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize(previous => Math.abs(previous.width - width) < .25 && Math.abs(previous.height - height) < .25
      ? previous : { width, height });
  }, []);
  return { size, onLayout };
}

/** Availability veil only; state text is rendered by the slot above it. */
export const NativeAgendaUnavailable = React.memo(function NativeAgendaUnavailable({night}:{night:boolean;phase?:number}) {
 return <View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFillObject,{backgroundColor:night?'rgba(8,12,13,.23)':'rgba(107,103,92,.08)'}]}/>;
});

/** Native equivalent of the web's transparent-ended one-point marker. */
export function NativeAgendaMarker({night=false,markerWidth=160,style,onLayout,...props}:ViewProps&{night?:boolean;markerWidth?:number}) {
  const { size, onLayout: measure } = useDecorationSize();
  const ink=night?'#D8C29B':'#343735';
  const opacity=night?.32:.24;
  const width=size.width || (Number.isFinite(markerWidth)?Math.max(1,markerWidth):160);
  const tail=Math.min(width/2,Math.max(38,Math.min(width*.13,140)));
  const fade=tail/width;
  const gradientId=`agenda-marker-${React.useId().replace(/[^a-zA-Z0-9_-]/g,'')}`;
  // Measure the stretched host, rather than pinning it to a stale lane estimate.
  // A resized SVG gets a fresh native viewport when operator filters change.
  return <View {...props} onLayout={event => { measure(event); onLayout?.(event); }} pointerEvents="none" accessible={false} style={[style,{width:undefined,left:0,right:0,top:-.25,height:1.5,backgroundColor:'transparent'}]}>
    <Svg key={width} width={width} height={1.5} viewBox={`0 0 ${width} 1.5`}><Defs><LinearGradient id={gradientId} x1={0} y1={0} x2={width} y2={0} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={ink} stopOpacity={0}/><Stop offset={fade} stopColor={ink} stopOpacity={opacity}/><Stop offset={1-fade} stopColor={ink} stopOpacity={opacity}/><Stop offset={1} stopColor={ink} stopOpacity={0}/></LinearGradient></Defs><Polygon points={`0,.75 ${tail},0 ${width-tail},0 ${width},.75 ${width-tail},1.5 ${tail},1.5`} fill={`url(#${gradientId})`}/></Svg>
  </View>;
}

/** Same 4-point, soft-edged separator used below the web operator header. */
export function NativeAgendaHeaderRule({night}:{night:boolean}) {
  const ink=night?'#D8C29B':'#343735', opacity=night?.36:.26;
  return <View pointerEvents="none" style={{position:'absolute',left:0,right:0,bottom:-2,height:4,zIndex:8}}>
    <Svg width="100%" height="100%"><Defs><LinearGradient id="headerRule" x1="0%" y1="0%" x2="0%" y2="100%"><Stop offset={0} stopColor={ink} stopOpacity={0}/><Stop offset={.45} stopColor={ink} stopOpacity={opacity}/><Stop offset={.55} stopColor={ink} stopOpacity={opacity}/><Stop offset={1} stopColor={ink} stopOpacity={0}/></LinearGradient></Defs><Rect width="100%" height="100%" fill="url(#headerRule)"/></Svg>
  </View>;
}
