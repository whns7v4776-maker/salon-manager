begin;

-- Private, salon-owned segmentation. No automatic booking restrictions or
-- changes to loyalty balances: the result is a descriptive customer badge.
create function public.default_customer_badge_policy() returns jsonb
language sql immutable set search_path=public,pg_temp as $$
 select '{"windowMonths":12,"cancellationThreshold":5,"noShowThreshold":3,"tiers":[{"id":"frequente","label":"Frequente","mode":"visits","visits":10,"spendCents":20000,"bookings":10},{"id":"premium","label":"Premium","mode":"both","visits":20,"spendCents":50000,"bookings":20},{"id":"top_premium","label":"Top Premium","mode":"both","visits":40,"spendCents":150000,"bookings":40}]}'::jsonb;
$$;
revoke all on function public.default_customer_badge_policy() from public,anon,authenticated;

create table public.customer_badge_policies (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 enabled boolean not null default false,
 config jsonb not null default public.default_customer_badge_policy(),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.customer_badge_policies enable row level security;
revoke all on public.customer_badge_policies from public,anon,authenticated;
grant select on public.customer_badge_policies to authenticated;
create policy customer_badge_policy_owner_read on public.customer_badge_policies for select to authenticated using(exists(
 select 1 from public.workspace_members m where m.workspace_id=customer_badge_policies.workspace_id and m.user_id=auth.uid() and m.role='owner'
));
-- Reuse appointments_workspace_customer_id_date_idx and appointments_group_idx.
-- A blocking CREATE INDEX on appointments does not belong in a live graphics
-- cutover. Any further index optimization requires a separate measured rollout.

create function public.get_owner_customer_badge_summary(p_workspace_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v_enabled boolean; v_config jsonb; v_updated timestamptz; v_since date; v_rows jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.role='owner') then
  raise exception 'owner_required' using errcode='42501';
 end if;
 select enabled,config,updated_at into v_enabled,v_config,v_updated from public.customer_badge_policies where workspace_id=p_workspace_id;
 v_enabled:=coalesce(v_enabled,false);v_config:=coalesce(v_config,public.default_customer_badge_policy());
 v_since:=case when (v_config->>'windowMonths')::integer=0 then '-infinity'::date else (current_date-make_interval(months=>(v_config->>'windowMonths')::integer))::date end;

 with appointment_rows as (
  select a.*,
   case when a.appointment_group_id is not null then 'group:'||a.appointment_group_id::text else 'appointment:'||a.id::text end as visit_key,
   coalesce(r.status::text,'accepted')='accepted' and coalesce(g.status,'active')<>'cancelled' as active,
   -- Same authoritative net-payment precedence used by service loyalty:
   -- revision ledger, online order, then a single settled cash movement.
   least(greatest(round(a.price*100),0),greatest(coalesce(
    (select (public.appointment_revision_payment_state(rv.appointment_id)->>'paidCents')::bigint from public.appointment_payment_revisions rv where rv.appointment_id=a.id and rv.workspace_id=a.workspace_id),
    (select public.booking_payment_paid_cents(o.request_id) from public.booking_payment_orders o where o.appointment_id=a.id and o.workspace_id=a.workspace_id),
    (select case when count(*)=1 then sum(case
      when sp.id is not null then case when sp.status='paid' then greatest(sp.amount_cents-sp.refunded_cents,0) else 0 end
      when m.payment_method is not null and not m.booking_voided then greatest(round(m.amount*100),0) else 0 end) else 0 end
     from public.cash_movements m left join public.cash_stripe_payments sp on sp.movement_id=m.id and sp.workspace_id=m.workspace_id and sp.status<>'expired'
     where m.workspace_id=a.workspace_id and m.appointment_id=a.id),0),0))::bigint as paid_cents
  from public.appointments a
  join public.customers c on c.id=a.customer_id and c.workspace_id=a.workspace_id
  left join public.booking_requests r on r.id=a.booking_request_id and r.workspace_id=a.workspace_id
  left join public.appointment_groups g on g.id=a.appointment_group_id and g.workspace_id=a.workspace_id
  where a.workspace_id=p_workspace_id
 ), visits as (
  select customer_id,visit_key,
   bool_and(completed and not no_show and active) as done,
   bool_or(no_show) as absent,
   max(appointment_date) as visit_date,sum(paid_cents) as paid_cents
  from appointment_rows group by customer_id,visit_key
 ), visit_totals as (
  select customer_id,count(*) filter(where done)::integer as completed_visits,
   count(*) filter(where absent)::integer as no_shows,
   coalesce(sum(paid_cents) filter(where done),0)::bigint as spent_cents
  from visits where visit_date between v_since and current_date group by customer_id
 ), request_visits as (
  select r.customer_id,
   case when r.appointment_group_id is not null then 'group:'||r.appointment_group_id::text else 'request:'||r.id::text end as visit_key,
   bool_or(r.status::text in ('pending','accepted')) as booked,
   bool_or(r.status::text='cancelled' and coalesce(r.cancellation_source,'cliente')='cliente') as cancelled
  from public.booking_requests r join public.customers c on c.id=r.customer_id and c.workspace_id=r.workspace_id
  where r.workspace_id=p_workspace_id and r.appointment_date between v_since and current_date
  group by r.customer_id,visit_key
 ), request_totals as (
  select customer_id,count(*) filter(where booked)::integer as bookings,count(*) filter(where cancelled)::integer as cancellations
  from request_visits group by customer_id
 ), metrics as (
  select c.id,coalesce(v.completed_visits,0) as visits,coalesce(v.spent_cents,0) as spent,
   coalesce(v.no_shows,0) as no_shows,coalesce(r.bookings,0) as bookings,coalesce(r.cancellations,0) as cancellations
  from public.customers c left join visit_totals v on v.customer_id=c.id left join request_totals r on r.customer_id=c.id
  where c.workspace_id=p_workspace_id
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'customerId',m.id,'completedVisits',m.visits,'spentCents',m.spent,'bookings',m.bookings,'cancellations',m.cancellations,'noShows',m.no_shows,
  'tier',case when not v_enabled then null else coalesce(t.tier->>'id','standard') end,
  'label',case when not v_enabled then null else coalesce(t.tier->>'label','Standard') end,
  'rule',case when v_enabled then t.tier else null end,
  'cancellationAlert',v_enabled and m.cancellations>=(v_config->>'cancellationThreshold')::integer,
  'noShowAlert',v_enabled and m.no_shows>=(v_config->>'noShowThreshold')::integer
 ) order by m.id),'[]'::jsonb) into v_rows
 from metrics m left join lateral (
  select tier from jsonb_array_elements(v_config->'tiers') with ordinality as levels(tier,rank)
  where case tier->>'mode'
   when 'visits' then m.visits>=(tier->>'visits')::integer
   when 'spend' then m.spent>=(tier->>'spendCents')::bigint
   when 'bookings' then m.bookings>=(tier->>'bookings')::integer
   when 'either' then m.visits>=(tier->>'visits')::integer or m.spent>=(tier->>'spendCents')::bigint
   when 'both' then m.visits>=(tier->>'visits')::integer and m.spent>=(tier->>'spendCents')::bigint else false end
  order by rank desc limit 1
 ) t on true;
 return jsonb_build_object('workspaceId',p_workspace_id,'enabled',v_enabled,'config',v_config,'updatedAt',v_updated,'customers',v_rows);
