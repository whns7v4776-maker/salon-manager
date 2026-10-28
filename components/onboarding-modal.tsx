import {NativePremiumScope,NativeReadableText as Text} from './owner-native-premium';
import { useAccessAppearance } from './access-premium';
import { useSettingsWebStyles } from './settings-web-styles';
import { popupGlass } from './premium-web-surfaces';
import { DockedSheetSurface } from './ui/docked-sheet-surface';
import { WebPagePortal } from './ui/web-page-portal';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import {
    Image,
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
    "body": "Prepariamo insieme il tuo salone, dal primo servizio alla prima prenotazione.",
    "cta": "Inizia la guida",
    "visual": "welcome",
    "section": "Si parte",
    "path": "Home · Servizi · Clienti · Agenda · Richieste",
    "screen": "Il tuo salone, pronto a partire",
    "rows": [
      {
        "label": "01",
        "value": "Crea il listino e il team"
      },
      {
        "label": "02",
        "value": "Configura orari e clienti"
      },
      {
        "label": "03",
        "value": "Ricevi le prime prenotazioni"
      }
    ],
    "instructions": [
      "Segui il percorso per scoprire dove si trova ogni funzione e come usarla.",
      "Gli esempi della guida sono illustrativi: configurerai i tuoi dati una volta entrato."
    ],
    "tip": "Puoi saltare la guida in qualsiasi momento con Salta."
  },
  {
  "key": "salon-logo",
  "title": "Il logo reale del tuo salone",
  "body": "Personalizza la targhetta che identifica il salone e che vedono anche i clienti.",
  "cta": "Scopri l’IA",
  "visual": "welcome",
  "section": "La tua identità",
  "path": "Home → Logo e targhetta → Logo · IA",
  "screen": "Logo e targhetta",
  "rows": [
    {
      "label": "Nome salone",
      "value": "Scegli font e finitura"
    },
    {
      "label": "Logo · IA",
      "value": "Carica il tuo logo reale"
    },
    {
      "label": "Metallo",
      "value": "Finitura della targhetta"
    }
  ],
  "instructions": [
    "Nella Home apri Logo e targhetta e scegli Logo · IA.",
    "Tocca Scegli foto o screenshot, seleziona il logo del salone e regola il ritaglio senza tagliare lettere o simboli.",
    "Se il logo è già nitido, scegli Usa originale. Seleziona la finitura, controlla l’anteprima e premi Salva."
  ],
  "tip": "Puoi anche usare Nome salone per personalizzare solo scritta, font e finitura, senza IA."
},
  {
  "key": "salon-logo-ai",
  "title": "Sistema il logo con l’IA",
  "body": "L’IA elabora la foto caricata e genera una nuova anteprima del logo: utile per migliorare la nitidezza e ripulire lo sfondo.",
  "cta": "Continua",
  "visual": "welcome",
  "section": "La tua identità",
  "path": "Home → Logo e targhetta → Logo · IA",
  "screen": "Elabora con IA",
  "rows": [
    {
      "label": "1 · Carica",
      "value": "Foto o screenshot del logo"
    },
    {
      "label": "2 · Crea con IA",
      "value": "Genera e controlla l’anteprima"
    },
    {
      "label": "3 · Salva",
      "value": "Applica il risultato scelto"
    }
  ],
  "instructions": [
    "Dopo aver caricato e ritagliato il logo, seleziona Elabora con IA e premi Crea con IA.",
    "Attendi l’anteprima: puoi chiudere e tornare nella sezione mentre la creazione continua. Il logo attuale resta visibile.",
    "Controlla nome, lettere, simboli e colori: l’IA può modificare i dettagli. Scegli la finitura e premi Salva solo quando il risultato ti convince."
  ],
  "tip": "Il ritaglio viene inviato a OpenAI. Sono previste fino a 3 prove al giorno, salvo account abilitati a prove illimitate. Annullare una creazione non restituisce il tentativo."
},
  {
    "key": "services",
    "title": "Aggiungi il primo servizio",
    "body": "Il listino è il punto di partenza per costruire appuntamenti e disponibilità.",
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
      "Apri Servizi e scegli Aggiungi servizio.",
      "Inserisci nome, durata e prezzo, poi associa il mestiere richiesto e salva."
    ],
    "tip": "Scegli durate coerenti con il passo della tua Agenda: SalonPro ti avvisa se non sono compatibili."
  },
  {
    "key": "roles",
    "title": "Crea i tuoi mestieri",
    "body": "I mestieri collegano i servizi alle competenze degli operatori.",
    "cta": "Avanti",
    "visual": "roles",
    "section": "Listino e team",
    "path": "Servizi → Aggiungi servizio → Mestiere",
    "screen": "Mestieri suggeriti",
    "rows": [
      {
        "label": "Mestiere",
        "value": "Parrucchiere"
      },
      {
        "label": "Mestiere",
        "value": "Estetista"
      },
      {
        "label": "＋",
        "value": "Crea nuovo mestiere"
      }
    ],
    "instructions": [
      "Nel campo del mestiere scegli una delle proposte.",
      "Per una specializzazione diversa, tocca + Crea nuovo mestiere, scrivi il nome e conferma."
    ],
    "tip": "Usa lo stesso mestiere per collegare il servizio agli operatori che possono eseguirlo."
  },
  {
    "key": "operators",
    "title": "Aggiungi gli operatori",
    "body": "Ogni professionista ha competenze e disponibilità proprie.",
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
      "Inserisci il nome e assegna il mestiere. Puoi aggiungere anche una foto.",
      "Scegli i servizi gestiti e configura giorni e intervalli di disponibilità, poi salva."
    ],
    "tip": "L’operatore compare nella sua corsia in Agenda. Le disponibilità online rispettano le sue competenze."
  },
  {
    "key": "compositions",
    "title": "Più servizi, un percorso",
    "body": "Puoi organizzare anche trattamenti con più fasi.",
    "cta": "Avanti",
    "visual": "services",
    "section": "Listino e team",
    "path": "Servizi → Aggiungi servizi → Composizione",
    "screen": "Composizione",
    "rows": [
      {
        "label": "Fase 1",
        "value": "Colore"
      },
      {
        "label": "Attesa",
        "value": "Posa"
      },
      {
        "label": "Fase finale",
        "value": "Piega"
      }
    ],
    "instructions": [
      "Scegli Composizione e collega i servizi nell’ordine di esecuzione.",
      "Configura operatori, lavorazioni e pause previste prima di salvare."
    ],
    "tip": "La posa può liberare l’operatore mentre il cliente resta impegnato. Inizia con un servizio semplice se non ti serve un percorso composto."
  },
  {
    "key": "clients",
    "title": "Aggiungi un cliente",
    "body": "La rubrica raccoglie i contatti utili al lavoro del salone.",
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
      "Apri Clienti e tocca Nuovo cliente.",
      "Compila i dati richiesti e i contatti disponibili, poi salva la scheda."
    ],
    "tip": "La scheda creata dal salone e l’account personale del cliente sono due passaggi diversi: il cliente registra il proprio accesso."
  },
  {
    "key": "customer-times",
    "title": "Tempi su misura per cliente",
    "body": "Lo stesso servizio può richiedere tempi diversi da persona a persona.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Personalizzazioni cliente",
    "path": "Clienti → Azioni della card → Tempi e prezzi",
    "screen": "Tempi e prezzi · Sofia Rossi",
    "rows": [
      {
        "label": "Servizio",
        "value": "Taglio"
      },
      {
        "label": "Durata standard",
        "value": "30 min"
      },
      {
        "label": "Durata per Sofia",
        "value": "45 min"
      }
    ],
    "instructions": [
      "Nell’app scorri la card del cliente verso sinistra; sul web apri il pannello delle azioni della card. Scegli Tempi e prezzi.",
      "Cerca il servizio, tocca Durata e salva il tempo dedicato. Per i servizi a fasi puoi regolare Lavoro, Posa e Finale."
    ],
    "tip": "I valori personali vengono usati nei prossimi appuntamenti in Agenda e online. Gli appuntamenti già creati non cambiano."
  },
  {
    "key": "customer-prices",
    "title": "Un prezzo dedicato",
    "body": "Personalizza il prezzo del servizio per il singolo cliente.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Personalizzazioni cliente",
    "path": "Clienti → Tempi e prezzi → Prezzo",
    "screen": "Listino personale · Sofia Rossi",
    "rows": [
      {
        "label": "Servizio",
        "value": "Taglio"
      },
      {
        "label": "Prezzo standard",
        "value": "25 €"
      },
      {
        "label": "Prezzo per Sofia",
        "value": "22 €"
      }
    ],
    "instructions": [
      "Apri Tempi e prezzi dalle azioni della card cliente e cerca il servizio.",
      "Tocca Prezzo, imposta l’importo dedicato e conferma con Salva prezzo."
    ],
    "tip": "Il prezzo personale prevale sul listino standard per quel cliente. Il comando di ripristino permette di tornare al prezzo standard."
  },
  {
    "key": "customer-discounts",
    "title": "Riserva uno sconto personale",
    "body": "Per riservare un’agevolazione, salva il prezzo finale dedicato al cliente.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Personalizzazioni cliente",
    "path": "Clienti → Tempi e prezzi → Prezzo",
    "screen": "Esempio di prezzo agevolato",
    "rows": [
      {
        "label": "Prezzo standard",
        "value": "50 €"
      },
      {
        "label": "Sconto desiderato · esempio",
        "value": "10% = 5 €"
      },
      {
        "label": "Prezzo cliente da salvare",
        "value": "45 €"
      }
    ],
    "instructions": [
      "Calcola il prezzo finale dopo lo sconto che vuoi riservare al cliente.",
      "Salva quell’importo nel Prezzo del servizio: nell’esempio, inserisci 45 €."
    ],
    "tip": "Qui imposti un importo in euro, non una percentuale automatica. L’agevolazione riguarda il servizio e il cliente selezionati."
  },
  {
    "key": "customer-visibility",
    "title": "Scegli i servizi per ogni cliente",
    "body": "Personalizza quali servizi il cliente può prenotare online.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Personalizzazioni cliente",
    "path": "Clienti → Azioni della card → Prenotazioni online",
    "screen": "Servizi prenotabili · Sofia Rossi",
    "rows": [
      {
        "label": "Taglio",
        "value": "Consentito"
      },
      {
        "label": "Piega",
        "value": "Consentito"
      },
      {
        "label": "Colore",
        "value": "Escluso per questo cliente"
      }
    ],
    "instructions": [
      "Apri Prenotazioni online dalle azioni della card e raggiungi Servizi prenotabili.",
      "Consenti o escludi i servizi per quel cliente, poi salva le regole personali."
    ],
    "tip": "Escludere un servizio esclude anche le composizioni e le scelte collegate che lo richiedono. I nuovi servizi sono consentiti di default."
  },
  {
    "key": "invite",
    "title": "Fatti trovare dai clienti",
    "body": "Condividi l’accesso al tuo salone per permettere ai clienti di collegarsi.",
    "cta": "Avanti",
    "visual": "qr",
    "section": "Clienti",
    "path": "Home → QR e codice del salone",
    "screen": "Il tuo salone",
    "rows": [
      {
        "label": "QR del salone",
        "value": "Da esporre, mostrare o condividere"
      },
      {
        "label": "Codice salone",
        "value": "Da mostrare per farti aggiungere"
      },
      {
        "label": "Accesso cliente",
        "value": "Collega il salone"
      }
    ],
    "instructions": [
      "Dalla Home puoi stampare ed esporre il QR code in salone, oppure mostrarlo e condividerlo direttamente.",
      "In alternativa, mostra il codice identificativo del salone: il cliente lo inserisce nell’area cliente per trovare e aggiungere il tuo salone."
    ],
    "tip": "Il cliente può aggiungere il salone scansionando il QR oppure inserendo il codice identificativo. Usa il QR e il codice reali presenti nella tua Home."
  },
  {
    "key": "registration",
    "title": "Il cliente crea il suo accesso",
    "body": "Il cliente può registrarsi e ritrovare il salone dal proprio account.",
    "cta": "Avanti",
    "visual": "clients",
    "section": "Clienti",
    "path": "Accesso cliente → Registrazione",
    "screen": "Registrazione cliente",
    "rows": [
      {
        "label": "Profilo",
        "value": "Dati personali"
      },
      {
        "label": "Accesso",
        "value": "Email e password"
      },
      {
        "label": "Verifica",
        "value": "Codice ricevuto via email"
      }
    ],
    "instructions": [
      "Invita il cliente a completare la registrazione con i propri dati e recapiti.",
      "Segue la verifica richiesta e si collega al salone tramite QR o codice."
    ],
    "tip": "Per un cliente già presente in rubrica, usare gli stessi recapiti aiuta a riconoscere la scheda corretta."
  },
  {
    "key": "agenda",
    "title": "Leggi la tua Agenda",
    "body": "Giorni, operatori e appuntamenti sono raccolti in una sola griglia.",
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
      "Scegli il giorno dalle date o apri il calendario. Usa Oggi per tornare alla giornata corrente.",
      "Nella Panoramica Settimana leggi gli orari in verticale e gli operatori nelle rispettive corsie."
    ],
    "tip": "Puoi scegliere la vista Auto oppure da 1 a 7 giorni visibili."
  },
  {
    "key": "booking",
    "title": "Prenota uno slot",
    "body": "Inserisci il primo appuntamento direttamente dall’Agenda.",
    "cta": "Avanti",
    "visual": "booking",
    "section": "Agenda",
    "path": "Agenda → Slot libero → Prenota slot",
    "screen": "Prenota slot",
    "rows": [
      {
        "label": "Cliente",
        "value": "Sofia Rossi"
      },
      {
        "label": "Servizio",
        "value": "Taglio · 30 min"
      },
      {
        "label": "Quando",
        "value": "09:00 · Giulia"
      }
    ],
    "instructions": [
      "Tocca uno slot libero: giorno, ora e operatore vengono predisposti.",
      "Scegli cliente e servizio, controlla il riepilogo e conferma lo slot."
    ],
    "tip": "Se è un cliente occasionale, puoi inserire i suoi dati nella prenotazione e scegliere se salvarlo in rubrica."
  },
  {
    "key": "move",
    "title": "Sposta e modifica",
    "body": "L’Agenda ti permette di riorganizzare il lavoro della giornata.",
    "cta": "Avanti",
    "visual": "agenda",
    "section": "Agenda",
    "path": "Agenda → Card appuntamento",
    "screen": "Il tuo appuntamento",
    "rows": [
      {
        "label": "Tocca",
        "value": "Apri i dettagli"
      },
      {
        "label": "Tieni premuto",
        "value": "Trascina la card"
      },
      {
        "label": "Maniglia inferiore",
        "value": "Modifica la durata"
      }
    ],
    "instructions": [
      "Tocca una card per vedere dettagli e azioni disponibili.",
      "Nell’app tieni premuto e trascina la card; sul web trascinala direttamente. Usa la maniglia inferiore per cambiare durata."
    ],
    "tip": "Controlla gli eventuali avvisi e conferma quando richiesto: spazi occupati e fasi collegate richiedono attenzione."
  },
  {
    "key": "hours",
    "title": "Imposta gli orari del salone",
    "body": "La disponibilità online parte dalla tua settimana di lavoro.",
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
        "label": "Domenica",
        "value": "Chiuso"
      }
    ],
    "instructions": [
      "In Agenda apri Personalizza orari.",
      "Imposta i giorni aperti, l’orario di entrata e uscita e la pausa pranzo, poi salva."
    ],
    "tip": "La finestra online decide fino a quanto avanti il cliente può prenotare; non limita la tua Agenda interna."
  },
  {
    "key": "exceptions",
    "title": "Gestisci le eccezioni",
    "body": "Ferie, formazione e chiusure non richiedono di riscrivere tutta la settimana.",
    "cta": "Avanti",
    "visual": "exceptions",
    "section": "Orari e disponibilità",
    "path": "Agenda → Personalizza orari → Eccezioni",
    "screen": "Eccezioni calendario",
    "rows": [
      {
        "label": "Motivo",
        "value": "Formazione"
      },
      {
        "label": "Durata",
        "value": "Una fascia o più giorni"
      },
      {
        "label": "Per chi",
        "value": "Salone o operatori scelti"
      }
    ],
    "instructions": [
      "Aggiungi un’eccezione e scegli la data o l’intervallo.",
      "Indica tutto il giorno oppure una fascia oraria e gli operatori coinvolti."
    ],
    "tip": "Se ci sono appuntamenti interessati, leggi come gestirne l’impatto prima di confermare."
  },
  {
    "key": "interval",
    "title": "Scegli il passo dell’Agenda",
    "body": "Il passo interno stabilisce la suddivisione della griglia di lavoro.",
    "cta": "Avanti",
    "visual": "interval",
    "section": "Orari e disponibilità",
    "path": "Agenda → Personalizza orari",
    "screen": "Passo interno Agenda",
    "rows": [
      {
        "label": "Esempio · 15 min",
        "value": "09:00 · 09:15 · 09:30"
      },
      {
        "label": "Taglio · 30 min",
        "value": "Occupa due intervalli"
      },
      {
        "label": "Durata servizio",
        "value": "Deve essere compatibile"
      }
    ],
    "instructions": [
      "Scegli un passo coerente con la durata dei tuoi servizi.",
      "Per una modifica programmata, controlla la data di attivazione indicata dall’app."
    ],
    "tip": "Le giornate con appuntamenti o richieste già accettate mantengono il passo precedente."
  },
  {
    "key": "public",
    "title": "Decidi gli orari visibili",
    "body": "La frequenza mostrata al cliente è separata dal passo interno.",
    "cta": "Avanti",
    "visual": "public",
    "section": "Orari e disponibilità",
    "path": "Agenda → Personalizza orari",
    "screen": "Orari mostrati al cliente",
    "rows": [
      {
        "label": "Agenda interna",
        "value": "Passo di 15 min"
      },
      {
        "label": "Frequenza cliente",
        "value": "Ogni 30 min"
      },
      {
        "label": "Esempio online",
        "value": "09:00 · 09:30 · 10:00"
      }
    ],
    "instructions": [
      "Configura la frequenza degli orari proposti nella prenotazione cliente.",
      "Il cliente sceglie il servizio e vede gli inizi compatibili con la disponibilità reale."
    ],
    "tip": "La frequenza non cambia la durata del servizio e non rende liberi gli orari occupati, chiusi o in pausa."
  },
  {
    "key": "requests",
    "title": "Gestisci le richieste",
    "body": "Le prenotazioni online arrivano nella sezione Richieste.",
    "cta": "Avanti",
    "visual": "requests",
    "section": "Prenotazioni online",
    "path": "Richieste → In attesa",
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
      "Con la gestione manuale scegli se accettarla o rifiutarla."
    ],
    "tip": "Una richiesta in attesa non equivale a un appuntamento confermato: controllane sempre lo stato."
  },
  {
    "key": "guided",
    "title": "Attiva gli slot guidati",
    "body": "Aiuta il cliente a scegliere gli orari più utili al tuo salone.",
    "cta": "Avanti",
    "visual": "guided",
    "section": "Prenotazioni online",
    "path": "Richieste → Slot guidati",
    "screen": "Strategia slot guidati",
    "rows": [
      {
        "label": "Consigliati intelligenti",
        "value": "Preserva spazi utili al listino"
      },
      {
        "label": "Equilibrata",
        "value": "Bilancia l’Agenda"
      },
      {
        "label": "Proteggi lunghi",
        "value": "Conserva spazi consecutivi"
      },
      {
        "label": "Riempi buchi",
        "value": "Completa gli spazi liberi"
      }
    ],
    "instructions": [
      "Attiva gli slot guidati nella sezione Richieste.",
      "Consigliati intelligenti è la strategia proposta all’attivazione. Puoi anche scegliere Equilibrata, Proteggi lunghi o Riempi buchi."
    ],
    "tip": "I suggerimenti rispettano servizi, operatori, durata, pause ed eccezioni."
  },
  {
    "key": "guided-view",
    "title": "Scegli quanta scelta offrire",
    "body": "Decidi come presentare i consigli nella prenotazione cliente.",
    "cta": "Avanti",
    "visual": "public",
    "section": "Prenotazioni online",
    "path": "Richieste → Slot guidati → Visualizzazione",
    "screen": "Come vede gli orari il cliente",
    "rows": [
      {
        "label": "Consigliati + tutti",
        "value": "Scelta predefinita con tutti gli orari disponibili"
      },
      {
        "label": "Prima i consigliati",
        "value": "Suggerimenti in evidenza"
      },
      {
        "label": "Solo consigliati",
        "value": "Scelta limitata ai consigli"
      }
    ],
    "instructions": [
      "Scegli la modalità di visualizzazione degli slot guidati.",
      "Consigliati intelligenti parte con Consigliati + tutti. Puoi scegliere Prima i consigliati oppure Solo consigliati per restringere la visualizzazione."
    ],
    "tip": "Solo consigliati restringe gli orari mostrati ai suggerimenti: scegli questa modalità consapevolmente."
  },
  {
    "key": "automatic",
    "title": "Accetta in automatico",
    "body": "Puoi automatizzare la conferma delle richieste compatibili.",
    "cta": "Avanti",
    "visual": "automatic",
    "section": "Prenotazioni online",
    "path": "Richieste → Accettazione automatica",
    "screen": "Accettazione automatica",
    "rows": [
      {
        "label": "Nuova richiesta",
        "value": "In attesa · 15 secondi"
      },
      {
        "label": "Controlli",
        "value": "Slot e regole del salone"
      },
      {
        "label": "Esito compatibile",
        "value": "Accettata"
      }
    ],
    "instructions": [
      "Attiva Accettazione automatica dalla sezione Richieste.",
      "Le nuove richieste restano visibili per 15 secondi: puoi intervenire prima della scadenza."
    ],
    "tip": "Le richieste che richiedono una decisione manuale restano da gestire. Disattiva la funzione per tornare all’accettazione manuale."
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
      { "label": "Periodo", "value": "Oggi · Questo mese · Storico" },
      { "label": "Già ricevuto", "value": "Contanti · POS esterno · Bonifico" },
      { "label": "Stripe", "value": "QR e link, se abilitato" }
    ],
    "instructions": [
      "Scegli il periodo e registra solo i pagamenti ricevuti. La fine della giornata non conferma un incasso.",
      "Per Stripe verifica lo stato del collegamento: la modalità di prova non riceve denaro reale. Il pagamento viene confermato dal server.",
      "Le vecchie registrazioni automatiche sono da verificare. I riferimenti carta sono semplici annotazioni, non autorizzano addebiti."
    ],
    "tip": "Nelle Impostazioni Cassa puoi nascondere la sezione: i movimenti restano salvati e gli eventuali link Stripe restano attivi. Per emettere documenti fiscali configura Ricevute fiscali e verifica lo stato del collegamento; in modalità prova non vengono emessi documenti fiscali reali."
  },
  {
    "key": "final",
    "title": "Ora tocca al tuo salone",
    "body": "Hai visto il percorso dalla configurazione alla prima prenotazione.",
    "cta": "Entra nell’app",
    "visual": "final",
    "section": "Pronto a iniziare",
    "path": "Servizi → Agenda → Clienti",
    "screen": "I tuoi primi tre passi",
    "rows": [
      {
        "label": "1 · Servizi",
        "value": "Crea listino, mestieri e operatori"
      },
      {
        "label": "2 · Agenda",
        "value": "Imposta orari e disponibilità"
      },
      {
        "label": "3 · Clienti",
        "value": "Aggiungi i contatti e condividi il QR"
      }
    ],
    "instructions": [
      "Inizia dal listino, poi configura la settimana di lavoro.",
      "Quando sei pronto, condividi il salone con i clienti e controlla le prime richieste."
    ],
    "tip": "Nelle sezioni dell’app trovi anche i pulsanti informativi per rileggere le spiegazioni delle funzioni."
  }
];

