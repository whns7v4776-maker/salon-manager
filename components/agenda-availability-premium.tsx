import React from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { nativeSerif } from './owner-native-premium';

type SectionTone = 'sage' | 'blue' | 'sand' | 'rose';
const accents = {
  sage: { day: '#426B54', night: '#B2D4BB', rgb: '124,166,134' },
  blue: { day: '#496A83', night: '#B5CDDE', rgb: '130,165,191' },
  sand: { day: '#8A653C', night: '#E0C399', rgb: '194,158,112' },
  rose: { day: '#875F75', night: '#D6B9CB', rgb: '177,135,160' },
};

/** One hierarchy for the existing availability controls; saves stay with their owners. */
export function AgendaAvailabilitySection({ number, title, description, icon, tone, split = false, compact = false, children }: React.PropsWithChildren<{
  number: string;
  title: string;
  description?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  tone: SectionTone;
  split?: boolean;
  compact?: boolean;
}>) {
  const { palette: p } = useAccessAppearance();
  const accent = accents[tone];
  const ink = p.night ? accent.night : accent.day;
  return <View {...(Platform.OS === 'web'?{dataSet:{ agendaAvailabilitySection: tone }}:{})} style={{
    width: '100%', minWidth: 0, borderRadius: 20, borderWidth: 1,
    borderColor: `rgba(${accent.rgb},${p.night ? '.30' : '.34'})`,
    // On web, overflow:hidden becomes a scroll container. The dialog's
    // containment rule would then trap the wheel on every section.
    backgroundColor: p.night ? '#222728' : '#F9F7F2', overflow: Platform.OS === 'web' ? 'visible' : 'hidden',
  }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 10 : 12, padding: compact ? 12 : 18,
      backgroundColor: `rgba(${accent.rgb},${p.night ? '.13' : '.16'})`,
      borderTopLeftRadius: 19, borderTopRightRadius: 19,
      borderBottomWidth: 1, borderBottomColor: `rgba(${accent.rgb},.20)`,
    }}>
      <View style={{ width: compact ? 34 : 42, height: compact ? 34 : 42, borderRadius: compact ? 11 : 13, backgroundColor: `rgba(${accent.rgb},.19)`, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ionicons name={icon} size={compact ? 18 : 21} color={ink}/>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={{ fontSize: compact ? 9 : 10, letterSpacing: 1.7, fontWeight: '700', color: ink }}>SEZIONE {number}</Text>
        <Text accessibilityRole="header" style={{ fontFamily: nativeSerif, fontSize: compact ? 20 : 24, lineHeight: compact ? 24 : 29, color: p.ink }}>{title}</Text>
        {description ? <Text style={{ fontSize: 12, lineHeight: 18, color: p.muted }}>{description}</Text> : null}
      </View>
    </View>
    <View {...(Platform.OS === 'web'?{dataSet:{ agendaAvailabilityContent: split ? 'split' : 'stack' }}:{})} style={{ padding: compact ? 12 : 16, gap: compact ? 10 : 14, minWidth: 0 }}>{children}</View>
  </View>;
}

export function AgendaAvailabilityLayout({ children }: React.PropsWithChildren) {
  const { palette: p } = useAccessAppearance();
  return <View {...(Platform.OS === 'web'?{dataSet:{ agendaAvailability: 'true' }}:{})} style={{ gap: 18, width: '100%', minWidth: 0 }}>
    {Platform.OS === 'web' ? React.createElement('style', null, `
      [data-agenda-availability="true"] [data-agenda-availability-content] > * {min-width:0;max-width:100%;}
      [data-agenda-availability="true"] [data-agenda-availability-panel] {width:100%!important;max-width:100%!important;align-self:stretch!important;background:transparent!important;border:0!important;padding:0!important;margin:0!important;box-shadow:none!important;}
      [data-agenda-availability="true"] [data-agenda-availability-panel] > div:first-child {text-align:left;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="online"] + [data-agenda-availability-panel="online"] {border-top:1px solid ${p.line}!important;padding-top:18px!important;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="grid"] > div:first-child,
      [data-agenda-availability="true"] [data-agenda-availability-panel="pause"] > div:first-child {background:transparent!important;border:0!important;padding:0!important;margin:0!important;}
      [data-agenda-availability="true"] [data-agenda-availability-copy] {align-items:flex-start!important;text-align:left!important;}
      [data-agenda-availability="true"] [data-agenda-availability-copy] > * {text-align:left!important;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="online"] [data-agenda-availability-options] {display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px!important;}
      [data-agenda-availability="true"] [data-agenda-availability-options] > * {min-width:0!important;width:auto!important;max-width:100%!important;flex-basis:auto!important;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="exceptions"] > div:first-child {display:none;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="exceptions"] input {margin-bottom:14px!important;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="exceptions"] > [role="button"]:last-child {background:${p.action}!important;border-color:${p.action}!important;}
      [data-agenda-availability="true"] [data-agenda-availability-panel="exceptions"] > [role="button"]:last-child > * {color:${p.actionText}!important;}
      @media(min-width:850px){
        [data-agenda-availability-content="split"] {display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px!important;align-items:start;}
        [data-agenda-availability-content="split"] [data-agenda-availability-panel="online"] + [data-agenda-availability-panel="online"] {border-top:0!important;border-left:1px solid ${p.line}!important;padding-top:0!important;padding-left:22px!important;}
      }
      @media(min-width:760px){
        [data-agenda-availability-panel="grid"] > div:first-child {display:grid!important;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:22px!important;align-items:center!important;}
        [data-agenda-availability-panel="grid"] > div:first-child > div {width:auto!important;min-width:0!important;max-width:100%!important;}
        [data-agenda-availability-panel="grid"] > div:first-child > div:last-child {display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px!important;}
        [data-agenda-availability-panel="grid"] > div:first-child > div:last-child > * {width:100%!important;min-width:0!important;max-width:100%!important;}
        [data-agenda-availability-panel="pause"] > div:first-child {flex-direction:row!important;align-items:center!important;justify-content:space-between!important;gap:18px!important;}
        [data-agenda-availability-panel="pause"] > div:first-child > div {width:auto!important;min-width:0!important;max-width:100%!important;}
      }
      @media(max-width:599px){
        [data-agenda-availability-section] > div:first-child {padding:14px!important;}
        [data-agenda-availability-content] {padding:12px!important;}
        [data-agenda-availability-units] {display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important;}
        [data-agenda-availability-units] > * {width:auto!important;min-width:0!important;max-width:100%!important;flex-basis:auto!important;}
        [data-agenda-availability="true"] [data-agenda-availability-panel="online"] [data-agenda-availability-options] {grid-template-columns:repeat(3,minmax(0,1fr));}
        [data-agenda-availability-options] > * {padding-left:6px!important;padding-right:6px!important;}
      }
      @media(max-width:380px){[data-agenda-availability="true"] [data-agenda-availability-panel="online"] [data-agenda-availability-options] {grid-template-columns:repeat(2,minmax(0,1fr));}}
    `) : null}
    {children}
  </View>;
}
