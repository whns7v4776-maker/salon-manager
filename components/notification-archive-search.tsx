import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import { useAccessAppearance } from './access-premium';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { filterArchiveSearch, normalizeArchiveSearch } from '../src/lib/notification-archive-search';
import { HapticTouchable } from './ui/haptic-touchable';

type NotificationArchiveSearchProps<T> = {
  premium?: boolean;
  bounded?: boolean;
  items: T[];
  scope: string;
  getSearchText: (item: T) => string;
  onSearchChange?: (matchingItems: T[], searching: boolean) => void;
  children: (items: T[]) => React.ReactNode;
};

export function NotificationArchiveSearch<T>({ items, scope, getSearchText, onSearchChange, children, premium=false, bounded=false }: NotificationArchiveSearchProps<T>) {
  const {palette:p}=useAccessAppearance();
  const [query, setQuery] = useState('');
  const filteredItems = useMemo(() => filterArchiveSearch(items, query, getSearchText), [items, query, getSearchText]);
  const searching = Boolean(normalizeArchiveSearch(query));
  const updateQuery = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    onSearchChange?.(filterArchiveSearch(items, nextQuery, getSearchText), Boolean(normalizeArchiveSearch(nextQuery)));
  }, [items, getSearchText, onSearchChange]);
  return (
    <View style={[styles.container, bounded && { flex: 1, minHeight: 0 }]}>
      <PremiumSearchToolbar><View style={[styles.searchRow,premium&&{backgroundColor:p.field,borderColor:p.border}]}>
        <Ionicons name="search-outline" size={19} color={premium?p.muted:"#64748B"} />
        <TextInput
          style={[styles.input,premium&&{color:p.ink}]}
          value={query}
          onChangeText={updateQuery}
          placeholder={/^\d{4}$/.test(scope) ? `Cerca nell’anno ${scope}…` : 'Cerca cliente, servizio, operatore…'}
          placeholderTextColor={premium?p.muted:"#64748B"}
          accessibilityLabel={`Cerca nell’archivio ${scope}`}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={120}
        />
        {query ? (
          <HapticTouchable
            onPress={() => updateQuery('')}
            style={styles.clear}
            accessibilityRole="button"
            accessibilityLabel={`Cancella ricerca nell’archivio ${scope}`}
          >
            <Ionicons name="close" size={21} color="#64748B" />
          </HapticTouchable>
        ) : null}
      </View></PremiumSearchToolbar>
      {searching ? (
        <Text style={styles.results} accessibilityLiveRegion="polite">
          {filteredItems.length === 0
            ? 'Nessuna notifica trovata'
            : `${filteredItems.length === 1 ? '1 risultato' : `${filteredItems.length} risultati`} su ${items.length}`}
        </Text>
      ) : null}
      {filteredItems.length > 0 ? children(filteredItems) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  searchRow: {
    minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1,
    borderColor: '#DCE5EF', paddingLeft: 12, paddingRight: 4,
  },
  input: {
    flex: 1, minWidth: 0, fontSize: 14, color: '#0F172A',
    paddingVertical: 12, paddingHorizontal: 0,
  },
  clear: { minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  results: { color: '#64748B', fontSize: 12, fontWeight: '600', paddingHorizontal: 4 },
});
