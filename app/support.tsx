import { NativeMedal } from '../components/owner-premium-native-home';
import { useAccessAppearance } from '../components/access-premium';
import { Ionicons } from '@expo/vector-icons';
import { NativeReadableText as Text } from '../components/owner-native-premium';
import { useSettingsWebStyles } from '../components/settings-web-styles';
import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "../components/ui/ios-simple-touchable";

const SUPPORT_EMAIL = 'salon.pro.app13@gmail.com';
const INSTAGRAM_HANDLE = '@salonpro13';
const INSTAGRAM_DIRECT_URL = 'https://ig.me/m/salonpro13';
const SITE_URL = 'https://salonpro.dev';
const MARKETING_URL = `${SITE_URL}/marketing`;
const PRIVACY_URL = `${SITE_URL}/privacy`;

const supportItems = [
  {
    title: 'Assistenza clienti e saloni',
    body:
      'Per richieste sull’accesso, registrazione, prenotazioni, notifiche o gestione del salone, scrivi al supporto indicando il codice salone e l’email usata nell’app.',
  },
  {
    title: 'Richieste sugli appuntamenti',
    body:
      'Per modifiche urgenti a un appuntamento, contatta anche direttamente il salone collegato: SalonPro gestisce il canale digitale, ma il servizio resta del salone.',
  },
  {
    title: 'Privacy e dati',
    body:
      'Per richieste di accesso, rettifica o cancellazione dei dati personali puoi scrivere allo stesso indirizzo di supporto. La Privacy Policy pubblica è disponibile sul sito.',
  },
];

export default function SupportScreen({embedded=false}:{embedded?:boolean}={}) {
 const styles=useSettingsWebStyles(baseSupportStyles);
 const {palette:p}=useAccessAppearance();
 if(embedded){
  // Back office: same glass rows and medallions as the rest of Impostazioni.
  const glass={borderRadius:18,borderWidth:1,borderColor:p.night?p.border:'rgba(122,100,70,.2)',backgroundColor:p.night?'rgba(38,41,43,.92)':'rgba(255,253,250,.9)',overflow:'hidden' as const};
  const links:[string,string,string,string,[string,string],string?][]=[
   ['mail-outline','Email',SUPPORT_EMAIL,`mailto:${SUPPORT_EMAIL}`,['#D99A92','#A35A52']],
   ['logo-instagram','Instagram Direct',INSTAGRAM_HANDLE,INSTAGRAM_DIRECT_URL,['#D69AB0','#9A4F67'],'Non inviare password, dati bancari o informazioni sensibili tramite Instagram.'],
   ['globe-outline','Sito',SITE_URL.replace('https://',''),SITE_URL,['#9DBAD6','#4D6E8F']],
   ['shield-checkmark-outline','Privacy Policy','Come trattiamo i dati',PRIVACY_URL,['#86C2BE','#3E7C7A']],
   ['megaphone-outline','Pagina marketing','Materiali e presentazione',MARKETING_URL,['#D6B27A','#8C6A35']],
  ];
  return <View style={{gap:16}}>
   <Text style={{fontSize:14,lineHeight:22,color:p.muted}}>I contatti ufficiali per assistenza sull’app SalonPro e sui servizi collegati.</Text>
   <View {...{dataSet:{supportContactLinks:'true'}}} style={glass}>{links.map(([icon,label,value,url,accent,note],index)=><TouchableOpacity key={label} activeOpacity={0.75} accessibilityRole="link" accessibilityLabel={label} onPress={()=>Linking.openURL(url)} style={{alignSelf:'stretch',width:'100%',flexDirection:'row',alignItems:'center',gap:14,paddingVertical:14,paddingHorizontal:16,borderTopWidth:index?1:0,borderTopColor:p.line}}><NativeMedal icon={icon as any} size={40} iconSize={18} accent={accent[p.night?0:1]}/><View style={{flex:1,minWidth:0,gap:2}}><Text style={{fontSize:13,color:p.muted}}>{label}</Text><Text style={{fontSize:15,fontWeight:'600',color:p.ink}}>{value}</Text>{note?<Text style={{fontSize:12,lineHeight:17,color:p.muted}}>{note}</Text>:null}</View><Ionicons name="open-outline" size={17} color={p.muted}/></TouchableOpacity>)}</View>
   <View style={[glass,{padding:16,gap:14}]}>{supportItems.map((item,index)=><View key={item.title} style={{gap:5,paddingTop:index?14:0,borderTopWidth:index?1:0,borderTopColor:p.line}}><Text style={{fontSize:15,fontWeight:'600',color:p.ink}}>{item.title}</Text><Text style={{fontSize:13,lineHeight:20,color:p.muted}}>{item.body}</Text></View>)}</View>
  </View>;
 }
  const content=(<View style={[styles.content,embedded&&{padding:0,paddingBottom:0}]}>
      <View style={styles.header}>
        <Text style={styles.kicker}>SalonPro</Text>
        <Text style={styles.title}>Supporto</Text>
        <Text style={styles.intro}>
          Qui trovi i contatti ufficiali per assistenza sull’app SalonPro e sui servizi collegati.
        </Text>
      </View>

      <View {...{dataSet:{supportContactLinks:"true"}}} style={styles.contactCard}>
        <Text style={styles.contactLabel}>Email</Text>
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

        <Text style={styles.contactLabel}>Sito</Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => Linking.openURL(SITE_URL)}
          style={styles.secondaryLink}
        >
          <Text style={styles.secondaryLinkText}>{SITE_URL}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => Linking.openURL(PRIVACY_URL)}
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => Linking.openURL(MARKETING_URL)}
          style={styles.privacyLink}
        >
          <Text style={styles.privacyLinkText}>Pagina marketing</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {supportItems.map((item, index) => (
          <View
            key={item.title}
            style={[styles.section, index === supportItems.length - 1 && styles.sectionLast]}
          >
            <Text style={styles.sectionTitle}>{item.title}</Text>
            <Text style={styles.sectionBody}>{item.body}</Text>
          </View>
        ))}
      </View>
    </View>);
  return embedded?content:<ScrollView style={styles.screen} showsVerticalScrollIndicator={false}>{content}</ScrollView>;
}

const baseSupportStyles = StyleSheet.create({
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
    color: '#2563eb',
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
    borderColor: '#dbeafe',
    borderRadius: 8,
    borderWidth: 1,
    padding: 22,
    marginBottom: 18,
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
    minHeight: 46,
    justifyContent: 'center',
    marginBottom: 18,
  },
  primaryLinkText: {
    color: '#0f172a',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  secondaryLink: {
    minHeight: 42,
    justifyContent: 'center',
  },
  instagramLink: {
    minHeight: 42,
    justifyContent: 'center',
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
  secondaryLinkText: {
    color: '#2563eb',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 24,
  },
  privacyLink: {
    marginTop: 10,
    minHeight: 34,
    justifyContent: 'center',
  },
  privacyLinkText: {
    color: '#2563eb',
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
