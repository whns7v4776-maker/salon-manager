-- Typed rewards and atomic checkout redemption. Historical redemptions keep a snapshot.
alter table public.salon_loyalty_rewards
 add column reward_type text not null default 'custom' check(reward_type in ('custom','fixed','percent','service')),
 add column value numeric not null default 0,
 add column service_ids uuid[] not null default '{}',
 add column description text not null default '' check(length(description)<=500),
 add column expires_on date,
 add column cumulative boolean not null default false;
create table public.loyalty_checkout_uses (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id),
 customer_id uuid not null references customers(id), appointment_id uuid not null unique, request_id uuid,
 reward_id uuid not null references salon_loyalty_rewards(id), snapshot jsonb not null,
 discount_cents bigint not null check(discount_cents>=0), original_price numeric not null,
 ledger_id uuid not null references customer_loyalty_ledger(id),
 state text not null check(state in ('reserved','consumed','released')), created_at timestamptz not null default now()
);
alter table public.loyalty_checkout_uses enable row level security;
revoke all on public.loyalty_checkout_uses from public,anon,authenticated;
grant select on public.loyalty_checkout_uses to authenticated;
grant all on public.loyalty_checkout_uses to service_role;
create policy loyalty_checkout_owner on public.loyalty_checkout_uses for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());

create function public.save_loyalty_reward_terms(p_id uuid,p_revision integer,p_name text,p_cost integer,p_type text,p_value numeric,p_services uuid[],p_description text,p_expires date,p_cumulative boolean)
returns public.salon_loyalty_rewards language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); r salon_loyalty_rewards;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 if p_type is null or p_type not in ('custom','fixed','percent','service') or p_cost is null or p_cost<1 or p_cost>1000000
 or p_name is null or length(trim(p_name)) not between 1 and 120 or p_value is null
 or (p_type='fixed' and (p_value<=0 or p_value>1000000))
 or (p_type='percent' and (p_value<=0 or p_value>100))
 or (p_type in ('custom','service') and p_value<>0)
 or (p_type='service' and coalesce(cardinality(p_services),0)=0)
 or length(coalesce(p_description,''))>500 then raise exception 'Controlla nome, punti, valore e servizi del premio'; end if;
 if exists(select 1 from unnest(p_services) x where not exists(select 1 from services where id=x and workspace_id=w)) then raise exception 'Servizi non validi'; end if;
 if p_id is null then insert into salon_loyalty_rewards(workspace_id,name,points_cost) values(w,trim(p_name),p_cost) returning * into r;
 else select * into r from salon_loyalty_rewards where id=p_id and workspace_id=w and revision=p_revision for update;
 if not found then raise exception 'Premio modificato: ricarica'; end if; end if;
 update salon_loyalty_rewards set name=trim(p_name),points_cost=p_cost,reward_type=p_type,value=p_value,
 service_ids=coalesce(p_services,'{}'),description=coalesce(p_description,''),expires_on=p_expires,cumulative=coalesce(p_cumulative,false),revision=revision+1
 where id=r.id returning * into r;
 return r;
end $$;

-- Quote and application share these exact eligibility checks; no client supplied amount.
create function public.loyalty_reward_quote(p_appointment uuid,p_reward uuid)
returns bigint language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id(); a appointments; r salon_loyalty_rewards; s services; balance bigint;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=w;
 select * into r from salon_loyalty_rewards where id=p_reward and workspace_id=w;
 if a.id is null or r.id is null or r.archived or a.customer_id is null or a.no_show or a.cashed_in
 or (r.expires_on is not null and greatest(a.appointment_date,(now() at time zone 'Europe/Rome')::date)>r.expires_on)
 or exists(select 1 from loyalty_checkout_uses where appointment_id=a.id)
 or exists(select 1 from gift_card_uses where appointment_id=a.id)
 or exists(select 1 from service_package_booking_lines where appointment_id=a.id or request_id=a.booking_request_id)
 or exists(select 1 from booking_payment_orders where request_id=a.booking_request_id)
 or exists(select 1 from appointment_payment_revisions where appointment_id=a.id)
 or exists(select 1 from cash_movements m where m.appointment_id=a.id and (m.payment_method is not null or exists(select 1 from cash_stripe_payments p where p.movement_id=m.id and p.status<>'expired')))
 then return null; end if;
 select coalesce(sum(delta),0) into balance from customer_loyalty_ledger where workspace_id=w and customer_id=a.customer_id;
 if balance<r.points_cost then return null; end if;
 -- Legacy appointments identify services by name; ambiguous names must never grant a wrong reward.
 if (select count(*) from services where workspace_id=w and lower(trim(name))=lower(trim(a.service_name)))=1 then
 select * into s from services where workspace_id=w and lower(trim(name))=lower(trim(a.service_name)); end if;
 if cardinality(r.service_ids)>0 and (s.id is null or not s.id=any(r.service_ids)) then return null; end if;
 if r.reward_type='custom' then return 0; end if;
 if a.price<=0 then return null; end if;
 if not r.cumulative and (s.id is null or a.price<s.price or exists(select 1 from appointments other_a join service_package_booking_lines l on l.appointment_id=other_a.id where other_a.appointment_group_id=a.appointment_group_id)) then return null; end if;
 return case r.reward_type when 'percent' then least(round(a.price*100)::bigint,round(a.price*r.value)::bigint)
 when 'fixed' then least(round(a.price*100)::bigint,round(r.value*100)::bigint)
 when 'service' then round(a.price*100)::bigint end;
