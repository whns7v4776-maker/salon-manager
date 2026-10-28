-- Independent balances: loyalty points are never money or package uses.
create table public.salon_loyalty_rewards (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(trim(name)) between 1 and 120),points_cost integer not null check(points_cost>0),
 archived boolean not null default false,revision integer not null default 1
);
create table public.customer_loyalty_ledger (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),customer_id uuid not null references public.customers(id),
 delta integer not null,awarded_points integer,kind text not null check(kind in ('service','reward')),reference_key text not null,
 description text not null,created_at timestamptz not null default now(),unique(workspace_id,reference_key)
);
create index loyalty_customer_balance on public.customer_loyalty_ledger(workspace_id,customer_id);
create table public.customer_gift_cards (
 id uuid primary key,workspace_id uuid not null references public.workspaces(id),customer_id uuid not null references public.customers(id),
 code text not null unique default upper(encode(extensions.gen_random_bytes(8),'hex')),
 amount_cents bigint not null check(amount_cents between 1 and 100000000),expires_on date,
 message text not null default '' check(length(message)<=500),sender_name text not null default '' check(length(sender_name)<=120),
 funding text not null check(funding in ('paid','complimentary')),purchase_movement_id uuid unique references public.cash_movements(id),
 created_at timestamptz not null default now(),check((funding='paid')=(purchase_movement_id is not null))
);
create table public.gift_card_uses (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 gift_card_id uuid not null references public.customer_gift_cards(id),appointment_id uuid not null unique,
 request_id uuid,amount_cents bigint not null check(amount_cents>0),original_price numeric not null,
 state text not null default 'reserved' check(state in ('reserved','consumed','released')),created_at timestamptz not null default now()
);
create index gift_card_uses_balance on public.gift_card_uses(gift_card_id,state);
do $$ declare t text; begin
 foreach t in array array['salon_loyalty_rewards','customer_loyalty_ledger','customer_gift_cards','gift_card_uses'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy benefit_owner_read on public.%I for select to authenticated using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed())',t);
 end loop;
end $$;

create function public.save_loyalty_reward(p_id uuid,p_revision integer,p_name text,p_cost integer,p_archived boolean default false)
returns public.salon_loyalty_rewards language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); r salon_loyalty_rewards;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 if p_id is null then insert into salon_loyalty_rewards(workspace_id,name,points_cost) values(w,trim(p_name),p_cost) returning * into r;
 else update salon_loyalty_rewards set name=trim(p_name),points_cost=p_cost,archived=p_archived,revision=revision+1 where id=p_id and workspace_id=w and revision=p_revision returning * into r;
 if not found then raise exception 'Premio modificato: ricarica'; end if; end if;
 return r;
end $$;

create function public.redeem_loyalty_reward(p_customer uuid,p_reward uuid,p_revision integer,p_operation uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); r salon_loyalty_rewards; prior customer_loyalty_ledger; balance bigint; result uuid;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 perform 1 from customers where id=p_customer and workspace_id=w for update;
 if not found then raise exception 'Cliente non trovato'; end if;
 select * into prior from customer_loyalty_ledger where workspace_id=w and reference_key='reward:'||p_operation;
 if found then
  if prior.customer_id<>p_customer then raise exception 'Operazione già utilizzata'; end if;
  return prior.id;
 end if;
 select * into r from salon_loyalty_rewards where id=p_reward and workspace_id=w for share;
 if not found or r.archived or r.revision<>p_revision then raise exception 'Premio non disponibile: aggiorna'; end if;
 select coalesce(sum(delta),0) into balance from customer_loyalty_ledger where customer_id=p_customer and workspace_id=w;
 if balance<r.points_cost then raise exception 'Punti insufficienti'; end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description)
 values(w,p_customer,-r.points_cost,'reward','reward:'||p_operation,'Omaggio consegnato: '||r.name) returning id into result;
 return result;
end $$;

