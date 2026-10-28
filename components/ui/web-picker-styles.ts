import { useSettingsWebStyles } from '../settings-web-styles';
import { StyleSheet } from 'react-native';

/** Applied only by web branches. Native picker presentation remains unchanged. */
export const webPickerStyles = StyleSheet.create({
  backdrop: { justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(15,23,42,0.42)' },
  sheet: { width: '100%', maxWidth: 480, borderRadius: 24, borderWidth: 1, borderColor: '#DCE5F0', backgroundColor: '#FFFFFF', padding: 20, minHeight: 0, flexShrink: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  title: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 26, fontWeight: '700', color: '#172B43', textAlign: 'left' },
  toggle: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', borderRadius: 12, backgroundColor: '#EEF4FF', borderWidth: 1, borderColor: '#D4E2F8' },
  toggleText: { fontSize: 13, fontWeight: '600', color: '#245BA5' },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 16, marginTop: 12, borderTopWidth: 1, borderTopColor: '#E7EDF5', flexShrink: 0 },
  cancel: { flex: 1, minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F2F5F9', borderWidth: 1, borderColor: '#DCE5F0' },
  confirm: { flex: 1, minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: '#203B60' },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#40556F' },
  confirmText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  chip: { minHeight: 44, minWidth: 72, paddingHorizontal: 10, borderRadius: 12, backgroundColor: '#F4F7FC', borderWidth: 1, borderColor: '#DCE5F0', alignItems: 'center', justifyContent: 'center' },
  chipSelected: { backgroundColor: '#E7F0FF', borderColor: '#7AA2DE' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#40556F' },
  chipTextSelected: { color: '#245BA5', fontWeight: '700' },
  amount: { minHeight: 64, borderRadius: 16, borderWidth: 1, borderColor: '#C9DAF1', backgroundColor: '#F5F8FD', paddingHorizontal: 16, fontSize: 28, fontWeight: '700', color: '#203B60' },
  error: { marginTop: 8, fontSize: 13, color: '#B4233A' },
});

export function useWebPickerStyles(){return useSettingsWebStyles(webPickerStyles);}
