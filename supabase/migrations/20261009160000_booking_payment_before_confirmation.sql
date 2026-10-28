-- New online bookings with an upfront agreement reserve capacity, but are not
-- salon requests or appointments until Stripe has verified the payment. Existing
-- accepted bookings retain their original contractual and accounting history.
alter table public.booking_requests
  add column payment_hold_state text check(payment_hold_state in ('awaiting_payment','paid','expired')),
  add column payment_hold_expires_at timestamptz,
  add column payment_hold_batch_id uuid;

create table public.booking_payment_hold_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  customer_id uuid references public.customers(id),
  state text not null default 'awaiting_payment' check(state in ('awaiting_payment','paid','expired','paid_conflict')),
  request_ids uuid[] not null,
  total_cents bigint not null check(total_cents between 50 and 99999999),
  due_cents bigint not null check(due_cents between 50 and total_cents),
  mode text not null check(mode in ('deposit','full')),
  percent integer not null check(percent between 1 and 100),
  expires_at timestamptz not null,
  checkout_expires_at timestamptz,
  account_id text,
  livemode boolean,
  session_id text unique,
  checkout_url text,
  currency text not null default 'eur' check(currency='eur'),
  payment_intent text unique,
  receipt_email text,
  refunded_cents bigint not null default 0 check(refunded_cents between 0 and due_cents),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(cardinality(request_ids)>0)
);
create index booking_payment_holds_due on public.booking_payment_hold_batches(expires_at)
  where state='awaiting_payment';
alter table public.booking_payment_hold_batches enable row level security;
revoke all on public.booking_payment_hold_batches from public,anon,authenticated;
grant select on public.booking_payment_hold_batches to authenticated;
grant all on public.booking_payment_hold_batches to service_role;
create policy booking_payment_hold_owner_read on public.booking_payment_hold_batches
  for select to authenticated using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed());
alter table public.booking_requests add constraint booking_request_payment_hold_batch_fk
  foreign key(payment_hold_batch_id) references public.booking_payment_hold_batches(id);

create table public.booking_payment_hold_allocations (
  batch_id uuid not null references public.booking_payment_hold_batches(id),
  request_id uuid primary key references public.booking_requests(id),
  workspace_id uuid not null references public.workspaces(id),
  upfront_movement_id uuid not null unique references public.cash_movements(id),
  due_cents bigint not null check(due_cents>0)
);
alter table public.booking_payment_hold_allocations enable row level security;
revoke all on public.booking_payment_hold_allocations from public,anon,authenticated;
grant select on public.booking_payment_hold_allocations to authenticated;
grant all on public.booking_payment_hold_allocations to service_role;
create policy booking_payment_hold_allocation_owner_read on public.booking_payment_hold_allocations
  for select to authenticated using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed());

create function public.booking_payment_hold_refunded_for_movement_v1(p_movement uuid)
returns bigint language sql stable security definer set search_path=public,pg_temp as $$
  -- Cumulative rounding assigns every refunded cent once, even across phases.
  select coalesce((select floor(x.cumulative*b.refunded_cents::numeric/b.due_cents)
    -floor((x.cumulative-x.due_cents)*b.refunded_cents::numeric/b.due_cents)
    from (select a.*,sum(a.due_cents) over(partition by a.batch_id order by a.request_id) cumulative
      from booking_payment_hold_allocations a) x
    join booking_payment_hold_batches b on b.id=x.batch_id
    where x.upfront_movement_id=p_movement),0)::bigint
$$;
revoke all on function public.booking_payment_hold_refunded_for_movement_v1(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_hold_refunded_for_movement_v1(uuid) to service_role;

create function public.booking_payment_hold_ready_v1(p_request uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select r.payment_hold_state is null or (
    r.payment_hold_state='paid' and b.state='paid'
    and not exists(select 1 from booking_requests sibling
      where sibling.workspace_id=r.workspace_id
        and (sibling.payment_hold_batch_id=b.id
          or (r.appointment_group_id is not null and sibling.appointment_group_id=r.appointment_group_id))
        and sibling.payment_hold_state in ('awaiting_payment','expired')))
    from booking_requests r left join booking_payment_hold_batches b on b.id=r.payment_hold_batch_id
    where r.id=p_request),false)
