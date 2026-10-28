import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
export default function SalonPaymentReturn() {
 const { result } = useLocalSearchParams<{ result?: string }>();
 return <View style={styles.page}><View style={styles.card}>
  <Text style={styles.brand}>SalonPro</Text>
  <Text style={styles.title}>Pagamento al salone</Text>
  <Text style={styles.text}>{result === 'connected' ? 'Collegamento completato. Torna alla Cassa e premi Verifica collegamento.' : result === 'error' ? 'Collegamento non completato. Torna alla Cassa e verifica lo stato prima di riprovare.' : 'Puoi tornare alla Cassa del salone per verificare lo stato del pagamento.'}</Text>
  <Text style={styles.note}>Il salone riceverà la conferma direttamente da Stripe. Puoi chiudere questa pagina.</Text>
 </View></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f4f7fc', justifyContent: 'center', padding: 24 }, card: { alignSelf: 'center', width: '100%', maxWidth: 480, padding: 32, borderRadius: 24, backgroundColor: 'white', gap: 20 }, brand: { fontSize: 18, fontWeight: '800', color: '#45689c' }, title: { fontSize: 28, fontWeight: '800', color: '#13213a' }, text: { fontSize: 17, lineHeight: 26, color: '#42526c' }, note: { fontSize: 14, lineHeight: 22, color: '#6c7990' } });
