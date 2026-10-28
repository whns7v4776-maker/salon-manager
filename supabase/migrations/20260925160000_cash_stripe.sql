-- Stripe cash payments are separate from the SalonPro subscription.
create table public.cash_stripe_accounts (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 account_id text not null unique,
 livemode boolean not null,
 created_at timestamptz not null default now()
);
create table public.cash_stripe_oauth (
 state text primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 expires_at timestamptz not null default now()+interval '10 minutes'
);
create table public.cash_stripe_payments (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id),
 movement_id uuid not null references public.cash_movements(id),
 account_id text not null,
 amount_cents bigint not null check(amount_cents>0),
 currency text not null default 'eur' check(currency='eur'),
 status text not null default 'creating' check(status in ('creating','open','paid','expired')),
 session_id text unique,
 checkout_url text,
 payment_intent text,
 refunded_cents bigint not null default 0 check(refunded_cents>=0),
 created_at timestamptz not null default now()
);
create unique index cash_stripe_one_active on public.cash_stripe_payments(movement_id) where status <> 'expired';
alter table public.cash_stripe_accounts enable row level security;
alter table public.cash_stripe_oauth enable row level security;
alter table public.cash_stripe_payments enable row level security;
revoke all on public.cash_stripe_accounts,public.cash_stripe_oauth,public.cash_stripe_payments from anon,authenticated;
grant all on public.cash_stripe_accounts,public.cash_stripe_oauth,public.cash_stripe_payments to service_role;

create function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid)
returns public.cash_stripe_payments language plpgsql security definer set search_path=public as $$
declare m cash_movements; a cash_stripe_accounts; p cash_stripe_payments;
begin
 select * into m from cash_movements where id=p_movement and workspace_id=p_workspace for update;
 if not found then raise exception 'Movimento non trovato'; end if;
 select * into p from cash_stripe_payments where movement_id=m.id and status<>'expired';
 if found then return p; end if;
 if m.payment_method is not null or m.amount<=0 then raise exception 'Movimento già incassato o importo non valido'; end if;
 select * into a from cash_stripe_accounts where workspace_id=p_workspace;
 if not found then raise exception 'Collega prima Stripe'; end if;
 insert into cash_stripe_payments(workspace_id,movement_id,account_id,amount_cents)
 values(p_workspace,m.id,a.account_id,round(m.amount*100)) returning * into p;
 return p;
end $$;
revoke all on function public.reserve_cash_stripe(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_cash_stripe(uuid,uuid) to service_role;

create function public.guard_cash_stripe() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if current_setting('salonpro.stripe_settle',true)='yes' then return new; end if;
 if exists(select 1 from cash_stripe_payments where movement_id=old.id and status<>'expired') then
  if tg_op='DELETE' then raise exception 'Pagamento Stripe associato: il movimento va conservato'; end if;
  if new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method
    or new.card_label is distinct from old.card_label or new.workspace_id is distinct from old.workspace_id
  then raise exception 'Pagamento Stripe associato: verifica o annulla il link prima di modificare l’incasso'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger cash_stripe_guard before update or delete on public.cash_movements for each row execute function public.guard_cash_stripe();

create function public.settle_cash_stripe(p_id uuid,p_account text,p_session text,p_amount bigint,p_currency text,p_intent text)
returns void language plpgsql security definer set search_path=public as $$
declare p cash_stripe_payments;
begin
 select * into p from cash_stripe_payments where id=p_id for update;
 if not found or p.account_id<>p_account or p.amount_cents<>p_amount or p.currency<>p_currency
 or (p.session_id is not null and p.session_id<>p_session) then raise exception 'Pagamento non corrispondente'; end if;
 perform set_config('salonpro.stripe_settle','yes',true);
 update cash_movements set payment_method='card',card_label='Stripe',updated_at=now() where id=p.movement_id;
 update cash_stripe_payments set status='paid',session_id=p_session,payment_intent=p_intent,checkout_url=null where id=p.id;
 perform set_config('salonpro.stripe_settle','no',true);
end $$;
revoke all on function public.settle_cash_stripe(uuid,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_cash_stripe(uuid,text,text,bigint,text,text) to service_role;
