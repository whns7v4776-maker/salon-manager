begin;
create table public.customer_cancellation_policies (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 notice_minutes integer not null default 30 check (notice_minutes between 0 and 10080),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.customer_cancellation_policies enable row level security;
revoke all on public.customer_cancellation_policies from public, anon, authenticated;
grant select on public.customer_cancellation_policies to anon, authenticated;
create policy customer_cancellation_policy_public_read on public.customer_cancellation_policies for select to anon, authenticated using (true);

create function public.customer_cancellation_notice_minutes(p_workspace_id uuid)
returns integer language sql stable security definer set search_path = public, pg_temp as $$
 select coalesce((select notice_minutes from public.customer_cancellation_policies where workspace_id = p_workspace_id), 30);
$$;
revoke all on function public.customer_cancellation_notice_minutes(uuid) from public, anon, authenticated;

create function public.get_customer_cancellation_policy(p_salon_code text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
 select jsonb_build_object('workspaceId', w.id, 'noticeMinutes', coalesce(p.notice_minutes,30), 'updatedAt', p.updated_at)
 from public.workspaces w left join public.customer_cancellation_policies p on p.workspace_id=w.id
 where w.slug=lower(trim(p_salon_code));
$$;
revoke all on function public.get_customer_cancellation_policy(text) from public;
grant execute on function public.get_customer_cancellation_policy(text) to anon, authenticated;

create function public.set_customer_cancellation_policy(p_salon_code text, p_notice_minutes integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
 if p_notice_minutes is null or p_notice_minutes < 0 or p_notice_minutes > 10080 then raise exception 'invalid_cancellation_notice'; end if;
 select w.id into v_id from public.workspaces w join public.workspace_members m on m.workspace_id=w.id
 where w.slug=lower(trim(p_salon_code)) and m.user_id=auth.uid() and m.role='owner';
 if v_id is null then raise exception 'owner_required'; end if;
 insert into public.customer_cancellation_policies(workspace_id,notice_minutes) values(v_id,p_notice_minutes)
 on conflict(workspace_id) do update set notice_minutes=excluded.notice_minutes, updated_at=clock_timestamp();
 return public.get_customer_cancellation_policy(p_salon_code);
end;
$$;
revoke all on function public.set_customer_cancellation_policy(text,integer) from public, anon;
grant execute on function public.set_customer_cancellation_policy(text,integer) to authenticated;

create or replace function public.cancel_public_booking_request(
  p_salon_code text,
  p_request_id uuid,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_linked_appointment public.appointments%rowtype;
  v_customer_email citext;
  v_customer_phone text;
  v_authoritative_appointment_date date;
  v_authoritative_appointment_time time;
  v_appointment_start_at timestamptz;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(
    right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
    ''
  );

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or coalesce(workspace.is_internal_tester, false)
    )
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  -- Serialize the cutoff decision with owner moves/status changes. The core
  -- function locks the same row again inside this transaction, which is safe.
  select request.*
  into v_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = p_request_id
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
    )
  for update;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  if v_request.status = 'accepted'::public.request_status then
    -- Owner move/swap RPCs update both records, but the live appointment is
    -- still the cancellation authority if a stale request projection ever
    -- survives. Lock it after the request row, matching the core mutation's
    -- request -> appointment lock order.
    select appointment.*
    into v_linked_appointment
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id = v_request.id
    limit 1
    for update;

    v_authoritative_appointment_date := case
      when v_linked_appointment.id is not null then v_linked_appointment.appointment_date
      else v_request.appointment_date
    end;
    v_authoritative_appointment_time := case
      when v_linked_appointment.id is not null then v_linked_appointment.appointment_time
      else v_request.appointment_time
    end;

    -- An accepted record without a complete authoritative start must never
    -- bypass the policy through SQL null comparison semantics.
    if v_authoritative_appointment_date is null or v_authoritative_appointment_time is null then
      raise exception 'customer_cancellation_window_closed';
    end if;

    v_appointment_start_at :=
      (v_authoritative_appointment_date + v_authoritative_appointment_time)
      at time zone 'Europe/Rome';

    -- Boundary closed: at exactly T-30 the online cancellation is no longer
    -- available. Pending requests deliberately keep their existing behaviour.
    if
      v_appointment_start_at is null
      or v_appointment_start_at <= clock_timestamp() + make_interval(mins => public.customer_cancellation_notice_minutes(v_workspace_id))
    then
      raise exception 'customer_cancellation_window_closed';
    end if;
  end if;

  return public.cancel_public_booking_request_without_cutoff_v1(
    p_salon_code,
    p_request_id,
    p_customer_email,
    p_customer_phone
  );
end;
$$;

create or replace function public.cancel_public_appointment_by_composite(
  p_salon_code text,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_service_name text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_requested_service_name text := lower(trim(coalesce(p_requested_service_name, '')));
  v_customer_email citext := nullif(
    lower(trim(coalesce(p_customer_email::text, ''))),
    ''
  )::citext;
  v_customer_phone text := nullif(
    right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
    ''
  );
  v_customer public.customers%rowtype;
  v_appointment public.appointments%rowtype;
  v_appointment_start_at timestamptz;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = '' then
    raise exception 'workspace_not_found';
  end if;

  if p_appointment_date is null or p_appointment_time is null or v_requested_service_name = '' then
    raise exception 'appointment_not_found';
  end if;

  if v_customer_email is null and v_customer_phone is null then
    raise exception 'customer_identity_required';
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select customer.*
  into v_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
    )
  order by customer.updated_at desc nulls last, customer.created_at desc nulls last
  limit 1;

  -- The legacy composite path has no booking-request row to protect first, so
  -- lock the exact live appointment before evaluating the same T-30 boundary.
  select appointment.*
  into v_appointment
  from public.appointments as appointment
  left join public.customers as customer
    on customer.id = appointment.customer_id
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_date = p_appointment_date
    and appointment.appointment_time = p_appointment_time
    and lower(trim(coalesce(appointment.service_name, ''))) = v_requested_service_name
    and appointment.completed = false
    and appointment.cashed_in = false
    and appointment.no_show = false
    and (
      (v_customer.id is not null and appointment.customer_id = v_customer.id)
      or (
        v_customer_email is not null
        and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
    )
  order by appointment.updated_at desc nulls last, appointment.created_at desc nulls last
  limit 1
  for update of appointment;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  v_appointment_start_at :=
    (v_appointment.appointment_date + v_appointment.appointment_time)
    at time zone 'Europe/Rome';

  if v_appointment_start_at <= clock_timestamp() + make_interval(mins => public.customer_cancellation_notice_minutes(v_workspace_id)) then
    raise exception 'customer_cancellation_window_closed';
  end if;

  return public.cancel_public_appointment_by_composite_without_cutoff_v1(
    p_salon_code,
    p_appointment_date,
    p_appointment_time,
    p_requested_service_name,
    p_customer_email,
    p_customer_phone
  );
end;
$$;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table public.customer_cancellation_policies;
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