-- No retroactive awards. One logical service/group earns once, when fully performed.
create function public.sync_service_loyalty() returns trigger language plpgsql security definer set search_path=public as $$
declare a appointments; k text; c uuid; w uuid; points integer; enabled boolean; done boolean; prior customer_loyalty_ledger;
begin
 if tg_op='DELETE' then a=old; else a=new; end if;
 c=a.customer_id;w=a.workspace_id;
 if c is null then return null; end if;
 if tg_op='UPDATE' and (old.completed,old.no_show) is not distinct from (new.completed,new.no_show) then return null; end if;
 k='service:'||coalesce(a.appointment_group_id,a.id)::text;
 select loyalty_enabled,points_per_service into enabled,points from salon_benefit_settings where workspace_id=w;
 if not coalesce(enabled,false) and not exists(select 1 from customer_loyalty_ledger where workspace_id=w and reference_key=k) then return null; end if;
 perform 1 from customers where id=c and workspace_id=w for update;
 select * into prior from customer_loyalty_ledger where workspace_id=w and reference_key=k;
 select count(*)>0 and bool_and(x.completed and not x.no_show) into done from appointments x
 where x.workspace_id=w and x.customer_id=c and (x.id=a.id or (a.appointment_group_id is not null and x.appointment_group_id=a.appointment_group_id));
 if done and prior.id is null and coalesce(enabled,false) then
  insert into customer_loyalty_ledger(workspace_id,customer_id,delta,awarded_points,kind,reference_key,description)
  values(w,c,points,points,'service',k,'Servizio effettuato: '||a.service_name);
 elsif done and prior.id is not null and prior.delta=0 then
  update customer_loyalty_ledger set delta=awarded_points where id=prior.id;
 elsif not done and prior.id is not null and prior.delta>0 then
  -- Reversing an erroneous completion removes the earned points, even after a
  -- reward was redeemed. A negative balance blocks further rewards, not agenda edits.
  update customer_loyalty_ledger set delta=0,description=description||' · annullato' where id=prior.id;
 end if;
 return null;
end $$;
create constraint trigger service_loyalty_lifecycle after insert or update or delete on public.appointments deferrable initially deferred for each row execute function public.sync_service_loyalty();

create function public.issue_customer_gift_card(p_id uuid,p_customer uuid,p_amount bigint,p_expires date,p_sender text,p_message text,p_method public.payment_method default null)
returns public.customer_gift_cards language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); result customer_gift_cards; m uuid; label text;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,1));
 select * into result from customer_gift_cards where id=p_id;
 if found then
  if result.workspace_id<>w or result.customer_id<>p_customer then raise exception 'Operazione già utilizzata'; end if;
  return result;
 end if;
 if not exists(select 1 from salon_benefit_settings where workspace_id=w and gift_cards_enabled) then raise exception 'Attiva le gift card prima di emetterle'; end if;
 select full_name into label from customers where id=p_customer and workspace_id=w;
 if not found then raise exception 'Destinatario non trovato'; end if;
 if p_amount not between 1 and 100000000 or (p_expires is not null and p_expires<(now() at time zone 'Europe/Rome')::date) then raise exception 'Importo o scadenza non validi'; end if;
 if p_method is not null then
  insert into cash_movements(workspace_id,description,amount,payment_method) values(w,'Gift card · '||label,p_amount/100.0,p_method) returning id into m;
 end if;
 insert into customer_gift_cards(id,workspace_id,customer_id,amount_cents,expires_on,sender_name,message,funding,purchase_movement_id)
 values(p_id,w,p_customer,p_amount,p_expires,trim(p_sender),trim(p_message),case when m is null then 'complimentary' else 'paid' end,m) returning * into result;
 return result;
end $$;

