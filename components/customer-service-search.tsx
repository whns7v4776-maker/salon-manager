import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useCustomerPremiumStyles } from './owner-premium-customers-style';
import { premiumFilterStyles } from './ui/premium-filter-styles';
import { HorizontalCardScrollView } from './ui/horizontal-card-scroll-view';

import { FilterCheckmark } from "./ui/filter-checkmark";
import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { HapticNativePressable as Pressable } from './ui/haptic-native-controls';
import { getServiceCardTheme } from '../src/lib/service-accents';
import { useAppContext } from '../src/context/AppContext';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export type CustomerServiceSearchState = { query: string; selectedRole: string | null };

// Keep keystrokes local to the popup, without rerendering the customer directory.
export function CustomerServiceSearch<T extends { key: string; label: string; services: { nome: string }[] }>({
  groups, children, stateStore, persistenceKey,
}: {
  groups: T[];
  stateStore: React.MutableRefObject<Record<string, CustomerServiceSearchState>>;
  persistenceKey: string;
  children: (groups: T[], scrollRef: React.RefObject<ScrollView | null>) => React.ReactNode;
}) {
 const styles=useCustomerPremiumStyles(baseCustomerComponentStyles);

  const [searchState, setSearchState] = useState<CustomerServiceSearchState>(() =>
    stateStore.current[persistenceKey] ?? { query: '', selectedRole: null });
  const { query, selectedRole } = searchState;
  const updateState = (patch: Partial<CustomerServiceSearchState>) => {
    const next = { ...searchState, ...patch };
    stateStore.current[persistenceKey] = next;
    setSearchState(next);
  };
  const { roleCardColorOverrides } = useAppContext();

  const showRoleFilters = groups.length > 1;
  const activeRole = groups.some((group) => group.key === selectedRole)
    ? selectedRole : null;
  const scrollRef = useRef<ScrollView | null>(null);
  const filtered = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const roleGroups = activeRole ? groups.filter((group) => group.key === activeRole) : groups;
    if (!words.length) return roleGroups;
    return roleGroups.map((group) => ({ ...group,
      services: group.services.filter((service) => words.every((word) => normalize(service.nome).includes(word))),
    })).filter((group) => group.services.length > 0);
  }, [groups, query, activeRole]);
  const updateQuery = (value: string) => {
    updateState({ query: value });
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  return (
    <View style={styles.container}>
      <PremiumSearchToolbar>
      {showRoleFilters && (
        <View {...{dataSet:{premiumToolbarFilters:"true"}}} style={[styles.filters, premiumFilterStyles.panel]}>
          <View style={[premiumFilterStyles.icon, styles.filterIcon]} accessibilityLabel="Filtri per mestiere">
            <Ionicons name="funnel-outline" size={18} color="#52677E" />
          </View>
          <HorizontalCardScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
            style={premiumFilterStyles.viewport}
            contentContainerStyle={styles.filterContent}>
            {[{ key: null, label: 'Tutti' }, ...groups].map((group) => {
              const accent = group.key ? getServiceCardTheme({ roleName: group.label,
                roleColorOverrides: roleCardColorOverrides, preferRoleColor: true }) : null;
              return (
              <Pressable key={group.key ?? '__all_roles__'} accessibilityRole="button"
                accessibilityLabel={`Filtra mestiere: ${group.label}`}
                accessibilityState={{ selected: activeRole === group.key }}
                onPress={() => {
                  updateState({ selectedRole: group.key });
                  scrollRef.current?.scrollTo({ y: 0, animated: false });
                }} style={[styles.filter, activeRole === group.key && styles.filterSelected]}>
                {accent && <View {...{dataSet:{premiumFilterDecoration:"true"}}} style={[premiumFilterStyles.marker, { backgroundColor: accent.baseColor }]} />}
                <Text style={[styles.filterText, activeRole === group.key && styles.filterTextSelected]}>{group.label}</Text>
                {activeRole === group.key && <View {...{dataSet:{premiumFilterDecoration:"true"}}} style={styles.selectedBadge} pointerEvents="none">
                  <FilterCheckmark />
                </View>}
              </Pressable>
            ); })}
          </HorizontalCardScrollView>
        </View>
      )}
      <View style={styles.search}>
        <Ionicons name="search-outline" size={19} color="#64748B" />
        <TextInput value={query} onChangeText={updateQuery} placeholder="Cerca un servizio…"
          accessibilityLabel="Cerca nei servizi da personalizzare" autoCorrect={false}
          autoCapitalize="none" returnKeyType="search" style={styles.input} placeholderTextColor="#64748B" />
        {!!query && <Pressable onPress={() => updateQuery('')} accessibilityRole="button"
          accessibilityLabel="Cancella ricerca servizi" hitSlop={8}>
          <Ionicons name="close-circle" size={20} color="#64748B" />
        </Pressable>}
      </View>
      </PremiumSearchToolbar>
      {!filtered.length && <Text style={styles.empty}>Nessun servizio trovato. Prova un altro nome.</Text>}
      {children(filtered, scrollRef)}
    </View>
  );
}
const baseCustomerComponentStyles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  selectedBadge: {    zIndex: 1,
       
    ...premiumFilterStyles.check,
  },
  filters: { marginBottom: 4, marginHorizontal: 12 },
  filterIcon: { width: 24, height: 44, minHeight: 44 },
  filterContent: {
    ...premiumFilterStyles.row,
    paddingLeft: 4, paddingRight: 4, paddingTop: 0, paddingBottom: 0, gap: 6,
  },
  filter: {   
    
      
       
    ...premiumFilterStyles.card,
    minHeight: 44, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    shadowOpacity: 0, elevation: 0,
  },
  filterSelected: {   
    ...premiumFilterStyles.selected,
    shadowOpacity: 0, elevation: 0,
  },
  filterText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterTextSelected: { 
    ...premiumFilterStyles.selectedText,
  },
  search: { marginHorizontal: 16, marginBottom: 4, paddingHorizontal: 11, minHeight: 44,
    borderRadius: 12, borderWidth: 1, borderColor: '#DCE5EE', backgroundColor: '#F6F9FC',
    flexDirection: 'row', alignItems: 'center', gap: 9 },
  input: { flex: 1, minWidth: 0, fontSize: 14, color: '#243957', paddingVertical: 8 },
  empty: { paddingHorizontal: 20, paddingVertical: 16, color: '#64748B', textAlign: 'center' },
});

