import {NativePremiumScope,NativeReadableText as Text} from './owner-native-premium';
import { AccessAppearanceProvider, useAccessAppearance } from './access-premium';
import { popupGlass } from './premium-web-surfaces';
import { WebPagePortal } from './ui/web-page-portal';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Platform,
    ScrollView,
    StyleSheet,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
import { haptic } from '../src/lib/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';

const IS_ANDROID = Platform.OS === 'android';
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;

// The Android tour uses one native release event, without press-in feedback or
// animated touch wrappers. Other platforms keep their original touch behavior.
function GuideButton(props: React.ComponentProps<typeof HapticTouchable>) {
  if (!IS_ANDROID) return <HapticTouchable {...props} />;
  const { immediatePress, hapticType, pressInHapticType, ...buttonProps } = props;
  return <TouchableOpacity {...buttonProps} delayPressIn={0} />;
}


type GuideRow = { label: string; value: string };
export type OnboardingStepVisual = 'welcome' | 'services' | 'roles' | 'operators' | 'clients' | 'qr' | 'agenda' | 'booking' | 'hours' | 'exceptions' | 'interval' | 'public' | 'requests' | 'guided' | 'automatic' | 'cash' | 'final';
type OnboardingStep = {
  key: string;
  title: string;
  body: string;
  cta: string;
  visual: OnboardingStepVisual;
  section: string;
  path: string;
  screen: string;
  rows: GuideRow[];
  instructions: string[];
  tip: string;
};
type OnboardingModalProps = {
  visible: boolean;
  allowSkip?: boolean;
  onClose: () => void | Promise<void>;
  onComplete: () => void | Promise<void>;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    "key": "welcome",
    "title": "Benvenuto in SalonPro",
    "body": "In pochi passi prepariamo il tuo salone, dal listino alla prima prenotazione online.",
    "cta": "Inizia la guida",
    "visual": "welcome",
    "section": "Si parte",
    "path": "Home · Servizi · Clienti · Agenda · Richieste",
    "screen": "Il tuo salone, pronto a partire",
    "rows": [
      {
        "label": "01",
        "value": "Identità, listino e team"
      },
      {
        "label": "02",
        "value": "Clienti, Agenda e orari"
      },
      {
        "label": "03",
        "value": "Prenotazioni online e cassa"
      }
    ],
    "instructions": [
      "Ogni passo ti mostra dove si trova una funzione e come usarla.",
      "Gli esempi sono illustrativi: inserirai i dati reali del tuo salone una volta entrato."
    ],
    "tip": "Puoi saltare la guida in qualsiasi momento con Salta e rivederla dalle Impostazioni."
  },
  {
    "key": "salon-logo",
    "title": "Il logo del tuo salone",
    "body": "Personalizza la targhetta che ti identifica e che vedono anche i clienti, con o senza l’aiuto dell’IA.",
    "cta": "Avanti",
    "visual": "welcome",
    "section": "La tua identità",
    "path": "Home → Logo e targhetta → Logo · IA",
    "screen": "Logo e targhetta",
    "rows": [
      {
        "label": "Nome salone",
        "value": "Scritta, font e finitura"
      },
      {
        "label": "Logo · IA",
        "value": "Carica e migliora il tuo logo"
      },
      {
        "label": "Metallo",
        "value": "Finitura della targhetta"
      }
    ],
    "instructions": [
      "Nella Home apri Logo e targhetta e scegli Logo · IA, poi carica una foto o uno screenshot del logo e regola il ritaglio senza tagliare lettere o simboli.",
      "Se il logo è già nitido scegli Usa originale; altrimenti seleziona Elabora con IA e premi Crea con IA per ripulire sfondo e dettagli.",
      "Controlla lettere, simboli e colori dell’anteprima, scegli la finitura e premi Salva solo quando il risultato ti convince."
    ],
    "tip": "Il ritaglio elaborato con l’IA viene inviato a OpenAI: sono previste fino a 3 prove al giorno e annullare una creazione non restituisce il tentativo. Con Nome salone personalizzi solo la scritta, senza IA."
  },
  {
    "key": "services",
    "title": "Crea il tuo listino",
    "body": "I servizi sono la base di appuntamenti e disponibilità: dai singoli trattamenti ai percorsi in più fasi.",
    "cta": "Avanti",
    "visual": "services",
    "section": "Listino e team",
    "path": "Servizi → Aggiungi servizio",
    "screen": "Aggiungi servizio",
    "rows": [
      {
        "label": "Nome",
        "value": "Taglio"
      },
      {
        "label": "Durata",
        "value": "30 min"
      },
      {
        "label": "Prezzo",
        "value": "25 €"
      }
    ],
    "instructions": [
      "Apri Servizi, scegli Aggiungi servizio e inserisci nome, durata e prezzo.",
      "Associa il mestiere richiesto e salva.",
      "Per trattamenti con più fasi scegli Composizione: collega i servizi nell’ordine di esecuzione e indica pose e pause."
    ],
    "tip": "Scegli durate compatibili con il passo dell’Agenda: SalonPro ti avvisa se non lo sono. Durante la posa l’operatore può restare libero per altri clienti."
  },
  {
    "key": "team",
    "title": "Il tuo team",
    "body": "I mestieri collegano i servizi alle persone che sanno eseguirli.",
    "cta": "Avanti",
    "visual": "operators",
    "section": "Listino e team",
    "path": "Servizi → Aggiungi operatore",
    "screen": "Aggiungi operatore",
    "rows": [
      {
        "label": "Nome",
        "value": "Giulia"
      },
      {
        "label": "Mestiere",
        "value": "Parrucchiere"
      },
      {
        "label": "Servizi gestiti",
        "value": "Taglio · Piega"
      }
    ],
    "instructions": [
      "Nel campo del mestiere scegli una proposta oppure tocca + Crea nuovo mestiere.",
      "Aggiungi ogni operatore con nome, mestiere ed eventuale foto.",
      "Scegli i servizi che gestisce e i suoi giorni e orari di disponibilità, poi salva."
    ],
    "tip": "Ogni operatore ha la sua corsia in Agenda e le disponibilità online rispettano le sue competenze."
  },
  {
    "key": "clients",
    "title": "La rubrica clienti",
    "body": "Tutti i contatti del salone in un unico posto, con i nuovi clienti in evidenza.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Clienti",
    "path": "Clienti → Nuovo cliente",
    "screen": "Nuovo cliente",
    "rows": [
      {
        "label": "Nome",
        "value": "Sofia"
      },
      {
        "label": "Cognome",
        "value": "Rossi"
      },
      {
        "label": "Contatti",
        "value": "Telefono · Email"
      }
    ],
    "instructions": [
      "Apri Clienti, tocca Nuovo cliente, compila i dati e salva la scheda.",
      "I clienti che si registrano da soli compaiono come Nuovo cliente: aprendo la loro card li segni come letti."
    ],
    "tip": "La scheda creata dal salone e l’account personale del cliente sono due cose diverse: il cliente registra il proprio accesso."
  },
  {
    "key": "customer-rules",
    "title": "Su misura per ogni cliente",
    "body": "Tempi, prezzi e servizi prenotabili possono cambiare da persona a persona.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Clienti",
    "path": "Clienti → Gestisci cliente → Tempi e prezzi · Regole",
    "screen": "Tempi e prezzi · Sofia Rossi",
    "rows": [
      {
        "label": "Durata per Sofia",
        "value": "45 min invece di 30"
      },
      {
        "label": "Prezzo per Sofia",
        "value": "22 € invece di 25"
      },
      {
        "label": "Colore",
        "value": "Non prenotabile online"
      }
    ],
    "instructions": [
      "Apri il menu Gestisci cliente (nell’app anche scorrendo la card verso sinistra) e scegli Tempi e prezzi.",
      "Cerca il servizio e salva la durata o il prezzo dedicati. Per uno sconto, inserisci direttamente il prezzo finale: da 50 € con il 10% salvi 45 €.",
      "In Regole scegli quali servizi il cliente può prenotare online."
    ],
    "tip": "I valori personali valgono per i prossimi appuntamenti, in Agenda e online: quelli già creati non cambiano. Escludere un servizio esclude anche le composizioni che lo richiedono."
  },
  {
    "key": "invite",
    "title": "Fatti trovare dai clienti",
    "body": "I clienti collegano il tuo salone con il QR o il codice, poi creano il proprio accesso.",
    "cta": "Avanti",
    "visual": "qr",
    "section": "Clienti",
    "path": "Home → QR e codice del salone",
    "screen": "Il tuo salone",
    "rows": [
      {
        "label": "QR del salone",
        "value": "Da esporre o condividere"
      },
      {
        "label": "Codice salone",
        "value": "6 cifre da comunicare"
      },
      {
        "label": "Registrazione",
        "value": "Dati, email e verifica"
      }
    ],
    "instructions": [
      "Dalla Home stampa ed esponi il QR in salone, oppure mostralo e condividilo.",
      "In alternativa comunica il codice del salone: il cliente lo inserisce in Collega il tuo salone.",
      "Il cliente completa la registrazione con i suoi dati e il codice di verifica ricevuto via email."
    ],
    "tip": "Per un cliente già in rubrica, usare gli stessi recapiti aiuta a riconoscere la scheda giusta."
  },
  {
    "key": "agenda",
    "title": "La tua Agenda",
    "body": "Giorni, operatori e appuntamenti in una sola griglia, da leggere e riorganizzare al volo.",
    "cta": "Avanti",
    "visual": "agenda",
    "section": "Agenda",
    "path": "Agenda → Panoramica Settimana",
    "screen": "Panoramica Settimana",
    "rows": [
      {
        "label": "09:00 · Giulia",
        "value": "Sofia · Taglio"
      },
      {
        "label": "09:30 · Giulia",
        "value": "Slot libero"
      },
      {
        "label": "10:00 · Marco",
        "value": "Anna · Piega"
      }
    ],
    "instructions": [
      "Scegli il giorno dalle date o dal calendario; Oggi ti riporta alla giornata corrente. Gli orari scorrono in verticale, gli operatori nelle loro corsie.",
      "Tocca uno slot libero per prenotare: giorno, ora e operatore sono già pronti, scegli cliente e servizio e conferma.",
      "Tocca una card per i dettagli; trascinala per spostarla e usa la maniglia in basso per cambiare la durata."
    ],
    "tip": "Puoi scegliere la vista Auto oppure da 1 a 7 giorni. Se uno spostamento tocca spazi occupati o fasi collegate, SalonPro ti chiede conferma."
  },
  {
    "key": "hours",
    "title": "Orari e disponibilità",
    "body": "La settimana di lavoro decide cosa vedono i clienti quando prenotano.",
    "cta": "Avanti",
    "visual": "hours",
    "section": "Orari e disponibilità",
    "path": "Agenda → Personalizza orari",
    "screen": "Personalizza orari",
    "rows": [
      {
        "label": "Lunedì",
        "value": "09:00 – 18:00"
      },
      {
        "label": "Pausa pranzo",
        "value": "13:00 – 14:00"
      },
      {
        "label": "Formazione",
        "value": "Eccezione · 12 marzo"
      }
    ],
    "instructions": [
      "In Agenda apri Personalizza orari e imposta giorni aperti, entrata, uscita e pausa pranzo.",
      "Per ferie, formazione o chiusure aggiungi un’eccezione: tutto il giorno o una fascia, per il salone o per singoli operatori.",
      "Scegli il passo interno della griglia e, separatamente, ogni quanto proporre gli orari ai clienti online."
    ],
    "tip": "Le giornate con appuntamenti già accettati mantengono il passo precedente. La frequenza online non rende liberi orari occupati, chiusi o in pausa."
  },
  {
    "key": "requests",
    "title": "Le richieste online",
    "body": "Le prenotazioni dei clienti arrivano nella sezione Richieste, pronte da gestire.",
    "cta": "Avanti",
    "visual": "requests",
    "section": "Prenotazioni online",
    "path": "Richieste → Richieste recenti",
    "screen": "Richiesta di prenotazione",
    "rows": [
      {
        "label": "Sofia Rossi",
        "value": "Taglio · 09:00"
      },
      {
        "label": "Stato",
        "value": "In attesa"
      },
      {
        "label": "Azioni",
        "value": "Accetta · Rifiuta"
      }
    ],
    "instructions": [
      "Apri una richiesta e controlla servizio, orario e operatore.",
      "Accettala o rifiutala: il cliente riceve subito l’esito.",
      "Confermate e annullate restano raccolte nelle loro sezioni, con le novità da leggere in evidenza."
    ],
    "tip": "Una richiesta in attesa non è ancora un appuntamento confermato: controllane sempre lo stato."
  },
  {
    "key": "automation",
    "title": "Prenotazioni più intelligenti",
    "body": "Guida i clienti verso gli orari migliori e conferma in automatico le richieste compatibili.",
    "cta": "Avanti",
    "visual": "guided",
    "section": "Prenotazioni online",
    "path": "Richieste → Slot guidati · Accettazione automatica",
    "screen": "Slot guidati",
    "rows": [
      {
        "label": "Strategia",
        "value": "Consigliati intelligenti"
      },
      {
        "label": "Visualizzazione",
        "value": "Consigliati + tutti"
      },
      {
        "label": "Accettazione automatica",
        "value": "Dopo 15 secondi"
      }
    ],
    "instructions": [
      "Attiva gli slot guidati e scegli la strategia: Consigliati intelligenti, Equilibrata, Proteggi lunghi o Riempi buchi.",
      "Decidi cosa vede il cliente: Consigliati + tutti, Prima i consigliati oppure Solo consigliati.",
      "Con Accettazione automatica le richieste compatibili vengono confermate dopo 15 secondi, così hai il tempo di intervenire."
    ],
    "tip": "Solo consigliati limita gli orari mostrati: sceglilo consapevolmente. Le richieste che richiedono una decisione restano da gestire a mano."
  },
  {
    "key": "notifications",
    "title": "Notifiche e promemoria",
    "body": "Salone e clienti restano allineati senza messaggi dispersi.",
    "cta": "Avanti",
    "visual": "requests",
    "section": "Comunicazioni",
    "path": "Richieste · Agenda · Clienti",
    "screen": "Le tue notifiche",
    "rows": [
      {
        "label": "Nuova richiesta",
        "value": "Si apre sulla prenotazione"
      },
      {
        "label": "Cliente",
        "value": "Conferme, modifiche, promemoria"
      },
      {
        "label": "In ritardo",
        "value": "Invia promemoria"
      }
    ],
    "instructions": [
      "Consenti le notifiche: nuove richieste, annullamenti e nuovi clienti ti avvisano anche con app chiusa.",
      "Tocca una notifica per aprire direttamente la richiesta, l’appuntamento o la scheda del cliente.",
      "I clienti ricevono conferme e modifiche e possono attivare il promemoria a 30 minuti; se uno tarda, puoi inviargli un promemoria dalla card dell’appuntamento."
    ],
    "tip": "Il permesso per le notifiche non sostituisce il consenso alle comunicazioni commerciali, quando questo è richiesto."
  },
  {
    "key": "cash",
    "title": "La cassa del tuo salone",
    "body": "Distingui gli incassi confermati dagli importi ancora da saldare.",
    "cta": "Avanti",
    "visual": "cash",
    "section": "Incassi",
    "path": "Cassa",
    "screen": "Cassa",
    "rows": [
      {
        "label": "Periodo",
        "value": "Oggi · Questo mese · Storico"
      },
      {
        "label": "Già ricevuto",
        "value": "Contanti · POS · Bonifico"
      },
      {
        "label": "Stripe",
        "value": "QR e link, se abilitato"
      }
    ],
    "instructions": [
      "Scegli il periodo e registra solo i pagamenti davvero ricevuti: la fine della giornata non conferma un incasso.",
      "Con Stripe controlla lo stato del collegamento: il pagamento viene confermato dal server e in modalità prova non si riceve denaro reale.",
      "I riferimenti carta sono solo annotazioni e non autorizzano addebiti."
    ],
    "tip": "Dalle Impostazioni Cassa puoi nascondere la sezione: i movimenti restano salvati. Per i documenti fiscali configura Ricevute fiscali; in modalità prova non vengono emessi documenti reali."
  },
  {
    "key": "final",
    "title": "Ora tocca al tuo salone",
    "body": "Hai visto tutto il percorso, dalla configurazione alla prima prenotazione.",
    "cta": "Entra nell’app",
    "visual": "final",
    "section": "Pronto a iniziare",
    "path": "Servizi → Agenda → Clienti",
    "screen": "I tuoi primi tre passi",
    "rows": [
      {
        "label": "1 · Servizi",
        "value": "Listino, mestieri e operatori"
      },
      {
        "label": "2 · Agenda",
        "value": "Orari e disponibilità"
      },
      {
        "label": "3 · Clienti",
        "value": "Contatti e QR del salone"
      }
    ],
    "instructions": [
      "Inizia dal listino, poi configura la settimana di lavoro.",
      "Quando sei pronto, condividi il salone con i clienti e controlla le prime richieste."
    ],
    "tip": "In ogni sezione trovi il pulsante informativo per rileggere come funziona."
  }
];

