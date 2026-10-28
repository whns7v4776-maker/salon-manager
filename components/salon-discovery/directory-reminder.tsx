import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import { DockedSheetSurface } from '../ui/docked-sheet-surface';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { DirectoryActivation } from './directory-activation';
import React, { useEffect, useState } from 'react';
import { DeviceEventEmitter, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../src/lib/supabase';

type Props = { workspaceId: string; active: boolean; popup?: boolean; canShow?: () => boolean };
export function DirectoryReminder({ workspaceId, active, popup = false, canShow }: Props) {
  const [editing, setEditing] = useState(false);
  const [needed, setNeeded] = useState(false);
  const [visible, setVisible] = useState(false);
  const key = `salonpro:directory-intro:v1:${workspaceId}`;
  useEffect(() => {
    let cancelled = false;
    setNeeded(false); setVisible(false); setEditing(false);
    if (!active || !workspaceId) return;
    const timer = setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase.from('salon_directory_profiles').select('enabled,address_confirmed,latitude,longitude').eq('workspace_id', workspaceId).maybeSingle();
        if (cancelled || error) return;
        const missing = data?.enabled !== false && !(data?.address_confirmed && data.latitude != null && data.longitude != null);
        setNeeded(missing);
        if (!popup || !missing || (canShow && !canShow())) return;
        const seen = await AsyncStorage.getItem(key);
        if (cancelled || seen || (canShow && !canShow())) return;
        setVisible(true);
      })().catch(() => undefined);
    }, popup ? 2000 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [workspaceId, active, popup, key, canShow]);
  useEffect(() => { const subscription = DeviceEventEmitter.addListener('salon-directory-confirmed', (id: string) => { if (id === workspaceId) { setNeeded(false); setVisible(false); setEditing(false); } }); return () => subscription.remove(); }, [workspaceId]);
  const dismiss = () => { setVisible(false); void AsyncStorage.setItem(key, 'true').catch(() => undefined); };
  const open = () => { void AsyncStorage.setItem(key, 'true').catch(() => undefined); setEditing(true); setVisible(true); };
  const complete = () => { dismiss(); setNeeded(false); setEditing(false); DeviceEventEmitter.emit('salon-directory-confirmed', workspaceId); };
  if (!needed || !active) return null;
  const content = <DockedSheetSurface style={s.card}>
    <Ionicons name="location-outline" size={26} color="#34516C" />
    <Text style={s.title}>Fatti trovare dai clienti vicino a te</Text>
    <Text style={s.body}>Conferma la sede sulla mappa per comparire nella ricerca dei saloni vicini. Puoi usare l’indirizzo già inserito: basta farlo una volta.</Text>
    <Pressable accessibilityRole="button" onPress={open} style={s.button}><Text style={s.buttonText}>Conferma la sede</Text></Pressable>
    {(popup || visible) ? <Pressable accessibilityRole="button" onPress={dismiss} style={s.later}><Text style={s.body}>Più tardi</Text></Pressable> : null}
  </DockedSheetSurface>;
  return <>
    {!popup ? content : null}
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent visible={visible} animationType="fade" onRequestClose={dismiss}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {editing ? <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: dismiss} : {})} style={[s.card, { maxHeight: '90%', padding: 0 }]}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22 }}><DirectoryActivation workspaceId={workspaceId} onComplete={complete} onLater={dismiss} /></ScrollView></DockedSheetSurface> : content}
      </KeyboardAvoidingView>
    </Modal>
  </>;
}
const s = StyleSheet.create({
  card: { padding: 22, gap: 12, borderRadius: 24, backgroundColor: '#fff', width: '100%', maxWidth: 600, alignSelf: 'center', marginTop: 12, marginBottom: 0 },
  title: { fontSize: 20, fontWeight: '700', color: '#14243A' },
  body: { fontSize: 15, lineHeight: 22, color: '#526882' },
  button: { padding: 15, minHeight: 48, borderRadius: 16, backgroundColor: '#20384F', alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  backdrop: { flex: 1, padding: 24, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' , paddingBottom: 0 },
});
