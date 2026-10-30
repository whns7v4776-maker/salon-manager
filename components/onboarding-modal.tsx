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
