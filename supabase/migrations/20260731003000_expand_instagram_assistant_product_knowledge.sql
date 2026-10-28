-- Ground the Instagram assistant in the user-facing behaviour implemented by
-- SalonPro. Keep this catalogue free from secrets, personal data and internal
-- implementation details: it is customer-support knowledge, not source-code
-- retrieval.

insert into public.instagram_knowledge_items (category, title, content, priority)
values
  (
    'prodotto',
    'Che cos''è SalonPro',
    'SalonPro è un gestionale italiano per saloni. Riunisce agenda, richieste di prenotazione, operatori, servizi, clienti, cassa interna, comunicazioni e area cliente. Aiuta il salone a organizzare il lavoro e permette ai clienti di prenotare dal proprio spazio.',
    10
  ),
  (
    'prodotto',
    'Moduli principali',
    'Il pannello del salone comprende Home, Agenda, Prenotazioni, Clienti, Cassa e Servizi. Le impostazioni permettono inoltre di configurare disponibilità, accessi e comportamento delle prenotazioni.',
    11
  ),
  (
    'configurazione',
    'Da dove iniziare',
    'Dopo la registrazione conviene configurare in quest''ordine: giorni e orari di apertura, eventuale pausa pranzo, operatori e mestieri, servizi con durata e prezzo, quindi clienti e primi appuntamenti. Il salone può poi condividere il proprio QR o codice con i clienti.',
    20
  ),
  (
    'configurazione',
    'Orari di apertura',
    'Il salone può impostare giorni e fasce di apertura. Questi orari vengono usati per mostrare le disponibilità e impedire prenotazioni fuori dall''orario configurato.',
    21
  ),
  (
    'configurazione',
    'Pausa pranzo e disponibilità',
    'È possibile configurare la pausa pranzo e le disponibilità del salone. Agenda e prenotazioni tengono conto delle fasce non disponibili insieme agli altri vincoli.',
    22
  ),
  (
    'configurazione',
    'Ferie e chiusure',
    'Il salone può registrare ferie e periodi di chiusura. In quei periodi le disponibilità vengono escluse; il salone può anche avvisare i clienti con una comunicazione.',
    23
  ),
  (
    'agenda',
    'Inserire un appuntamento',
    'Per inserire un appuntamento si apre Agenda, si selezionano giorno e orario, quindi cliente, servizio e operatore, e si conferma. Un nuovo cliente può essere aggiunto anche durante la creazione dell''appuntamento.',
    30
  ),
  (
    'agenda',
    'Gestire un appuntamento',
    'Dall''Agenda il salone può consultare e modificare un appuntamento, spostarlo, annullarlo o eliminarlo e segnarlo come completato oppure non eseguito. Le azioni disponibili dipendono dallo stato dell''appuntamento.',
    31
  ),
  (
    'agenda',
    'Slot e blocchi agenda',
    'Il salone può bloccare o liberare un singolo spazio dell''agenda oppure un''intera fascia oraria. Gli spazi bloccati non vengono proposti come disponibili ai clienti.',
    32
  ),
  (
    'agenda',
    'Controlli di disponibilità',
    'Prima di confermare o spostare un appuntamento SalonPro controlla orari, chiusure, pausa pranzo, sovrapposizioni, disponibilità dell''operatore e, quando previsto, delle attrezzature. Se esiste un conflitto, la prenotazione non viene confermata in quello spazio.',
    33
  ),
  (
    'agenda',
    'Ritardo del cliente',
    'Dall''appuntamento il salone può inviare al cliente un promemoria relativo al ritardo, quando la funzione è disponibile e il cliente può ricevere notifiche.',
    34
  ),
  (
    'prenotazioni',
    'Richieste dei clienti',
    'Le prenotazioni inviate dai clienti arrivano nella sezione Prenotazioni. Il salone può valutarle e accettarle o rifiutarle; dopo l''accettazione l''appuntamento compare in Agenda.',
    40
  ),
  (
    'prenotazioni',
    'Accettazione automatica',
    'Il salone può scegliere l''accettazione automatica delle richieste. Una richiesta viene accettata solo se rispetta disponibilità, orari e vincoli configurati; in caso contrario richiede gestione o non può essere confermata.',
    41
  ),
  (
    'prenotazioni',
    'Scelta operatore in accettazione',
    'Quando una richiesta deve essere gestita manualmente, il salone può scegliere un operatore compatibile e disponibile. SalonPro esegue un controllo finale prima di confermare per evitare sovrapposizioni.',
    42
  ),
  (
    'prenotazioni',
    'Accetta e accorcia',
    'Per una richiesta manuale il salone può, quando consentito, accettare riducendo soltanto l''orario finale. Restano attivi i controlli su operatore, disponibilità, attrezzature, pause e sovrapposizioni.',
    43
  ),
  (
    'prenotazioni',
    'Lista d''attesa',
    'Se non trova posto, il cliente può usare la lista d''attesa quando disponibile. SalonPro può notificare il cliente quando si libera una disponibilità compatibile; la notifica non equivale a una prenotazione già confermata.',
    44
  ),
  (
    'servizi',
    'Servizi e operatori',
    'Nei Servizi si possono indicare nome, durata, prezzo, descrizione, colore e mestiere o operatori compatibili. Ogni operatore attivo può avere la propria agenda e le associazioni aiutano SalonPro a proporre disponibilità corrette.',
    50
  ),
  (
    'servizi',
    'Ordine e riconoscimento dei servizi',
    'Il salone può ordinare mestieri e servizi e usare colori o etichette per riconoscerli più facilmente. L''ordine salvato viene riutilizzato nella presentazione del catalogo.',
    51
  ),
  (
    'servizi',
    'Promozioni programmate',
    'Un servizio può avere una promozione programmata con periodo di validità e prezzo o sconto configurato dal salone. L''assistente non deve inventare promozioni: può descrivere la funzione, ma per un''offerta attuale deve passare a Marzio.',
    52
  ),
  (
    'operatori',
    'Gestire operatori e mestieri',
    'Il salone può creare operatori, associarli ai mestieri e ai servizi compatibili, impostarne lo stato attivo e personalizzarne il riconoscimento. Disponibilità e compatibilità vengono considerate nelle prenotazioni.',
    60
  ),
  (
    'clienti',
    'Scheda cliente',
    'La sezione Clienti raccoglie le schede dei clienti del salone. Un cliente può essere inserito manualmente oppure durante la creazione di un appuntamento; le informazioni devono essere trattate solo dal salone e non sono accessibili all''assistente Instagram.',
    70
  ),
  (
    'clienti',
    'Limiti di prenotazione',
    'Il salone può configurare per un cliente limiti alle prenotazioni, per esempio giornalieri, mensili o sul numero di prenotazioni future. I limiti vengono controllati anche nel flusso di prenotazione del cliente.',
    71
  ),
  (
    'clienti',
    'Promemoria e notifiche push',
    'Il salone può inviare promemoria e notifiche ai clienti che hanno configurato correttamente le notifiche. La consegna dipende dal dispositivo, dai permessi e dai dati di contatto disponibili.',
    72
  ),
  (
    'clienti',
    'Comunicazioni ai clienti',
    'Il salone può inviare comunicazioni a uno o più clienti, anche usando testi preparati per casi ricorrenti come ferie o aggiornamenti. Prima dell''invio vengono mostrati destinatari e conferma.',
    73
  ),
  (
    'cassa',
    'Cassa interna',
    'Cassa è un riepilogo gestionale interno di entrate, uscite e movimenti del salone. Non è collegata al conto bancario né sostituisce un sistema fiscale. Il salone può disattivarla e riattivarla senza perdere i movimenti già registrati.',
    80
  ),
  (
    'cassa',
    'Appuntamenti completati e cassa',
    'Quando un appuntamento viene segnato come completato, SalonPro può registrare il relativo movimento nella cassa interna secondo la configurazione attiva. Un appuntamento non eseguito non deve essere trattato come servizio completato.',
    81
  ),
  (
    'accesso',
    'QR e codice salone',
    'Ogni salone può condividere o stampare il proprio QR e il proprio codice. Il cliente li usa per aprire lo spazio corretto del salone, registrarsi o accedere e consultare i servizi disponibili.',
    90
  ),
  (
    'area_cliente',
    'Registrazione e accesso cliente',
    'Il cliente entra nello spazio del proprio salone tramite QR, link o codice salone e completa registrazione o accesso. L''accesso è legato al salone corretto; per problemi sull''account o sui dati personali deve intervenire una persona.',
    91
  ),
  (
    'area_cliente',
    'Prenotare dall''area cliente',
    'Dall''area cliente si sceglie il servizio, quindi una disponibilità e, quando previsto, l''operatore. La richiesta rispetta orari, chiusure, limiti e disponibilità configurati dal salone e può richiedere l''accettazione del salone.',
    92
  ),
  (
    'area_cliente',
    'Stato e annullamento prenotazioni',
    'Il cliente può consultare lo stato delle proprie richieste e degli appuntamenti e usare le azioni di annullamento disponibili. Regole specifiche, eccezioni o problemi su una prenotazione reale devono essere gestiti dal salone o da Marzio.',
    93
  ),
  (
    'sicurezza',
    'Face ID e impronta',
    'Nell''app installata su un dispositivo compatibile, salone e cliente possono proteggere l''accesso con Face ID o impronta. Dal computer si può vedere lo stato della protezione, ma la biometria si configura sul dispositivo mobile.',
    100
  ),
  (
    'sicurezza',
    'Password cliente',
    'La protezione con password del profilo cliente può essere attivata quando prevista. L''assistente non deve mai chiedere password, codici di verifica o altri segreti e deve passare a una persona per problemi di recupero o accesso.',
    101
  ),
  (
    'accesso',
    'App e computer',
    'SalonPro permette di lavorare dall''app e dal computer mantenendo sincronizzati i dati salvati del salone. Alcune funzioni legate al dispositivo, come Face ID o impronta, restano disponibili solo nell''app mobile compatibile.',
    102
  ),
  (
    'personalizzazione',
    'Messaggio di benvenuto',
    'Il salone può personalizzare il messaggio di benvenuto mostrato al cliente nel primo accesso, dopo i passaggi iniziali relativi a notifiche e protezione biometrica.',
    110
  ),
  (
    'prova',
    'Prova gratuita',
    'SalonPro prevede una prova gratuita di 30 giorni. Per prezzi, promozioni correnti, rinnovi o condizioni commerciali non presenti nella conoscenza approvata, l''assistente deve chiedere a Marzio di intervenire e non deve inventare cifre.',
    120
  ),
  (
    'assistenza',
    'Limiti dell''assistente',
    'L''assistente conosce le funzioni generali approvate di SalonPro, ma non vede i dati interni di un salone, lo stato reale di un account, appuntamenti, pagamenti o abbonamenti. Per dati personali, problemi di account, pagamenti, rimborsi, cancellazioni, reclami o bug non risolvibili con istruzioni certe deve passare a Marzio.',
    130
  ),
  (
    'assistenza',
    'Non inventare informazioni',
    'Se la risposta non è coperta dalla conoscenza approvata, l''assistente deve dirlo con chiarezza e passare la conversazione a Marzio. Non deve inventare prezzi, link, promozioni, scadenze, stato di servizi esterni o procedure non verificate.',
    131
  )
on conflict (category, title) do update
set
  content = excluded.content,
  enabled = true,
  priority = excluded.priority,
  updated_at = timezone('utc', now());

