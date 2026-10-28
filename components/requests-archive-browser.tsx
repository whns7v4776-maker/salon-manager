import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { popupGlass } from './premium-web-surfaces';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { useAccessAppearance } from './access-premium';
import { NotificationArchiveSearch } from './notification-archive-search';

type Month<T> = { key: string; label: string; items: T[] };
type Year<T> = { year: string; count: number; months: Month<T>[] };

/** Web archive: compact period index and one bounded, centred reading dialog. */
export function RequestsArchiveBrowser<T>({ years, getSearchText, renderItems, onSelectMonth, onScroll }: {
  years: Year<T>[];
  getSearchText: (item: T) => string;
  renderItems: (key: string, items: T[]) => React.ReactNode;
  onSelectMonth: (key: string | null) => void;
  onScroll: (offset: number) => void;
}) {
  const { palette: p } = useAccessAppearance();
  const { height, width } = useWindowDimensions();
  const [period, setPeriod] = useState<{ year: string; month: string | null } | null>(null);
  const year = years.find(group => group.year === period?.year);
  const month = year?.months.find(group => group.key === period?.month);
  const open = (yearValue: string, selected: string | null) => {
    onSelectMonth(selected);
    setPeriod({ year: yearValue, month: selected });
  };
  const close = () => { onSelectMonth(null); setPeriod(null); };
  const button = { borderRadius: 12, backgroundColor: p.field, padding: 14, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 };
  const label = { color: p.ink, fontSize: 14 };
  return <>
    <View style={{ gap: 20 }}>
      {years.map(group => <View key={group.year} style={{ gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Apri anno ${group.year}`} onPress={() => open(group.year, null)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
          <Text style={{ color: p.ink, fontSize: 23, fontFamily: 'Georgia', flex: 1 }}>{group.year}</Text>
          <Text style={{ color: p.muted, fontSize: 12 }}>{group.count} prenotazioni</Text>
          <Ionicons name="arrow-forward" size={18} color={p.muted}/>
        </Pressable>
        {group.months.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`Apri archivio ${item.label}`} onPress={() => open(group.year, item.key)} style={button}>
          <Ionicons name="calendar-outline" size={18} color={p.muted}/>
          <Text style={[label, { flex: 1, textTransform: 'capitalize' }]}>{item.label}</Text>
          <Text style={{ color: p.muted, fontSize: 12 }}>{item.items.length}</Text>
          <Ionicons name="chevron-forward" size={17} color={p.muted}/>
        </Pressable>)}
      </View>)}
    </View>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={Boolean(period)} transparent animationType="fade" onRequestClose={close}>
      <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: p.night ? 'rgba(0,0,0,.56)' : 'rgba(50,44,35,.28)' }, { backdropFilter: 'blur(12px)' } as any]}>
        <Pressable accessibilityLabel="Chiudi archivio" onPress={close} style={{ position: 'absolute', inset: 0 } as any}/>
        <View accessibilityRole="none" style={{ width: '100%', maxWidth: 850, height: Math.max(120, height - 48), borderRadius: 24, borderWidth: 1, borderColor: p.border, backgroundColor: p.night ? '#202423' : '#F7F4EE', ...popupGlass(p), overflow: 'hidden' }}>
          <View style={{ padding: 22, borderBottomWidth: 1, borderBottomColor: p.line, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.muted, fontSize: 10, letterSpacing: 2 }}>ARCHIVIO STORICO · {year?.year}</Text><Text style={{ color: p.ink, fontFamily: 'Georgia', fontSize: 25, textTransform: 'capitalize' }}>{month?.label ?? 'Scegli un mese'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Chiudi archivio storico" onPress={close} style={[button, { padding: 10 }]}><Text style={label}>Chiudi</Text><Ionicons name="close" size={18} color={p.ink}/></Pressable>
          </View>
          <View style={{ flexDirection: width < 620 ? 'column' : 'row', flex: 1, minHeight: 0 }}>
            <ScrollView horizontal={width < 620} style={{ flexGrow: 0, width: width < 620 ? '100%' : 180, maxHeight: width < 620 ? 70 : undefined, borderRightWidth: width < 620 ? 0 : 1, borderColor: p.line }} contentContainerStyle={{ padding: 12, gap: 6 }}>
              {year?.months.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: month?.key === item.key }} accessibilityLabel={`Mostra ${item.label}`} onPress={() => open(year.year, item.key)} style={[button, { backgroundColor: month?.key === item.key ? p.action : 'transparent', padding: 12 }]}><Text style={{ color: month?.key === item.key ? p.actionText : p.ink, fontSize: 13, textTransform: 'capitalize' }}>{item.label.replace(/\s\d{4}$/, '')}</Text><Text style={{ color: month?.key === item.key ? p.actionText : p.muted, fontSize: 11 }}>{item.items.length}</Text></Pressable>)}
            </ScrollView>
            <View style={{ flex: 1, minHeight: 0, minWidth: 0, padding: 16 }}>
              {month ? <NotificationArchiveSearch key={month.key} premium bounded items={month.items} scope={month.label} getSearchText={getSearchText}>
                {items => <ScrollView accessibilityLabel={`Elenco archivio ${month.label}`} style={{ flexShrink: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 12 }} scrollEventThrottle={100} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)}>{renderItems(month.key, items)}</ScrollView>}
              </NotificationArchiveSearch> : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}><Ionicons name="calendar-outline" size={34} color={p.muted}/><Text style={{ color: p.muted }}>Seleziona il mese da consultare.</Text></View>}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
