import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { popupGlass } from './premium-web-surfaces';
import React from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';

import { useAccessAppearance } from './access-premium';

export function RequestsListDialog({ visible, title, count, onClose, onScroll, children }: React.PropsWithChildren<{
  visible: boolean; title: string; count: number; onClose: () => void; onScroll: (offset: number) => void;
}>) {
  const { palette: p } = useAccessAppearance();
  const { height } = useWindowDimensions();
  return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: p.night ? 'rgba(0,0,0,.56)' : 'rgba(50,44,35,.28)' }, { backdropFilter: 'blur(12px)' } as any]}>
      <Pressable accessibilityLabel="Chiudi elenco richieste" onPress={onClose} style={{ position: 'absolute', inset: 0 } as any}/>
      <View style={{ width: '100%', maxWidth: 850, height: Math.max(120, height - 48), minHeight: 0, borderRadius: 24, borderWidth: 1, borderColor: p.border, backgroundColor: p.night ? '#202423' : '#F7F4EE', ...popupGlass(p), overflow: 'hidden' }}>
        <View style={{ padding: 20, gap: 14, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: p.line }}>
          <View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.muted, fontSize: 10, letterSpacing: 2 }}>RICHIESTE · {count} PRENOTAZIONI</Text><Text style={{ fontFamily: 'Georgia', fontSize: 25, color: p.ink }}>{title}</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel="Chiudi elenco prenotazioni" onPress={onClose} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: p.field }}><Text style={{ color: p.ink, fontSize: 13 }}>Chiudi</Text><Ionicons name="close" size={18} color={p.ink}/></Pressable>
        </View>
        <ScrollView accessibilityLabel={`Elenco ${title}`} style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 18, gap: 12 }} scrollEventThrottle={100} onScroll={event => onScroll(event.nativeEvent.contentOffset.y)}>{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}
