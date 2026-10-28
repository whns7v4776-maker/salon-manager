-- Revised appointments keep every receipt. Outstanding rows are retired, never rewritten.
create table public.appointment_payment_revisions (
 appointment_id uuid primary key,
 workspace_id uuid not null references public.workspaces(id),
 request_id uuid references public.booking_requests(id),
 total_cents bigint not null check(total_cents >= 0),
 credited_refund_cents bigint not null default 0,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
-- Appointment identity is retained after deletion, like an accounting reference.
create table public.appointment_revision_receipts (
 movement_id uuid primary key references public.cash_movements(id) on delete restrict,
 kind text not null default 'history' check(kind in ('history','upfront','balance')),
 appointment_id uuid not null references public.appointment_payment_revisions(appointment_id),
 workspace_id uuid not null references public.workspaces(id)
);
alter table public.appointment_payment_revisions enable row level security;
alter table public.appointment_revision_receipts enable row level security;
revoke all on public.appointment_payment_revisions,public.appointment_revision_receipts from public,anon,authenticated;
grant select on public.appointment_payment_revisions,public.appointment_revision_receipts to authenticated;
grant all on public.appointment_payment_revisions,public.appointment_revision_receipts to service_role;
create policy revision_owner_read on public.appointment_payment_revisions for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());
create policy revision_receipt_owner_read on public.appointment_revision_receipts for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());

