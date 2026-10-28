import React from 'react';
import { MetaMeasurementPreferences } from '../components/meta-measurement-preferences';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

const SUPPORT_EMAIL = 'salon.pro.app13@gmail.com';

const sections = [
  {
    "title": "Chi gestisce SalonPro e come contattarci",
    "body": "Marzilio Muscatello, persona fisica, gestisce SalonPro ed è titolare del trattamento per la gestione del servizio, degli account, dell’assistenza e della sicurezza della piattaforma. Contatto privacy: salon.pro.app13@gmail.com. Per una richiesta indica il salone e l’account interessati, senza inviare password, carte o documenti non richiesti."
  },
  {
    "title": "Il ruolo del salone",
    "body": "Il singolo salone decide come gestire la propria rubrica, gli appuntamenti, le note e le iniziative rivolte ai clienti: per queste attività è titolare del trattamento. SalonPro mette a disposizione gli strumenti tecnici ed elabora questi dati per conto del salone. L’identità e i recapiti del salone sono presenti nella sua scheda; puoi chiedergli la sua informativa e i criteri di conservazione applicati alla rubrica. Le responsabilità dipendono dalle attività effettivamente svolte e non vengono trasferite al cliente che usa l’app."
  },
  {
    "title": "Quali dati vengono trattati",
    "body": "Account e contatti: nome, cognome, email, numero di telefono, eventuale profilo Instagram e credenziali di accesso. Gestione del salone: appuntamenti, servizi, operatori, preferenze, storico, note inserite dal salone, pacchetti, punti, gift card e ordini, quando utilizzati. Dati tecnici: identificativi dell’installazione, versione dell’app, sistema operativo, stato dei permessi, token per le notifiche e informazioni necessarie a sicurezza e assistenza. I dati possono essere forniti direttamente dall’utente oppure dal salone. Le note libere non devono contenere informazioni sulla salute o altri dati particolari non necessari; se il salone ha necessità di trattarli deve individuare le condizioni previste dalla legge e informare il cliente."
  },
  {
    "title": "Perché usiamo i dati e su quali basi",
    "body": "Per creare e gestire l’account, eseguire prenotazioni e richieste, fornire assistenza e le funzioni richieste, il trattamento si fonda sull’esecuzione del contratto o di misure precontrattuali (art. 6.1.b GDPR). Gli adempimenti imposti dalla legge si fondano sull’art. 6.1.c. La prevenzione di abusi, la protezione degli accessi e la gestione di contestazioni si fondano sul legittimo interesse alla sicurezza e alla tutela dei diritti (art. 6.1.f), tenendo conto dei diritti degli interessati. Le funzioni facoltative descritte sotto si attivano in base alle scelte e ai consensi applicabili. Il salone deve individuare la base giuridica delle attività che decide autonomamente, comprese eventuali comunicazioni commerciali."
  },
  {
    "title": "Dati necessari e funzioni facoltative",
    "body": "I dati indicati come obbligatori nei moduli servono a identificare l’account, verificare i recapiti e gestire il servizio: senza quelli necessari non possiamo completare l’operazione richiesta. Instagram e gli altri campi indicati come facoltativi possono essere lasciati vuoti. Il rifiuto della misurazione pubblicitaria o dei permessi facoltativi non impedisce di usare le funzioni principali. La consultazione dell’informativa non equivale al consenso per pubblicità o altri trattamenti facoltativi."
  },
  {
    "title": "Dove vengono conservati e chi può riceverli",
    "body": "Il database principale di SalonPro è ospitato da Supabase nella regione AWS eu-west-1, Irlanda, Unione europea. Questo non significa che ogni trattamento avvenga esclusivamente nell’UE: assistenza, servizi tecnici e relativi subfornitori possono operare anche in altri Paesi. Sono utilizzati Supabase per database, autenticazione e archiviazione; Vercel per il sito web; Expo e i servizi Apple/Google per aggiornamenti e notifiche; Resend per email operative; Apple/Google e RevenueCat per gli abbonamenti in app; Stripe per i pagamenti gestiti tramite la sua infrastruttura. Meta è coinvolta solo nella misurazione facoltativa descritta sotto. Questi servizi ricevono i dati necessari alla propria funzione, non indistintamente l’intera rubrica. Quando avvengono trasferimenti fuori dallo Spazio economico europeo si applicano, secondo il servizio e il destinatario, decisioni di adeguatezza o garanzie come le clausole contrattuali standard; puoi richiedere informazioni sui destinatari e sulle garanzie al contatto privacy. I dati non vengono venduti."
  },
  {
    "title": "Per quanto tempo vengono conservati",
    "body": "Account e profili restano disponibili per la durata dell’account e del servizio richiesto, fino alla cancellazione, salvo dati che devono essere mantenuti per obblighi di legge o per una contestazione concreta. Disinstallare l’app o non accedere non equivale a cancellare l’account. Rubrica, appuntamenti, ordini e movimenti gestiti per conto di un salone seguono le istruzioni e gli obblighi di quel salone: la chiusura dell’account cliente non comporta automaticamente la cancellazione di documenti o registrazioni che il salone è tenuto a conservare. I dati di assistenza e sicurezza vengono mantenuti nella misura necessaria a gestire la richiesta o l’evento e gli eventuali obblighi o diritti collegati. Le sessioni di verifica del cliente per le funzioni di pagamento hanno validità massima di sette giorni e decadono in caso di modifica delle relative credenziali. Le copie tecniche di backup e i dati trattati autonomamente dai fornitori seguono i relativi cicli di conservazione; una richiesta di cancellazione non implica l’eliminazione istantanea di ogni copia. Puoi chiedere quali criteri e obblighi si applicano ai tuoi dati prima di richiederne la cancellazione."
  },
  {
    "title": "Notifiche e comunicazioni del salone",
    "body": "I permessi del dispositivo consentono l’invio di notifiche, per esempio per conferme, promemoria, modifiche o cancellazioni. La piattaforma permette anche comunicazioni del salone: contenuti, destinatari e base giuridica sono responsabilità del salone. Il permesso di ricevere notifiche non sostituisce il consenso per comunicazioni commerciali quando questo è richiesto. Puoi gestire i permessi nelle impostazioni del dispositivo e chiedere al salone di interrompere i messaggi commerciali. Disattivare le notifiche non cancella prenotazioni o account."
  },
  {
    "title": "Posizione e promemoria facoltativi",
    "body": "La posizione, se consentita, serve a cercare saloni vicini o impostare la sede del salone. I normali promemoria prima dell’appuntamento possono funzionare senza GPS. Il controllo aggiuntivo della distanza prima dell’appuntamento, quando abilitato, avviene solo mentre l’app è aperta, nella finestra prevista vicino all’appuntamento: non manteniamo il GPS attivo in background per seguire il cliente. Le coordinate possono essere trasmesse al server per calcolare la distanza; non viene conservata una cronologia degli spostamenti. Lo stato della funzione e le informazioni temporanee del controllo sono gestiti separatamente dalla posizione della sede, che resta associata al salone. Puoi revocare il permesso dal dispositivo e disattivare la funzione dalle impostazioni cliente."
  },
  {
    "title": "Misurazione pubblicitaria Meta, solo se autorizzata",
    "body": "Nelle versioni dell’app che includono la funzione, solo dopo il consenso facoltativo, e su iPhone anche dopo il permesso di tracciamento di iOS, il SDK Meta invia eventi di installazione, apertura e nuova registrazione del titolare, insieme a identificativi pubblicitari e dati tecnici del dispositivo. Non aggiungiamo agli eventi nomi, email, telefoni, dati dei clienti o appuntamenti. Non attiviamo la raccolta automatica di acquisti o prove gratuite. Puoi rifiutare senza limitare il servizio e revocare dalle preferenze presenti in questa pagina o nelle impostazioni: la revoca interrompe i nuovi eventi, senza cancellare quelli già inviati o in trasmissione. Questa integrazione non include un pixel sul sito web. Informativa Meta: https://www.facebook.com/privacy/policy/."
  },
  {
    "title": "Pagamenti e abbonamenti",
    "body": "Quando utilizzi un pagamento Stripe, i dati della carta vengono gestiti tramite l’infrastruttura di Stripe: SalonPro non conserva il numero completo della carta o il codice di sicurezza. Il servizio conserva gli identificativi e gli esiti necessari a collegare il pagamento all’operazione. Per gli acquisti in app, Apple o Google gestiscono il pagamento e RevenueCat supporta la verifica dell’abbonamento. I dati gestiti autonomamente da questi soggetti sono descritti nelle loro informative."
  },
  {
    "title": "I tuoi diritti e come esercitarli",
    "body": "Puoi chiedere accesso, rettifica, cancellazione, limitazione e, nei casi previsti, portabilità dei dati e opposizione al trattamento, compresa l’opposizione al marketing diretto. Puoi revocare un consenso senza pregiudicare la liceità dei trattamenti precedenti. Scrivi a salon.pro.app13@gmail.com; per i dati gestiti dal salone puoi rivolgerti anche direttamente al salone. Rispondiamo alle richieste senza ingiustificato ritardo e di norma entro un mese, con le eventuali proroghe motivate consentite dal GDPR. Può essere necessario verificare l’identità in modo proporzionato. Hai diritto di presentare un reclamo al Garante per la protezione dei dati personali, www.garanteprivacy.it, o all’autorità di controllo competente."
  },
  {
    "title": "Informative dei fornitori e aggiornamenti",
    "body": "Per maggiori informazioni sui fornitori: Supabase https://supabase.com/privacy e https://supabase.com/legal; Vercel https://vercel.com/legal/privacy-policy; Expo https://expo.dev/privacy; Resend https://resend.com/legal/privacy-policy; RevenueCat https://www.revenuecat.com/privacy/; Stripe https://stripe.com/privacy; Apple https://www.apple.com/legal/privacy/; Google https://policies.google.com/privacy. Questa informativa riguarda app e sito SalonPro. Gli aggiornamenti sono pubblicati qui con la relativa data; le funzioni che richiedono consenso restano soggette a una scelta distinta."
  }
];

