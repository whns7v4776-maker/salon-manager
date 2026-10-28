import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "../components/ui/ios-simple-touchable";

const SUPPORT_EMAIL = 'salon.pro.app13@gmail.com';
const INSTAGRAM_HANDLE = '@salonpro13';
const INSTAGRAM_DIRECT_URL = 'https://ig.me/m/salonpro13';
const SITE_URL = 'https://salonpro.dev';
const SUPPORT_URL = `${SITE_URL}/support`;
const PRIVACY_URL = `${SITE_URL}/privacy`;

const contactSections = [
  {
    title: 'Assistenza app',
    body:
      'Per problemi di accesso, notifiche, prenotazioni o gestione del salone, scrivi indicando email usata e codice salone se disponibile.',
  },
  {
    title: 'Appuntamenti',
    body:
      'Per richieste urgenti su orari o servizi già prenotati, contatta anche direttamente il salone collegato.',
  },
  {
    title: 'Privacy',
    body:
      'Per richieste sui dati personali puoi usare lo stesso contatto ufficiale. La Privacy Policy resta disponibile nella pagina dedicata.',
  },
];

export default function ContattiScreen() {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>SalonPro</Text>
        <Text style={styles.title}>Contatti</Text>
        <Text style={styles.intro}>
          Canali ufficiali per assistenza clienti, saloni e richieste operative collegate
          {"all'app"}.
        </Text>
      </View>

      <View style={styles.contactCard}>
        <Text style={styles.contactLabel}>Email supporto</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          style={styles.primaryLink}
        >
          <Text style={styles.primaryLinkText}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>

        <Text style={styles.contactLabel}>Instagram Direct</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => Linking.openURL(INSTAGRAM_DIRECT_URL)}
          style={styles.instagramLink}
        >
          <Text style={styles.instagramLinkText}>{INSTAGRAM_HANDLE}</Text>
        </TouchableOpacity>
        <Text style={styles.contactNote}>
          Non inviare password, dati bancari o informazioni sensibili tramite Instagram.
        </Text>

        <View style={styles.linkRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => Linking.openURL(SUPPORT_URL)}
            style={styles.secondaryLink}
          >
            <Text style={styles.secondaryLinkText}>Supporto</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => Linking.openURL(PRIVACY_URL)}
            style={styles.secondaryLink}
          >
            <Text style={styles.secondaryLinkText}>Privacy</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.card}>
        {contactSections.map((section, index) => (
          <View
            key={section.title}
            style={[styles.section, index === contactSections.length - 1 && styles.sectionLast]}
          >
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f8fb',
  },
  content: {
    width: '100%',
    maxWidth: 860,
    alignSelf: 'center',
    paddingHorizontal: 22,
    paddingTop: 56,
    paddingBottom: 64,
  },
  header: {
    marginBottom: 24,
  },
  kicker: {
    color: '#0f766e',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
    marginBottom: 12,
  },
  intro: {
    color: '#475569',
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 720,
  },
  contactCard: {
    backgroundColor: '#ffffff',
    borderColor: '#ccfbf1',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 18,
    padding: 22,
  },
  contactLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  primaryLink: {
    justifyContent: 'center',
    marginBottom: 18,
    minHeight: 46,
  },
  primaryLinkText: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  linkRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  instagramLink: {
    justifyContent: 'center',
    minHeight: 42,
  },
  instagramLinkText: {
    color: '#c026d3',
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 24,
  },
  contactNote: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
  },
  secondaryLink: {
    borderColor: '#99f6e4',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 42,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  secondaryLinkText: {
    color: '#0f766e',
    fontSize: 15,
    fontWeight: '800',
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  section: {
    borderBottomColor: '#eef2f7',
    borderBottomWidth: 1,
    paddingVertical: 20,
  },
  sectionLast: {
    borderBottomWidth: 0,
  },
  sectionTitle: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionBody: {
    color: '#475569',
    fontSize: 16,
    lineHeight: 24,
  },
});
