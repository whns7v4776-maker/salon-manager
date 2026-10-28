-- Configurable earning rules. Existing points and purchased benefits are not backfilled.
alter table public.salon_benefit_settings
 add column loyalty_earning_mode text not null default 'service' check(loyalty_earning_mode in ('service','spend')),
 add column loyalty_spend_step_cents integer not null default 500 check(loyalty_spend_step_cents between 1 and 100000000),
 add column loyalty_spend_points integer not null default 1 check(loyalty_spend_points between 1 and 10000),
 add column loyalty_spend_carry boolean not null default true,
 add column loyalty_spend_services boolean not null default true,
 add column loyalty_spend_products boolean not null default false,
 add column loyalty_minimum_cents integer not null default 0 check(loyalty_minimum_cents between 0 and 100000000),
 add column loyalty_rule_description text not null default '' check(length(loyalty_rule_description)<=180),
 add column loyalty_rule_id uuid not null default gen_random_uuid(),
 add constraint loyalty_spend_scope check(loyalty_earning_mode<>'spend' or loyalty_spend_services or loyalty_spend_products);
alter table public.customer_loyalty_ledger alter column delta type bigint, alter column awarded_points type bigint;

create function public.save_loyalty_earning_rule(p_revision integer,p_mode text,p_service_points integer,p_step_cents integer,p_spend_points integer,p_carry boolean,p_services boolean,p_products boolean,p_minimum_cents integer,p_description text)
returns salon_benefit_settings language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); s salon_benefit_settings;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito';end if;
 if p_mode is null or p_mode not in ('service','spend') or p_service_points is null or p_service_points not between 1 and 10000
 or p_step_cents is null or p_step_cents not between 1 and 100000000 or p_spend_points is null or p_spend_points not between 1 and 10000
 or p_carry is null or p_services is null or p_products is null or p_minimum_cents is null or p_minimum_cents not between 0 and 100000000
 or length(coalesce(p_description,''))>180 or (p_mode='spend' and not(p_services or p_products)) then raise exception 'Controlla punti, importi e acquisti inclusi nella regola';end if;
 insert into salon_benefit_settings(workspace_id) values(w) on conflict do nothing;
 select * into s from salon_benefit_settings where workspace_id=w for update;
 if s.revision is distinct from p_revision then raise exception 'Regola modificata su un altro dispositivo. Riapri e riprova';end if;
 update salon_benefit_settings set loyalty_earning_mode=p_mode,points_per_service=p_service_points,
 loyalty_spend_step_cents=p_step_cents,loyalty_spend_points=p_spend_points,loyalty_spend_carry=p_carry,
 loyalty_spend_services=p_services,loyalty_spend_products=p_products,loyalty_minimum_cents=p_minimum_cents,
 loyalty_rule_description=trim(coalesce(p_description,'')),revision=revision+1,
 loyalty_rule_id=case when (loyalty_earning_mode,points_per_service,loyalty_spend_step_cents,loyalty_spend_points,loyalty_spend_carry,loyalty_spend_services,loyalty_spend_products,loyalty_minimum_cents)
 is distinct from (p_mode,p_service_points,p_step_cents,p_spend_points,p_carry,p_services,p_products,p_minimum_cents)
 then gen_random_uuid() else loyalty_rule_id end
 where workspace_id=w returning * into s;
 return s;
end $$;
revoke all on function public.save_loyalty_earning_rule(integer,text,integer,integer,integer,boolean,boolean,boolean,integer,text) from public,anon;
grant execute on function public.save_loyalty_earning_rule(integer,text,integer,integer,integer,boolean,boolean,boolean,integer,text) to authenticated;

