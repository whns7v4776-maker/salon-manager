import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "../components/ui/ios-simple-touchable";

const SITE_URL = 'https://salonpro.dev';
const SUPPORT_URL = `${SITE_URL}/support`;
const PRIVACY_URL = `${SITE_URL}/privacy`;

const features = [
  {
    title: 'Agenda del salone',
    body:
      'Organizza appuntamenti, servizi, clienti e disponibilità giornaliera in un back office pensato per parrucchieri, barbieri e centri beauty.',
  },
  {
    title: 'Area cliente',
    body:
      'I clienti possono collegarsi al salone, prenotare, consultare i propri appuntamenti e ricevere aggiornamenti operativi.',
  },
  {
    title: 'Notifiche utili',
    body:
      'Promemoria, conferme e modifiche aiutano salone e cliente a restare allineati senza messaggi dispersi.',
  },
];

export default function MarketingScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.hero}>
        <Text style={styles.kicker}>SalonPro</Text>
        <Text style={styles.title}>Gestionale appuntamenti per saloni e clienti</Text>
        <Text style={styles.subtitle}>
          SalonPro aiuta i saloni a gestire agenda, clienti e prenotazioni, offrendo ai clienti
          un accesso semplice per seguire i propri appuntamenti.
        </Text>
        <View style={styles.linkRow}>
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={() => Linking.openURL(SUPPORT_URL)}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Supporto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.78}
            onPress={() => Linking.openURL(PRIVACY_URL)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Privacy</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.infoBand}>
        <Text style={styles.infoTitle}>Pensata per il lavoro quotidiano</Text>
        <Text style={styles.infoBody}>
          L’app mette al centro i flussi più frequenti: consultare l’agenda, registrare clienti,
          gestire servizi, seguire le prenotazioni e ridurre gli scambi manuali.
        </Text>
      </View>

      <View style={styles.featureGrid}>
        {features.map((feature) => (
          <View key={feature.title} style={styles.featureCard}>
            <Text style={styles.featureTitle}>{feature.title}</Text>
            <Text style={styles.featureBody}>{feature.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Sito ufficiale: {SITE_URL}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f7f8f5',
  },
  content: {
    width: '100%',
    maxWidth: 980,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 56,
    paddingBottom: 64,
  },
  hero: {
    marginBottom: 28,
  },
  kicker: {
    color: '#7c5d31',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#111827',
    fontSize: 44,
    fontWeight: '900',
    lineHeight: 50,
    marginBottom: 14,
    maxWidth: 820,
  },
  subtitle: {
    color: '#475569',
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 760,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 24,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: '#111827',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 48,
    borderColor: '#d6d3ca',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  secondaryButtonText: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '900',
  },
  infoBand: {
    backgroundColor: '#ffffff',
    borderColor: '#e7e1d7',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
    marginBottom: 18,
  },
  infoTitle: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
  },
  infoBody: {
    color: '#4b5563',
    fontSize: 16,
    lineHeight: 25,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  featureCard: {
    flexGrow: 1,
    flexBasis: 260,
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderRadius: 8,
    borderWidth: 1,
    padding: 20,
  },
  featureTitle: {
    color: '#111827',
    fontSize: 19,
    fontWeight: '900',
    marginBottom: 8,
  },
  featureBody: {
    color: '#4b5563',
    fontSize: 15,
    lineHeight: 23,
  },
  footer: {
    marginTop: 24,
  },
  footerText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '700',
  },
});