end $$;

create function public.loyalty_checkout_options(p_appointment uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id(); a appointments;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=w;
 if not found then raise exception 'Appuntamento non trovato'; end if;
 return jsonb_build_object('price',a.price,'applied',(select to_jsonb(u) from loyalty_checkout_uses u where appointment_id=a.id and workspace_id=w),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('discount_cents',loyalty_reward_quote(a.id,r.id)) order by points_cost,name)
 from salon_loyalty_rewards r where workspace_id=w and loyalty_reward_quote(a.id,r.id) is not null),'[]'));
end $$;

create function public.apply_loyalty_checkout_reward(p_appointment uuid,p_reward uuid,p_revision integer)
returns public.loyalty_checkout_uses language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); a appointments; r salon_loyalty_rewards; prior loyalty_checkout_uses; discount bigint; ledger uuid;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=w for update;
 if not found then raise exception 'Appuntamento non trovato'; end if;
 perform 1 from customers where id=a.customer_id and workspace_id=w for update;
 select * into prior from loyalty_checkout_uses where appointment_id=a.id;
 if found then
 if prior.reward_id<>p_reward or prior.state='released' then raise exception 'Premio già gestito su questo appuntamento'; end if;
 return prior; end if;
 select * into r from salon_loyalty_rewards where id=p_reward and workspace_id=w for share;
 if not found or r.revision<>p_revision then raise exception 'Premio modificato: aggiorna'; end if;
 -- Serialize with checkout: payment code locks the same cash movement.
 perform 1 from cash_movements where appointment_id=a.id for update;
 discount=loyalty_reward_quote(a.id,r.id);
 if discount is null then raise exception 'Premio non più utilizzabile: verifica punti, scadenza e pagamenti'; end if;
 if discount>0 then
 delete from booking_payment_terms where request_id=a.booking_request_id;
 update appointments set price=a.price-discount/100.0 where id=a.id;
 update booking_requests set requested_price=a.price-discount/100.0 where id=a.booking_request_id;
 if round(a.price*100)=discount then delete from cash_movements where appointment_id=a.id and payment_method is null;
 else update cash_movements set amount=a.price-discount/100.0 where appointment_id=a.id and payment_method is null; end if;
 update appointment_groups g set total_price=(select sum(x.price) from appointments x where x.appointment_group_id=g.id) where id=a.appointment_group_id;
 end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description)
 values(w,a.customer_id,-r.points_cost,'reward','checkout:'||a.id,'Premio fedeltà: '||r.name) returning id into ledger;
 insert into loyalty_checkout_uses(workspace_id,customer_id,appointment_id,request_id,reward_id,snapshot,discount_cents,original_price,ledger_id,state)
 values(w,a.customer_id,a.id,a.booking_request_id,r.id,to_jsonb(r),discount,a.price,ledger,case when a.completed or r.reward_type='custom' then 'consumed' else 'reserved' end) returning * into prior;
 return prior;
end $$;

