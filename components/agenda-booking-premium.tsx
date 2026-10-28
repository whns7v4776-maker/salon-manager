import React from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { nativeSerif } from './owner-native-premium';

const tones = {
  mode: { rgb: '130,165,191', day: '#496A83', night: '#B5CDDE' },
  customer: { rgb: '124,166,134', day: '#426B54', night: '#B2D4BB' },
  service: { rgb: '194,158,112', day: '#8A653C', night: '#E0C399' },
  operator: { rgb: '177,135,160', day: '#875F75', night: '#D6B9CB' },
};

/** Native equivalents of the approved web section bands. */
export function nativeAgendaBookingSection(p: ReturnType<typeof useAccessAppearance>['palette'], kind: keyof typeof tones) {
  if (Platform.OS === 'web') return undefined;
  return { borderColor: `rgba(${tones[kind].rgb},${p.night ? '.17' : '.18'})`, backgroundColor: p.night ? '#222728' : '#FCFAF6' };
}
export function nativeAgendaBookingHeader(p: ReturnType<typeof useAccessAppearance>['palette'], kind: keyof typeof tones) {
  if (Platform.OS === 'web') return undefined;
  return { marginHorizontal: -12, marginTop: -12, marginBottom: 12, padding: 12, borderTopLeftRadius: 17, borderTopRightRadius: 17, borderBottomWidth: 1, borderBottomColor: `rgba(${tones[kind].rgb},${p.night ? '.17' : '.18'})`, backgroundColor: `rgba(${tones[kind].rgb},${p.night ? '.07' : '.08'})` };
}

export function AgendaBookingStepTitle({step,title,kind,icon,complete,active,locked=false}:{locked?:boolean;step:number;title:string;kind:keyof typeof tones;icon:React.ComponentProps<typeof Ionicons>['name'];complete:boolean;active:boolean}) {
  const {palette:p}=useAccessAppearance();
  const tone=tones[kind], ink=p.night?tone.night:tone.day;
  return <View style={{flexDirection:'row',alignItems:'center',gap:10,flex:1,minWidth:130}}>
    <View style={{width:34,height:34,borderRadius:11,backgroundColor:`rgba(${tone.rgb},.11)`,alignItems:'center',justifyContent:'center',flexShrink:0}}><Ionicons name={locked?'lock-closed-outline':complete?'checkmark-outline':icon} size={18} color={ink}/></View>
    <View style={{flex:1,minWidth:0,gap:3}}><Text style={{fontSize:9,lineHeight:13,letterSpacing:1.1,fontWeight:'600',color:ink}}>STEP {String(step).padStart(2,'0')}{locked?' · IN ATTESA':active?' · ATTUALE':complete?' · COMPLETATO':''}</Text><Text style={{fontFamily:nativeSerif,fontSize:20,lineHeight:25,color:p.ink}}>{title}</Text></View>
  </View>;
}

