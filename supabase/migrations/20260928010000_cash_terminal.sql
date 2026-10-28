-- QR and contactless share the same reservation and settlement authority.
alter table public.cash_stripe_payments add column channel text not null default 'checkout'
 check (channel in ('checkout','terminal'));
create unique index cash_stripe_intent_unique on public.cash_stripe_payments(payment_intent) where payment_intent is not null;

create function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid,p_live boolean,p_channel text)
returns public.cash_stripe_payments language plpgsql security definer set search_path=public as $$
declare m cash_movements; a cash_stripe_accounts; p cash_stripe_payments;
begin
 if p_channel not in ('checkout','terminal') or p_channel is null then raise exception 'Metodo non valido'; end if;
 select * into m from cash_movements where id=p_movement and workspace_id=p_workspace;
 if not found then raise exception 'Movimento non trovato'; end if;
 -- Same lock order as prepare_cash_appointment; one appointment cannot acquire
 -- two separate payment attempts through two different cash rows.
 if m.appointment_id is not null then
  perform 1 from appointments where id=m.appointment_id and workspace_id=p_workspace for update;
  if (select count(*) from cash_movements where appointment_id=m.appointment_id and workspace_id=p_workspace)>1 then raise exception 'Più movimenti per questo appuntamento: verifica la Cassa'; end if;
 end if;
 select * into m from cash_movements where id=p_movement and workspace_id=p_workspace for update;
 select * into p from cash_stripe_payments where movement_id=m.id and status<>'expired';
 if found then
  if not exists(select 1 from cash_stripe_accounts where workspace_id=p_workspace and livemode=p_live and account_id=p.account_id) then raise exception 'Movimento di un altro collegamento Stripe'; end if;
  if p.status<>'paid' and p.channel<>p_channel then raise exception 'Un altro metodo Stripe è già aperto: verificalo o annullalo prima di cambiare metodo'; end if;
  return p;
 end if;
 if m.payment_method is not null or m.amount<0.50 or m.amount>999999.99 then raise exception 'Movimento già incassato o importo non valido'; end if;
 if exists(select 1 from appointments where id=m.appointment_id and workspace_id=p_workspace and cashed_in=true) then raise exception 'Appuntamento già incassato'; end if;
 select * into a from cash_stripe_accounts where workspace_id=p_workspace and livemode=p_live;
 if not found then raise exception 'Collega prima Stripe'; end if;
 insert into cash_stripe_payments(workspace_id,movement_id,account_id,amount_cents,channel)
 values(p_workspace,m.id,a.account_id,round(m.amount*100),p_channel) returning * into p;
 return p;
end $$;
revoke all on function public.reserve_cash_stripe(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.reserve_cash_stripe(uuid,uuid,boolean,text) to service_role;
create or replace function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid,p_live boolean)
returns public.cash_stripe_payments language sql security definer set search_path=public as $$
 select public.reserve_cash_stripe(p_workspace,p_movement,p_live,'checkout');
$$;

create function public.settle_cash_terminal(p_id uuid,p_account text,p_amount bigint,p_currency text,p_intent text)
returns void language plpgsql security definer set search_path=public as $$
declare p cash_stripe_payments;
begin
 select * into p from cash_stripe_payments where id=p_id for update;
 if not found or p.channel<>'terminal' or p_intent is null or p.account_id is distinct from p_account
 or p.amount_cents is distinct from p_amount or p.currency is distinct from p_currency
 or (p.payment_intent is not null and p.payment_intent is distinct from p_intent)
 then raise exception 'Pagamento non corrispondente'; end if;
 perform set_config('salonpro.stripe_settle','yes',true);
 update cash_movements set payment_method='card',card_label='Stripe · Contactless',updated_at=now() where id=p.movement_id and workspace_id=p.workspace_id;
 update cash_stripe_payments set status='paid',payment_intent=p_intent,checkout_url=null where id=p.id;
 perform set_config('salonpro.stripe_settle','no',true);
end $$;
revoke all on function public.settle_cash_terminal(uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_cash_terminal(uuid,text,bigint,text,text) to service_role;

create function public.guard_stripe_appointment_paid() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if current_setting('salonpro.stripe_settle',true)='yes' then return new; end if;
 if new.cashed_in is distinct from old.cashed_in and exists(
  select 1 from cash_stripe_payments p join cash_movements m on m.id=p.movement_id
  where m.appointment_id=old.id and m.workspace_id=old.workspace_id and p.status<>'expired'
 ) then raise exception 'Verifica il pagamento Stripe dalla Cassa prima di modificare l’incasso'; end if;
 return new;
end $$;
revoke all on function public.guard_stripe_appointment_paid() from public,anon,authenticated;
create trigger stripe_appointment_paid_guard before update of cashed_in on public.appointments
for each row execute function public.guard_stripe_appointment_paid();

-- Manual POS/cash/bank payments recorded in Cassa must also update the linked slot.
-- No backfill: historical automatic entries are deliberately left untouched.
create function public.sync_cash_appointment_payment() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.appointment_id is not null and (tg_op='UPDATE' or new.payment_method is not null) then
  update appointments a set cashed_in=exists(
   select 1 from cash_movements m where m.appointment_id=a.id and m.workspace_id=a.workspace_id and m.payment_method is not null
  ),updated_at=now() where a.id=new.appointment_id and a.workspace_id=new.workspace_id
  and a.cashed_in is distinct from exists(
   select 1 from cash_movements m where m.appointment_id=a.id and m.workspace_id=a.workspace_id and m.payment_method is not null
  );
 end if;
 return new;
end $$;
revoke all on function public.sync_cash_appointment_payment() from public,anon,authenticated;
create trigger cash_appointment_payment_sync after insert or update of payment_method on public.cash_movements
for each row execute function public.sync_cash_appointment_payment();
