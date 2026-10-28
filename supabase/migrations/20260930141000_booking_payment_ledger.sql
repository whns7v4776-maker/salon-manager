-- A deposit and its balance are separate receipts. Only the balance keeps the
-- legacy unique appointment_id, so existing cash queries still count each receipt once.
create table public.booking_payment_orders (
 request_id uuid primary key references public.booking_requests(id) on delete restrict,
 workspace_id uuid not null references public.workspaces(id),
 appointment_id uuid unique references public.appointments(id) on delete set null,
 upfront_movement_id uuid not null unique references public.cash_movements(id),
 balance_movement_id uuid unique references public.cash_movements(id),
 total_cents bigint not null check(total_cents>0),
 due_cents bigint not null check(due_cents>0 and due_cents<=total_cents),
 created_at timestamptz not null default now()
);
alter table public.cash_movements add column booking_voided boolean not null default false;
alter table public.booking_payment_orders enable row level security;
revoke all on public.booking_payment_orders from public,anon,authenticated;
grant select on public.booking_payment_orders to authenticated;
grant all on public.booking_payment_orders to service_role;
create policy booking_payment_order_owner_read on public.booking_payment_orders for select to authenticated
 using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed());
create trigger booking_payment_order_revision after insert or update or delete on public.booking_payment_orders
 for each row execute function public.touch_cash_sync_revision();

create function public.booking_payment_paid_cents(p_request uuid) returns bigint
language sql stable security definer set search_path=public as $$
 select coalesce(sum(case when m.payment_method is null then 0 else round(m.amount*100)-coalesce((
  select sum(p.refunded_cents) from cash_stripe_payments p where p.movement_id=m.id and p.status='paid'
 ),0) end),0)::bigint from booking_payment_orders o join cash_movements m
 on m.id in(o.upfront_movement_id,o.balance_movement_id) and m.workspace_id=o.workspace_id where o.request_id=p_request