-- One immutable rate snapshot per economic source; refunds only adjust its basis.
create table public.loyalty_spend_sources (
 workspace_id uuid not null references workspaces(id), customer_id uuid not null references customers(id),
 source_kind text not null check(source_kind in ('service','shop')),source_id uuid not null,
 rule_id uuid not null,step_cents integer not null check(step_cents>0),points integer not null check(points>0),
 carry boolean not null,minimum_cents integer not null,net_cents bigint not null check(net_cents>=0),
 created_at timestamptz not null default now(),primary key(workspace_id,source_kind,source_id)
);
create index loyalty_spend_customer_rule on public.loyalty_spend_sources(workspace_id,customer_id,rule_id);
alter table public.loyalty_spend_sources enable row level security;
revoke all on public.loyalty_spend_sources from public,anon,authenticated;
grant select on public.loyalty_spend_sources to authenticated;
grant all on public.loyalty_spend_sources to service_role;
create policy owner_read on public.loyalty_spend_sources for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());

create function public.sync_loyalty_spend_source(p_workspace uuid,p_customer uuid,p_kind text,p_source uuid,p_create boolean default false)
returns void language plpgsql security definer set search_path=public as $$
declare s salon_benefit_settings; prior loyalty_spend_sources; net bigint=0; total numeric; earned bigint; k text; done boolean;
begin
 if p_customer is null then return;end if;
 if not exists(select 1 from loyalty_spend_sources where workspace_id=p_workspace and source_kind=p_kind and source_id=p_source) then
  if not p_create or not exists(select 1 from salon_benefit_settings where workspace_id=p_workspace and loyalty_enabled and loyalty_earning_mode='spend'
   and ((p_kind='service' and loyalty_spend_services) or (p_kind='shop' and loyalty_spend_products))) then return;end if;
 end if;
 -- Same customer lock used by reward redemption: no lost points on concurrent cashouts.
 perform 1 from customers where id=p_customer and workspace_id=p_workspace for update;
 if not found then return;end if;
 select * into prior from loyalty_spend_sources where workspace_id=p_workspace and source_kind=p_kind and source_id=p_source;
 if prior.customer_id is not null and prior.customer_id<>p_customer then return;end if;
 if p_kind='service' then
  -- Never award both the legacy per-service rule and the amount rule for one group.
  if exists(select 1 from customer_loyalty_ledger where workspace_id=p_workspace and reference_key='service:'||p_source::text) then return;end if;
  select count(*)>0 and bool_and(a.completed and not a.no_show),coalesce(sum(
   least(greatest(round(a.price*100),0),greatest(coalesce(
   (select (appointment_revision_payment_state(r.appointment_id)->>'paidCents')::bigint from appointment_payment_revisions r where r.appointment_id=a.id and r.workspace_id=a.workspace_id),
   (select booking_payment_paid_cents(o.request_id) from booking_payment_orders o where o.appointment_id=a.id and o.workspace_id=a.workspace_id),
   (select case when count(*)=1 then sum(
    case when sp.id is not null then case when sp.status='paid' then greatest(sp.amount_cents-sp.refunded_cents,0) else 0 end
    when m.payment_method is not null then greatest(round(m.amount*100),0) else 0 end) else 0 end
    from cash_movements m left join cash_stripe_payments sp on sp.movement_id=m.id and sp.workspace_id=m.workspace_id and sp.status<>'expired'
    where m.workspace_id=a.workspace_id and m.appointment_id=a.id),0),0))),0)
   into done,net from appointments a where a.workspace_id=p_workspace and a.customer_id=p_customer and coalesce(a.appointment_group_id,a.id)=p_source;
  if not coalesce(done,false) then net=0;end if;
 elsif p_kind='shop' then
  select greatest(x.total_cents-coalesce((select sum(r.amount_cents) from shop_returns r where r.workspace_id=p_workspace and r.sale_id=x.id),0),0)
  into net from shop_sales x where x.workspace_id=p_workspace and x.customer_id=p_customer and x.id=p_source;
  net=coalesce(net,0);
 else return;end if;
 if prior.source_id is null then
  if not p_create or net<=0 then return;end if;
  select * into s from salon_benefit_settings where workspace_id=p_workspace;
  if not coalesce(s.loyalty_enabled,false) or s.loyalty_earning_mode<>'spend' or (p_kind='service' and not s.loyalty_spend_services) or (p_kind='shop' and not s.loyalty_spend_products) then return;end if;
  insert into loyalty_spend_sources(workspace_id,customer_id,source_kind,source_id,rule_id,step_cents,points,carry,minimum_cents,net_cents)
  values(p_workspace,p_customer,p_kind,p_source,s.loyalty_rule_id,s.loyalty_spend_step_cents,s.loyalty_spend_points,s.loyalty_spend_carry,s.loyalty_minimum_cents,net) returning * into prior;
 else
  update loyalty_spend_sources set net_cents=net where workspace_id=p_workspace and source_kind=p_kind and source_id=p_source;
 end if;
 if prior.carry then
  select coalesce(sum(case when net_cents>=minimum_cents then net_cents else 0 end),0) into total from loyalty_spend_sources
   where workspace_id=p_workspace and customer_id=p_customer and rule_id=prior.rule_id;
  k='spend-pool:'||p_customer||':'||prior.rule_id;
 else total=case when net>=prior.minimum_cents then net else 0 end;k='spend:'||p_kind||':'||p_source;end if;
 earned=(floor(total/prior.step_cents)*prior.points)::bigint;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,awarded_points,kind,reference_key,description)
 values(p_workspace,p_customer,earned,earned,'service',k,'Punti sugli importi incassati')
 on conflict(workspace_id,reference_key) do update set delta=excluded.delta,awarded_points=excluded.awarded_points
 where customer_loyalty_ledger.delta is distinct from excluded.delta;
