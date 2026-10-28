import { StyleSheet } from 'react-native';

// Shared visual language for the benefits console, on native and web.
export const benefitsDesign = StyleSheet.create({
  panel: { backgroundColor: '#F8F5F8', borderWidth: 1, borderColor: '#EAE1E7', borderRadius: 22, padding: 18, gap: 16 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E7DFE6', borderRadius: 18, padding: 16, gap: 10 },
  label: { color: '#394152', fontSize: 14, fontWeight: '600', marginBottom: 7 },
  input: { minHeight: 50, paddingHorizontal: 15, paddingVertical: 13, borderWidth: 1, borderColor: '#D9DDE5', borderRadius: 14, backgroundColor: '#FFFFFF', color: '#202C3D', fontSize: 16 },
  primary: { minHeight: 48, padding: 14, borderRadius: 14, backgroundColor: '#963B57', alignItems: 'center', justifyContent: 'center' },
  secondary: { minHeight: 46, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E1D9E2', backgroundColor: '#F5F1F5', alignItems: 'center', justifyContent: 'center' },
  danger: { minHeight: 44, padding: 12, borderRadius: 14, backgroundColor: '#FFF0F1', alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontWeight: '700', color: '#FFFFFF', fontSize: 15 },
  secondaryText: { fontWeight: '600', color: '#63495C', fontSize: 14 },
  title: { fontSize: 20, fontWeight: '800', color: '#222C3B' },
  copy: { color: '#677182', fontSize: 14, lineHeight: 21 },
});
