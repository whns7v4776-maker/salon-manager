import { PremiumSectionHeading } from './ui/premium-section-heading';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import { useCustomerPremiumColor } from './owner-premium-customers-style';
import type { Palette } from './access-appearance-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Platform, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { supabase } from '../src/lib/supabase';
import { HapticTouchable } from './ui/haptic-touchable';

export const communicationPosterUrl = (path?: string | null) => path
  ? supabase.storage.from('communication-posters').getPublicUrl(path).data.publicUrl : null;

export function CommunicationPoster({ path, compact = false, customerPalette }: { path?: string | null; compact?: boolean; customerPalette?: Palette }) {
 const premiumColor=useCustomerPremiumColor();

  const [open, setOpen] = useState(false);
  const [ratio, setRatio] = useState(0.75);
  const [failed, setFailed] = useState(false);
  const uri = communicationPosterUrl(path);
  useEffect(() => {
    setFailed(false); setOpen(false);
    if (!uri) return;
    let active = true;
    Image.getSize(uri, (w, h) => { if (active && w > 0 && h > 0) setRatio(w / h); }, () => {});
    return () => { active = false; };
  }, [uri]);
  if (!uri) return null;
  return <View style={{ marginVertical: 12 }}>
    {failed ? <Text style={{ color: customerPalette?.muted ?? premiumColor("#64748B","color") }}>Locandina non disponibile. Le informazioni sono nel messaggio.</Text> :
      <HapticTouchable accessibilityRole="button" accessibilityLabel="Apri e ingrandisci la locandina" onPress={() => { setOpen(true); }}>
        <Image source={{ uri }} resizeMode="contain" onError={() => setFailed(true)} style={{ width: '100%', ...(customerPalette ? { aspectRatio: ratio } : { height: compact ? 64 : 240 }), borderRadius: 14, backgroundColor: customerPalette?.field ?? premiumColor("#EEF2F7","backgroundColor") }} />
        <Text style={{ textAlign: 'center', color: customerPalette?.muted ?? premiumColor("#31558B","color"), marginTop: 8 }}>{compact ? "Apri locandina" : "Tocca per ingrandire"}</Text>
      </HapticTouchable>}
    {open && <PosterViewer uri={uri} ratio={ratio} onClose={() => setOpen(false)} customerPalette={customerPalette} />}

  </View>;
}

export function CommunicationPosterPreview({ path, onClose, customerPalette }: { path: string; onClose: () => void; customerPalette?: Palette }) {
  const [ratio, setRatio] = useState(0.75);
  const uri = communicationPosterUrl(path);
  useEffect(() => {
    let active = true;
    if (uri) Image.getSize(uri, (w, h) => { if (active && h) setRatio(w / h); }, () => {});
    return () => { active = false; };
  }, [uri]);
  return uri ? <PosterViewer uri={uri} ratio={ratio} onClose={onClose} customerPalette={customerPalette} /> : null;
}

