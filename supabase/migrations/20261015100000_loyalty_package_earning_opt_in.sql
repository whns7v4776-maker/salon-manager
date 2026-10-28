-- Preserve historical points; exclude package-covered services from new earning by default.
alter table public.salon_benefit_settings add column loyalty_package_services boolean not null default false;
create function public.save_loyalty_earning_rule_v2(p_revision integer,p_mode text,p_service_points integer,p_step_cents integer,p_spend_points integer,p_carry boolean,p_services boolean,p_products boolean,p_minimum_cents integer,p_description text,p_package_services boolean)
returns public.salon_benefit_settings language plpgsql security definer set search_path=public as $$
declare s salon_benefit_settings;
begin
 if p_package_services is null then raise exception 'Scegli se accumulare punti sui servizi in abbonamento';end if;
 s=save_loyalty_earning_rule(p_revision,p_mode,p_service_points,p_step_cents,p_spend_points,p_carry,p_services,p_products,p_minimum_cents,p_description);
 update salon_benefit_settings set loyalty_package_services=p_package_services,
 loyalty_rule_id=case when loyalty_package_services is distinct from p_package_services then gen_random_uuid() else loyalty_rule_id end
 where workspace_id=s.workspace_id returning * into s;
 return s;
end $$;
revoke all on function public.save_loyalty_earning_rule_v2(integer,text,integer,integer,integer,boolean,boolean,boolean,integer,text,boolean) from public,anon;
grant execute on function public.save_loyalty_earning_rule_v2(integer,text,integer,integer,integer,boolean,boolean,boolean,integer,text,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.sync_service_loyalty()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 if done and prior.id is null and coalesce(enabled,false)
 and (coalesce((select loyalty_package_services from salon_benefit_settings where workspace_id=w),false)
 or exists(select 1 from appointments x where x.workspace_id=w and x.customer_id=c
 and coalesce(x.appointment_group_id,x.id)=coalesce(a.appointment_group_id,a.id)
 and not exists(select 1 from service_package_booking_lines l where l.workspace_id=w
 and (l.appointment_id=x.id or l.request_id=x.booking_request_id)))) then
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
end $function$
;
CREATE OR REPLACE FUNCTION public.sync_loyalty_spend_source(p_workspace uuid, p_customer uuid, p_kind text, p_source uuid, p_create boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if prior.source_id is null and not coalesce((select loyalty_package_services from salon_benefit_settings where workspace_id=p_workspace),false)
  and not exists(select 1 from appointments x where x.workspace_id=p_workspace and x.customer_id=p_customer
    and coalesce(x.appointment_group_id,x.id)=p_source
    and not exists(select 1 from service_package_booking_lines l where l.workspace_id=p_workspace
      and (l.appointment_id=x.id or l.request_id=x.booking_request_id))) then return;end if;
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
end $function$
;
