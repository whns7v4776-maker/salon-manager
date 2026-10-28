-- Optional cash screen reauthentication. This does not create staff accounts or change cash RLS.
create table if not exists public.cash_owner_passkeys (
 credential_id text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 rp_id text not null,
 public_key text not null,
 counter bigint not null default 0 check (counter >= 0),
 transports text[] not null default '{}',
 created_at timestamptz not null default now()
);
create index if not exists cash_owner_passkeys_owner on public.cash_owner_passkeys(user_id,workspace_id,rp_id);
create table if not exists public.cash_owner_passkey_challenges (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 kind text not null check (kind in ('register','authenticate')),
 challenge text not null,
 origin text not null,
 rp_id text not null,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '5 minutes'
);
create index if not exists cash_owner_passkey_challenges_owner on public.cash_owner_passkey_challenges(user_id,workspace_id,created_at);
alter table public.cash_owner_passkeys enable row level security;
alter table public.cash_owner_passkey_challenges enable row level security;
revoke all on public.cash_owner_passkeys,public.cash_owner_passkey_challenges from anon,authenticated;
grant select,insert,update,delete on public.cash_owner_passkeys,public.cash_owner_passkey_challenges to service_role;
