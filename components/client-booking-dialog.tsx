import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';

export type ClientBookingDialogNotice = { id: number; kind: 'info' | 'success' | 'confirm'; title: string; message: string };

/** Dialog decisions settle once; leaving the customer session cancels pending confirmations. */
export function useClientBookingDialogs(scope: string) {
  const [queue, setQueue] = useState<ClientBookingDialogNotice[]>([]);
  const sequence = useRef(0);
  const decisions = useRef(new Map<number, (accepted: boolean) => void>());
  useEffect(() => {
    setQueue([]);
    const pending = decisions.current;
    return () => { pending.forEach(resolve => resolve(false)); pending.clear(); };
  }, [scope]);
  const notice = useCallback((title: string, message: string, kind: 'info' | 'success' = 'info') => {
    const id = ++sequence.current;
    setQueue(current => [...current, { id, title, message, kind }]);
  }, []);
  const confirm = useCallback((title: string, message: string) => new Promise<boolean>(resolve => {
    const id = ++sequence.current;
    decisions.current.set(id, resolve);
    setQueue(current => [...current, { id, title, message, kind: 'confirm' }]);
  }), []);
  const settle = useCallback((id: number, accepted: boolean) => {
    const resolve = decisions.current.get(id);
    decisions.current.delete(id);
    setQueue(current => current.filter(item => item.id !== id));
    resolve?.(accepted);
  }, []);
  return { notice, confirm, current: queue[0] ?? null, settle };
}

export function ClientBookingDialog({ notice, onDecision }: { notice: ClientBookingDialogNotice | null; onDecision: (id: number, accepted: boolean) => void }) {
  const { palette: p } = useAccessAppearance();
  const insets = useSafeAreaInsets();
  const confirm = notice?.kind === 'confirm';
  const success = notice?.kind === 'success';
  return <Modal visible={Boolean(notice)} transparent animationType="fade" supportedOrientations={TABLET_MODAL_ORIENTATIONS} onRequestClose={() => { if (notice) onDecision(notice.id, false); }}>
    {notice ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: Math.max(20, insets.top), paddingBottom: Math.max(20, insets.bottom), paddingHorizontal: Math.max(20, insets.left, insets.right), backgroundColor: p.night ? 'rgba(0,0,0,.62)' : 'rgba(37,39,35,.38)' }}>
      <View accessibilityViewIsModal {...(Platform.OS === 'web' ? { role: 'dialog', 'aria-modal': true, 'aria-label': notice.title } : {})} style={{ width: '100%', maxWidth: 460, maxHeight: '100%', borderRadius: 26, padding: 22, backgroundColor: p.night ? '#22282A' : '#F8F5EF', borderWidth: 1, borderColor: p.border, gap: 16 }}>
        <View style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: success ? p.night ? '#2D4437' : '#E1EBDF' : p.night ? '#3C392F' : '#ECE4D4' }}><Ionicons name={success ? 'checkmark-circle-outline' : confirm ? 'people-outline' : 'information-circle-outline'} size={28} color={success ? p.night ? '#B3D5BC' : '#4D7156' : p.night ? '#D8C29B' : '#6E6045'} /></View>
        <Text accessibilityRole="header" style={{ color: p.ink, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 25, lineHeight: 32 }}>{notice.title}</Text>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ paddingBottom: 2 }}><Text style={{ color: p.muted, fontSize: 14, lineHeight: 22 }}>{notice.message}</Text></ScrollView>
        <View style={{ gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => onDecision(notice.id, true)} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: p.action, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .75 : 1 })}><Text style={{ color: p.actionText, fontSize: 14, lineHeight: 21, fontWeight: '600', textAlign: 'center' }}>{confirm ? 'Prenota per un’altra persona' : 'OK'}</Text></Pressable>
          {confirm ? <Pressable accessibilityRole="button" onPress={() => onDecision(notice.id, false)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.ink, fontSize: 14, lineHeight: 21 }}>Indietro</Text></Pressable> : null}
        </View>
      </View>
    </View> : null}
  </Modal>;
}
