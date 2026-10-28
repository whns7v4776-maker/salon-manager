import { useAgendaPopupStyles } from './agenda-popup-theme';
import { useAccessAppearance } from './access-premium';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticTouchable } from './ui/haptic-touchable';

export function AppointmentBenefitConfirmation({ visible, title, service, message, confirmLabel, busy, error, onClose, onConfirm }: {
  visible: boolean;
  title: string;
  service: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const {palette:p}=useAccessAppearance();
  const styles=useAgendaPopupStyles(baseStyles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" presentationStyle="overFullScreen" statusBarTranslucent onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}>
        <View style={[styles.card, { maxHeight: Math.max(120, height - insets.top - insets.bottom - 40) }]} accessibilityViewIsModal>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>{title}</Text>
              <HapticTouchable accessibilityRole="button" accessibilityLabel="Chiudi conferma" disabled={busy} onPress={onClose} style={styles.close}>
                <Ionicons name="close" size={22} color={p.ink} />
              </HapticTouchable>
            </View>
            <Text style={styles.service}>{service}</Text>
            <Text style={styles.message}>{message}</Text>
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <View style={styles.actions}>
              <HapticTouchable accessibilityRole="button" disabled={busy} onPress={onClose} style={[styles.button, styles.cancel]}>
                <Text style={styles.cancelText}>Annulla</Text>
              </HapticTouchable>
              <HapticTouchable accessibilityRole="button" disabled={busy} onPress={onConfirm} style={[styles.button, styles.confirm, busy && { opacity: 0.6 }]}>
                <Text style={styles.confirmText}>{busy ? 'Salvataggio…' : confirmLabel}</Text>
              </HapticTouchable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const baseStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20, backgroundColor: 'rgba(15,23,42,0.38)' },
  card: { width: '100%', maxWidth: 420, borderRadius: 24, backgroundColor: '#FFF', overflow: 'hidden', flexShrink: 1 },
  content: { padding: 20, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: '#172B44' },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  service: { fontSize: 15, fontWeight: '700', color: '#244E88' },
  message: { fontSize: 14, lineHeight: 21, color: '#526477' },
  error: { color: '#AE334A', fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  button: { flex: 1, minHeight: 46, padding: 12, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: '#F1F5F9' },
  confirm: { backgroundColor: '#245BDB' },
  cancelText: { color: '#526477', fontWeight: '700', textAlign: 'center' },
  confirmText: { color: '#FFF', fontWeight: '700', textAlign: 'center' },
});