create function public.apply_customer_gift_card(p_card uuid,p_appointment uuid,p_amount bigint)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); g customer_gift_cards; a appointments; prior gift_card_uses; available bigint; result uuid;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into g from customer_gift_cards where id=p_card and workspace_id=w for update;
 if not found then raise exception 'Gift card non disponibile'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=w for update;
 if not found or a.customer_id is distinct from g.customer_id then raise exception 'Gift card intestata a un altro cliente'; end if;
 select * into prior from gift_card_uses where appointment_id=a.id;
 if found then
  if prior.gift_card_id<>g.id or prior.amount_cents<>p_amount then raise exception 'Gift card già applicata all’appuntamento'; end if;
  return prior.id;
 end if;
 if a.completed or a.no_show or a.cashed_in or (g.expires_on is not null and a.appointment_date>g.expires_on) then raise exception 'Verifica scadenza e stato dell’appuntamento'; end if;
 select g.amount_cents-coalesce(sum(amount_cents) filter(where state<>'released'),0) into available from gift_card_uses where gift_card_id=g.id;
 if p_amount is null or p_amount<=0 or p_amount>available or p_amount>round(a.price*100) then raise exception 'Credito insufficiente o importo superiore al servizio'; end if;
 if exists(select 1 from booking_payment_orders where request_id=a.booking_request_id)
 or exists(select 1 from appointment_payment_revisions where appointment_id=a.id)
 or exists(select 1 from cash_movements m where m.appointment_id=a.id and (m.payment_method is not null or exists(select 1 from cash_stripe_payments s where s.movement_id=m.id and s.status<>'expired'))) then raise exception 'Gestisci prima il pagamento già avviato'; end if;
 -- Update before inserting the immutable allocation; later changes are guarded.
 delete from cash_movements where appointment_id=a.id;
 delete from booking_payment_terms where request_id=a.booking_request_id;
 update appointments set price=price-p_amount/100.0 where id=a.id;
 update booking_requests set requested_price=a.price-p_amount/100.0,customer_id=g.customer_id where id=a.booking_request_id;
 insert into gift_card_uses(workspace_id,gift_card_id,appointment_id,request_id,amount_cents,original_price)
 values(w,g.id,a.id,a.booking_request_id,p_amount,a.price) returning id into result;
 update appointment_groups gg set total_price=(select sum(x.price) from appointments x where x.appointment_group_id=gg.id) where gg.id=a.appointment_group_id;
 return result;
end $$;

create function public.guard_gift_card_agreement() returns trigger language plpgsql security definer set search_path=public as $$
declare usage gift_card_uses; card customer_gift_cards;
begin
 if tg_table_name='cash_movements' then
  if exists(select 1 from customer_gift_cards where purchase_movement_id=old.id) then
   if tg_op='DELETE' then raise exception 'Conserva l’incasso della gift card'; end if;
   if (new.amount,new.payment_method,new.workspace_id,new.appointment_id,new.booking_voided) is distinct from (old.amount,old.payment_method,old.workspace_id,old.appointment_id,old.booking_voided) then raise exception 'Incasso gift card protetto'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
 end if;
 if tg_table_name='appointments' then select * into usage from gift_card_uses where appointment_id=old.id;
 else select * into usage from gift_card_uses where request_id=old.id; end if;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then
  if usage.state='consumed' then raise exception 'Gift card già utilizzata: conserva la prestazione'; end if;
  return old;
 end if;
 select * into card from customer_gift_cards where id=usage.gift_card_id;
 if new.customer_id is distinct from card.customer_id or new.workspace_id<>card.workspace_id or (card.expires_on is not null and new.appointment_date>card.expires_on) then raise exception 'Rispetta intestatario e scadenza della gift card'; end if;
 if tg_table_name='appointments' then
  if new.price is distinct from old.price or new.service_name is distinct from old.service_name or (usage.state='consumed' and (not new.completed or new.no_show)) or (usage.state='released' and (new.completed or not new.no_show)) then raise exception 'Copertura gift card già registrata: conserva le condizioni'; end if;
 else
  if new.requested_price is distinct from old.requested_price or new.requested_service_name is distinct from old.requested_service_name or (usage.state='consumed' and new.status::text not in ('pending','accepted')) or (usage.state='released' and new.status::text in ('pending','accepted')) then raise exception 'Copertura gift card già registrata'; end if;
 end if;
 return new;
end $$;
create trigger gift_receipt_guard before update or delete on public.cash_movements for each row execute function public.guard_gift_card_agreement();
create trigger gift_appointment_guard before update or delete on public.appointments for each row execute function public.guard_gift_card_agreement();
create trigger gift_request_guard before update or delete on public.booking_requests for each row execute function public.guard_gift_card_agreement();

create function public.sync_gift_card_use() returns trigger language plpgsql security definer set search_path=public as $$
declare usage gift_card_uses; aid uuid; request uuid; a appointments;
begin
 if tg_table_name='appointments' then aid=case when tg_op='DELETE' then old.id else new.id end;
 else request=case when tg_op='DELETE' then old.id else new.id end; end if;
 select * into usage from gift_card_uses where appointment_id=aid or request_id=request;
 if not found then return null; end if;
 perform 1 from customer_gift_cards where id=usage.gift_card_id for update;
 select * into a from appointments where id=usage.appointment_id;
 if a.completed and not a.no_show then update gift_card_uses set state='consumed' where id=usage.id and state='reserved';
 elsif a.id is null or a.no_show or exists(select 1 from booking_requests where id=usage.request_id and status::text not in ('pending','accepted')) then update gift_card_uses set state='released' where id=usage.id and state='reserved'; end if;
 return null;