$$;
revoke all on function public.booking_payment_paid_cents(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_paid_cents(uuid) to service_role;

-- A refund is a separate operation, not an automatic new debt for the customer.
create function public.booking_payment_received_cents(p_request uuid) returns bigint
language sql stable security definer set search_path=public as $$
 select coalesce(sum(case when m.payment_method is null then 0 else round(m.amount*100) end),0)::bigint
 from booking_payment_orders o join cash_movements m on m.id in(o.upfront_movement_id,o.balance_movement_id)
 and m.workspace_id=o.workspace_id where o.request_id=p_request
$$;
revoke all on function public.booking_payment_received_cents(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_received_cents(uuid) to service_role;

create function public.prepare_booking_payment_ledger(p_workspace uuid,p_appointment uuid)
returns public.booking_payment_orders language plpgsql security definer set search_path=public as $$
declare a appointments; t booking_payment_terms; o booking_payment_orders; m cash_movements;
 upfront uuid; balance uuid; customer_label text;
begin
 select * into a from appointments where id=p_appointment and workspace_id=p_workspace for update;
 if not found or a.no_show then raise exception 'Appuntamento non disponibile'; end if;
 select * into o from booking_payment_orders where appointment_id=a.id and workspace_id=p_workspace;
 if found then return o; end if;
 select * into t from booking_payment_terms where request_id=a.booking_request_id and workspace_id=p_workspace;
 if not found or t.due_cents=0 then return null; end if;
 if not exists(select 1 from booking_requests where id=t.request_id and workspace_id=p_workspace and status::text='accepted') then
  raise exception 'Attendi l’approvazione del salone';
 end if;
 if a.cashed_in then raise exception 'Appuntamento già incassato'; end if;
 if round(a.price*100)<>t.total_cents then raise exception 'Importo della prenotazione modificato. Verifica il pagamento con il salone.'; end if;
 select * into m from cash_movements where appointment_id=a.id and workspace_id=p_workspace for update;
 if found and (m.payment_method is not null or exists(select 1 from cash_stripe_payments where movement_id=m.id and status<>'expired')) then
  raise exception 'Pagamento già registrato o in corso: verifica la Cassa';
 end if;
 customer_label=coalesce(a.service_name,'Servizio')||' · '||coalesce(a.customer_name,'Cliente');
 if t.mode='full' or t.due_cents=t.total_cents then
  if m.id is null then
   insert into cash_movements(workspace_id,appointment_id,description,amount)
   values(p_workspace,a.id,'Prenotazione · '||customer_label,t.total_cents/100.0) returning id into upfront;
  else
   if round(m.amount*100)<>t.total_cents then raise exception 'Importo in Cassa non corrispondente'; end if;
   upfront=m.id;
  end if;
 else
  if m.id is null then
   insert into cash_movements(workspace_id,appointment_id,description,amount)
   values(p_workspace,a.id,'Saldo · '||customer_label,(t.total_cents-t.due_cents)/100.0) returning id into balance;
  else
   if round(m.amount*100)<>t.total_cents then raise exception 'Importo in Cassa non corrispondente'; end if;
   update cash_movements set description='Saldo · '||customer_label,amount=(t.total_cents-t.due_cents)/100.0,updated_at=now() where id=m.id;
   balance=m.id;
  end if;
  insert into cash_movements(workspace_id,description,amount)
  values(p_workspace,'Acconto '||t.percent||'% · '||customer_label,t.due_cents/100.0) returning id into upfront;
 end if;
 insert into booking_payment_orders(request_id,workspace_id,appointment_id,upfront_movement_id,balance_movement_id,total_cents,due_cents)
 values(t.request_id,p_workspace,a.id,upfront,balance,t.total_cents,t.due_cents) returning * into o;
 return o;
end $$;
revoke all on function public.prepare_booking_payment_ledger(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_booking_payment_ledger(uuid,uuid) to service_role;

alter function public.prepare_cash_appointment(uuid,uuid) rename to prepare_cash_appointment_without_booking_policy;
create function public.prepare_cash_appointment(p_workspace uuid,p_appointment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o booking_payment_orders; m cash_movements;
begin
 o=prepare_booking_payment_ledger(p_workspace,p_appointment);
 if o.request_id is null then return prepare_cash_appointment_without_booking_policy(p_workspace,p_appointment); end if;
 select * into m from cash_movements where id=o.upfront_movement_id;
 if m.payment_method is not null and o.balance_movement_id is not null then
  select * into m from cash_movements where id=o.balance_movement_id;
 end if;
 if m.payment_method is not null then raise exception 'Pagamento già registrato'; end if;
 return jsonb_build_object('id',m.id,'importo',m.amount);
end $$;
revoke all on function public.prepare_cash_appointment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_cash_appointment(uuid,uuid) to service_role;

create function public.sync_booking_payment_receipt() returns trigger
language plpgsql security definer set search_path=public as $$
declare o booking_payment_orders; movement uuid;
begin
 if tg_table_name='cash_movements' then movement=new.id; else movement=new.movement_id; end if;
 select * into o from booking_payment_orders where movement in(upfront_movement_id,balance_movement_id);
 if found then
  update appointments set cashed_in=(booking_payment_received_cents(o.request_id)>=o.total_cents),updated_at=now()
  where id=o.appointment_id and workspace_id=o.workspace_id and cashed_in is distinct from (booking_payment_received_cents(o.request_id)>=o.total_cents);
 end if;
 return new;
end $$;
revoke all on function public.sync_booking_payment_receipt() from public,anon,authenticated;
create trigger booking_receipt_cash_sync after update of payment_method on public.cash_movements for each row execute function public.sync_booking_payment_receipt();
create trigger booking_receipt_stripe_sync after update of status,refunded_cents on public.cash_stripe_payments for each row execute function public.sync_booking_payment_receipt();

create or replace function public.sync_cash_appointment_payment() returns trigger
language plpgsql security definer set search_path=public as $$
declare o booking_payment_orders; paid boolean;
begin
 if new.appointment_id is not null and (tg_op='UPDATE' or new.payment_method is not null) then
  select * into o from booking_payment_orders where appointment_id=new.appointment_id and workspace_id=new.workspace_id;
  if found then paid=booking_payment_received_cents(o.request_id)>=o.total_cents;
  else paid=exists(select 1 from cash_movements m where m.appointment_id=new.appointment_id and m.workspace_id=new.workspace_id and m.payment_method is not null); end if;
  update appointments set cashed_in=paid,updated_at=now() where id=new.appointment_id and workspace_id=new.workspace_id and cashed_in is distinct from paid;
 end if;
 return new;
end $$;

create or replace function public.guard_stripe_appointment_paid() returns trigger
language plpgsql security definer set search_path=public as $$
declare o booking_payment_orders;
begin
 select * into o from booking_payment_orders where appointment_id=old.id and workspace_id=old.workspace_id;
 if found then
  if new.cashed_in is distinct from old.cashed_in and new.cashed_in is distinct from (booking_payment_received_cents(o.request_id)>=o.total_cents) then
   raise exception 'Acconto e saldo vanno verificati nella Cassa prima di modificare l’incasso';
  end if;
  return new;
 end if;
 if current_setting('salonpro.stripe_settle',true)='yes' then return new; end if;
 if new.cashed_in is distinct from old.cashed_in and exists(
  select 1 from cash_stripe_payments p join cash_movements m on m.id=p.movement_id
  where m.appointment_id=old.id and m.workspace_id=old.workspace_id and p.status<>'expired'
 ) then raise exception 'Verifica il pagamento Stripe dalla Cassa prima di modificare l’incasso'; end if;
 return new;
end $$;

create or replace function public.mark_stripe_appointment_paid() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.status='paid' and old.status is distinct from 'paid' then
  update appointments a set cashed_in=true,updated_at=now()
  from cash_movements m where m.id=new.movement_id and m.workspace_id=new.workspace_id
  and a.id=m.appointment_id and a.workspace_id=new.workspace_id
  and not exists(select 1 from booking_payment_orders where appointment_id=a.id);
 end if;
 return new;
end $$;

-- Protect contractual amounts and links; normal method changes still use existing Stripe guards.
create function public.guard_booking_payment_movement() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from booking_payment_orders where old.id in(upfront_movement_id,balance_movement_id)) then
  if tg_op='DELETE' then raise exception 'Movimento collegato a una prenotazione: conserva lo storico'; end if;
  if new.amount is distinct from old.amount or new.workspace_id is distinct from old.workspace_id or (
   new.appointment_id is distinct from old.appointment_id and not(new.appointment_id is null and not exists(select 1 from appointments where id=old.appointment_id))
  ) then
   raise exception 'Importo collegato all’accordo di prenotazione: non modificabile';
  end if;
  if old.booking_voided and new.payment_method is not null and current_setting('salonpro.stripe_settle',true) is distinct from 'yes' then
   raise exception 'Prenotazione annullata: non registrare nuovi incassi';
  end if;
  if new.payment_method is not null then new.booking_voided=false; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.guard_booking_payment_movement() from public,anon,authenticated;
create trigger booking_payment_movement_guard before update or delete on public.cash_movements for each row execute function public.guard_booking_payment_movement();

alter table public.cash_stripe_payments add column booking_request_id uuid references public.booking_requests(id);
create function public.snapshot_booking_receipt_email() returns trigger language plpgsql security definer set search_path=public as $$
begin
 select o.request_id,lower(trim(r.customer_email::text)) into new.booking_request_id,new.receipt_email
 from booking_payment_orders o join booking_requests r on r.id=o.request_id and r.workspace_id=o.workspace_id
 where new.movement_id in(o.upfront_movement_id,o.balance_movement_id) and o.workspace_id=new.workspace_id;
 if new.booking_request_id is null then
  select lower(trim(c.email::text)) into new.receipt_email from cash_movements m
  join appointments a on a.id=m.appointment_id and a.workspace_id=m.workspace_id
  join customers c on c.id=a.customer_id and c.workspace_id=a.workspace_id
  where m.id=new.movement_id and m.workspace_id=new.workspace_id;
 end if;
 if length(coalesce(new.receipt_email,''))>254 or coalesce(new.receipt_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then new.receipt_email=null; end if;
 return new;
end $$;
revoke all on function public.snapshot_booking_receipt_email() from public,anon,authenticated;
create trigger z_booking_receipt_email before insert on public.cash_stripe_payments for each row execute function public.snapshot_booking_receipt_email();

-- Same exact email + normalized phone identity used by the client booking portal.
-- Service-role only: no new anonymous table access or editable prices.
create function public.booking_payment_customer_context(p_salon_code text,p_email text,p_phone text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid; c uuid; matches integer;
begin
 if length(trim(coalesce(p_email,'')))=0 or length(regexp_replace(coalesce(p_phone,''),'\D','','g'))=0 then return null; end if;
 select id into w from workspaces where slug=lower(trim(p_salon_code)) and subscription_status in('demo','active');
 if w is null then return null; end if;
 select count(*),(array_agg(id))[1] into matches,c from customers where workspace_id=w and is_active is not false
 and lower(trim(email::text))=lower(trim(p_email)) and regexp_replace(coalesce(phone,''),'\D','','g')=regexp_replace(p_phone,'\D','','g');
 if matches<>1 then return null; end if;
 return jsonb_build_object('workspaceId',w,'customerId',c,'policy',resolve_booking_payment_policy(w,c));
end $$;
revoke all on function public.booking_payment_customer_context(text,text,text) from public,anon,authenticated;
grant execute on function public.booking_payment_customer_context(text,text,text) to service_role;

-- Keep real receipts after cancellation, exclude unpaid cancelled balances from
-- cash totals, and allow the existing cancellation RPC to detach the deleted slot.
create or replace function public.guard_cash_stripe() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if current_setting('salonpro.stripe_settle',true)='yes' then return new; end if;
 if exists(select 1 from cash_stripe_payments where movement_id=old.id and status<>'expired') then
  if tg_op='DELETE' then raise exception 'Pagamento Stripe associato: il movimento va conservato'; end if;
  if new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method
    or new.card_label is distinct from old.card_label or new.workspace_id is distinct from old.workspace_id
    or (new.appointment_id is distinct from old.appointment_id and not(
     new.appointment_id is null and not exists(select 1 from appointments where id=old.appointment_id)
     and exists(select 1 from booking_payment_orders where old.id in(upfront_movement_id,balance_movement_id))
    ))
  then raise exception 'Pagamento Stripe associato: verifica o annulla il link prima di modificare l’incasso'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;

create function public.cancel_booking_payment_balances() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status::text not in('accepted','pending') and new.status is distinct from old.status then
  update cash_movements m set booking_voided=true,updated_at=now()
  from booking_payment_orders o where o.request_id=new.id and o.workspace_id=new.workspace_id
  and m.id in(o.upfront_movement_id,o.balance_movement_id) and m.payment_method is null;
 end if;
 return new;
end $$;
revoke all on function public.cancel_booking_payment_balances() from public,anon,authenticated;
create trigger cancel_booking_payment_balances after update of status on public.booking_requests
 for each row execute function public.cancel_booking_payment_balances();

create function public.guard_booking_payment_reservation() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from booking_payment_orders o join booking_requests r on r.id=o.request_id
  where new.movement_id in(o.upfront_movement_id,o.balance_movement_id) and r.status::text<>'accepted') then
  raise exception 'Prenotazione non confermata: pagamento non disponibile';
 end if;
 return new;
end $$;
revoke all on function public.guard_booking_payment_reservation() from public,anon,authenticated;
create trigger booking_payment_reservation_guard before insert on public.cash_stripe_payments
 for each row execute function public.guard_booking_payment_reservation();

-- Deferred creation sees the final accepted request and appointment in the same
-- transaction, including automatic approval. Pending requests create no debt.
create function public.prepare_accepted_booking_payment() returns trigger language plpgsql security definer set search_path=public as $$
declare request uuid; appointment uuid; workspace uuid;
begin
 if tg_table_name='appointments' then request=new.booking_request_id; else request=new.id; end if;
 select a.id,a.workspace_id into appointment,workspace from appointments a
 join booking_requests r on r.id=a.booking_request_id and r.workspace_id=a.workspace_id
 join booking_payment_terms t on t.request_id=r.id and t.workspace_id=r.workspace_id
 where r.id=request and r.status::text='accepted' and not a.no_show and t.due_cents>0;
 if appointment is not null then perform prepare_booking_payment_ledger(workspace,appointment); end if;
 return null;
end $$;
revoke all on function public.prepare_accepted_booking_payment() from public,anon,authenticated;
create constraint trigger accepted_booking_payment_request after insert or update on public.booking_requests
 deferrable initially deferred for each row execute function public.prepare_accepted_booking_payment();
create constraint trigger accepted_booking_payment_appointment after insert on public.appointments
 deferrable initially deferred for each row execute function public.prepare_accepted_booking_payment();