const VISUAL_ICONS: Record<OnboardingStepVisual, React.ComponentProps<typeof Ionicons>['name']> = {
  welcome: 'sparkles-outline', services: 'cut-outline', roles: 'color-palette-outline',
  operators: 'person-outline', clients: 'people-outline', qr: 'qr-code-outline',
  agenda: 'calendar-outline', booking: 'add-circle-outline', hours: 'time-outline',
  exceptions: 'calendar-clear-outline', interval: 'grid-outline', public: 'phone-portrait-outline',
  requests: 'notifications-outline', guided: 'options-outline', automatic: 'checkmark-circle-outline', cash: 'wallet-outline', final: 'checkmark-done-outline',
};

type GuidePalette = ReturnType<typeof useAccessAppearance>['palette'];

/** Day/night tones of the guide, derived from the shared access palette. */
function guideTones(p: GuidePalette) {
  return {
    sheet: p.night ? '#1C1F20' : '#F6F3EE',
    panel: p.night ? 'rgba(255,255,255,.045)' : 'rgba(255,255,255,.72)',
    panelBorder: p.night ? 'rgba(237,230,215,.13)' : 'rgba(120,100,70,.14)',
    row: p.night ? 'rgba(255,255,255,.04)' : '#FFFFFF',
    gold: p.night ? '#D8C29B' : '#9C7A45',
    goldSoft: p.night ? 'rgba(216,194,155,.14)' : 'rgba(156,122,69,.11)',
    track: p.night ? 'rgba(255,255,255,.09)' : 'rgba(38,39,37,.08)',
    scrim: p.night ? 'rgba(0,0,0,.62)' : 'rgba(40,35,29,.34)',
  };
}

