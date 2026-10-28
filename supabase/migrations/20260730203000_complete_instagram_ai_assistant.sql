alter table public.instagram_assistant_settings
  add column if not exists auto_reply_intents text[] not null default array[
    'product_info',
    'onboarding',
    'trial_info',
    'booking_help'
  ]::text[],
  add column if not exists max_reply_chars integer not null default 700
    check (max_reply_chars between 200 and 1000);

alter table public.instagram_conversations
  add column if not exists ai_confidence numeric(4, 3)
    check (ai_confidence is null or ai_confidence between 0 and 1);

alter table public.instagram_messages
  add column if not exists ai_confidence numeric(4, 3)
    check (ai_confidence is null or ai_confidence between 0 and 1),
  add column if not exists detected_intent text,
  add column if not exists handoff_reason text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by text;

create unique index if not exists instagram_messages_one_assistant_reply_idx
  on public.instagram_messages (reply_to_message_id)
  where direction = 'outbound'
    and sender_type = 'assistant'
    and reply_to_message_id is not null;

create table if not exists public.instagram_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  content text not null,
  enabled boolean not null default true,
  priority integer not null default 100 check (priority between 0 and 1000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (category, title)
);

alter table public.instagram_knowledge_items enable row level security;
revoke all on public.instagram_knowledge_items from anon, authenticated;

comment on table public.instagram_knowledge_items is
  'Versionable, non-secret facts used to ground the SalonPro Instagram assistant.';

insert into public.instagram_knowledge_items (category, title, content, priority)
values
  (
    'prodotto',
    'Che cos''è SalonPro',
    'SalonPro è un gestionale italiano per saloni. Riunisce agenda, operatori, servizi, clienti, prenotazioni online, promemoria e organizzazione del lavoro. È pensato per semplificare sia il lavoro del salone sia la prenotazione del cliente.',
    10
  ),
  (
    'configurazione',
    'Da dove iniziare',
    'Dopo la registrazione conviene configurare in quest''ordine: 1) giorni e orari di apertura; 2) operatori; 3) servizi con durata, prezzo e operatore o mestiere; 4) clienti già esistenti; 5) agenda e primi appuntamenti. Una volta inseriti operatori e servizi, creare un appuntamento diventa rapido.',
    20
  ),
  (
    'agenda',
    'Inserire un appuntamento',
    'Per inserire un appuntamento si apre l''Agenda, si sceglie giorno e orario, quindi cliente, servizio e operatore, e si conferma. Un nuovo cliente può essere aggiunto anche durante la creazione dell''appuntamento.',
    30
  ),
  (
    'servizi',
    'Servizi e operatori',
    'Ogni operatore può avere la propria agenda. Nei servizi si possono indicare durata, prezzo, operatore o mestiere associato e un colore utile per riconoscerli subito in agenda.',
    40
  ),
  (
    'clienti',
    'Clienti e prenotazione online',
    'I clienti possono essere inseriti manualmente dal salone oppure aggiunti mentre si crea un appuntamento. Dalle impostazioni si possono configurare la prenotazione online, i promemoria, i limiti di prenotazione e i periodi di chiusura o ferie.',
    50
  ),
  (
    'accesso',
    'App e computer',
    'SalonPro è progettato per lavorare dall''app e dal computer mantenendo sincronizzati i dati del salone. Le funzioni disponibili possono dipendere dal profilo e dalla versione in uso.',
    60
  ),
  (
    'prova',
    'Prova gratuita',
    'SalonPro prevede una prova gratuita di 30 giorni. Per prezzi, promozioni in corso o condizioni commerciali non presenti nel contesto, l''assistente deve chiedere a Marzio di intervenire e non deve inventare cifre.',
    70
  ),
  (
    'assistenza',
    'Quando passa a Marzio',
    'L''assistente passa la conversazione a Marzio per pagamenti, rimborsi, cancellazioni, dati personali, problemi di accesso, bug non banali, reclami, richieste legali, richieste esplicite di una persona o domande per cui le informazioni disponibili non bastano.',
    80
  )
on conflict (category, title) do update
set
  content = excluded.content,
  priority = excluded.priority,
  updated_at = timezone('utc', now());