$$;
revoke all on function public.booking_payment_hold_ready_v1(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_hold_ready_v1(uuid) to service_role;

create function public.guard_booking_payment_hold_request_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare policy jsonb; due bigint; customer uuid; canonical numeric; agreement jsonb;
begin
  if tg_op='DELETE' then
    if old.payment_hold_state is not null then raise exception 'booking_payment_hold_receipt_history';end if;
    return old;
  end if;
  if tg_op='INSERT' then
    new.payment_hold_state=null;new.payment_hold_expires_at=null;new.payment_hold_batch_id=null;
    if new.origin::text<>'frontend' then return new;end if;
    customer=new.customer_id;
    policy=public.resolve_booking_payment_policy(new.workspace_id,customer);
    if policy->>'mode'='salon' then return new;end if;
    -- Package coverage has already changed the price in its preceding trigger.
    -- A legacy client cannot turn a priced service into a free booking by sending
    -- zero: use the canonical price and the customer's stored override.
    if new.requested_price=0 and nullif(current_setting('salonpro.package_redemption',true),'') is null then
      select price into canonical from services where workspace_id=new.workspace_id
        and lower(trim(name))=lower(trim(new.requested_service_name)) order by updated_at desc limit 1;
      if canonical>0 then
        agreement=public.resolve_customer_service_price_v1(new.workspace_id,new.customer_email::text,new.customer_phone,new.requested_service_name,canonical);
        new.requested_price=coalesce((agreement->>'price')::numeric,canonical);
      end if;
    end if;
    due=round(round(new.requested_price*100)*(policy->>'percent')::numeric/100);
    if due<50 then return new;end if;
    new.status='pending'::public.request_status;
    new.payment_hold_state='awaiting_payment';
    new.payment_hold_expires_at=clock_timestamp()+interval '5 minutes';
    new.viewed_by_salon=true;new.viewed_by_customer=true;
    return new;
  end if;
  if old.payment_hold_state is not null then
    if current_setting('salonpro.booking_payment_hold_write',true) is distinct from 'yes' then
      new.payment_hold_state=old.payment_hold_state;
      new.payment_hold_expires_at=old.payment_hold_expires_at;
      new.payment_hold_batch_id=old.payment_hold_batch_id;
      if old.payment_hold_state='awaiting_payment' and new.status::text not in ('pending','accepted') then
        raise exception 'booking_payment_session_must_be_reconciled';
      end if;
      if old.payment_hold_batch_id is not null and old.payment_hold_state<>'paid' and (
        new.requested_price is distinct from old.requested_price
        or new.requested_duration_minutes is distinct from old.requested_duration_minutes
        or new.appointment_date is distinct from old.appointment_date
        or new.appointment_time is distinct from old.appointment_time
        or new.workspace_id is distinct from old.workspace_id
        or new.customer_id is distinct from old.customer_id
        or new.customer_email is distinct from old.customer_email
        or new.customer_phone is distinct from old.customer_phone
        or new.requested_service_name is distinct from old.requested_service_name
        or new.requested_operator_id is distinct from old.requested_operator_id
        or new.phase_snapshot is distinct from old.phase_snapshot
        or new.phase_operator_assignments is distinct from old.phase_operator_assignments
        or new.phase_overlap_overrides is distinct from old.phase_overlap_overrides
        or new.appointment_group_id is distinct from old.appointment_group_id) then
        raise exception 'booking_payment_hold_immutable';
      end if;
    end if;
    if new.status::text='accepted' and public.booking_payment_hold_ready_v1(old.id) is not true then
      raise exception 'booking_payment_required';
    end if;
    if old.payment_hold_state='expired' and new.status::text in ('pending','accepted') then
      raise exception 'booking_payment_hold_expired';
    end if;
  else
    if current_setting('salonpro.booking_payment_hold_write',true) is distinct from 'yes' then
      new.payment_hold_state=null;new.payment_hold_expires_at=null;new.payment_hold_batch_id=null;
    end if;
  end if;
  return new;
end $$;
-- Sort after price, customer policy and package binders; no temporary accepted
-- request can leak into push/portal triggers.
create trigger zzz_booking_payment_hold_request before insert or update or delete on public.booking_requests
  for each row execute function public.guard_booking_payment_hold_request_v1();
revoke all on function public.guard_booking_payment_hold_request_v1() from public,anon,authenticated;

create function public.guard_booking_payment_hold_appointment_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.booking_request_id is not null and exists(select 1 from booking_requests r
    where r.id=new.booking_request_id and r.payment_hold_state is not null
      and public.booking_payment_hold_ready_v1(r.id) is not true) then
    raise exception 'booking_payment_required';
  end if;
  return new;
end $$;
create trigger zzz_booking_payment_hold_appointment before insert or update of booking_request_id on public.appointments
  for each row execute function public.guard_booking_payment_hold_appointment_v1();
revoke all on function public.guard_booking_payment_hold_appointment_v1() from public,anon,authenticated;

create function public.prepare_booking_payment_hold_v1(p_workspace uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r booking_requests;member booking_requests;b booking_payment_hold_batches;t booking_payment_terms;
  ids uuid[];movement uuid;total bigint;due bigint;expiration timestamptz;day date;policy jsonb;
begin
  select * into r from booking_requests where id=p_request and workspace_id=p_workspace;
  if not found or r.payment_hold_state is null then return null;end if;
  ids=coalesce((select array_agg(x.id order by x.id) from booking_requests x
    where x.workspace_id=p_workspace and (x.id=r.id or (r.appointment_group_id is not null and x.appointment_group_id=r.appointment_group_id))),array[r.id]);
  for day in select distinct appointment_date from booking_requests where id=any(ids) order by appointment_date loop
    perform pg_advisory_xact_lock(hashtext(p_workspace::text||':'||day::text));
  end loop;
  perform 1 from booking_requests where id=any(ids) order by id for update nowait;
  select * into r from booking_requests where id=p_request;
  if r.payment_hold_batch_id is not null then
    select * into b from booking_payment_hold_batches where id=r.payment_hold_batch_id;
    return to_jsonb(b);
  end if;
  if exists(select 1 from booking_requests where id=any(ids) and (status::text<>'pending' or payment_hold_batch_id is not null)) then
    raise exception 'booking_payment_hold_group_changed';
  end if;
  select sum(requested_price*100)::bigint,min(payment_hold_expires_at)
    into total,expiration from booking_requests where id=any(ids);
  select sum(due_cents)::bigint into due from booking_payment_terms where request_id=any(ids);
  if coalesce(due,0)<50 then return null;end if;
  select jsonb_build_object('mode',mode,'percent',percent) into policy
    from booking_payment_terms where request_id=any(ids) and due_cents>0 order by request_id limit 1;
  insert into booking_payment_hold_batches(workspace_id,customer_id,request_ids,total_cents,due_cents,mode,percent,expires_at,receipt_email)
    values(p_workspace,r.customer_id,ids,total,due,policy->>'mode',(policy->>'percent')::integer,expiration,
      case when lower(trim(r.customer_email::text)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then lower(trim(r.customer_email::text)) else null end) returning * into b;
  perform set_config('salonpro.booking_payment_hold_write','yes',true);
  update booking_requests set payment_hold_batch_id=b.id,
    payment_hold_state='awaiting_payment',payment_hold_expires_at=b.expires_at,
    viewed_by_salon=true,viewed_by_customer=true where id=any(ids);
  for member in select * from booking_requests where id=any(ids) order by id loop
    select * into t from booking_payment_terms where request_id=member.id;
    if found and t.due_cents>0 then
      insert into cash_movements(workspace_id,description,amount,booking_voided)
        values(p_workspace,case when t.mode='deposit' then 'Acconto '||t.percent||'%' else 'Prenotazione' end
          ||' · '||member.requested_service_name||' · '||concat_ws(' ',member.customer_name,member.customer_surname),t.due_cents/100.0,true)
        returning id into movement;
      insert into booking_payment_orders(request_id,workspace_id,upfront_movement_id,total_cents,due_cents)
        values(member.id,p_workspace,movement,t.total_cents,t.due_cents);
      insert into booking_payment_hold_allocations(batch_id,request_id,workspace_id,upfront_movement_id,due_cents)
        values(b.id,member.id,p_workspace,movement,t.due_cents);
    end if;
  end loop;
  perform set_config('salonpro.booking_payment_hold_write','',true);
  return to_jsonb(b);
end $$;
revoke all on function public.prepare_booking_payment_hold_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_booking_payment_hold_v1(uuid,uuid) to service_role;

create function public.seal_booking_payment_hold_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from booking_requests where id=new.id and payment_hold_state='awaiting_payment' and payment_hold_batch_id is null) then
    perform public.prepare_booking_payment_hold_v1(new.workspace_id,new.id);
  end if;
  return null;
end $$;
create constraint trigger zzzz_seal_booking_payment_hold after insert on public.booking_requests
  deferrable initially deferred for each row execute function public.seal_booking_payment_hold_v1();
revoke all on function public.seal_booking_payment_hold_v1() from public,anon,authenticated;

create function public.reserve_booking_payment_hold_v1(p_workspace uuid,p_request uuid,p_account text,p_live boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;prepared jsonb;
begin
  prepared=prepare_booking_payment_hold_v1(p_workspace,p_request);
  if prepared is null then raise exception 'booking_payment_hold_not_found';end if;
  select * into b from booking_payment_hold_batches where id=(prepared->>'id')::uuid for update;
  if b.state<>'awaiting_payment' then return to_jsonb(b);end if;
  if exists(select 1 from booking_requests where id=any(b.request_ids) and status::text<>'pending') then
    raise exception 'booking_payment_hold_cancelled';
  end if;
  if b.account_id is null and b.expires_at<=clock_timestamp() then raise exception 'booking_payment_hold_expired';end if;
  if not exists(select 1 from cash_stripe_accounts where workspace_id=p_workspace and account_id=p_account and livemode=p_live) then
    raise exception 'booking_payment_account_mismatch';
  end if;
  if b.account_id is not null and (b.account_id is distinct from p_account or b.livemode is distinct from p_live) then
    raise exception 'booking_payment_account_mismatch';
  end if;
  if b.account_id is null then
    -- These parameters are immutable for Stripe's idempotency key, even if the
    -- network times out after session creation and before attachment.
    update booking_payment_hold_batches set account_id=p_account,livemode=p_live,
      checkout_expires_at=date_trunc('second',clock_timestamp()+interval '36 minutes'),updated_at=now()
      where id=b.id returning * into b;
  end if;
  return to_jsonb(b);
end $$;
revoke all on function public.reserve_booking_payment_hold_v1(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_booking_payment_hold_v1(uuid,uuid,text,boolean) to service_role;

create function public.attach_booking_payment_hold_checkout_v1(p_batch uuid,p_account text,p_live boolean,p_session text,p_url text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;
begin
  select * into b from booking_payment_hold_batches where id=p_batch for update;
  if not found or b.account_id is distinct from p_account or b.livemode is distinct from p_live
    or nullif(p_session,'') is null or p_url not like 'https://checkout.stripe.com/%'
    or (b.session_id is not null and b.session_id is distinct from p_session) then raise exception 'booking_payment_session_mismatch';end if;
  if b.state='awaiting_payment' then
    update booking_payment_hold_batches set session_id=p_session,checkout_url=p_url,updated_at=now()
      where id=b.id returning * into b;
  end if;
  return to_jsonb(b);
end $$;
revoke all on function public.attach_booking_payment_hold_checkout_v1(uuid,text,boolean,text,text) from public,anon,authenticated;
grant execute on function public.attach_booking_payment_hold_checkout_v1(uuid,text,boolean,text,text) to service_role;

create function public.settle_booking_payment_hold_v1(p_batch uuid,p_account text,p_live boolean,p_session text,p_amount bigint,p_currency text,p_intent text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;day date;member booking_requests;first_request uuid;final_service services;
  automatic boolean;conflict text;result jsonb;
begin
  select * into b from booking_payment_hold_batches where id=p_batch;
  if not found then raise exception 'booking_payment_hold_not_found';end if;
  for day in select distinct appointment_date from booking_requests where id=any(b.request_ids) order by appointment_date loop
    perform pg_advisory_xact_lock(hashtext(b.workspace_id::text||':'||day::text));
  end loop;
  select * into b from booking_payment_hold_batches where id=p_batch for update;
  perform 1 from booking_requests where id=any(b.request_ids) order by id for update nowait;
  -- Revalidate the latest agenda after the day lock, never a cached candidate
  -- snapshot populated before another writer changed opening hours or capacity.
  perform set_config('salonpro.public_booking_payload_workspace_id','',true);
  perform set_config('salonpro.public_booking_context_workspace_id','',true);
  perform set_config('salonpro.public_booking_busy_key','',true);
  perform set_config('salonpro.public_booking_phased_busy_key','',true);
  perform set_config('salonpro.public_booking_operator_dates','{}',true);
  perform set_config('salonpro.time_guard_reads_v1','{}',true);
  if b.account_id is distinct from p_account or b.livemode is distinct from p_live
    or b.due_cents is distinct from p_amount or b.currency is distinct from p_currency
    or nullif(p_session,'') is null or nullif(p_intent,'') is null
    or (b.session_id is not null and b.session_id is distinct from p_session)
    or (b.payment_intent is not null and b.payment_intent is distinct from p_intent) then
    raise exception 'booking_payment_settlement_mismatch';
  end if;
  if b.state in ('paid','paid_conflict') then return to_jsonb(b)||jsonb_build_object('replayed',true);end if;
  perform set_config('salonpro.stripe_settle','yes',true);
  update cash_movements m set payment_method='card',card_label='Stripe',booking_voided=false,updated_at=now()
    from booking_payment_hold_allocations a where a.batch_id=b.id and m.id=a.upfront_movement_id and m.workspace_id=b.workspace_id;
  update booking_payment_hold_batches set state='paid',session_id=p_session,payment_intent=p_intent,checkout_url=null,updated_at=now()
    where id=b.id returning * into b;
  -- Receipt truth survives an expired/cancelled hold. It must never resurrect a
  -- released slot when another customer has taken it in the meantime.
  if exists(select 1 from booking_requests where id=any(b.request_ids)
    and (status::text<>'pending' or payment_hold_state='expired')) then
    conflict='hold_cancelled_or_expired';
  else
    begin
      for member in select * from booking_requests where id=any(b.request_ids) order by id loop
        if not exists(select 1 from services s where s.workspace_id=b.workspace_id
          and lower(trim(s.name))=lower(trim(member.requested_service_name)) and s.is_online
          and (nullif(trim(member.required_role),'') is null
            or lower(trim(s.required_role))=lower(trim(member.required_role)))) then
          raise exception 'booking_request_service_unavailable';
        end if;
        if nullif(trim(coalesce(member.phase_operator_assignments->'initial'->>'id',member.requested_operator_id,'')),'') is not null
          or nullif(trim(coalesce(member.phase_operator_assignments->'initial'->>'name',member.requested_operator_name,'')),'') is not null then
        if not public.public_operator_can_book_service_v1(b.workspace_id,
          coalesce(member.phase_operator_assignments->'initial'->>'id',member.requested_operator_id),
          coalesce(member.phase_operator_assignments->'initial'->>'name',member.requested_operator_name),
          member.requested_service_name,member.required_role) then
          raise exception 'booking_request_operator_unavailable';
        end if;
        end if;
        if member.phase_snapshot->>'mode'='phased'
          and coalesce((member.phase_snapshot->>'finalPhaseEnabled')::boolean,true)
          and coalesce((member.phase_snapshot->>'finalDurationMinutes')::integer,0)>0 then
          select * into final_service from services s where s.workspace_id=b.workspace_id
            and (s.id::text=member.phase_snapshot->>'finalServiceId'
              or lower(trim(s.name))=lower(trim(member.phase_snapshot->>'finalServiceName')))
            order by (s.id::text=member.phase_snapshot->>'finalServiceId') desc nulls last,s.updated_at desc limit 1;
          -- A linked final service need not be independently bookable online.
          -- Older configurations can also use a plain final-phase label and
          -- assign an operator enabled for the parent service.
          if (nullif(trim(coalesce(member.phase_operator_assignments->'final'->>'id',member.requested_operator_id,'')),'') is not null
            or nullif(trim(coalesce(member.phase_operator_assignments->'final'->>'name',member.requested_operator_name,'')),'') is not null)
            and not (public.public_operator_can_book_service_v1(b.workspace_id,
              coalesce(member.phase_operator_assignments->'final'->>'id',member.requested_operator_id),
              coalesce(member.phase_operator_assignments->'final'->>'name',member.requested_operator_name),
              coalesce(final_service.name,member.requested_service_name),
              case when final_service.id is null then member.required_role else final_service.required_role end)
            or public.public_operator_can_book_service_v1(b.workspace_id,
              coalesce(member.phase_operator_assignments->'final'->>'id',member.requested_operator_id),
              coalesce(member.phase_operator_assignments->'final'->>'name',member.requested_operator_name),
              member.requested_service_name,member.required_role)) then
            raise exception 'booking_request_operator_unavailable';
          end if;
        end if;
        perform public.validate_booking_request_auto_accept_v1(b.workspace_id,member.id);
      end loop;
      perform set_config('salonpro.booking_payment_hold_write','yes',true);
      update booking_requests set payment_hold_state='paid',viewed_by_salon=false,viewed_by_customer=true
        where id=any(b.request_ids);
      perform set_config('salonpro.booking_payment_hold_write','',true);
      select bool_and(public.resolve_customer_online_auto_accept_v1(r.workspace_id,r.customer_id)
        and not coalesce((g.metadata->>'requiresSalonApproval')::boolean,false)) into automatic
        from booking_requests r left join appointment_groups g on g.id=r.appointment_group_id
        where r.id=any(b.request_ids);
      select id into first_request from booking_requests where id=any(b.request_ids)
        order by appointment_group_order nulls first,created_at,id limit 1;
      if automatic then
        perform public.accept_booking_request_or_group_core_v3(b.workspace_id,first_request);
        perform public.queue_owner_badge_refresh_after_auto_accept(b.workspace_id,first_request);
      else
        select * into member from booking_requests where id=first_request;
        if member.appointment_group_id is not null then
          perform public.queue_booking_group_created_owner_push_v1(b.workspace_id,member.appointment_group_id);
        else
          perform public.queue_workspace_push(b.workspace_id,'booking_request_created','Nuova richiesta di prenotazione',
            concat_ws(' ',member.customer_name,member.customer_surname)||'. '||member.requested_service_name||'. '
              ||to_char(member.appointment_date,'DD/MM/YYYY')||' alle '||to_char(member.appointment_time,'HH24:MI')||'.',
            jsonb_build_object('type','booking_request_created','_pushAudience','auth','_pushTarget','owner',
              '_pushEventType','booking_request_created','_dedupeKey','booking-payment-ready:'||b.id,
              'bookingRequestId',member.id,'bookingRequestIds',to_jsonb(b.request_ids),
              'appointmentDate',member.appointment_date,'appointmentTime',member.appointment_time,
              'customerName',concat_ws(' ',member.customer_name,member.customer_surname),'serviceName',member.requested_service_name));
        end if;
        perform public.queue_public_customer_push(b.workspace_id,'custom','Pagamento ricevuto',
          'La richiesta è stata inviata al salone. La prenotazione sarà confermata dopo la sua approvazione.',
          jsonb_build_object('type','booking_payment_received','batchId',b.id,'bookingRequestId',member.id,
            '_pushTarget','client','_dedupeKey','booking-payment-received:'||b.id),member.customer_email,member.customer_phone);
        perform public.refresh_workspace_agenda_state(b.workspace_id);
      end if;
    exception when others then
      -- Keep the money receipt, but roll back every attempted confirmation.
      conflict=case when sqlerrm like '%booking_request_conflict%' or sqlerrm like '%slot%' then 'slot_unavailable' else 'booking_review_required' end;
    end;
  end if;
  if conflict is not null then
    update booking_payment_hold_batches set state='paid_conflict',updated_at=now() where id=b.id returning * into b;
    perform set_config('salonpro.booking_payment_hold_write','yes',true);
    perform set_config('salonpro.skip_booking_request_push','on',true);
    update booking_requests set payment_hold_state='expired',status='cancelled'::request_status,
      cancellation_source=null,viewed_by_salon=true,viewed_by_customer=true
      where id=any(b.request_ids) and status::text='pending';
    perform set_config('salonpro.skip_booking_request_push','off',true);
    perform set_config('salonpro.booking_payment_hold_write','',true);
    perform public.queue_workspace_push(b.workspace_id,'custom','Pagamento ricevuto: prenotazione da verificare',
      'È stato ricevuto un pagamento, ma l’orario non è stato confermato. Verifica la prenotazione e gli eventuali rimborsi.',
      jsonb_build_object('type','booking_payment_review','batchId',b.id,'_dedupeKey','booking-payment-review:'||b.id));
    select * into member from booking_requests where id=b.request_ids[1];
    perform public.queue_public_customer_push(b.workspace_id,'custom','Pagamento ricevuto: orario da verificare',
      'Il pagamento è stato ricevuto, ma la prenotazione non è confermata. Contatta il salone per concordare l’orario o il rimborso.',
      jsonb_build_object('type','booking_payment_review','batchId',b.id,'_pushTarget','client',
        '_dedupeKey','booking-payment-review-client:'||b.id),member.customer_email,member.customer_phone);
  end if;
  perform set_config('salonpro.stripe_settle','no',true);
  return to_jsonb(b)||jsonb_build_object('replayed',false,'bookingStatus',case when conflict is not null then 'review_required' when automatic then 'accepted' else 'pending' end);
end $$;
revoke all on function public.settle_booking_payment_hold_v1(uuid,text,boolean,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_booking_payment_hold_v1(uuid,text,boolean,text,bigint,text,text) to service_role;

create function public.expire_booking_payment_hold_v1(p_batch uuid,p_account text,p_live boolean,p_session text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;day date;member booking_requests;
begin
  select * into b from booking_payment_hold_batches where id=p_batch;
  if not found then raise exception 'booking_payment_hold_not_found';end if;
  for day in select distinct appointment_date from booking_requests where id=any(b.request_ids) order by appointment_date loop
    perform pg_advisory_xact_lock(hashtext(b.workspace_id::text||':'||day::text));
  end loop;
  select * into b from booking_payment_hold_batches where id=p_batch for update;
  perform 1 from booking_requests where id=any(b.request_ids) order by id for update nowait;
  if b.state<>'awaiting_payment' then return to_jsonb(b);end if;
  if b.account_id is null then
    if p_account is not null or p_live is not null or p_session is not null or b.expires_at>clock_timestamp() then
      raise exception 'booking_payment_hold_not_expired';
    end if;
  elsif b.account_id is distinct from p_account or b.livemode is distinct from p_live
    or nullif(p_session,'') is null or (b.session_id is not null and b.session_id is distinct from p_session) then
    raise exception 'booking_payment_expiration_mismatch';
  end if;
  -- Service-only caller has retrieved an expired Stripe session. A mere local
  -- clock deadline can never release a started or uncertain Checkout session.
  update booking_payment_hold_batches set state='expired',session_id=coalesce(session_id,p_session),checkout_url=null,updated_at=now()
    where id=b.id returning * into b;
  perform set_config('salonpro.booking_payment_hold_write','yes',true);
  perform set_config('salonpro.skip_booking_request_push','on',true);
  update booking_requests set payment_hold_state='expired',status='cancelled'::request_status,
    cancellation_source=null,viewed_by_salon=true,viewed_by_customer=true
    where id=any(b.request_ids) and status::text='pending';
  update cash_movements m set booking_voided=true,updated_at=now()
    from booking_payment_hold_allocations a where a.batch_id=b.id and m.id=a.upfront_movement_id and m.payment_method is null;
  perform set_config('salonpro.skip_booking_request_push','off',true);
  perform set_config('salonpro.booking_payment_hold_write','',true);
  perform public.refresh_workspace_agenda_state(b.workspace_id);
  select * into member from booking_requests where id=b.request_ids[1];
  perform public.queue_public_customer_push(b.workspace_id,'custom','Pagamento non completato',
    'L’orario è stato liberato. Per prenotare, scegli nuovamente il servizio e completa il pagamento.',
    jsonb_build_object('type','booking_payment_expired','batchId',b.id,'_pushTarget','client',
      '_dedupeKey','booking-payment-expired:'||b.id),member.customer_email,member.customer_phone);
  return to_jsonb(b);
end $$;
revoke all on function public.expire_booking_payment_hold_v1(uuid,text,boolean,text) from public,anon,authenticated;
grant execute on function public.expire_booking_payment_hold_v1(uuid,text,boolean,text) to service_role;

create function public.cancel_unstarted_booking_payment_hold_v1(p_workspace uuid,p_request uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;prepared jsonb;
begin
  prepared=prepare_booking_payment_hold_v1(p_workspace,p_request);
  if prepared is null then raise exception 'booking_payment_hold_not_found';end if;
  select * into b from booking_payment_hold_batches where id=(prepared->>'id')::uuid for update;
  if b.state<>'awaiting_payment' then return to_jsonb(b);end if;
  if b.account_id is not null or b.session_id is not null then raise exception 'booking_payment_session_must_be_reconciled';end if;
  update booking_payment_hold_batches set expires_at=clock_timestamp() where id=b.id;
  return expire_booking_payment_hold_v1(b.id,null,null,null);
end $$;
revoke all on function public.cancel_unstarted_booking_payment_hold_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_unstarted_booking_payment_hold_v1(uuid,uuid) to service_role;

create function public.release_unattached_booking_payment_hold_v1(p_batch uuid,p_account text,p_live boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;result jsonb;day date;
begin
  select * into b from booking_payment_hold_batches where id=p_batch;
  if not found then raise exception 'booking_payment_hold_not_found';end if;
  for day in select distinct appointment_date from booking_requests where id=any(b.request_ids) order by appointment_date loop
    perform pg_advisory_xact_lock(hashtext(b.workspace_id::text||':'||day::text));
  end loop;
  select * into b from booking_payment_hold_batches where id=p_batch for update;
  if not found or b.account_id is distinct from p_account or b.livemode is distinct from p_live
    or b.session_id is not null or b.expires_at>clock_timestamp()-interval '60 seconds' then
    raise exception 'booking_payment_unattached_release_mismatch';end if;
  if b.state<>'awaiting_payment' then return to_jsonb(b);end if;
  -- Edge has completed the connected-account search and verified that no
  -- Checkout session exists for this frozen idempotency identity.
  update booking_payment_hold_batches set account_id=null,livemode=null where id=b.id;
  result=expire_booking_payment_hold_v1(b.id,null,null,null);
  update booking_payment_hold_batches set account_id=p_account,livemode=p_live where id=b.id;
  select to_jsonb(x) into result from booking_payment_hold_batches x where id=b.id;
  return result;
end $$;
revoke all on function public.release_unattached_booking_payment_hold_v1(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.release_unattached_booking_payment_hold_v1(uuid,text,boolean) to service_role;

create function public.refund_booking_payment_hold_v1(p_batch uuid,p_account text,p_live boolean,p_intent text,p_refunded bigint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare b booking_payment_hold_batches;
begin
  select * into b from booking_payment_hold_batches where id=p_batch for update;
  if not found or b.state not in ('paid','paid_conflict') or b.account_id is distinct from p_account
    or b.livemode is distinct from p_live or b.payment_intent is distinct from p_intent
    or p_refunded is null or p_refunded<0 or p_refunded>b.due_cents then raise exception 'booking_payment_refund_mismatch';end if;
  update booking_payment_hold_batches set refunded_cents=greatest(refunded_cents,p_refunded),updated_at=now()
    where id=b.id returning * into b;
  return to_jsonb(b);
end $$;
revoke all on function public.refund_booking_payment_hold_v1(uuid,text,boolean,text,bigint) from public,anon,authenticated;
grant execute on function public.refund_booking_payment_hold_v1(uuid,text,boolean,text,bigint) to service_role;

alter table public.booking_payment_hold_batches add column next_check_at timestamptz not null default now();
create function public.claim_due_booking_payment_holds_v1(p_limit integer default 20)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  with candidates as (
    select id from booking_payment_hold_batches where state='awaiting_payment'
      and expires_at<=clock_timestamp() and next_check_at<=clock_timestamp()
      order by expires_at,id limit greatest(1,least(coalesce(p_limit,20),100)) for update skip locked
  ),claimed as (
    update booking_payment_hold_batches b set next_check_at=clock_timestamp()+interval '60 seconds'
      from candidates c where b.id=c.id returning b.*
  )select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end $$;
revoke all on function public.claim_due_booking_payment_holds_v1(integer) from public,anon,authenticated;
grant execute on function public.claim_due_booking_payment_holds_v1(integer) to service_role;

-- Attach the already-paid upfront receipts only when a real appointment exists.
alter function public.prepare_booking_payment_ledger(uuid,uuid) rename to prepare_booking_payment_ledger_before_hold_v1;
create function public.prepare_booking_payment_ledger(p_workspace uuid,p_appointment uuid)
returns public.booking_payment_orders language plpgsql security definer set search_path=public,pg_temp as $$
declare a appointments;o booking_payment_orders;balance uuid;label text;
begin
  select * into a from appointments where id=p_appointment and workspace_id=p_workspace for update;
  select * into o from booking_payment_orders where request_id=a.booking_request_id and workspace_id=p_workspace;
  if o.request_id is null or not exists(select 1 from booking_payment_hold_allocations where request_id=o.request_id) then
    return prepare_booking_payment_ledger_before_hold_v1(p_workspace,p_appointment);
  end if;
  if o.appointment_id is not null then return o;end if;
  if public.booking_payment_hold_ready_v1(o.request_id) is not true then raise exception 'booking_payment_required';end if;
  if round(a.price*100)<>o.total_cents then raise exception 'booking_payment_amount_changed';end if;
  perform set_config('salonpro.booking_payment_hold_attach','yes',true);
  label=a.service_name||' · '||a.customer_name;
  if o.due_cents<o.total_cents then
    insert into cash_movements(workspace_id,appointment_id,description,amount)
      values(p_workspace,a.id,'Saldo · '||label,(o.total_cents-o.due_cents)/100.0) returning id into balance;
  else
    update cash_movements set appointment_id=a.id where id=o.upfront_movement_id;
  end if;
  update booking_payment_orders set appointment_id=a.id,balance_movement_id=balance where request_id=o.request_id returning * into o;
  perform set_config('salonpro.booking_payment_hold_attach','',true);
  perform set_config('salonpro.stripe_settle','yes',true);
  update appointments set cashed_in=(public.booking_payment_received_cents(o.request_id)>=o.total_cents) where id=a.id;
  perform set_config('salonpro.stripe_settle','no',true);
  return o;
end $$;
revoke all on function public.prepare_booking_payment_ledger(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_booking_payment_ledger(uuid,uuid) to service_role;

-- All hold receipt method/amount edits are protected until Stripe verification.
create function public.guard_booking_payment_hold_movement_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from booking_payment_hold_allocations where upfront_movement_id=old.id) then
    if tg_op='DELETE' then raise exception 'booking_payment_hold_receipt_history';end if;
    if new.payment_method is distinct from old.payment_method or new.card_label is distinct from old.card_label then
      if current_setting('salonpro.stripe_settle',true) is distinct from 'yes' then raise exception 'booking_payment_requires_stripe_verification';end if;
    end if;
  end if;
  if tg_op='DELETE' then return old;end if;
  return new;
end $$;
create trigger aa_booking_payment_hold_movement_guard before update or delete on public.cash_movements
  for each row execute function public.guard_booking_payment_hold_movement_v1();
revoke all on function public.guard_booking_payment_hold_movement_v1() from public,anon,authenticated;

-- Small guarded edits to existing authorities retain their unrelated behavior.
do $patch$
declare definition text;updated text;signature regprocedure;
begin
  signature='public.guard_booking_payment_movement()'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'new.appointment_id is distinct from old.appointment_id and not(',
    'new.appointment_id is distinct from old.appointment_id and current_setting(''salonpro.booking_payment_hold_attach'',true) is distinct from ''yes'' and not(');
  if updated=definition then raise exception 'booking_hold_movement_attach_anchor_missing';end if;execute updated;
  signature='public.process_due_auto_accept_booking_requests(integer)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'where candidate.origin = ''frontend''',
    'where public.booking_payment_hold_ready_v1(candidate.id) is true
      and not exists(select 1 from appointment_groups g where g.id=candidate.appointment_group_id
        and coalesce((g.metadata->>''requiresSalonApproval'')::boolean,false))
      and candidate.origin = ''frontend''');
  updated=replace(updated,'member.origin <> ''frontend''',
    'public.booking_payment_hold_ready_v1(member.id) is not true
      or exists(select 1 from appointment_groups g where g.id=member.appointment_group_id
        and coalesce((g.metadata->>''requiresSalonApproval'')::boolean,false))
      or member.origin <> ''frontend''');
  if updated=definition then raise exception 'booking_hold_auto_accept_anchor_missing';end if;execute updated;
  signature='public.booking_payment_paid_before_revision(uuid)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'round(m.amount*100)-coalesce(',
    'round(m.amount*100)-public.booking_payment_hold_refunded_for_movement_v1(m.id)-coalesce(');
  if updated=definition then raise exception 'booking_hold_paid_cents_anchor_missing';end if;execute updated;
  signature='public.appointment_revision_payment_state(uuid)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'round(m.amount*100)-coalesce(',
    'round(m.amount*100)-public.booking_payment_hold_refunded_for_movement_v1(m.id)-coalesce(');
  if updated=definition then raise exception 'booking_hold_revision_refund_anchor_missing';end if;execute updated;
end $patch$;

create function public.booking_payment_hold_event_allowed_v1(p_workspace uuid,p_payload jsonb)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select not exists(select 1 from booking_requests r where r.workspace_id=p_workspace
    and r.payment_hold_state in ('awaiting_payment','expired')
    and (r.id::text=coalesce(p_payload->>'bookingRequestId',p_payload->>'requestId','')
      or r.appointment_group_id::text=coalesce(p_payload->>'appointmentGroupId',p_payload->>'groupId','')
      or (jsonb_typeof(p_payload->'bookingRequestIds')='array' and p_payload->'bookingRequestIds' @> jsonb_build_array(r.id))))
$$;
revoke all on function public.booking_payment_hold_event_allowed_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.booking_payment_hold_event_allowed_v1(uuid,jsonb) to service_role;

create function public.filter_booking_payment_hold_projection_v1(p_workspace uuid,p_payload jsonb)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb=coalesce(p_payload,'{}'::jsonb);key text;filtered jsonb;
begin
  foreach key in array array['richiestePrenotazione','richieste_prenotazione','appuntamenti'] loop
    if jsonb_typeof(result->key)='array' then
      select coalesce(jsonb_agg(item order by position),'[]'::jsonb) into filtered
      from jsonb_array_elements(result->key) with ordinality as entries(item,position)
      where not exists(select 1 from booking_requests r where r.workspace_id=p_workspace
        and r.payment_hold_state in ('awaiting_payment','expired')
        and (r.id::text=coalesce(item->>'bookingRequestId',item->>'id','')
          or (key='appuntamenti' and coalesce(item->>'data',item->>'date','')=r.appointment_date::text
            and left(coalesce(item->>'ora',item->>'time',''),5)=to_char(r.appointment_time,'HH24:MI')
            and lower(trim(coalesce(item->>'servizio',item->>'serviceName','')))=lower(trim(r.requested_service_name))
            and lower(trim(coalesce(item->>'cliente',item->>'customerName','')))=lower(trim(concat_ws(' ',r.customer_name,r.customer_surname))))));
      result=jsonb_set(result,array[key],filtered,true);
    end if;
  end loop;
  return result;
end $$;
revoke all on function public.filter_booking_payment_hold_projection_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.filter_booking_payment_hold_projection_v1(uuid,jsonb) to service_role;

create function public.protect_booking_payment_hold_owner_projection_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  new.payload=public.filter_booking_payment_hold_projection_v1(new.workspace_id,new.payload);
  return new;
end $$;
create trigger zzzz_booking_payment_hold_owner_projection before insert or update of payload on public.owner_app_snapshots
  for each row execute function public.protect_booking_payment_hold_owner_projection_v1();
revoke all on function public.protect_booking_payment_hold_owner_projection_v1() from public,anon,authenticated;

do $patch$
declare definition text;updated text;signature regprocedure;name text;
begin
  foreach signature in array array[
    'public.queue_workspace_push(uuid,public.push_event_type,text,text,jsonb)'::regprocedure,
    'public.queue_public_customer_push(uuid,public.push_event_type,text,text,jsonb,citext,text)'::regprocedure,
    'public.queue_public_owner_push(uuid,public.push_event_type,text,text,jsonb)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    updated=regexp_replace(definition,E'\nbegin\n',E'\nbegin\n  if public.booking_payment_hold_event_allowed_v1(p_workspace_id,p_payload) is not true then return 0;end if;\n','i');
    if updated=definition then raise exception 'booking_hold_push_guard_anchor_missing:%',signature;end if;execute updated;
  end loop;
  foreach signature in array array[
    'public.sync_client_portal_booking_requests(uuid)'::regprocedure,
    'public.get_client_portal_snapshot(text)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    updated=replace(definition,'where booking_request.workspace_id =',
      'where coalesce(booking_request.payment_hold_state,''paid'')=''paid'' and booking_request.workspace_id =');
    if updated=definition then raise exception 'booking_hold_projection_anchor_missing:%',signature;end if;execute updated;
  end loop;
  signature='public.get_client_portal_snapshot(text)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'''availabilitySettings'', coalesce(v_owner_payload -> ''availabilitySettings'', ''{}''::jsonb),',
    $occupancy$'paymentHoldOccupancy',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'data',r.appointment_date,'ora',to_char(r.appointment_time,'HH24:MI'),
      'servizio',r.requested_service_name,'durataMinuti',r.requested_duration_minutes,
      'operatoreId',r.requested_operator_id,'operatoreNome',r.requested_operator_name,
      'requiredRole',r.required_role,'phaseSnapshot',r.phase_snapshot,
      'phaseOperatorAssignments',r.phase_operator_assignments,'phaseOverlapOverrides',r.phase_overlap_overrides,
      'appointmentGroupId',r.appointment_group_id,'appointmentGroupOrder',r.appointment_group_order,
      'stato','In attesa','viewedByCliente',true,'viewedBySalon',true,
      'paymentHoldState',r.payment_hold_state,'paymentHoldExpiresAt',r.payment_hold_expires_at)
      order by r.appointment_date,r.appointment_time,r.id) from booking_requests r
      where r.workspace_id=v_workspace.id and r.status='pending'::request_status
        and r.payment_hold_state='awaiting_payment'),'[]'::jsonb),
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),$occupancy$);
  if updated=definition then raise exception 'booking_hold_occupancy_anchor_missing';end if;execute updated;
  -- Both readback paths are used after timeout or composition/dependency submits.
  signature='public.find_public_booking_request_by_composite(text,date,time without time zone,text,text,text)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'booking_request.appointment_group_id'||chr(10)||'  into',
    'booking_request.appointment_group_id,'||chr(10)||'    booking_request.payment_hold_state,booking_request.payment_hold_expires_at,booking_request.payment_hold_batch_id'||chr(10)||'  into');
  updated=replace(updated,'''appointmentGroupId'', v_booking_request.appointment_group_id,',
    '''appointmentGroupId'', v_booking_request.appointment_group_id,'||chr(10)||'    ''paymentHoldState'',v_booking_request.payment_hold_state,''paymentHoldExpiresAt'',v_booking_request.payment_hold_expires_at,''paymentHoldBatchId'',v_booking_request.payment_hold_batch_id,');
  if updated=definition then raise exception 'booking_hold_readback_anchor_missing';end if;execute updated;
  signature='public.find_public_booking_dependency_by_idempotency_v1(text,text,text,text)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'request.viewed_by_salon'||chr(10)||'  into',
    'request.viewed_by_salon,request.payment_hold_state,request.payment_hold_expires_at,request.payment_hold_batch_id'||chr(10)||'  into');
  updated=replace(updated,'''viewedBySalon'', coalesce(v_root_request.viewed_by_salon, false)',
    '''viewedBySalon'', coalesce(v_root_request.viewed_by_salon, false),''paymentHoldState'',v_root_request.payment_hold_state,''paymentHoldExpiresAt'',v_root_request.payment_hold_expires_at,''paymentHoldBatchId'',v_root_request.payment_hold_batch_id');
  if updated=definition then raise exception 'booking_hold_dependency_readback_anchor_missing';end if;execute updated;
  foreach signature in array array[
    'public.create_public_booking_composition_v1(text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure,
    'public.create_public_booking_dependency_v1(text,text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    updated=replace(definition,'''groupId'', v_group.id,',
      $metadata$'groupId', v_group.id,
        'paymentHoldState',(select r.payment_hold_state from booking_requests r where r.appointment_group_id=v_group.id
          and r.payment_hold_state is not null order by r.id limit 1),
        'paymentHoldExpiresAt',(select min(r.payment_hold_expires_at) from booking_requests r where r.appointment_group_id=v_group.id),
        'paymentHoldBatchId',(select r.payment_hold_batch_id from booking_requests r where r.appointment_group_id=v_group.id
          and r.payment_hold_batch_id is not null order by r.id limit 1),$metadata$);
    if updated=definition then raise exception 'booking_hold_constructor_metadata_anchor_missing:%',signature;end if;execute updated;
  end loop;
  foreach signature in array array[
    'public.get_public_booking_occupancy_live(text,date)'::regprocedure,
    'public.get_public_booking_occupancy_phased_v1(text,date)'::regprocedure
  ] loop
    select pg_get_functiondef(signature) into definition;
    updated=replace(definition,
      'trim(concat_ws('' '', booking_request.customer_name, booking_request.customer_surname))',
      'case when booking_request.payment_hold_state=''awaiting_payment'' then '''' else trim(concat_ws('' '', booking_request.customer_name, booking_request.customer_surname)) end');
    if updated=definition then raise exception 'booking_hold_live_occupancy_redaction_anchor_missing:%',signature;end if;execute updated;
  end loop;
  signature='public.queue_owner_badge_refresh_after_auto_accept(uuid,uuid)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'where request.workspace_id = p_workspace_id',
    'where coalesce(request.payment_hold_state,''paid'')=''paid'' and request.workspace_id = p_workspace_id');
  if updated=definition then raise exception 'booking_hold_owner_badge_anchor_missing';end if;execute updated;
end $patch$;

alter function public.customer_booking_payment_notices(uuid,uuid) rename to customer_booking_payment_notices_before_hold_v1;
create function public.customer_booking_payment_notices(p_workspace uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select jsonb_agg(n.value||coalesce((select jsonb_build_object(
      'appointmentDate',r.appointment_date::text,'appointmentTime',to_char(r.appointment_time,'HH24:MI'))
      from booking_requests r where r.workspace_id=p_workspace and r.id=(n.value->>'requestId')::uuid),'{}'::jsonb)
      order by n.position)
    from jsonb_array_elements(coalesce(public.customer_booking_payment_notices_before_hold_v1(p_workspace,p_customer),'[]'::jsonb))
      with ordinality n(value,position)),'[]'::jsonb)
    ||coalesce((select jsonb_agg(jsonb_build_object('requestId',b.request_ids[1],
      'requestIds',to_jsonb(b.request_ids),'groupRequestIds',to_jsonb(b.request_ids),'batchId',b.id,'serviceName',
      (select string_agg(r.requested_service_name,' + ' order by r.appointment_group_order nulls first,r.id)
        from booking_requests r where r.id=any(b.request_ids)),
      'appointmentDate',(select r.appointment_date::text from booking_requests r where r.id=any(b.request_ids)
        order by r.appointment_date,r.appointment_time,r.appointment_group_order nulls first,r.id limit 1),
      'appointmentTime',(select to_char(r.appointment_time,'HH24:MI') from booking_requests r where r.id=any(b.request_ids)
        order by r.appointment_date,r.appointment_time,r.appointment_group_order nulls first,r.id limit 1),
      'dueCents',b.due_cents,'totalCents',b.total_cents,'mode',b.mode,'percent',b.percent,
      'expiresAt',b.expires_at,'holdExpiresAt',b.expires_at,
      'status',case when b.state='paid_conflict' then 'paid_conflict' else 'payment_required' end,
      'paidCents',case when b.state='paid_conflict' then b.due_cents-b.refunded_cents else 0 end,
      'refundedCents',b.refunded_cents,
      'bookingStatus',case when b.state='paid_conflict' then 'review_required' else 'awaiting_payment' end) order by b.created_at,b.id)
      from booking_payment_hold_batches b where b.workspace_id=p_workspace and b.customer_id=p_customer
        and ((b.state='awaiting_payment' and not exists(select 1 from booking_requests r where r.id=any(b.request_ids) and r.status::text<>'pending'))
          or (b.state='paid_conflict' and b.refunded_cents<b.due_cents))),'[]'::jsonb)
$$;
revoke all on function public.customer_booking_payment_notices(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_booking_payment_notices(uuid,uuid) to service_role;

-- Aggregate cash sync must also react to new hold receipts and verified refunds.
create trigger booking_payment_hold_cash_revision after insert or update on public.booking_payment_hold_batches
  for each row execute function public.touch_cash_sync_revision();

-- Timed reconciliation is performed by the Edge function, which retrieves or
-- expires Stripe sessions before releasing capacity. Never free an open session
-- based on a database-only clock comparison.
do $schedule$
declare job bigint;endpoint text;
begin
  if exists(select 1 from pg_namespace where nspname='cron') and exists(select 1 from pg_namespace where nspname='net') then
    select jobid into job from cron.job where jobname='booking-payment-hold-reconciliation' limit 1;
    if job is not null then perform cron.unschedule(job);end if;
    endpoint='https://mlzrtpqphsdfgsklacmu.supabase.co/functions/v1/cash-stripe?action=booking-sweep';
    perform cron.schedule('booking-payment-hold-reconciliation','* * * * *',
      format('select net.http_post(url := %L, headers := ''{"Content-Type":"application/json"}''::jsonb, body := ''{}''::jsonb);',endpoint));
  end if;
end $schedule$;

notify pgrst,'reload schema';
