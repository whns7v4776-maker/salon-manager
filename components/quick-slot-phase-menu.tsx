import { DockedSheetSurface } from './ui/docked-sheet-surface';
import React, { useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HapticTouchable } from './ui/haptic-touchable';
import { quickSlotDesign } from './quick-slot-design';
import { haptic } from '../src/lib/haptics';
import { useAccessAppearance } from './access-premium';
import { createAgendaPremiumStyles } from './agenda-premium-style';
import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';

type Props = {
  serviceName: string;
  onEdit?: () => void;
  onRemove: () => void;
};

// Explicit onPressIn also covers the native fast-tap gesture path.
const feedbackOnTouch = () => {
  if (Platform.OS !== 'web') void haptic.light().catch(() => null);
};

// These actions only edit the current composition draft, never the catalog.
export function QuickSlotPhaseMenu({ serviceName, onEdit, onRemove }: Props) {
  const {palette}=useAccessAppearance();
  const styles=useMemo(()=>{
    const themed=createAgendaPremiumStyles(baseStyles,palette);
    return {...themed,overlay:{...themed.overlay,justifyContent:'center' as const,paddingBottom:24,backgroundColor:palette.night?'rgba(0,0,0,.48)':'rgba(40,36,30,.28)',...(Platform.OS==='web'?{backdropFilter:'blur(9px)'}:{})},
      card:{...themed.card,backgroundColor:palette.night?'rgba(28,32,34,.98)':'rgba(252,249,245,.98)',borderColor:palette.border},
      title:{...themed.title,color:palette.ink,fontFamily:Platform.OS==='android'?'serif':'Georgia',fontWeight:'400' as const},
      remove:{...themed.remove,backgroundColor:palette.night?'rgba(202,100,110,.12)':'#FCF0F0'},
      removeIcon:{...themed.removeIcon,backgroundColor:'transparent'},
      removeLabel:{...themed.removeLabel,color:palette.night?'#F1A8AA':'#A83E49'},
    };
  },[palette]);
  const [visible, setVisible] = useState(false);
  const pendingAction = useRef<(() => void) | null>(null);
  const finishDismiss = () => {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  };
  const close = (action?: () => void) => {
    pendingAction.current = action ?? null;
    setVisible(false);
    // iOS must finish dismissing this modal before opening the phase editor.
    if (Platform.OS !== 'ios') requestAnimationFrame(finishDismiss);
  };

  return <>
    <HapticTouchable
      style={[quickSlotDesign.quickCompositionActionControlNative, Platform.OS === 'web' && styles.webTrigger]}
      onPress={() => setVisible(true)}
      hapticType="none"
      onPressIn={feedbackOnTouch}
      accessibilityRole="button"
      accessibilityLabel={`Azioni per ${serviceName}`}
      accessibilityHint="Modifica o rimuovi il servizio dalla composizione"
    >
      <Ionicons name="ellipsis-horizontal" size={20} color={palette.ink} />
    </HapticTouchable>
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} transparent visible={visible} animationType="none" onRequestClose={() => close()} onDismiss={finishDismiss}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Chiudi menu" accessibilityRole="button" />
        <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: () => close()} : {})} style={styles.card} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={styles.eyebrow}>GESTIONE FASE</Text>
              <Text style={styles.title} numberOfLines={2}>{serviceName}</Text>
            </View>
            <HapticTouchable style={styles.close} onPress={() => close()} hapticType="none" onPressIn={feedbackOnTouch} accessibilityRole="button" accessibilityLabel="Chiudi menu">
              <Ionicons name="close" size={22} color={palette.ink} />
            </HapticTouchable>
          </View>
          {onEdit && <HapticTouchable style={styles.action} onPress={() => close(onEdit)} hapticType="none" onPressIn={feedbackOnTouch} accessibilityRole="button">
            <View style={styles.icon}><Ionicons name="pencil-outline" size={19} color={palette.ink} /></View>
            <Text style={styles.label}>Modifica fase</Text>
            <Ionicons name="chevron-forward" size={16} color={palette.muted} />
          </HapticTouchable>}
          <HapticTouchable style={[styles.action, styles.remove]} onPress={() => close(onRemove)} hapticType="none" onPressIn={feedbackOnTouch} accessibilityRole="button">
            <View style={[styles.icon, styles.removeIcon]}><Ionicons name="trash-outline" size={19} color={palette.night?'#F1A8AA':'#A83E49'} /></View>
            <Text style={[styles.label, styles.removeLabel]}>Rimuovi dalla composizione</Text>
          </HapticTouchable>
        </DockedSheetSurface>
      </View>
    </Modal>
  </>;
}

const baseStyles = StyleSheet.create({
  webTrigger: { flexGrow: 0, flexShrink: 0, flexBasis: 36, width: 36, minWidth: 36, height: 36, minHeight: 36, borderRadius: 10, borderWidth: 1, borderColor: '#D4DFEC', backgroundColor: '#F7F9FC' },
  overlay: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,0.22)' , paddingBottom: 0 },
  card: { width: '100%', maxWidth: 340, padding: 16, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E8F0', shadowColor: '#182D48', shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E8EDF4' },
  heading: { flex: 1 },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1, color: '#64748B', marginBottom: 4 },
  title: { fontSize: 18, lineHeight: 23, fontWeight: '700', color: '#18283F' },
  close: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#F2F5F9', alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, padding: 8, borderRadius: 12, backgroundColor: '#F2F6FB', marginTop: 6 },
  icon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E5EDF8', alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#294B70' },
  remove: { backgroundColor: '#FCF5F5' },
  removeIcon: { backgroundColor: '#F8E8EA' },
  removeLabel: { color: '#A83E49' },
});
