import { StyleSheet } from 'react-native';

// Appearance only; callers retain selection and scrolling behavior.
export const premiumFilterStyles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', borderWidth: 0, borderTopWidth: 0, borderBottomWidth: 0, borderRadius: 0, backgroundColor: 'transparent', paddingTop: 0, paddingBottom: 0, gap: 0 },
  icon: { width: 30, height: 46, minHeight: 46, flexShrink: 0, alignItems: 'center', justifyContent: 'center', marginLeft: 0, borderWidth: 0, backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  row: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', gap: 7, paddingLeft: 0, paddingRight: 0, paddingTop: 0, paddingBottom: 0 },
  viewport: { flex: 1, flexGrow: 1, flexShrink: 1, width: 'auto', minWidth: 0, alignSelf: 'stretch', overflow: 'hidden' },
  card: { minHeight: 40, flexGrow: 0, flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, borderWidth: 1, borderColor: '#DCE5EF', backgroundColor: '#F1F5FA', shadowColor: '#0F172A', shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 3 }, elevation: 0 },
  selected: { borderWidth: 1, borderColor: '#20364F', backgroundColor: '#20364F', transform: [{ scale: 1 }], shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 3 }, elevation: 0 },
  selectedText: { color: '#FFFFFF' },
  marker: { width: 4, height: 20, borderRadius: 2, flexShrink: 0 },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F5F9', borderWidth: 0 },
  selectedCount: { backgroundColor: '#3A5069', borderColor: '#3A5069' },
  check: { position: 'relative', top: 0, right: 0, width: 14, height: 18, alignItems: 'center', justifyContent: 'center' },
});