end $$;
create constraint trigger gift_appointment_lifecycle after update or delete on public.appointments deferrable initially deferred for each row execute function public.sync_gift_card_use();
create constraint trigger gift_request_lifecycle after update or delete on public.booking_requests deferrable initially deferred for each row execute function public.sync_gift_card_use();

create function public.customer_benefits_wallet(p_salon_code text,p_email text,p_phone text,p_token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb; c uuid; w uuid;
begin
 ctx=verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);
 if ctx is null then raise exception 'Verifica la password per accedere ai vantaggi'; end if;
 c=(ctx->>'customerId')::uuid;w=(ctx->>'workspaceId')::uuid;
 return jsonb_build_object('settings',coalesce((select to_jsonb(s)-'workspace_id' from salon_benefit_settings s where workspace_id=w),'{}'),
 'points',(select coalesce(sum(delta),0) from customer_loyalty_ledger where workspace_id=w and customer_id=c),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r)) from salon_loyalty_rewards r where workspace_id=w and not archived),'[]'),
 'giftCards',coalesce((select jsonb_agg(to_jsonb(g)-'purchase_movement_id'||jsonb_build_object('available_cents',g.amount_cents-(select coalesce(sum(amount_cents),0) from gift_card_uses where gift_card_id=g.id and state<>'released'))) from customer_gift_cards g where workspace_id=w and customer_id=c),'[]'),
 'packages',customer_package_wallet(p_salon_code,p_email,p_phone,p_token));
end $$;
revoke all on function public.save_loyalty_reward(uuid,integer,text,integer,boolean),public.redeem_loyalty_reward(uuid,uuid,integer,uuid),public.sync_service_loyalty(),public.issue_customer_gift_card(uuid,uuid,bigint,date,text,text,public.payment_method),public.apply_customer_gift_card(uuid,uuid,bigint),public.guard_gift_card_agreement(),public.sync_gift_card_use(),public.customer_benefits_wallet(text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_loyalty_reward(uuid,integer,text,integer,boolean),public.redeem_loyalty_reward(uuid,uuid,integer,uuid),public.issue_customer_gift_card(uuid,uuid,bigint,date,text,text,public.payment_method),public.apply_customer_gift_card(uuid,uuid,bigint) to authenticated;
grant execute on function public.customer_benefits_wallet(text,text,text,text) to anon,authenticated;

create function public.owner_customer_benefits(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id();
begin
 if w is null or not workspace_access_allowed() or not exists(select 1 from customers where id=p_customer and workspace_id=w) then raise exception 'Cliente non accessibile'; end if;
 return jsonb_build_object(
 'settings',coalesce((select to_jsonb(s) from salon_benefit_settings s where workspace_id=w),'{}'),
 'points',(select coalesce(sum(delta),0) from customer_loyalty_ledger where workspace_id=w and customer_id=p_customer),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by points_cost) from salon_loyalty_rewards r where workspace_id=w),'[]'),
 'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by name) from service_package_catalog c where workspace_id=w),'[]'),
 'packages',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object(
   'available',p.uses-(select count(*) from service_package_redemptions r where r.package_id=p.id and state<>'released'),
   'reserved',(select count(*) from service_package_redemptions r where r.package_id=p.id and state='reserved'),
   'consumed',(select count(*) from service_package_redemptions r where r.package_id=p.id and state='consumed')) order by expires_on)
   from customer_service_packages p where workspace_id=w and customer_id=p_customer),'[]'),
 'giftCards',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('available',g.amount_cents-(select coalesce(sum(amount_cents),0) from gift_card_uses u where u.gift_card_id=g.id and state<>'released')))
   from customer_gift_cards g where workspace_id=w and customer_id=p_customer),'[]'));
end $$;
revoke all on function public.owner_customer_benefits(uuid) from public,anon;
grant execute on function public.owner_customer_benefits(uuid) to authenticated;
