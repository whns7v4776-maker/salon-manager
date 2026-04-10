# Supabase Migrations Guide

Questa guida serve a noi per collegare `salon-manager` a Supabase senza perdere ordine.

## Struttura attuale

- `supabase/schema.sql`
  Riferimento leggibile completo dello schema attuale.
- `supabase/migrations/20260314190000_initial_schema.sql`
  Baseline iniziale pronta da applicare.
- `supabase/config.toml`
  Config base standard per Supabase CLI.
- `supabase/seed.sql`
  Placeholder per eventuali dati seed locali.

## Regola pratica

Da questo punto in avanti conviene lavorare cosi:

1. `schema.sql` resta il documento completo di riferimento.
2. ogni modifica reale al database entra come nuova migration in `supabase/migrations/`
3. non riscriviamo la baseline iniziale, la lasciamo storica
4. quando il progetto passera davvero a Supabase, la fonte di verita operativa saranno le migration

## Convenzione file migration

Formato consigliato:

- `YYYYMMDDHHMMSS_nome_breve.sql`

Esempi:

- `20260315110000_add_owner_phone_verification.sql`
- `20260315123000_create_subscription_receipts.sql`

## Flusso consigliato quando saremo pronti

1. installare Supabase CLI
2. fare login
3. linkare il progetto remoto
4. applicare la baseline iniziale
5. creare solo migration incrementali da li in avanti

## Comandi utili

Esempi orientativi:

```bash
supabase init
supabase login
supabase link --project-ref <project-ref>
supabase db push
supabase migration new add_something
```

## Nota importante

Al momento il progetto mobile usa ancora storage locale e logica locale.
Quindi questa struttura non e ancora "in produzione": e una base ordinata per arrivare al passaggio finale senza rifare il lavoro.