/** Scoped presentation: all step gates, actions and form state remain in Agenda. */
export function AgendaBookingPremiumCss() {
  const {palette:p}=useAccessAppearance();
  if(Platform.OS!=='web')return null;
  return React.createElement('style',null,`
    html body [data-testid="agenda-quick-slot"] {background:${p.night?'#202526':'#F8F5EF'}!important;border-color:${p.line}!important;}
    /* Only the outer dialog contains the wheel. Cards and horizontal rails
       must pass vertical scrolling through to the form's native scroller. */
    html body [data-testid="agenda-quick-slot"] * {overscroll-behavior-y:auto!important;}
    html body [data-testid="agenda-quick-slot"] {overscroll-behavior-y:contain!important;}
    ${Object.entries(tones).map(([kind,t])=>`[data-agenda-booking-step="${kind}"] {--booking-wash:rgba(${t.rgb},${p.night?'.07':'.08'});--booking-edge:rgba(${t.rgb},${p.night?'.17':'.18'});}`).join('\n')}
    [data-agenda-booking-locked="true"] {opacity:.62!important;}
    [data-agenda-booking-step] {padding:14px!important;border:1px solid var(--booking-edge)!important;border-radius:18px!important;background:${p.night?'#222728':'#FCFAF6'}!important;margin-bottom:16px!important;box-shadow:none!important;}
    [data-agenda-booking-step] > [data-agenda-booking-header] {margin:-14px -14px 12px!important;padding:12px!important;background:var(--booking-wash)!important;border-bottom:1px solid var(--booking-edge);border-radius:17px 17px 0 0;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap;}
    [data-agenda-booking-tools] {display:grid!important;grid-template-columns:minmax(0,1fr) minmax(110px,.9fr);align-items:center;gap:10px!important;}
    [data-agenda-booking-tools] > * {grid-column:1 / -1;min-width:0;}
    [data-agenda-booking-tools] > :first-child:has(input) {grid-column:2;grid-row:1;}
    [data-agenda-booking-tools] > [data-agenda-booking-filters] {grid-column:1;grid-row:1;max-width:100%;}
    [data-agenda-booking-tools] > :first-child:has(input) {width:100%!important;max-width:100%!important;margin:0!important;}
    [data-agenda-booking-tools] input {width:100%!important;max-width:100%!important;margin:0!important;min-height:42px!important;}
    [data-agenda-booking-filters] {padding:0!important;margin:0!important;min-height:38px!important;gap:8px!important;background:transparent!important;border:0!important;}
    [data-agenda-booking-filters] > div:first-child {display:none!important;}
    [data-agenda-booking-filters] > div:last-child {flex-wrap:nowrap!important;gap:7px!important;padding:0!important;margin:0!important;min-height:40px!important;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;}
    [data-agenda-booking-filters] > div:last-child::-webkit-scrollbar {display:none;}
    [data-agenda-booking-filter] {height:40px!important;min-height:40px!important;padding:9px 13px!important;border-radius:12px!important;gap:5px!important;flex-shrink:0!important;}
    [data-agenda-booking-filter-icon] {display:none!important;}
    [data-agenda-booking-filter-count] {background:transparent!important;padding:0!important;width:auto!important;min-width:0!important;height:auto!important;opacity:.72;}
    [data-agenda-booking-filter="idle"] {background:${p.field}!important;border-color:${p.line}!important;}
    [data-agenda-booking-filter="selected"] {background:${p.action}!important;border-color:${p.action}!important;}
    [data-testid="agenda-quick-slot"] [aria-label="Scorri Prenota slot"] {background:transparent!important;}
    [data-testid="agenda-quick-slot"] [aria-label="Scorri Prenota slot"]::before {content:"";position:absolute;left:6px;top:0;bottom:0;width:2px;border-radius:2px;background:${p.night?'rgba(237,230,215,.10)':'rgba(84,80,69,.12)'};pointer-events:none;}
    [data-testid="agenda-quick-slot"] [aria-label="Scorri Prenota slot"] > div {left:5px!important;width:4px!important;border-radius:4px!important;background:${p.night?'rgba(216,194,155,.60)':'rgba(78,91,81,.52)'}!important;}
    [data-testid="agenda-quick-slot"] [data-agenda-booking-status] {margin-top:4px!important;margin-bottom:0!important;border-radius:13px!important;border:1px solid ${p.line}!important;background:${p.night?'rgba(216,194,155,.055)':'rgba(255,253,249,.72)'}!important;box-shadow:none!important;}
    [data-testid="agenda-quick-slot"] [data-agenda-booking-actions] {border-top-width:0!important;margin-top:0!important;padding-top:10px!important;}
    [data-testid="agenda-quick-slot"] [data-horizontal-rail] {padding-top:2px!important;padding-bottom:0!important;}
    [data-testid="agenda-quick-slot"] [data-horizontal-rail] [role="scrollbar"] {background:transparent!important;border-radius:8px!important;height:16px!important;}
    [data-testid="agenda-quick-slot"] [data-horizontal-rail] [role="scrollbar"]::before {content:"";position:absolute;left:4px;right:4px;top:7px;height:1px;background:${p.line};border-radius:1px;pointer-events:none;}
    [data-testid="agenda-quick-slot"] [data-horizontal-rail] [role="scrollbar"] > div {top:6px!important;height:3px!important;border-radius:3px!important;background:${p.night?'rgba(216,194,155,.58)':'rgba(70,83,72,.45)'}!important;}
    [data-testid="agenda-quick-slot"] input {text-align:left!important;}
    @media(max-width:599px){[data-agenda-booking-step] {padding:12px!important;}[data-agenda-booking-step] > [data-agenda-booking-header] {margin:-12px -12px 12px!important;padding:12px!important;}}
  `);
}
