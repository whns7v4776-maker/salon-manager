import { useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAppContext } from '../../src/context/AppContext';

const formatDateLabel = (dateString?: string) => {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
};

export default function ClienteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { clienti, appuntamenti, movimenti } = useAppContext();

  const cliente = useMemo(() => {
    return clienti.find((item) => item.id === id);
  }, [clienti, id]);

  const appuntamentiCliente = useMemo(() => {
    if (!cliente) return [];

    return appuntamenti.filter(
      (app) =>
        app.cliente.trim().toLowerCase() === cliente.nome.trim().toLowerCase()
    );
  }, [appuntamenti, cliente]);

  const movimentiCliente = useMemo(() => {
    if (!cliente) return [];

    return movimenti.filter((movimento) =>
      movimento.descrizione.toLowerCase().includes(cliente.nome.trim().toLowerCase())
    );
  }, [movimenti, cliente]);

  const totaleSpeso = useMemo(() => {
    return movimentiCliente.reduce((totale, movimento) => totale + movimento.importo, 0);
  }, [movimentiCliente]);

  const ultimoAppuntamento = appuntamentiCliente[0];
  const ultimoMovimento = movimentiCliente[0];

  const statoUltimoAppuntamento = useMemo(() => {
    if (!ultimoAppuntamento) return 'Nessuno';
    if (ultimoAppuntamento.incassato) return 'Incassato';
    if (ultimoAppuntamento.completato) return 'Completato';
    return 'In agenda';
  }, [ultimoAppuntamento]);

  if (!cliente) {
    return (
      <View style={styles.container}>
        <Text style={styles.overline}>SALON PRO</Text>
        <Text style={styles.title}>Scheda cliente</Text>

        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Cliente non trovato</Text>
          <Text style={styles.emptyText}>
            Questo cliente non è più disponibile nella rubrica.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.overline}>SALON PRO</Text>
      <Text style={styles.title}>Scheda cliente</Text>
      <Text style={styles.subtitle}>
        Storico completo del cliente con appuntamenti e incassi.
      </Text>

      <View style={styles.heroCard}>
        <Text style={styles.clientName}>{cliente.nome}</Text>
        <Text style={styles.clientPhone}>{cliente.telefono}</Text>
        <Text style={styles.clientNote}>
          {cliente.nota?.trim() ? cliente.nota : 'Nessuna nota disponibile'}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{appuntamentiCliente.length}</Text>
          <Text style={styles.statLabel}>Visite</Text>
        </View>

        <View style={styles.statCardLast}>
          <Text style={styles.statNumber}>€ {totaleSpeso.toFixed(2)}</Text>
          <Text style={styles.statLabel}>Totale speso</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Ultimo servizio</Text>
        <Text style={styles.infoValue}>
          {ultimoAppuntamento ? ultimoAppuntamento.servizio : 'Nessun servizio registrato'}
        </Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.infoMiniTitle}>Ultimo importo</Text>
          <Text style={styles.infoMiniValue}>
            {ultimoMovimento ? `€ ${ultimoMovimento.importo.toFixed(2)}` : '—'}
          </Text>
        </View>

        <View style={styles.statCardLast}>
          <Text style={styles.infoMiniTitle}>Stato appuntamento</Text>
          <Text style={styles.infoMiniValue}>{statoUltimoAppuntamento}</Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Storico appuntamenti</Text>

        {appuntamentiCliente.length > 0 ? (
          appuntamentiCliente.map((app) => (
            <View key={app.id} style={styles.historyItem}>
              <Text style={styles.historyMain}>
                {formatDateLabel((app as any).data)} · {app.ora}
              </Text>
              <Text style={styles.historySub}>
                {app.servizio} · € {app.prezzo.toFixed(2)}
              </Text>
              <Text style={styles.historyMeta}>
                {app.incassato
                  ? 'Incassato'
                  : app.completato
                  ? 'Completato'
                  : 'In agenda'}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySectionText}>Nessun appuntamento registrato.</Text>
        )}
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Storico incassi</Text>

        {movimentiCliente.length > 0 ? (
          movimentiCliente.map((movimento) => (
            <View key={movimento.id} style={styles.historyItem}>
              <Text style={styles.historyMain}>{movimento.descrizione}</Text>
              <Text style={styles.historySub}>€ {movimento.importo.toFixed(2)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptySectionText}>Nessun incasso registrato.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f6f3',
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 140,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#8a8a8a',
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#111111',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b6b6b',
    lineHeight: 22,
    marginBottom: 18,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  clientName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
  },
  clientPhone: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
  },
  clientNote: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  statCardLast: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '700',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111111',
    lineHeight: 22,
  },
  infoMiniTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    marginBottom: 6,
  },
  infoMiniValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 12,
  },
  historyItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#d8e4f3',
  },
  historyMain: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 4,
  },
  historySub: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 4,
  },
  historyMeta: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    marginTop: 10,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
  emptySectionText: {
    fontSize: 14,
    color: '#666666',
    lineHeight: 20,
  },
});