const VISUAL_ICONS: Record<OnboardingStepVisual, React.ComponentProps<typeof Ionicons>['name']> = {
  welcome: 'sparkles-outline', services: 'cut-outline', roles: 'color-palette-outline',
  operators: 'person-outline', clients: 'people-outline', qr: 'qr-code-outline',
  agenda: 'calendar-outline', booking: 'add-circle-outline', hours: 'time-outline',
  exceptions: 'calendar-clear-outline', interval: 'grid-outline', public: 'phone-portrait-outline',
  requests: 'notifications-outline', guided: 'options-outline', automatic: 'checkmark-circle-outline', cash: 'wallet-outline', final: 'checkmark-done-outline',
};

export function StepVisual({ visual, compact, step }: { visual: OnboardingStepVisual; compact: boolean; step?: OnboardingStep }) {
  const {palette:p}=useAccessAppearance();
  const styles=useSettingsWebStyles(baseOnboardingStyles,true);
  const content = step ?? ONBOARDING_STEPS.find((item) => item.visual === visual) ?? ONBOARDING_STEPS[0];
  return (
    <View style={[styles.preview, compact && styles.previewCompact]}>
      <View style={styles.previewBrand}>
        <View style={styles.previewBrandLogoArea}>
          <View style={styles.logoWindow}><Image source={require('../assets/images/salon-pro-logo-ui.png')} style={[styles.logo,Platform.OS==='web'&&({filter:p.night?'invert(1) grayscale(1)':'none'} as any)]} resizeMode="contain" accessibilityLabel="SalonPro" /></View>
        </View>
        <Text style={styles.exampleLabel}>ESEMPIO</Text>
      </View>
      <View style={styles.previewHeading}>
        <Ionicons name={VISUAL_ICONS[visual]} size={20} color={Platform.OS==='web'?p.ink:'#334155'} />
        <Text style={styles.previewTitle}>{content.screen}</Text>
      </View>
      {content.rows.map((row, index) => (
        <View key={Platform.OS === 'web' ? `${content.key}-${index}` : index} style={[styles.previewRow, { borderLeftColor: ['#60A5FA', '#A78BFA', '#34D399'][index % 3] }]}>
          <Text style={styles.previewLabel}>{row.label}</Text>
          <Text style={styles.previewValue}>{row.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function OnboardingModal({
  visible,
  allowSkip = true,
  onClose,
  onComplete,
}: OnboardingModalProps) {
  const {palette:p}=useAccessAppearance();
  const themedStyles=useSettingsWebStyles(baseOnboardingStyles,true);
  // The header floats over the live app and the CTA sits on the sheet surface:
  // both need solid fills on every platform, not the themed translucent field.
  const styles=React.useMemo(()=>{
    const chip={backgroundColor:p.night?'#24282A':'#FBF8F2',borderColor:p.night?'rgba(237,230,215,.22)':'rgba(120,100,70,.18)',borderWidth:1,shadowColor:'#2A2118',shadowOpacity:p.night?.3:.12,shadowRadius:10,shadowOffset:{width:0,height:3},elevation:3};
    return {...themedStyles,
      overlayBadge:{...themedStyles.overlayBadge,...chip},
      overlayBadgeText:{...themedStyles.overlayBadgeText,color:p.ink,fontWeight:'600'},
      skipButton:{...themedStyles.skipButton,...chip},
      skipText:{...themedStyles.skipText,color:p.ink,fontWeight:'600'},
      primaryButton:{...themedStyles.primaryButton,backgroundColor:p.action,borderWidth:0,shadowColor:'#2A2118',shadowOpacity:p.night?.25:.16,shadowRadius:12,shadowOffset:{width:0,height:5},elevation:4},
      primaryButtonText:{...themedStyles.primaryButtonText,color:p.actionText,fontWeight:'600'},
    } as unknown as typeof themedStyles;
  },[themedStyles,p]);
  const { width, height } = useWindowDimensions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isClosingFlow, setIsClosingFlow] = useState(false);
  const mountedRef = React.useRef(true);
  const androidLastNavigationAtRef = React.useRef(0);
  const cardScrollRef = React.useRef<ScrollView>(null);

  const isCompactHeight = height < 760;
  const cardMaxWidth = Math.min(width - 28, 560);
  const safeCurrentIndex = Math.max(0, Math.min(currentIndex, ONBOARDING_STEPS.length - 1));
  const currentStep = ONBOARDING_STEPS[safeCurrentIndex] ?? ONBOARDING_STEPS[0];
  const progressLabel = `${safeCurrentIndex + 1} / ${ONBOARDING_STEPS.length}`;

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
    if (visible && Platform.OS !== 'web') {
      cardScrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }, [visible, safeCurrentIndex]);

  if (!visible) {
    return null;
  }

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

  return (
    <WebPagePortal><NativePremiumScope.Provider value={true}><View {...(Platform.OS==='web'?{dataSet:{settingsTour:'true'}}:{})} style={styles.modalRoot} accessibilityViewIsModal>
      <View style={[styles.scrim,Platform.OS==='web'&&{backgroundColor:p.night?'rgba(0,0,0,.54)':'rgba(40,35,29,.28)',backdropFilter:'blur(8px)'} as any]} />
      <View pointerEvents="none" style={[styles.scrimVignetteTop,Platform.OS==='web'&&{display:'none'}]} />
      <View pointerEvents="none" style={[styles.scrimVignetteBottom,Platform.OS==='web'&&{display:'none'}]} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={[styles.overlayHeader, { maxWidth: cardMaxWidth, marginTop: isCompactHeight ? 8 : 12 }]}>
          <View style={styles.overlayBadge}>
            <Text numberOfLines={Platform.OS==='web'?undefined:1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.overlayBadgeText}>Guida SalonPro</Text>
          </View>
          {allowSkip ? (
            <GuideButton
              style={styles.skipButton}
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
              <Text numberOfLines={Platform.OS==='web'?undefined:1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.skipText}>Salta</Text>
            </GuideButton>
          ) : (
            <View style={styles.skipButtonPlaceholder} />
          )}
        </View>

        <View
          style={[
            styles.centerLayer,
            {
              paddingTop: 14,
              paddingBottom: 0,
            },
          ]}
        >
          <DockedSheetSurface
            {...(Platform.OS === 'web' ? { onClose: () => { void handleClose(); }, dismissDisabled: isClosingFlow || !allowSkip } : {})}
            style={[
              styles.cardShell,
              Platform.OS==='web'&&popupGlass(p),
              {
                maxWidth: cardMaxWidth,
                flex: 1,
                // On web, fill the available viewport below the guide header.
                // The inner ScrollView keeps long steps clear of the fixed footer.
                maxHeight: undefined,
                ...(Platform.OS === 'web' ? { minHeight: 0 } : {}),
              },
            ]}
          >
            <View style={[styles.cardTint,Platform.OS==='web'&&{backgroundColor:'transparent'}]} />

            <ScrollView
              key={Platform.OS === 'web' ? currentStep.key : 'native-guide-content'}
              ref={cardScrollRef}
              style={styles.cardScroll}
              contentContainerStyle={styles.cardScrollContent}
              showsVerticalScrollIndicator
              bounces={false}
              scrollEnabled
            >
              {Platform.OS !== 'web' ? <View style={styles.cardAccent} /> : null}


              <View style={styles.copyBlock}>
                <Text numberOfLines={Platform.OS==='web'?undefined:1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.progressText}>{currentStep.section} · {progressLabel}</Text>
                <Text accessibilityRole="header" style={[styles.title, isCompactHeight && styles.titleCompact]}>
                  {currentStep.title}
                </Text>
                <Text style={[styles.body, isCompactHeight && styles.bodyCompact]}>
                  {currentStep.body}
                </Text>
              </View>
              <View style={[styles.visualWrap, isCompactHeight && styles.visualWrapCompact]}>
                <StepVisual visual={currentStep.visual} compact={isCompactHeight} step={currentStep} />
              </View>
              <View style={styles.copyBlock}>
                <View style={styles.location}><Ionicons name="navigate-outline" size={16} color={Platform.OS==='web'?p.ink:'#2563EB'} /><Text style={styles.locationText}>{currentStep.path}</Text></View>
                {currentStep.instructions.map((instruction, index) => (
                  <View key={Platform.OS === 'web' ? instruction : index} style={styles.instructionRow}>
                    <Text style={styles.instructionNumber}>{index + 1}</Text>
                    <Text style={styles.instructionText}>{instruction}</Text>
                  </View>
                ))}
                <View style={styles.tipBox}><Ionicons name="information-circle-outline" size={18} color={Platform.OS==='web'?p.ink:'#475569'} /><Text style={styles.tipText}>{currentStep.tip}</Text></View>
              </View>
            </ScrollView>

            <View style={styles.footer}>
              <View style={styles.footerProgress}>
                <GuideButton accessibilityRole="button" accessibilityLabel="Passaggio precedente" disabled={safeCurrentIndex === 0 || isClosingFlow} onPress={() => { if (acceptGuideNavigation()) setCurrentIndex((index) => IS_ANDROID && index !== safeCurrentIndex ? index : Math.max(0, index - 1)); }} style={[styles.backButton, safeCurrentIndex === 0 && styles.backDisabled]}>
                  <Ionicons name="chevron-back" size={16} color={Platform.OS==='web'?p.ink:'#334155'} /><Text style={styles.backText}>Indietro</Text>
                </GuideButton>
                <Text style={styles.footerCount}>{progressLabel}</Text>
              </View>
              <View accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: ONBOARDING_STEPS.length, now: safeCurrentIndex + 1 }} style={styles.progressTrack}><View style={[styles.progressFill, { width: `${((safeCurrentIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }]} /></View>

              <GuideButton
                style={styles.primaryButton}
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
                <Text
                  numberOfLines={Platform.OS==='web'?undefined:1}
                  ellipsizeMode="clip"
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  style={styles.primaryButtonText}
                >
                  {currentStep.cta}
                </Text>
              </GuideButton>
            </View>
          </DockedSheetSurface>
        </View>
      </SafeAreaView>
    </View></NativePremiumScope.Provider></WebPagePortal>
  );
}

const baseOnboardingStyles = StyleSheet.create({
  modalRoot: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    zIndex: 9999,
    elevation: 9999,
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(7, 12, 22, 0.82)',
  },
  scrimVignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '38%',
    backgroundColor: 'rgba(7, 12, 22, 0.14)',
  },
  scrimVignetteBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '32%',
    backgroundColor: 'rgba(7, 12, 22, 0.18)',
  },
  safeArea: {
    flex: 1,
    position: 'relative',
  },
  overlayHeader: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 20,
    paddingHorizontal: 16,
    minHeight: 44,
    flexShrink: 0,
  },
  overlayBadge: {
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 14 : 12,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  overlayBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#f8fafc',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  skipButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 16 : 14,
    paddingVertical: 8,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  skipButtonPlaceholder: {
    position: 'absolute',
    right: 10,
    width: 74,
    height: 38,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#f8fafc',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  centerLayer: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
  },
  cardShell: {
    width: '100%',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    shadowColor: '#020617',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  cardTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(244, 248, 252, 0.9)',
  },
  cardScroll: {
    flex: 1,
    minHeight: 0,
  },
  cardScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardAccent: {
    width: 44,
    height: 4,
    borderRadius: 999,
    alignSelf: 'center',
    backgroundColor: 'rgba(71, 85, 105, 0.28)',
    marginBottom: 10,
  },
  visualWrap: {
    marginTop: 16,
    marginBottom: 16,
  },
  visualWrapCompact: {
    marginTop: 12,
    marginBottom: 12,
  },
  copyBlock: {
    alignItems: 'center',
    paddingTop: 6,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 6,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  titleCompact: {
    fontSize: 23,
    lineHeight: 28,
    marginBottom: 6,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'center',
    maxWidth: 420,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  bodyCompact: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexShrink: 0,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.24)',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  dotButton: {
    paddingHorizontal: 5,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(100, 116, 139, 0.32)',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#0f172a',
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#111827',
    paddingHorizontal: IS_ANDROID ? 16 : 0,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#ffffff',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  preview: { borderRadius: 22, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', padding: 14, gap: 8 },
  previewCompact: { padding: 12 },
  previewBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  previewBrandLogoArea: { flex: 1, alignItems: 'flex-start', paddingLeft: 6, minWidth: 0 },
  logoWindow: { width: 108, maxWidth: '100%', height: 36, overflow: 'hidden' },
  logo: { position: 'absolute', width: 108, height: 72, top: -14, left: '50%', marginLeft: -54 },
  exampleLabel: { flexShrink: 0, color: '#64748B', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  previewHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  previewTitle: { flex: 1, color: '#0F172A', fontSize: 15, fontWeight: '800' },
  previewRow: { backgroundColor: '#FFFFFF', borderRadius: 11, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 3, paddingHorizontal: 11, paddingVertical: 10, gap: 10, flexDirection: 'row', alignItems: 'center' },
  previewLabel: { flex: 1, color: '#64748B', fontSize: 11, fontWeight: '600' },
  previewValue: { flex: 1.2, textAlign: 'right', color: '#0F172A', fontSize: 13, fontWeight: '700' },
  location: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, marginVertical: 16, width: '100%' },
  locationText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '700', color: '#1D4ED8' },
  instructionRow: { flexDirection: 'row', gap: 10, marginBottom: 14, width: '100%' },
  instructionNumber: { color: '#334155', backgroundColor: '#E2E8F0', borderRadius: 12, width: 24, height: 24, textAlign: 'center', lineHeight: 24, fontSize: 12, fontWeight: '800' },
  instructionText: { flex: 1, color: '#334155', fontSize: 14, lineHeight: 21 },
  tipBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 12, backgroundColor: '#E8EEF4', marginBottom: 12 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 18, color: '#475569' },
  footerProgress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44, paddingRight: 12 },
  backDisabled: { opacity: 0.3 },
  backText: { color: '#334155', fontSize: 13, fontWeight: '700' },
  footerCount: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  progressTrack: { height: 3, backgroundColor: '#E2E8F0', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: '#334155', borderRadius: 3 },
});