export function StepVisual({ visual, compact, step }: { visual: OnboardingStepVisual; compact: boolean; step?: OnboardingStep }) {
  const { palette: p } = useAccessAppearance();
  const t = guideTones(p);
  const content = step ?? ONBOARDING_STEPS.find((item) => item.visual === visual) ?? ONBOARDING_STEPS[0];
  return (
    <View style={{ borderRadius: 22, borderWidth: 1, borderColor: t.panelBorder, backgroundColor: t.panel, padding: compact ? 12 : 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: t.goldSoft }}>
          <Ionicons name={VISUAL_ICONS[visual]} size={18} color={t.gold} />
        </View>
        <Text style={{ flex: 1, color: p.ink, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{content.screen}</Text>
        <Text style={{ color: p.muted, fontSize: 10, letterSpacing: 1.4, fontWeight: '600' }}>ESEMPIO</Text>
      </View>
      {content.rows.map((row, index) => (
        <View key={`${content.key}-${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: t.panelBorder, backgroundColor: t.row, paddingHorizontal: 12, paddingVertical: 9 }}>
          <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: t.gold, opacity: 1 - index * 0.25 }} />
          <Text style={{ flex: 1, color: p.muted, fontSize: 12 }}>{row.label}</Text>
          <Text style={{ flex: 1.4, textAlign: 'right', color: p.ink, fontSize: 13, fontWeight: '600' }}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function OnboardingModal(props: OnboardingModalProps) {
  // Mounted outside the tab layout: it needs its own appearance scope, or it
  // would always render in the day palette whatever the salon uses.
  if (!props.visible) return null;
  return <AccessAppearanceProvider><OnboardingGuide {...props} /></AccessAppearanceProvider>;
}

function OnboardingGuide({
  visible,
  allowSkip = true,
  onClose,
  onComplete,
}: OnboardingModalProps) {
  const { palette: p, toggle } = useAccessAppearance();
  const t = guideTones(p);
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClosingFlow, setIsClosingFlow] = useState(false);
  const mountedRef = React.useRef(true);
  const androidLastNavigationAtRef = React.useRef(0);
  const cardScrollRef = React.useRef<ScrollView>(null);

  // Wide screens get a centred card; phones a full-width sheet from the bottom.
  const floating = width >= 640;
  const isCompactHeight = height < 760;
  const safeCurrentIndex = Math.max(0, Math.min(currentIndex, ONBOARDING_STEPS.length - 1));
  const currentStep = ONBOARDING_STEPS[safeCurrentIndex] ?? ONBOARDING_STEPS[0];
  const progressLabel = `${safeCurrentIndex + 1} / ${ONBOARDING_STEPS.length}`;
  const serif = Platform.OS === 'android' ? 'serif' : 'Georgia';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      androidLastNavigationAtRef.current = 0;
      setCurrentIndex(0);
      setIsClosingFlow(false);
    }
  }, [visible]);

  React.useLayoutEffect(() => {
    if (visible) {
      cardScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [visible, safeCurrentIndex]);

  const acceptGuideNavigation = () => {
    if (!IS_ANDROID) return true;
    const now = Date.now();
    // Drain taps queued while Android was busy bootstrapping without skipping steps.
    if (now - androidLastNavigationAtRef.current < 450) return false;
    androidLastNavigationAtRef.current = now;
    void haptic.light().catch(() => undefined);
    return true;
  };

  const handleNext = async () => {
    if (isClosingFlow || !acceptGuideNavigation()) {
      return;
    }

    if (safeCurrentIndex >= ONBOARDING_STEPS.length - 1) {
      try {
        setIsClosingFlow(true);
        await onComplete();
      } catch {
        if (mountedRef.current) {
          setIsClosingFlow(false);
        }
      }
      return;
    }

    setCurrentIndex((previous) => IS_ANDROID && previous !== safeCurrentIndex ? previous : Math.min(previous + 1, ONBOARDING_STEPS.length - 1));
  };

  const handleBack = () => {
    if (isClosingFlow || safeCurrentIndex === 0 || !acceptGuideNavigation()) return;
    setCurrentIndex((index) => IS_ANDROID && index !== safeCurrentIndex ? index : Math.max(0, index - 1));
  };

  const handleClose = async () => {
    if (isClosingFlow || !acceptGuideNavigation()) {
      return;
    }

    try {
      setIsClosingFlow(true);
      await onClose();
    } catch {
      if (mountedRef.current) {
        setIsClosingFlow(false);
      }
    }
  };

  const chip = { minHeight: 40, minWidth: 40, borderRadius: 20, borderWidth: 1, borderColor: t.panelBorder, backgroundColor: t.panel, alignItems: 'center' as const, justifyContent: 'center' as const, flexDirection: 'row' as const, gap: 6, paddingHorizontal: 12 };

  return (
    <WebPagePortal><NativePremiumScope.Provider value={true}><View {...(Platform.OS==='web'?{dataSet:{settingsTour:'true'}}:{})} style={styles.modalRoot} accessibilityViewIsModal>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }, Platform.OS === 'web' && ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as object)]} />
      <SafeAreaView style={[styles.safeArea, { justifyContent: floating ? 'center' : 'flex-end', paddingHorizontal: floating ? 24 : 0, paddingVertical: floating ? 24 : 0 }]} edges={floating ? ['top', 'bottom', 'left', 'right'] : ['top', 'left', 'right']}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: t.sheet,
              borderColor: t.panelBorder,
              maxWidth: floating ? 620 : undefined,
              maxHeight: floating ? Math.min(height - 48, 860) : height - (isCompactHeight ? 24 : 56),
              borderRadius: floating ? 30 : 0,
              borderTopLeftRadius: 30,
              borderTopRightRadius: 30,
              shadowOpacity: p.night ? 0.42 : 0.16,
            },
            Platform.OS === 'web' && { ...popupGlass(p), backgroundColor: p.night ? 'rgba(28,31,32,.97)' : 'rgba(246,243,238,.97)' },
          ]}
        >
          {/* Header: brand left, appearance and skip right, edge to edge. */}
          <View style={[styles.header, { borderBottomColor: t.panelBorder }]}>
            {!floating ? <View style={[styles.grabber, { backgroundColor: t.track }]} /> : null}
            <View style={styles.headerRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: t.goldSoft }}>
                  <Ionicons name="sparkles" size={14} color={t.gold} />
                </View>
                <Text numberOfLines={1} style={{ color: p.ink, fontSize: 12, fontWeight: '600', letterSpacing: 1.6, textTransform: 'uppercase' }}>Guida SalonPro</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <GuideButton
                  accessibilityRole="button"
                  accessibilityLabel={p.night ? 'Attiva aspetto giorno' : 'Attiva aspetto night'}
                  onPress={toggle}
                  hapticType="light"
                  style={[chip, { paddingHorizontal: 0, width: 40 }]}
                >
                  <Ionicons name={p.night ? 'sunny-outline' : 'moon-outline'} size={17} color={p.ink} />
                </GuideButton>
                {allowSkip ? (
                  <GuideButton
                    style={chip}
                    accessibilityRole="button"
                    accessibilityLabel="Salta la guida ed entra in SalonPro"
                    onPress={() => {
                      void handleClose();
                    }}
                    hapticType="light"
                    pressInHapticType="light"
                    activeOpacity={0.9}
                    disabled={isClosingFlow}
                  >
                    <Text numberOfLines={1} style={{ color: p.ink, fontSize: 13, fontWeight: '600' }}>Salta</Text>
                  </GuideButton>
                ) : null}
              </View>
            </View>
            <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: ONBOARDING_STEPS.length, now: safeCurrentIndex + 1 }} style={[styles.progressTrack, { backgroundColor: t.track }]}>
              <View style={[styles.progressFill, { backgroundColor: t.gold, width: `${((safeCurrentIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }]} />
            </View>
          </View>

          <ScrollView
            key={Platform.OS === 'web' ? currentStep.key : 'native-guide-content'}
            ref={cardScrollRef}
            style={styles.scroll}
            contentContainerStyle={[styles.scrollContent, { paddingHorizontal: floating ? 28 : 20 }]}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={{ alignItems: 'center', gap: 8 }}>
              <Text numberOfLines={1} style={{ color: t.gold, fontSize: 11, fontWeight: '600', letterSpacing: 1.8, textTransform: 'uppercase' }}>{currentStep.section} · {progressLabel}</Text>
              <Text accessibilityRole="header" style={{ color: p.ink, fontFamily: serif, fontSize: isCompactHeight ? 25 : 29, lineHeight: isCompactHeight ? 31 : 35, textAlign: 'center', letterSpacing: -0.4 }}>
                {currentStep.title}
              </Text>
              <Text style={{ color: p.muted, fontSize: isCompactHeight ? 14 : 15, lineHeight: isCompactHeight ? 20 : 22, textAlign: 'center', maxWidth: 460 }}>
                {currentStep.body}
              </Text>
            </View>

            <View style={{ marginTop: isCompactHeight ? 16 : 22 }}>
              <StepVisual visual={currentStep.visual} compact={isCompactHeight} step={currentStep} />
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 16, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, backgroundColor: t.goldSoft }}>
              <Ionicons name="navigate-outline" size={15} color={t.gold} />
              <Text style={{ flex: 1, color: p.ink, fontSize: 12, lineHeight: 18 }}>{currentStep.path}</Text>
            </View>

            <View style={{ gap: 12, marginTop: 18 }}>
              {currentStep.instructions.map((instruction, index) => (
                <View key={`${currentStep.key}-${index}`} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.gold }}>
                    <Text style={{ color: t.gold, fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, color: p.ink, fontSize: 14, lineHeight: 21 }}>{instruction}</Text>
                </View>
              ))}
            </View>

            {currentStep.tip ? (
              <View style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start', marginTop: 18, padding: 13, borderRadius: 14, borderWidth: 1, borderColor: t.panelBorder, backgroundColor: t.panel }}>
                <Ionicons name="bulb-outline" size={16} color={t.gold} />
                <Text style={{ flex: 1, color: p.muted, fontSize: 12, lineHeight: 18 }}>{currentStep.tip}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Footer: back on the left, the next step as the main action. */}
          <SafeAreaView edges={floating ? [] : ['bottom']} style={[styles.footer, { borderTopColor: t.panelBorder, paddingHorizontal: floating ? 28 : 20 }]}>
            <GuideButton
              accessibilityRole="button"
              accessibilityLabel="Passaggio precedente"
              disabled={safeCurrentIndex === 0 || isClosingFlow}
              onPress={handleBack}
              style={[chip, { width: 54, height: 54, borderRadius: 18, paddingHorizontal: 0, opacity: safeCurrentIndex === 0 ? 0.35 : 1 }]}
            >
              <Ionicons name="chevron-back" size={20} color={p.ink} />
            </GuideButton>
            <GuideButton
              style={[styles.primaryButton, { backgroundColor: p.action, shadowOpacity: p.night ? 0.3 : 0.16 }]}
              immediatePress
              accessibilityRole="button"
              onPress={() => {
                void handleNext();
              }}
              hapticType="medium"
              pressInHapticType="light"
              activeOpacity={0.92}
              disabled={isClosingFlow}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78} style={{ color: p.actionText, fontSize: 15, fontWeight: '600', paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM }}>
                {currentStep.cta}
              </Text>
              <Ionicons name={safeCurrentIndex >= ONBOARDING_STEPS.length - 1 ? 'checkmark' : 'arrow-forward'} size={17} color={p.actionText} />
            </GuideButton>
          </SafeAreaView>
        </View>
      </SafeAreaView>
    </View></NativePremiumScope.Provider></WebPagePortal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 9999,
    elevation: 9999,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    overflow: 'hidden',
    borderWidth: 1,
    shadowColor: '#000000',
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    marginBottom: 10,
  },
  progressTrack: {
    height: 3,
    marginHorizontal: -16,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: 22,
    paddingBottom: 22,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 12,
    paddingBottom: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: '#2A2118',
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
});