end $$;
revoke all on function public.sync_loyalty_spend_source(uuid,uuid,text,uuid,boolean) from public,anon,authenticated;

create or replace function public.sync_service_loyalty() returns trigger language plpgsql security definer set search_path=public as $$
declare a appointments; k text; c uuid; w uuid; points integer; enabled boolean; done boolean; prior customer_loyalty_ledger;
begin
 if tg_op='DELETE' then a=old; else a=new; end if;
 c=a.customer_id;w=a.workspace_id;
 if tg_op='UPDATE' and (old.customer_id,old.appointment_group_id) is distinct from (new.customer_id,new.appointment_group_id) then
  perform sync_loyalty_spend_source(old.workspace_id,old.customer_id,'service',coalesce(old.appointment_group_id,old.id),false);
 end if;
 if c is null then return null; end if;
 if tg_op='UPDATE' and (old.completed,old.no_show,old.price,old.customer_id,old.appointment_group_id)
 is not distinct from (new.completed,new.no_show,new.price,new.customer_id,new.appointment_group_id) then return null;end if;
 k='service:'||coalesce(a.appointment_group_id,a.id)::text;
 perform sync_loyalty_spend_source(w,c,'service',coalesce(a.appointment_group_id,a.id),
  case when tg_op='INSERT' then new.completed when tg_op='UPDATE' then old.completed is distinct from new.completed or old.no_show is distinct from new.no_show else false end);
 if exists(select 1 from loyalty_spend_sources where workspace_id=w and source_kind='service' and source_id=coalesce(a.appointment_group_id,a.id)) then return null;end if;
 if (select loyalty_earning_mode from salon_benefit_settings where workspace_id=w)='spend'
 and not exists(select 1 from customer_loyalty_ledger where workspace_id=w and reference_key=k) then return null;end if;
 if tg_op='UPDATE' and (old.completed,old.no_show) is not distinct from (new.completed,new.no_show) then return null;end if;
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
create function public.sync_cash_loyalty_earning() returns trigger language plpgsql security definer set search_path=public as $$
declare m cash_movements;a appointments;aid uuid;allow_new boolean=false;
begin
 if tg_table_name='cash_movements' then
  if tg_op='DELETE' then m=old;else m=new;end if;
  allow_new=case when tg_op='INSERT' then new.payment_method is not null when tg_op='UPDATE' then old.payment_method is null and new.payment_method is not null else false end;
 else
  select * into m from cash_movements where id=new.movement_id and workspace_id=new.workspace_id;
  allow_new=case when tg_op='INSERT' then new.status='paid' else old.status<>'paid' and new.status='paid' end;
 end if;
 aid=coalesce(m.appointment_id,
  (select r.appointment_id from appointment_revision_receipts r where r.movement_id=m.id and r.workspace_id=m.workspace_id),
  (select o.appointment_id from booking_payment_orders o where o.workspace_id=m.workspace_id and m.id in(o.upfront_movement_id,o.balance_movement_id)));
 if aid is not null then
  select * into a from appointments where id=aid and workspace_id=m.workspace_id;
  if found then perform sync_loyalty_spend_source(a.workspace_id,a.customer_id,'service',coalesce(a.appointment_group_id,a.id),allow_new);end if;
 end if;
 return null;