create function public.guard_loyalty_checkout() returns trigger language plpgsql security definer set search_path=public as $$
declare u loyalty_checkout_uses;
begin
 if tg_table_name='cash_movements' then
 select * into u from loyalty_checkout_uses where appointment_id=new.appointment_id;
 if found and (u.state='released' or new.workspace_id<>u.workspace_id or round(new.amount*100)<>round(u.original_price*100)-u.discount_cents) then raise exception 'Importo protetto dal premio fedeltà: aggiorna la Cassa'; end if;
 return new;
 end if;
 if tg_table_name='appointments' then select * into u from loyalty_checkout_uses where appointment_id=old.id;
 else select * into u from loyalty_checkout_uses where request_id=old.id; end if;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then
 if u.state='consumed' then raise exception 'Premio già utilizzato: conserva lo storico'; end if;
 return old; end if;
 if new.workspace_id<>u.workspace_id or new.customer_id is distinct from u.customer_id
 or (u.snapshot->>'expires_on' is not null and new.appointment_date>(u.snapshot->>'expires_on')::date) then raise exception 'Rispetta intestatario e scadenza del premio'; end if;
 if tg_table_name='appointments' then
 if new.price is distinct from old.price or new.service_name is distinct from old.service_name
 or (u.state='consumed' and (new.no_show or (old.completed and not new.completed)))
 or (u.state='released' and (new.completed or not new.no_show)) then raise exception 'Premio fedeltà registrato: conserva le condizioni'; end if;
 else
 if new.requested_price is distinct from old.requested_price or new.requested_service_name is distinct from old.requested_service_name
 or (u.state='consumed' and new.status::text not in ('pending','accepted'))
 or (u.state='released' and new.status::text in ('pending','accepted')) then raise exception 'Premio fedeltà registrato: conserva le condizioni'; end if;
 end if;
 return new;
end $$;
create trigger loyalty_cash_guard before insert or update on public.cash_movements for each row execute function guard_loyalty_checkout();
create trigger loyalty_appointment_guard before update or delete on public.appointments for each row execute function guard_loyalty_checkout();
create trigger loyalty_request_guard before update or delete on public.booking_requests for each row execute function guard_loyalty_checkout();
create function public.sync_loyalty_checkout() returns trigger language plpgsql security definer set search_path=public as $$
declare u loyalty_checkout_uses; a appointments;
begin
 if tg_table_name='appointments' then select * into u from loyalty_checkout_uses where appointment_id=old.id;
 else select * into u from loyalty_checkout_uses where request_id=old.id; end if;
 if u.id is null or u.state<>'reserved' then return null; end if;
 select * into a from appointments where id=u.appointment_id;
 if (a.completed or a.cashed_in) and not a.no_show then update loyalty_checkout_uses set state='consumed' where id=u.id;
 elsif a.id is null or a.no_show or exists(select 1 from booking_requests where id=u.request_id and status::text not in ('pending','accepted')) then
 update loyalty_checkout_uses set state='released' where id=u.id;
 update customer_loyalty_ledger set delta=0 where id=u.ledger_id;
 end if;
 return null;
end $$;
create constraint trigger loyalty_checkout_lifecycle after update or delete on public.appointments deferrable initially deferred for each row execute function sync_loyalty_checkout();
create constraint trigger loyalty_checkout_request_lifecycle after update or delete on public.booking_requests deferrable initially deferred for each row execute function sync_loyalty_checkout();
revoke all on function public.save_loyalty_reward_terms(uuid,integer,text,integer,text,numeric,uuid[],text,date,boolean),public.loyalty_reward_quote(uuid,uuid),public.loyalty_checkout_options(uuid),public.apply_loyalty_checkout_reward(uuid,uuid,integer),public.guard_loyalty_checkout(),public.sync_loyalty_checkout() from public,anon,authenticated;
grant execute on function public.save_loyalty_reward_terms(uuid,integer,text,integer,text,numeric,uuid[],text,date,boolean),public.loyalty_checkout_options(uuid),public.apply_loyalty_checkout_reward(uuid,uuid,integer) to authenticated;

create or replace function public.redeem_loyalty_reward(p_customer uuid,p_reward uuid,p_revision integer,p_operation uuid)
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
 if r.reward_type<>'custom' then raise exception 'Applica questo premio dalla Cassa o dall’appuntamento'; end if;
 if r.expires_on is not null and r.expires_on<(now() at time zone 'Europe/Rome')::date then raise exception 'Premio scaduto'; end if;
 if balance<r.points_cost then raise exception 'Punti insufficienti'; end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description)
 values(w,p_customer,-r.points_cost,'reward','reward:'||p_operation,'Omaggio consegnato: '||r.name) returning id into result;
 return result;
end $$;

