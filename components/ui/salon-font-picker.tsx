import { useAgendaPopupStyles } from '../agenda-popup-theme';
import { useAccessAppearance } from '../access-premium';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import { DockedSheetSurface } from './docked-sheet-surface';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import React, { useState } from 'react';
import { Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { resolveSalonNameFontFamily, salonNameFontOptions } from '../../src/lib/fonts';
import type { SalonNameDisplayStyle, SalonNameFontVariant } from '../../src/lib/platform';
import { HapticTouchable } from './haptic-touchable';

export function SalonFontPicker({ value, name, displayStyle, disabled, onChange }: {
  value: SalonNameFontVariant;
  name: string;
  displayStyle: SalonNameDisplayStyle;
  disabled: boolean;
  onChange: (value: SalonNameFontVariant) => void;
}) {
  const {palette:p}=useAccessAppearance();
  const styles=useAgendaPopupStyles(baseFontPickerStyles);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const preview = (font: SalonNameFontVariant) => (
    <Text style={[styles.preview, { fontFamily: resolveSalonNameFontFamily(displayStyle, font) }]}>
      {name.trim() || 'Il tuo salone'}
    </Text>
  );
  return (
    <View style={styles.card}>
      <HapticTouchable immediatePress disabled={disabled} accessibilityRole="button"
        accessibilityLabel="Scegli il font dell’insegna" onPress={() => { setDraft(value); setOpen(true); }}
        style={styles.row}>
        <View style={styles.labelWrap}>
          <Text style={styles.label}>Font insegna</Text>
          <Text style={styles.caption}>{salonNameFontOptions.find((font) => font.key === value)?.label}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={p.ink} />
      </HapticTouchable>
      {preview(value)}
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: () => setOpen(false)} : {})} style={styles.sheet} accessibilityViewIsModal>
            <View style={styles.row}>
              <View style={styles.labelWrap}>
                <Text style={styles.title}>La firma del tuo salone</Text>
                <Text style={styles.caption}>Scegli un font e guarda l’anteprima.</Text>
              </View>
              <HapticTouchable immediatePress style={styles.close} onPress={() => setOpen(false)}
                accessibilityRole="button" accessibilityLabel="Annulla scelta font">
                <Ionicons name="close" size={22} color={p.ink} />
              </HapticTouchable>
            </View>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
              <View style={styles.previewFrame}>{preview(draft)}</View>
              <Picker selectedValue={draft} accessibilityLabel="Font del salone"
                onValueChange={(next) => {
                  if (salonNameFontOptions.some((font) => font.key === next)) setDraft(next);
                }}
                style={styles.picker} itemStyle={styles.pickerItem} dropdownIconColor={p.ink}>
                {salonNameFontOptions.map((font) => (
                  <Picker.Item key={font.key} label={font.label} value={font.key} color={p.ink} />
                ))}
              </Picker>
              <Text style={styles.note}>La scelta verrà salvata con “Salva modifiche” nel profilo.</Text>
            </ScrollView>
            <HapticTouchable immediatePress style={styles.confirm} disabled={disabled}
              accessibilityRole="button" onPress={() => { onChange(draft); setOpen(false); }}>
              <Text style={styles.confirmText}>Usa questo font</Text>
            </HapticTouchable>
          </DockedSheetSurface>
        </View>
      </Modal>
    </View>
  );
}

const baseFontPickerStyles = StyleSheet.create({
  card: { backgroundColor: '#F0F5FA', borderRadius: 16, padding: 14, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  labelWrap: { flex: 1, minWidth: 0 },
  label: { fontSize: 14, fontWeight: '700', color: '#183451' },
  caption: { fontSize: 12, lineHeight: 18, color: '#64748B', marginTop: 3 },
  preview: { fontSize: 34, lineHeight: 48, color: '#183451', textAlign: 'center', paddingVertical: 10, flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.42)', justifyContent: 'flex-end', padding: 20 , paddingBottom: 0 },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '90%', alignSelf: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18 },
  title: { fontSize: 19, fontWeight: '700', color: '#183451' },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F5FA' },
  content: { paddingTop: 16, paddingBottom: 10 },
  previewFrame: { backgroundColor: '#F0F5FA', borderRadius: 16, minHeight: 90, justifyContent: 'center', padding: 12 },
  picker: { width: '100%', height: Platform.OS === 'ios' ? 216 : 56, color: '#183451' },
  pickerItem: { fontSize: 20, color: '#183451' },
  note: { fontSize: 12, lineHeight: 18, textAlign: 'center', color: '#64748B' },
  confirm: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: '#193B60', alignItems: 'center' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