end $$;
create constraint trigger cash_loyalty_earning after insert or update or delete on public.cash_movements deferrable initially deferred for each row execute function public.sync_cash_loyalty_earning();
create constraint trigger stripe_loyalty_earning after insert or update on public.cash_stripe_payments deferrable initially deferred for each row execute function public.sync_cash_loyalty_earning();
create function public.sync_shop_loyalty_earning() returns trigger language plpgsql security definer set search_path=public as $$
declare sale shop_sales;begin
 if tg_table_name='shop_sales' then sale=new;else select * into sale from shop_sales where id=new.sale_id and workspace_id=new.workspace_id;end if;
 perform sync_loyalty_spend_source(sale.workspace_id,sale.customer_id,'shop',sale.id,tg_table_name='shop_sales' and tg_op='INSERT');
 return null;
end $$;
create constraint trigger shop_loyalty_earning after insert or update on public.shop_sales deferrable initially deferred for each row execute function public.sync_shop_loyalty_earning();
create constraint trigger shop_return_loyalty_earning after insert on public.shop_returns deferrable initially deferred for each row execute function public.sync_shop_loyalty_earning();
revoke all on function public.sync_cash_loyalty_earning(),public.sync_shop_loyalty_earning() from public,anon,authenticated;
-- Amount pools update an existing ledger row. Notify only the newly crossed threshold.
create or replace function public.notify_customer_benefit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare balance bigint; threshold_names text; increment bigint;
begin
 if tg_table_name='customer_service_packages' then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'package:'||new.id,'Il tuo pacchetto è pronto',new.name||': trovi utilizzi e validità in Pacchetti e vantaggi.');
 elsif tg_table_name='customer_gift_cards' then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'gift:'||new.id,'Hai ricevuto una gift card','Il salone ti ha assegnato un buono regalo. Apri i tuoi vantaggi per vedere valore e dettagli.');
 elsif tg_table_name='customer_loyalty_ledger' then
 if tg_op='UPDATE' and new.kind='reward' and old.delta<0 and new.delta=0 then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'reward-returned:'||new.id,'Punti fedeltà restituiti','Il premio prenotato è stato annullato. I punti sono nuovamente disponibili.');
 elsif new.kind='reward' and new.delta<0 then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'reward:'||new.id,'Premio fedeltà utilizzato',new.description||'. Utilizzati '||abs(new.delta)||' punti.');
 elsif new.kind='service' and new.delta>0 then
 increment=new.delta-case when tg_op='UPDATE' then old.delta else 0 end;
 if increment<=0 then return null;end if;
 select coalesce(sum(delta),0) into balance from customer_loyalty_ledger where workspace_id=new.workspace_id and customer_id=new.customer_id;
 select string_agg(name,', ' order by points_cost) into threshold_names from salon_loyalty_rewards where workspace_id=new.workspace_id and not archived and points_cost<=balance and points_cost>balance-increment and (expires_on is null or expires_on>=(now() at time zone 'Europe/Rome')::date);
 if threshold_names is not null then perform record_benefit_notification(new.workspace_id,new.customer_id,'threshold:'||new.id||case when new.reference_key like 'spend%' then ':'||new.delta else '' end,'Hai raggiunto un premio',left(threshold_names,180)||'. Chiedi al salone di utilizzarlo in cassa.'); end if;
 end if;
 end if;
 return null;
end $$;