export default function PrivacyScreen() {
  const router = useRouter();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        {Platform.OS !== 'web' && <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/welcome')} style={{ paddingVertical: 12 }}><Text>‹ Indietro</Text></Pressable>}
        <Text style={styles.kicker}>SalonPro</Text>
        <Text style={styles.title}>Privacy Policy</Text>
        <Text style={styles.updated}>Ultimo aggiornamento: 17 ottobre 2026</Text>
        <Text style={styles.intro}>
          Questa informativa descrive come SalonPro tratta i dati personali usati per la gestione
          degli appuntamenti tra saloni e clienti.
        </Text>
      </View>

      <MetaMeasurementPreferences />
      <View style={styles.card}>
        {sections.map((section, index) => (
          <View
            key={section.title}
            style={[styles.section, index === sections.length - 1 && styles.sectionLast]}
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
    backgroundColor: '#f8f6f2',
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
    color: '#8f6a38',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  title: {
    color: '#171411',
    fontSize: 42,
    fontWeight: '900',
    lineHeight: 48,
    marginBottom: 10,
  },
  updated: {
    color: '#74695f',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 18,
  },
  intro: {
    color: '#413a34',
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 720,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#eee5da',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 8,
  },
  section: {
    borderBottomColor: '#f0e9df',
    borderBottomWidth: 1,
    paddingVertical: 20,
  },
  sectionLast: {
    borderBottomWidth: 0,
  },
  sectionTitle: {
    color: '#1f1a16',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionBody: {
    color: '#514940',
    fontSize: 16,
    lineHeight: 24,
  },
});