end;
$$;
revoke all on function public.get_owner_customer_badge_summary(uuid) from public,anon;
grant execute on function public.get_owner_customer_badge_summary(uuid) to authenticated;

create function public.set_owner_customer_badge_policy(p_workspace_id uuid,p_enabled boolean,p_config jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t jsonb; i integer:=0; expected text[]:=array['frequente','premium','top_premium'];
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.role='owner') then raise exception 'owner_required' using errcode='42501'; end if;
 if p_enabled is null or jsonb_typeof(p_config) is distinct from 'object'
  or coalesce(p_config->>'windowMonths','') not in ('0','6','12','24','36')
  or coalesce(p_config->>'cancellationThreshold','') !~ '^[0-9]{1,4}$'
  or coalesce(p_config->>'noShowThreshold','') !~ '^[0-9]{1,4}$'
  or jsonb_typeof(p_config->'tiers') is distinct from 'array' then raise exception 'invalid_badge_policy' using errcode='22023';end if;
 if (p_config->>'cancellationThreshold')::integer not between 1 and 1000 or (p_config->>'noShowThreshold')::integer not between 1 and 1000
  or jsonb_array_length(p_config->'tiers')<>3 then raise exception 'invalid_badge_policy' using errcode='22023';end if;
 for t in select value from jsonb_array_elements(p_config->'tiers') loop
  i:=i+1;
  if t->>'id' is distinct from expected[i] or length(trim(coalesce(t->>'label',''))) not between 1 and 32
   or coalesce(t->>'mode','') not in ('visits','spend','bookings','either','both')
   or coalesce(t->>'visits','') !~ '^[0-9]{1,5}$' or coalesce(t->>'bookings','') !~ '^[0-9]{1,5}$'
   or coalesce(t->>'spendCents','') !~ '^[0-9]{1,9}$' then raise exception 'invalid_badge_policy' using errcode='22023';end if;
  if (t->>'visits')::integer not between 1 and 10000 or (t->>'bookings')::integer not between 1 and 10000 or (t->>'spendCents')::bigint not between 100 and 100000000 then raise exception 'invalid_badge_policy' using errcode='22023';end if;
 end loop;
 insert into public.customer_badge_policies(workspace_id,enabled,config) values(p_workspace_id,p_enabled,p_config)
 on conflict(workspace_id) do update set enabled=excluded.enabled,config=excluded.config,updated_at=clock_timestamp();
 return public.get_owner_customer_badge_summary(p_workspace_id);
end;
$$;
revoke all on function public.set_owner_customer_badge_policy(uuid,boolean,jsonb) from public,anon;
grant execute on function public.set_owner_customer_badge_policy(uuid,boolean,jsonb) to authenticated;
commit;
