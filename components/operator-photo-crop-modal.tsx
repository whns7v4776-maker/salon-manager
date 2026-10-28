import {Platform as NativeSheetPlatform} from 'react-native';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {useSettingsWebStyles} from './settings-web-styles';
import { NativeReadableText as Text } from './owner-native-premium';
import { DockedSheetSurface } from './ui/docked-sheet-surface';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, PanResponder, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { HapticNativePressable as Pressable } from './ui/haptic-native-controls';

type Photo = { uri: string; width: number; height: number };

export function OperatorPhotoCropModal({ photo, onFinish }: {
  photo: Photo;
  onFinish: (uri: string | null) => void;
}) {
  const styles=useSettingsWebStyles(baseCropStyles);
  const { width, height } = useWindowDimensions();
  const size = Math.max(120, Math.min(300, width - 48, height - 260));
  const [frame, setFrame] = useState({ zoom: 1, x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const current = useRef(frame);
  current.current = frame;
  const base = Math.max(size / photo.width, size / photo.height);
  const clampFrame = (zoom: number, x: number, y: number) => {
    const z = Math.max(1, Math.min(4, zoom));
    const maxX = Math.max(0, (photo.width * base * z - size) / 2);
    const maxY = Math.max(0, (photo.height * base * z - size) / 2);
    return { zoom: z, x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const start = useRef(frame);
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !busyRef.current,
    onMoveShouldSetPanResponder: () => !busyRef.current,
    onPanResponderGrant: () => { start.current = current.current; },
    onPanResponderMove: (_, gesture) => {
      setFrame(clampFrame(start.current.zoom, start.current.x + gesture.dx, start.current.y + gesture.dy));
    },
  }), [base, size, photo.width, photo.height]);
  const zoom = (delta: number) => setFrame(value => clampFrame(value.zoom + delta, value.x, value.y));
  const confirm = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // Load only when needed: existing photo selection remains usable on old
      // development binaries which do not yet contain the native crop module.
      const { manipulateAsync, SaveFormat } = await import('expo-image-manipulator');
      const scale = base * frame.zoom;
      const side = Math.min(photo.width, photo.height, Math.round(size / scale));
      const originX = Math.max(0, Math.min(photo.width - side, Math.round((photo.width - size / scale) / 2 - frame.x / scale)));
      const originY = Math.max(0, Math.min(photo.height - side, Math.round((photo.height - size / scale) / 2 - frame.y / scale)));
      const result = await manipulateAsync(photo.uri, [
        { crop: { originX, originY, width: side, height: side } },
        { resize: { width: 600, height: 600 } },
      ], { base64: true, compress: 0.85, format: SaveFormat.JPEG });
      if (!result.base64) throw new Error('Foto ritagliata non disponibile');
      onFinish(`data:image/jpeg;base64,${result.base64}`);
    } catch {
      Alert.alert('Ritaglio non disponibile', 'Non è stato possibile preparare la foto. La foto precedente è rimasta invariata. Riprova; se usi una build DEV precedente, potrebbe essere necessario aggiornarla.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const scale = base * frame.zoom;
  return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible transparent animationType="fade" onRequestClose={() => { if (!busy) onFinish(null); }}>
    <View style={styles.backdrop}>
      <DockedSheetSurface {...(NativeSheetPlatform.OS !== 'web' ? {onClose: () => { if (!busy) onFinish(null); }, dismissDisabled:busy} : {})} style={styles.panel}>
        <Text style={styles.title}>Centra la foto operatore</Text>
        <Text style={styles.hint}>Trascina il volto e regola lo zoom.</Text>
        <View {...responder.panHandlers} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: '#e2e8f0', touchAction: 'none' } as ViewStyle}>
          <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
            <Image source={{ uri: photo.uri }} style={{ position: 'absolute', width: photo.width * scale, height: photo.height * scale, left: (size - photo.width * scale) / 2 + frame.x, top: (size - photo.height * scale) / 2 + frame.y }} />
          </View>
        </View>
        <View style={styles.row}>
          <Pressable accessibilityLabel="Riduci zoom" disabled={busy || frame.zoom <= 1} onPress={() => zoom(-0.15)} style={styles.button}><Text style={styles.label}>−</Text></Pressable>
          <Text style={styles.label}>{Math.round(frame.zoom * 100)}%</Text>
          <Pressable accessibilityLabel="Ingrandisci foto" disabled={busy || frame.zoom >= 4} onPress={() => zoom(0.15)} style={styles.button}><Text style={styles.label}>+</Text></Pressable>
        </View>
        <View style={styles.row}>
          <Pressable disabled={busy} onPress={() => onFinish(null)} style={styles.button}><Text style={styles.label}>Annulla</Text></Pressable>
          <Pressable disabled={busy} onPress={confirm} style={[styles.button, { backgroundColor: '#2563eb' }]}>{busy ? <ActivityIndicator color="#fff" /> : <Text style={[styles.label, { color: '#fff' }]}>Usa foto</Text>}</Pressable>
        </View>
      </DockedSheetSurface>
    </View>
  </Modal>;
}

const baseCropStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.65)', alignItems: 'center', justifyContent: 'flex-end', padding: 16 , paddingBottom: 0 },
  panel: { backgroundColor: '#fff', borderRadius: 24, padding: 20, alignItems: 'center', gap: 16, maxWidth: 420 },
  title: { fontSize: 20, fontWeight: '700', color: '#0f172a', textAlign: 'center' },
  hint: { color: '#475569', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  button: { minWidth: 52, minHeight: 46, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#eef2f7', alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
});