create function public.appointment_revision_payment_state(p_appointment uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select jsonb_build_object('totalCents',r.total_cents,'revision',r.revision,
  'paidCents',coalesce(x.paid,0),'grossReceivedCents',coalesce(x.received,0),'receivedCents',coalesce(x.received,0)-r.credited_refund_cents,
  'balanceCents',greatest(0,r.total_cents-coalesce(x.received,0)+r.credited_refund_cents),
  'refundDueCents',greatest(0,coalesce(x.paid,0)-r.total_cents),
  'dueCents',coalesce((select sum(round(m.amount*100)) from appointment_revision_receipts l join cash_movements m on m.id=l.movement_id where l.appointment_id=r.appointment_id and l.kind='upfront' and m.payment_method is null and not m.booking_voided),0),
  'onlineMovementId',(select m.id from appointment_revision_receipts l join cash_movements m on m.id=l.movement_id where l.appointment_id=r.appointment_id and l.kind='upfront' and m.payment_method is null and not m.booking_voided limit 1),
  'movementId',(select m.id from appointment_revision_receipts l join cash_movements m on m.id=l.movement_id
    where l.appointment_id=r.appointment_id and m.payment_method is null and not m.booking_voided order by (l.kind='upfront') desc,m.id limit 1))
 from appointment_payment_revisions r left join lateral (
  select sum(round(m.amount*100)) filter(where m.payment_method is not null)::bigint received,
   sum(round(m.amount*100)-coalesce((select sum(p.refunded_cents) from cash_stripe_payments p where p.movement_id=m.id and p.status='paid'),0)) filter(where m.payment_method is not null)::bigint paid
  from appointment_revision_receipts l join cash_movements m on m.id=l.movement_id and m.workspace_id=l.workspace_id where l.appointment_id=r.appointment_id
 ) x on true where r.appointment_id=p_appointment
$$;
revoke all on function public.appointment_revision_payment_state(uuid) from public,anon,authenticated;
grant execute on function public.appointment_revision_payment_state(uuid) to service_role;

create function public.revise_appointment_payment(p_appointment uuid,p_total_cents bigint) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a appointments; o booking_payment_orders; state jsonb; balance bigint; due bigint; percent integer; movement uuid;
begin
 select * into a from appointments where id=p_appointment for update;
 if not found or p_total_cents is null or p_total_cents<0 or p_total_cents>99999999 then raise exception 'Importo non valido'; end if;
 select * into o from booking_payment_orders where appointment_id=a.id;
 insert into appointment_payment_revisions(appointment_id,workspace_id,request_id,total_cents)
 values(a.id,a.workspace_id,a.booking_request_id,p_total_cents)
 on conflict(appointment_id) do update set total_cents=excluded.total_cents,revision=appointment_payment_revisions.revision+1,updated_at=clock_timestamp();
 insert into appointment_revision_receipts(movement_id,appointment_id,workspace_id)
 select m.id,a.id,a.workspace_id from cash_movements m where m.workspace_id=a.workspace_id
 and (m.appointment_id=a.id or m.id in(o.upfront_movement_id,o.balance_movement_id)) on conflict do nothing;
 perform 1 from cash_movements m join appointment_revision_receipts l on l.movement_id=m.id where l.appointment_id=a.id order by m.id for update of m;
 if exists(select 1 from cash_stripe_payments p join appointment_revision_receipts l on l.movement_id=p.movement_id where l.appointment_id=a.id and p.status not in('expired','paid')) then
  raise exception 'Verifica o annulla il pagamento Stripe aperto in Cassa prima di modificare il servizio';
 end if;
 state=appointment_revision_payment_state(a.id);
 update appointment_payment_revisions set credited_refund_cents=(state->>'grossReceivedCents')::bigint-(state->>'paidCents')::bigint where appointment_id=a.id;
 state=appointment_revision_payment_state(a.id);
 -- A legacy cashed flag without a receipt cannot be safely converted into money.
 if a.cashed_in and (state->>'grossReceivedCents')::bigint=0 and current_setting('salonpro.service_revision_free',true) is distinct from a.id::text then raise exception 'Incasso senza movimento: verifica la Cassa prima di modificare il prezzo'; end if;
 update cash_movements m set booking_voided=true,updated_at=now() from appointment_revision_receipts l
 where l.appointment_id=a.id and m.id=l.movement_id and m.payment_method is null;
 balance=greatest(0,p_total_cents-(state->>'receivedCents')::bigint);
 select t.percent into percent from booking_payment_terms t where request_id=a.booking_request_id;
 due=least(balance,greatest(0,round(p_total_cents*coalesce(percent,0)/100.0)::bigint-(state->>'receivedCents')::bigint));
 if due<50 then due=0; end if;
 if due>0 then
  insert into cash_movements(workspace_id,description,amount) values(a.workspace_id,'Anticipo aggiornato · '||a.service_name||' · '||a.customer_name,due/100.0) returning id into movement;
  insert into appointment_revision_receipts(movement_id,appointment_id,workspace_id,kind) values(movement,a.id,a.workspace_id,'upfront');
 end if;
 if balance-due>0 then
  insert into cash_movements(workspace_id,description,amount) values(a.workspace_id,'Saldo aggiornato · '||a.service_name||' · '||a.customer_name,(balance-due)/100.0) returning id into movement;
  insert into appointment_revision_receipts(movement_id,appointment_id,workspace_id,kind) values(movement,a.id,a.workspace_id,'balance');
 end if;
 return appointment_revision_payment_state(a.id);
end $$;
revoke all on function public.revise_appointment_payment(uuid,bigint) from public,anon,authenticated;

alter function public.prepare_cash_appointment(uuid,uuid) rename to prepare_cash_appointment_before_revision;
create function public.prepare_cash_appointment(p_workspace uuid,p_appointment uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare s jsonb; m cash_movements;
begin
 perform 1 from appointments where id=p_appointment and workspace_id=p_workspace and not no_show for update;
 if not found then raise exception 'Appuntamento non disponibile'; end if;
 s=appointment_revision_payment_state(p_appointment);
 if s is null then return prepare_cash_appointment_before_revision(p_workspace,p_appointment); end if;
 select * into m from cash_movements where id=(s->>'movementId')::uuid and workspace_id=p_workspace and not booking_voided;
 if not found then raise exception 'Nessun saldo da incassare. Verifica eventuali rimborsi.'; end if;
 return jsonb_build_object('id',m.id,'importo',m.amount);
end $$;
revoke all on function public.prepare_cash_appointment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_cash_appointment(uuid,uuid) to service_role;

-- Extend the existing totals only for revised bookings; untouched bookings keep their contract.
alter function public.booking_payment_received_cents(uuid) rename to booking_payment_received_before_revision;
alter function public.booking_payment_paid_cents(uuid) rename to booking_payment_paid_before_revision;
create function public.booking_payment_received_cents(p_request uuid) returns bigint language sql stable security definer set search_path=public as $$
 select coalesce((select (appointment_revision_payment_state(appointment_id)->>'receivedCents')::bigint from appointment_payment_revisions where request_id=p_request),booking_payment_received_before_revision(p_request))
$$;
create function public.booking_payment_paid_cents(p_request uuid) returns bigint language sql stable security definer set search_path=public as $$
 select coalesce((select (appointment_revision_payment_state(appointment_id)->>'paidCents')::bigint from appointment_payment_revisions where request_id=p_request),booking_payment_paid_before_revision(p_request))
$$;
revoke all on function public.booking_payment_received_cents(uuid),public.booking_payment_paid_cents(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_received_cents(uuid),public.booking_payment_paid_cents(uuid) to service_role;

-- Existing receipt triggers must compare against the current agreed total.
DO $block$
declare name text; definition text;
begin
 foreach name in array array['sync_booking_payment_receipt','sync_cash_appointment_payment','guard_stripe_appointment_paid'] loop
  select pg_get_functiondef(p.oid) into definition from pg_proc p where pronamespace='public'::regnamespace and proname=name;
  if definition is null or position('o.total_cents' in definition)=0 then raise exception 'Unexpected payment guard: %',name; end if;
  definition=replace(definition,'o.total_cents','coalesce((select total_cents from appointment_payment_revisions where appointment_id=o.appointment_id),o.total_cents)');
  execute definition;
 end loop;
end $block$;

create function public.guard_revised_appointment_cashed() returns trigger language plpgsql security definer set search_path=public as $$
declare s jsonb;
begin
 s=appointment_revision_payment_state(old.id);
 if s is not null and new.cashed_in is distinct from old.cashed_in and new.cashed_in is distinct from ((s->>'receivedCents')::bigint>=(s->>'totalCents')::bigint) then
  raise exception 'Verifica il saldo aggiornato dalla Cassa';
 end if;
 return new;
end $$;
create trigger a_revised_cashed_guard before update on appointments for each row execute function guard_revised_appointment_cashed();

create function public.guard_revision_receipt() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from appointment_revision_receipts where movement_id=old.id) then
  if tg_op='DELETE' then raise exception 'Conserva lo storico degli incassi'; end if;
  if old.payment_method is not null and new.payment_method is distinct from old.payment_method then raise exception 'Conserva l’incasso originale; gestisci separatamente il rimborso'; end if;
  if new.payment_method is not null and old.payment_method is null then
   perform 1 from appointments a join appointment_revision_receipts l on l.appointment_id=a.id where l.movement_id=old.id for update of a;
   if current_setting('salonpro.stripe_settle',true) is distinct from 'yes' and round(new.amount*100)>(select (appointment_revision_payment_state(appointment_id)->>'balanceCents')::bigint from appointment_revision_receipts where movement_id=old.id) then raise exception 'Saldo aggiornato: verifica i pagamenti prima di incassare'; end if;
   new.booking_voided=false;
  end if;
  if new.amount is distinct from old.amount or new.workspace_id is distinct from old.workspace_id then raise exception 'Importo della revisione non modificabile'; end if;
  if new.payment_method is not null and old.payment_method is null and current_setting('salonpro.stripe_settle',true) is distinct from 'yes' and (
   old.booking_voided or not exists(select 1 from appointment_revision_receipts l join appointments a on a.id=l.appointment_id where l.movement_id=old.id and not a.no_show)
  ) then raise exception 'Saldo superato o appuntamento annullato: aggiorna la Cassa'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger revision_receipt_guard before update or delete on cash_movements for each row execute function guard_revision_receipt();

create function public.sync_revision_receipt() returns trigger language plpgsql security definer set search_path=public as $$
declare appointment uuid; s jsonb; movement uuid;
begin
 if tg_table_name='cash_movements' then movement=new.id; else movement=new.movement_id; end if;
 select appointment_id into appointment from appointment_revision_receipts where movement_id=movement;
 if appointment is not null then
  s=appointment_revision_payment_state(appointment);
  update appointments set cashed_in=((s->>'receivedCents')::bigint>=(s->>'totalCents')::bigint),updated_at=now()
   where id=appointment and cashed_in is distinct from ((s->>'receivedCents')::bigint>=(s->>'totalCents')::bigint);
 end if;
 return new;
end $$;
create trigger zz_revision_receipt_sync after update of payment_method on cash_movements for each row execute function sync_revision_receipt();
create trigger zz_revision_stripe_sync after update of status,refunded_cents on cash_stripe_payments for each row execute function sync_revision_receipt();

-- Serialize checkout with revision, and reject retired rows even when the caller has an old screen.
alter function public.reserve_cash_stripe(uuid,uuid,boolean,text) rename to reserve_cash_stripe_before_revision;
create function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid,p_live boolean,p_channel text) returns cash_stripe_payments language plpgsql security definer set search_path=public as $$
declare aid uuid;
begin
 select appointment_id into aid from appointment_revision_receipts where movement_id=p_movement and workspace_id=p_workspace;
 if aid is not null then
  perform 1 from appointments where id=aid and workspace_id=p_workspace and not no_show for update;
  if not found then raise exception 'Appuntamento non disponibile'; end if;
  perform 1 from cash_movements where id=p_movement for update;
  if exists(select 1 from cash_movements where id=p_movement and booking_voided) then raise exception 'Importo aggiornato: riapri il pagamento'; end if;
  if (select round(amount*100) from cash_movements where id=p_movement and payment_method is null)>(appointment_revision_payment_state(aid)->>'balanceCents')::bigint then raise exception 'Saldo aggiornato: verifica gli incassi in Cassa'; end if;
 end if;
 return reserve_cash_stripe_before_revision(p_workspace,p_movement,p_live,p_channel);
end $$;
revoke all on function public.reserve_cash_stripe(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.reserve_cash_stripe(uuid,uuid,boolean,text) to service_role;

create function public.revision_receipt_email() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from appointment_revision_receipts where movement_id=new.movement_id) then
  select a.booking_request_id,lower(trim(c.email::text)) into new.booking_request_id,new.receipt_email
  from appointment_revision_receipts l join appointments a on a.id=l.appointment_id and a.workspace_id=l.workspace_id
  left join customers c on c.id=a.customer_id and c.workspace_id=a.workspace_id where l.movement_id=new.movement_id;
  if length(coalesce(new.receipt_email,''))>254 or coalesce(new.receipt_email,'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then new.receipt_email=null; end if;
 end if;
 return new;
end $$;
create trigger zz_revision_receipt_email before insert on cash_stripe_payments for each row execute function revision_receipt_email();

create function public.guard_revision_payment_reservation() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from appointment_revision_receipts where movement_id=new.movement_id) and not exists(
  select 1 from appointment_revision_receipts l join cash_movements m on m.id=l.movement_id join appointments a on a.id=l.appointment_id and a.workspace_id=l.workspace_id
  left join booking_requests r on r.id=a.booking_request_id
  where l.movement_id=new.movement_id and not m.booking_voided and not a.no_show and (a.booking_request_id is null or r.status::text='accepted')
 ) then raise exception 'Pagamento superato o prenotazione annullata: aggiorna la Cassa'; end if;
 return new;
end $$;
create trigger revision_reservation_guard before insert on cash_stripe_payments for each row execute function guard_revision_payment_reservation();

create function public.cancel_revision_balances() returns trigger language plpgsql security definer set search_path=public as $$
declare aid uuid;
begin
 if tg_table_name='appointments' then
  if tg_op='DELETE' then aid=old.id;
  elsif new.no_show then aid=new.id; else return new; end if;
 else
  if new.status::text in('accepted','pending') then return new; end if;
  select appointment_id into aid from appointment_payment_revisions where request_id=new.id;
 end if;
 update cash_movements m set booking_voided=true,updated_at=now() from appointment_revision_receipts l where l.appointment_id=aid and m.id=l.movement_id and m.payment_method is null;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger cancel_revision_request after update of status on booking_requests for each row execute function cancel_revision_balances();
create trigger cancel_revision_appointment before delete or update of no_show on appointments for each row execute function cancel_revision_balances();
create trigger payment_revision_sync after insert or update or delete on appointment_payment_revisions for each row execute function touch_cash_sync_revision();

revoke all on function public.guard_revised_appointment_cashed(),public.guard_revision_receipt(),public.sync_revision_receipt(),public.revision_receipt_email(),public.guard_revision_payment_reservation(),public.cancel_revision_balances() from public,anon,authenticated;

alter function public.booking_payment_notice_is_due(uuid) rename to booking_payment_notice_before_revision;
create function public.booking_payment_notice_is_due(p_request uuid) returns boolean language sql stable security definer set search_path=public as $$
 select case when exists(select 1 from appointment_payment_revisions where request_id=p_request) then exists(
  select 1 from appointment_payment_revisions v join appointments a on a.id=v.appointment_id join booking_requests r on r.id=v.request_id
  join booking_payment_terms t on t.request_id=r.id where v.request_id=p_request and r.status::text='accepted' and not a.no_show
  and (appointment_revision_payment_state(a.id)->>'dueCents')::bigint>=50
 ) else booking_payment_notice_before_revision(p_request) end
$$;
revoke all on function public.booking_payment_notice_is_due(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_notice_is_due(uuid) to service_role;
create or replace function public.customer_booking_payment_notices(p_workspace uuid,p_customer uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('requestId',r.id,'serviceName',a.service_name,
  'dueCents',case when v.appointment_id is not null then (appointment_revision_payment_state(a.id)->>'dueCents')::bigint else o.due_cents end,
  'totalCents',coalesce(v.total_cents,o.total_cents),'mode',t.mode,'percent',t.percent) order by o.created_at,o.request_id),'[]'::jsonb)
 from booking_payment_orders o join booking_requests r on r.id=o.request_id and r.workspace_id=o.workspace_id
 join booking_payment_terms t on t.request_id=r.id join appointments a on a.id=o.appointment_id and a.workspace_id=o.workspace_id
 left join appointment_payment_revisions v on v.appointment_id=a.id
 where o.workspace_id=p_workspace and r.customer_id=p_customer and booking_payment_notice_is_due(r.id)
$$;

create function public.owner_appointment_refund_summary_v1() returns jsonb language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('appointmentId',a.id,'customer',a.customer_name,'service',a.service_name,'refundDueCents',(s->>'refundDueCents')::bigint)),'[]')
 from appointment_payment_revisions v join appointments a on a.id=v.appointment_id cross join lateral (select appointment_revision_payment_state(v.appointment_id) s) q
 where v.workspace_id=current_workspace_id() and (s->>'refundDueCents')::bigint>0);