function PosterViewer({ uri, ratio, onClose, customerPalette }: { uri: string; ratio: number; onClose: () => void; customerPalette?: Palette }) {
 const ownerColor=useCustomerPremiumColor();
 const insets=useSafeAreaInsets();
 const premiumColor=(value:string, kind:'color'|'backgroundColor')=>customerPalette ? kind==='color' ? customerPalette.ink : customerPalette.canvas : ownerColor(value,kind);

  // Mount the image only after the modal has a real viewport. On iOS, an
  // initial 1px image can be decoded at that size and then stretched on resize.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  const scale = useSharedValue(1);
  const x = useSharedValue(0), y = useSharedValue(0);
  const startScale = useSharedValue(1), startX = useSharedValue(0), startY = useSharedValue(0);
  const focalX = useSharedValue(0), focalY = useSharedValue(0);
  const panX = useSharedValue(0), panY = useSharedValue(0);
  const imageWidth = Math.min(size.width, size.height * ratio);
  const imageHeight = imageWidth / ratio;
  const imageKey = `${uri}:${imageWidth}:${imageHeight}:${attempt}`;
  useEffect(() => { setLoadState('loading'); }, [imageKey]);
  const bound = (value: number, extent: number) => {
    'worklet';
    return Math.max(-Math.max(0, extent), Math.min(Math.max(0, extent), value));
  };
  const pinch = Gesture.Pinch().onStart(e => {
    startScale.value = scale.value; startX.value = x.value; startY.value = y.value;
    focalX.value = e.focalX - size.width / 2; focalY.value = e.focalY - size.height / 2;
  }).onUpdate(e => {
    const next = Math.max(1, Math.min(4, startScale.value * e.scale));
    const factor = next / startScale.value;
    scale.value = next;
    x.value = bound(e.focalX - size.width / 2 - (focalX.value - startX.value) * factor, (imageWidth * next - size.width) / 2);
    y.value = bound(e.focalY - size.height / 2 - (focalY.value - startY.value) * factor, (imageHeight * next - size.height) / 2);
  });
  const pan = Gesture.Pan().maxPointers(1).onStart(() => {
    panX.value = x.value; panY.value = y.value;
  }).onUpdate(e => {
    x.value = bound(panX.value + e.translationX, (imageWidth * scale.value - size.width) / 2);
    y.value = bound(panY.value + e.translationY, (imageHeight * scale.value - size.height) / 2);
  });
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));
  return <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible animationType="fade" onRequestClose={onClose}>
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: premiumColor("#101827","backgroundColor"), paddingTop: customerPalette ? Math.max(insets.top + 8, 16) : 55, paddingBottom: customerPalette ? Math.max(insets.bottom + 12, 24) : 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 }}>
        <Text style={{ flex: 1, color: customerPalette?.muted ?? premiumColor("#CBD5E1","color") }}>{customerPalette && Platform.OS === 'web' ? 'Locandina del salone' : 'Allarga con due dita per ingrandire'}</Text>
        <HapticTouchable accessibilityRole="button" accessibilityLabel="Chiudi locandina" onPress={onClose} style={{ padding: 14 }}>
          <Text style={{ color: customerPalette?.ink ?? 'white', fontWeight: '700' }}>Chiudi</Text>
        </HapticTouchable>
      </View>
      <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)} touchAction="none">
        <Animated.View onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          if (width <= 0 || height <= 0 || (width === size.width && height === size.height)) return;
          setSize({ width, height }); scale.value = 1; x.value = 0; y.value = 0;
        }} style={{ flex: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
          {imageWidth > 0 && imageHeight > 0 && <Animated.View style={[{ width: imageWidth, height: imageHeight }, animated]}>
            <Image key={imageKey} source={{ uri }} resizeMode="contain"
              onLoad={() => setLoadState('ready')} onError={() => setLoadState('error')}
              style={{ width: imageWidth, height: imageHeight }} />
          </Animated.View>}
          {loadState === 'loading' && <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={premiumColor("#FFFFFF","color")} />
            <Text style={{ color: premiumColor("#CBD5E1","color") }}>Caricamento locandina…</Text>
          </View>}
          {loadState === 'error' && <View style={{ position: 'absolute', alignItems: 'center', gap: 12, padding: 24, backgroundColor: premiumColor("#101827","backgroundColor") }}>
            <Text style={{ color: premiumColor("#FFFFFF","color"), textAlign: 'center' }}>Impossibile caricare la locandina. Riprova.</Text>
            <HapticTouchable accessibilityRole="button" accessibilityLabel="Riprova a caricare la locandina"
              onPress={() => { setLoadState('loading'); setAttempt(value => value + 1); }}
              style={{ paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, backgroundColor: premiumColor("#334155","backgroundColor") }}>
              <Text style={{ color: premiumColor("#FFFFFF","color"), fontWeight: '700' }}>Riprova</Text>
            </HapticTouchable>
          </View>}
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  </Modal>;
}

export function CommunicationPosterPicker({ path, onChange, disabled, onBusyChange }: {
  path: string | null; onChange: (path: string | null) => void; disabled: boolean; onBusyChange: (busy: boolean) => void;
}) {
 const premiumColor=useCustomerPremiumColor();

  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pick = async () => {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); onBusyChange(true); setError('');
    try {
      const canManipulate = Platform.OS === 'web' || !!requireOptionalNativeModule('ExpoImageManipulator');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: canManipulate ? 1 : 0.85, base64: !canManipulate });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.width || !asset.height || (asset.fileSize ?? 0) > 25 * 1024 * 1024) throw new Error('Scegli un’immagine fino a 25 MB.');
      // Older DEV binaries may not include this native module yet. Never load it at startup.
      let image: { base64?: string | null } = asset;
      if (canManipulate) {
        const ImageManipulator = await import('expo-image-manipulator');
        image = await ImageManipulator.manipulateAsync(asset.uri,
          [{ resize: asset.width >= asset.height ? { width: Math.min(2048, asset.width) } : { height: Math.min(2048, asset.height) } }],
          { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      }
      if (!image.base64) throw new Error('Preparazione immagine non riuscita.');
      if (!image.base64.startsWith('/9j/')) throw new Error('In questa versione scegli una locandina JPEG. Gli altri formati richiedono l’aggiornamento dell’app.');
      if (image.base64.length > 4 * Math.ceil(5 * 1024 * 1024 / 3)) throw new Error('L’immagine è troppo pesante. Scegli una locandina più leggera.');
      const bytes = Uint8Array.from(atob(image.base64), c => c.charCodeAt(0));
      if (bytes.length > 5 * 1024 * 1024) throw new Error('L’immagine è troppo pesante. Scegli una locandina più leggera.');
      const { data, error: authError } = await supabase.auth.getUser();
      if (authError || !data.user) throw new Error('Accedi nuovamente per allegare la locandina.');
      const nextPath = `${data.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const upload = await supabase.storage.from('communication-posters').upload(nextPath, bytes.buffer, { contentType: 'image/jpeg', upsert: false });
      if (upload.error) throw new Error('Caricamento non riuscito. Riprova.');
      onChange(nextPath);
    } catch (e) { setError(e instanceof Error ? e.message : 'Caricamento non riuscito. Riprova.'); }
    finally { lock.current = false; setBusy(false); onBusyChange(false); }
  };
  return <View style={{ padding: 16, borderRadius: 18, backgroundColor: premiumColor("#F1F5FA","backgroundColor"), gap: 10, marginBottom: 16 }}>
    <PremiumSectionHeading tone={1} style={{ fontSize: 16, fontWeight: '700', color: premiumColor("#253D61","color") }}>Locandina · facoltativa</PremiumSectionHeading>
    <Text style={{ fontSize: 14, lineHeight: 20, color: premiumColor("#526781","color") }}>Usa poche parole e caratteri grandi. Riporta le informazioni importanti anche nel messaggio.</Text>
    <HapticTouchable disabled={disabled || busy} onPress={() => void pick()} style={{ padding: 12, borderRadius: 12, backgroundColor: premiumColor("#DFE9F8","backgroundColor"), alignItems: 'center' }}><Text style={{ color: premiumColor("#253D61","color"), fontWeight: '700' }}>{busy ? 'Caricamento locandina…' : path ? 'Sostituisci locandina' : 'Allega locandina'}</Text></HapticTouchable>
    {!!error && <Text accessibilityLiveRegion="polite" style={{ color: premiumColor("#B44960","color") }}>{error}</Text>}
    {!!path && <>
      <View style={{ width: '100%', maxWidth: 320, alignSelf: 'center' }}><Text style={{ color: premiumColor("#526781","color"), textAlign: 'center' }}>Anteprima su telefono</Text><CommunicationPoster path={path} /></View>
      <HapticTouchable disabled={disabled || busy} onPress={() => onChange(null)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: premiumColor("#B44960","color") }}>Rimuovi allegato</Text></HapticTouchable>
    </>}
  </View>;
}