end $$;
revoke all on function public.owner_appointment_refund_summary_v1() from public,anon;
grant execute on function public.owner_appointment_refund_summary_v1() to authenticated;

create unique index appointment_revision_request on public.appointment_payment_revisions(request_id) where request_id is not null;
create index appointment_revision_receipt_lookup on public.appointment_revision_receipts(appointment_id);
create table public.appointment_service_revision_history(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),appointment_id uuid not null,
 actor_id uuid not null,previous_snapshot jsonb not null,next_snapshot jsonb not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.appointment_service_revision_history enable row level security;
revoke all on public.appointment_service_revision_history from public,anon,authenticated;
grant select on public.appointment_service_revision_history to authenticated;
grant all on public.appointment_service_revision_history to service_role;
create policy service_revision_owner_read on public.appointment_service_revision_history for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());

create function public.get_owner_appointment_revision_v1(p_appointment uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a appointments;
begin
 select * into a from appointments where id=p_appointment and workspace_id=current_workspace_id();
 if auth.uid() is null or not workspace_access_allowed() or a.id is null then raise exception 'Accesso non consentito'; end if;
 return jsonb_build_object('appointment',to_jsonb(a),'payment',appointment_revision_payment_state(a.id),
  'services',(select coalesce(jsonb_agg(to_jsonb(s) order by s.name),'[]'::jsonb) from services s where s.workspace_id=a.workspace_id and not coalesce(s.composition_only,false) and s.superseded_by_composition_id is null),
  'operators',coalesce(get_public_portal_owner_payload_cached_v1(a.workspace_id)->'operatori','[]'::jsonb));
end $$;
revoke all on function public.get_owner_appointment_revision_v1(uuid) from public,anon;
grant execute on function public.get_owner_appointment_revision_v1(uuid) to authenticated;

create function public.revise_owner_appointment_service_v1(p_appointment uuid,p_expected timestamptz,p_service uuid,p_price numeric,p_initial integer,p_processing integer,p_final integer,p_operator_id text,p_final_operator_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; s services; f services; phase jsonb; assignments jsonb; total integer; start_at timestamp; end_at timestamp;
 v_operator_name text; v_final_operator_name text; operators jsonb; owner_payload jsonb; machine text; op jsonb; final_op jsonb; financial jsonb; r booking_requests; customer customers;
begin
 if auth.uid() is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=current_workspace_id();
 if not found then raise exception 'Appuntamento non disponibile'; end if;
 perform pg_advisory_xact_lock(hashtext(a.workspace_id::text||':'||a.appointment_date::text));
 select * into a from appointments where id=p_appointment and workspace_id=current_workspace_id() for update;
 if a.updated_at is distinct from p_expected then raise exception 'Appuntamento aggiornato da un altro dispositivo. Riapri la modifica.'; end if;
 start_at=a.appointment_date::timestamp+a.appointment_time;
 if a.no_show or start_at <= (now() at time zone 'Europe/Rome') then raise exception 'Puoi modificare solo appuntamenti futuri e attivi'; end if;
 if a.booking_request_id is not null then
  select * into r from booking_requests where id=a.booking_request_id and workspace_id=a.workspace_id for update;
  if r.id is null or r.status::text is distinct from 'accepted' then raise exception 'La prenotazione non è più confermata'; end if;
 end if;
 select * into s from services where id=p_service and workspace_id=a.workspace_id and not coalesce(composition_only,false) and superseded_by_composition_id is null for share;
 if not found then raise exception 'Servizio non disponibile nel listino'; end if;
 if coalesce(s.linked_service_config->>'dependencyMode','')='automatic' and exists(select 1 from jsonb_array_elements_text(coalesce(s.linked_service_config->'requiredServiceIds','[]')) d where d is distinct from s.phase_config->>'finalServiceId') then
  raise exception 'Questo servizio richiede una composizione: modifica i componenti dalla composizione';
 end if;
 if p_price is null or p_price<0 or p_price>999999.99 or p_price<>round(p_price,2) then raise exception 'Prezzo non valido'; end if;
 phase=case when s.phase_config->>'mode'='phased' then s.phase_config else null end;
 if p_initial is null or p_processing is null or p_final is null or p_initial<5 or p_initial>480 or p_processing<0 or p_processing>480 or p_final<0 or p_final>480 or p_initial%5<>0 or p_processing%5<>0 or p_final%5<>0 then raise exception 'Tempi non validi: usa intervalli di 5 minuti'; end if;
 if phase is null and (p_processing<>0 or p_final<>0) then raise exception 'Il servizio non prevede fasi'; end if;
 if phase is not null then
  if coalesce((phase->>'finalPhaseEnabled')::boolean,true) and p_final<5 then raise exception 'Durata della fase finale non valida'; end if;
  if not coalesce((phase->>'finalPhaseEnabled')::boolean,true) and p_final<>0 then raise exception 'Il servizio non prevede fase finale'; end if;
  phase=phase||jsonb_build_object('initialDurationMinutes',p_initial,'processingDurationMinutes',p_processing,'finalDurationMinutes',p_final);
  if p_final>0 then
   select * into f from services where workspace_id=a.workspace_id and (id::text=phase->>'finalServiceId' or name=phase->>'finalServiceName') order by (id::text=phase->>'finalServiceId') desc limit 1;
   if not found then raise exception 'Completa la fase finale nel listino'; end if;
  end if;
 end if;
 total=p_initial+p_processing+p_final;end_at=start_at+make_interval(mins=>total);
 if end_at::date<>a.appointment_date then raise exception 'Il servizio deve terminare nella stessa giornata'; end if;
 owner_payload=get_public_portal_owner_payload_cached_v1(a.workspace_id);
 operators=coalesce(owner_payload->'operatori','[]');
 for machine in select distinct jsonb_array_elements_text(coalesce(value->'macchinarioIds','[]')) from jsonb_array_elements(coalesce(owner_payload->'servizi','[]')) where value->>'id' in(s.id::text,f.id::text) or value->>'nome' in(s.name,f.name) loop
  if not exists(select 1 from jsonb_array_elements(coalesce(owner_payload->'macchinari','[]')) m where m->>'id'=machine and coalesce((m->>'attivo')::boolean,true)) then raise exception 'Un macchinario richiesto non è attivo'; end if;
 end loop;
 -- Owner changes may use salon capacity only when that trade has no configured operators.
 if coalesce(p_operator_id,'') like 'salon-capacity::%' then p_operator_id=null; end if;
 if coalesce(p_final_operator_id,'') like 'salon-capacity::%' then p_final_operator_id=null; end if;
 select value into op from jsonb_array_elements(operators) where value->>'id'=p_operator_id;
 v_operator_name=coalesce(op->>'nome',op->>'name');
 if p_operator_id is null then
  if exists(select 1 from jsonb_array_elements(operators) o where lower(trim(coalesce(o->>'mestiere',o->>'required_role','')))=lower(trim(coalesce(s.required_role,'')))) then raise exception 'Scegli l’operatore del nuovo servizio'; end if;
 elsif op is null or (nullif(s.required_role,'') is not null and lower(trim(coalesce(op->>'mestiere',op->>'required_role','')))<>lower(trim(s.required_role)) and public_operator_can_book_service_v1(a.workspace_id,p_operator_id,v_operator_name,s.name,s.required_role) is not true) then raise exception 'Scegli un operatore abilitato al nuovo servizio'; end if;
 if p_final>0 then
  if coalesce((phase->>'sameOperator')::boolean,true) and p_final_operator_id is distinct from p_operator_id then raise exception 'Questo servizio richiede lo stesso operatore nelle due fasi'; end if;
  select value into final_op from jsonb_array_elements(operators) where value->>'id'=p_final_operator_id;
  v_final_operator_name=coalesce(final_op->>'nome',final_op->>'name');
  if p_final_operator_id is null then
   if exists(select 1 from jsonb_array_elements(operators) o where lower(trim(coalesce(o->>'mestiere',o->>'required_role','')))=lower(trim(coalesce(f.required_role,'')))) then raise exception 'Scegli l’operatore della fase finale'; end if;
  elsif final_op is null or (nullif(f.required_role,'') is not null and lower(trim(coalesce(final_op->>'mestiere',final_op->>'required_role','')))<>lower(trim(f.required_role)) and public_operator_can_book_service_v1(a.workspace_id,p_final_operator_id,v_final_operator_name,f.name,f.required_role) is not true) then raise exception 'Scegli un operatore abilitato alla fase finale'; end if;
 end if;
 perform set_config('app.booking_exclude_appointment_id',a.id::text,true);
 perform set_config('app.booking_exclude_request_id',coalesce(a.booking_request_id::text,''),true);
 if not is_public_booking_time_allowed_by_availability(a.workspace_id,a.appointment_date,a.appointment_time,total)
 or not is_public_booking_slot_available(a.workspace_id,a.appointment_date,a.appointment_time,p_initial,s.name,p_operator_id,v_operator_name)
 or phased_operator_interval_conflicts_v1(a.workspace_id,a.appointment_date,a.appointment_time,p_initial,p_operator_id,v_operator_name,a.id,a.booking_request_id)
 or (p_final>0 and (not is_public_booking_slot_available(a.workspace_id,a.appointment_date,(a.appointment_time+make_interval(mins=>p_initial+p_processing))::time,p_final,f.name,p_final_operator_id,v_final_operator_name)
 or phased_operator_interval_conflicts_v1(a.workspace_id,a.appointment_date,(a.appointment_time+make_interval(mins=>p_initial+p_processing))::time,p_final,p_final_operator_id,v_final_operator_name,a.id,a.booking_request_id))) then
  raise exception 'Il nuovo servizio non entra in questo orario: verifica operatori, chiusure e macchinari';
 end if;
 if p_operator_id is null and exists(select 1 from appointments b where b.workspace_id=a.workspace_id and b.id<>a.id and b.appointment_date=a.appointment_date and lower(trim(coalesce(b.required_role,'')))=lower(trim(coalesce(s.required_role,''))) and b.appointment_date::timestamp+b.appointment_time<start_at+make_interval(mins=>p_initial) and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.duration_minutes)>start_at) then raise exception 'La disponibilità del salone è già occupata'; end if;
 if p_final>0 and p_final_operator_id is null and exists(select 1 from appointments b where b.workspace_id=a.workspace_id and b.id<>a.id and b.appointment_date=a.appointment_date and lower(trim(coalesce(b.required_role,'')))=lower(trim(coalesce(f.required_role,''))) and b.appointment_date::timestamp+b.appointment_time<end_at and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.duration_minutes)>start_at+make_interval(mins=>p_initial+p_processing)) then raise exception 'La disponibilità della fase finale è già occupata'; end if;
 if exists(select 1 from appointments b where b.workspace_id=a.workspace_id and b.id<>a.id and b.appointment_date=a.appointment_date
  and ((a.customer_id is not null and b.customer_id=a.customer_id) or lower(trim(b.customer_name))=lower(trim(a.customer_name)))
  and b.appointment_date::timestamp+b.appointment_time<end_at and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.duration_minutes)>start_at) then
  raise exception 'La nuova durata si sovrappone a un altro appuntamento del cliente';
 end if;
 if exists(select 1 from booking_requests b where b.workspace_id=a.workspace_id and b.id is distinct from a.booking_request_id and b.status::text='pending' and b.customer_id=a.customer_id and b.appointment_date=a.appointment_date and b.appointment_date::timestamp+b.appointment_time<end_at and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.requested_duration_minutes)>start_at) then raise exception 'Il cliente ha una richiesta in approvazione nello stesso intervallo'; end if;
 assignments=case when phase is null then null else jsonb_build_object('version',1,'initial',jsonb_build_object('id',p_operator_id,'name',v_operator_name),'final',jsonb_build_object('id',p_final_operator_id,'name',v_final_operator_name)) end;
 if a.service_name is not distinct from s.name and a.price is not distinct from p_price and a.duration_minutes=total
 and a.required_role is not distinct from s.required_role and a.phase_snapshot is not distinct from phase
 and a.phase_operator_assignments is not distinct from assignments and a.operator_id is not distinct from p_operator_id then
  return jsonb_build_object('appointment',to_jsonb(a),'payment',appointment_revision_payment_state(a.id),'unchanged',true);
 end if;
 -- A single transaction: no cancellation/recreation and no orphaned payment.
 perform set_config('salonpro.service_revision',a.id::text,true);
 perform set_config('salonpro.service_revision_free',case when a.price=0 then a.id::text else '' end,true);
 update appointments set service_name=s.name,price=p_price,duration_minutes=total,required_role=s.required_role,phase_snapshot=phase,phase_operator_assignments=assignments,operator_id=p_operator_id,operator_name=v_operator_name,updated_at=clock_timestamp() where id=a.id;
 financial=revise_appointment_payment(a.id,round(p_price*100)::bigint);
 update appointments set cashed_in=((financial->>'receivedCents')::bigint>=round(p_price*100)::bigint) where id=a.id;
 if a.booking_request_id is not null then
  update booking_requests set requested_service_name=s.name,requested_price=p_price,requested_duration_minutes=total,required_role=s.required_role,phase_snapshot=phase,phase_operator_assignments=assignments,requested_operator_id=p_operator_id,requested_operator_name=v_operator_name,viewed_by_customer=false,updated_at=clock_timestamp() where id=a.booking_request_id;
 end if;
 select * into customer from customers where id=a.customer_id and workspace_id=a.workspace_id;
 if coalesce(r.customer_email,customer.email) is not null or coalesce(r.customer_phone,customer.phone) is not null then
  perform queue_public_customer_push(a.workspace_id,'appointment_updated','Appuntamento aggiornato',s.name||' · '||to_char(a.appointment_date,'DD/MM/YYYY')||' alle '||to_char(a.appointment_time,'HH24:MI')||' · '||total||' min · '||replace(to_char(p_price,'FM999999990.00'),'.',',')||' €.'||
   case when (financial->>'refundDueCents')::bigint>0 then ' Rimborso da concordare con il salone: '||replace(to_char((financial->>'refundDueCents')::numeric/100,'FM999999990.00'),'.',',')||' €.'
   when (financial->>'balanceCents')::bigint>0 then ' Da saldare: '||replace(to_char((financial->>'balanceCents')::numeric/100,'FM999999990.00'),'.',',')||' €.' else ' Pagamento già coperto.' end,
   jsonb_build_object('type','appointment_updated','notificationType','appointment_updated','_serviceRevision',true,'revision',(financial->>'revision')::bigint,'eventId','service-revision:'||a.id||':'||(financial->>'revision'),'appointmentId',a.id,'appointmentDate',a.appointment_date,'appointmentTime',a.appointment_time,'serviceName',s.name,'bookingRequestId',a.booking_request_id,'requestId',a.booking_request_id,'_pushTarget','client','_dedupeKey','service-revision:'||a.id||':'||(financial->>'revision'),'screen','cliente','tab','notifications'),coalesce(r.customer_email,customer.email)::citext,coalesce(r.customer_phone,customer.phone));
 end if;
 insert into appointment_service_revision_history(workspace_id,appointment_id,actor_id,previous_snapshot,next_snapshot) values(a.workspace_id,a.id,auth.uid(),to_jsonb(a),(select to_jsonb(x) from appointments x where x.id=a.id));
 perform refresh_workspace_agenda_state(a.workspace_id);
 return jsonb_build_object('appointment',(select to_jsonb(x) from appointments x where x.id=a.id),'payment',financial);
end $$;
revoke all on function public.revise_owner_appointment_service_v1(uuid,timestamptz,uuid,numeric,integer,integer,integer,text,text) from public,anon;
grant execute on function public.revise_owner_appointment_service_v1(uuid,timestamptz,uuid,numeric,integer,integer,integer,text,text) to authenticated;

create function public.guard_revised_service_agreement() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (new.price is distinct from old.price or new.service_name is distinct from old.service_name) and exists(select 1 from appointment_payment_revisions where appointment_id=old.id) and current_setting('salonpro.service_revision',true) is distinct from old.id::text then
 raise exception 'Usa Servizio, durata e prezzo per aggiornare anche il saldo della prenotazione'; end if;
 return new;
end $$;
revoke all on function public.guard_revised_service_agreement() from public,anon,authenticated;
create trigger revision_agreement_guard before update on appointments for each row execute function guard_revised_service_agreement();
