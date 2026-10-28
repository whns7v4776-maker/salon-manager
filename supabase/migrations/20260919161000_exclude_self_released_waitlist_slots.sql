-- Remember who released a place, including across the owner's grace period.
create table public.waitlist_release_origins (
 source_key text primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 appointment_date date not null, appointment_time time not null, duration_minutes integer not null,
 operator_id text, operator_name text, service_name text,
 email_hash text, phone_hash text, created_at timestamptz not null default clock_timestamp()
);
alter table public.waitlist_release_origins enable row level security;
revoke all on public.waitlist_release_origins from public,anon,authenticated;
create index waitlist_release_origins_lookup on public.waitlist_release_origins(workspace_id,appointment_date);

create or replace function public.track_waitlist_release_origin_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare r jsonb; v_email text; v_phone text; v_operator_id text; v_operator_name text; v_duration integer;
 v_is_release boolean; v_customer public.customers%rowtype;
begin
 r:=case when TG_OP='DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
 v_is_release:=TG_OP='DELETE' or (TG_TABLE_NAME='booking_requests' and TG_OP='UPDATE' and to_jsonb(OLD)->>'status' in ('pending','accepted') and r->>'status' in ('cancelled','rejected'));
 if TG_TABLE_NAME='booking_requests' and not v_is_release and coalesce(r->>'status','') not in ('pending','accepted') then return NEW;end if;
 if v_is_release then r:=to_jsonb(OLD);end if;
 v_duration:=greatest(coalesce((r->>'duration_minutes')::integer,(r->>'requested_duration_minutes')::integer,1),1);
 v_operator_id:=nullif(trim(coalesce(r->>'operator_id',r->>'requested_operator_id','')),'');
 v_operator_name:=nullif(lower(trim(coalesce(r->>'operator_name',r->>'requested_operator_name',''))),'');
 -- A new booking starts a new occupancy cycle for this place. Its later
 -- cancellation must not inherit the previous customer's exclusion.
 if not v_is_release then
   delete from public.waitlist_release_origins o where o.workspace_id=(r->>'workspace_id')::uuid
     and o.appointment_date=(r->>'appointment_date')::date
     and (coalesce(o.operator_id,'')=coalesce(v_operator_id,'') or (v_operator_name is not null and o.operator_name=v_operator_name))
     and o.appointment_time < (r->>'appointment_time')::time + make_interval(mins=>v_duration)
     and o.appointment_time + make_interval(mins=>o.duration_minutes) > (r->>'appointment_time')::time;
   return NEW;
 end if;
 v_email:=nullif(lower(trim(coalesce(r->>'customer_email',''))),'');
 v_phone:=nullif(regexp_replace(coalesce(r->>'customer_phone',''),'\D+','','g'),'');
 if r->>'customer_id' is not null then
   select * into v_customer from public.customers where id=(r->>'customer_id')::uuid and workspace_id=(r->>'workspace_id')::uuid;
   v_email:=coalesce(v_email,nullif(lower(trim(v_customer.email::text)),''));
   v_phone:=coalesce(v_phone,nullif(regexp_replace(coalesce(v_customer.phone,''),'\D+','','g'),''));
 end if;
 if v_email is null and v_phone is null and r->>'booking_request_id' is not null then
   select nullif(lower(trim(customer_email::text)),''),nullif(regexp_replace(coalesce(customer_phone,''),'\D+','','g'),'')
   into v_email,v_phone from public.booking_requests where id=(r->>'booking_request_id')::uuid and workspace_id=(r->>'workspace_id')::uuid;
 end if;
 if v_email is not null or v_phone is not null then
   insert into public.waitlist_release_origins(source_key,workspace_id,appointment_date,appointment_time,duration_minutes,operator_id,operator_name,service_name,email_hash,phone_hash)
   values(TG_TABLE_NAME||':'||(r->>'id'),(r->>'workspace_id')::uuid,(r->>'appointment_date')::date,(r->>'appointment_time')::time,v_duration,v_operator_id,v_operator_name,coalesce(r->>'service_name',r->>'requested_service_name'),md5(v_email),md5(v_phone))
   on conflict(source_key) do update set email_hash=excluded.email_hash,phone_hash=excluded.phone_hash;
 end if;
 delete from public.waitlist_release_origins where appointment_date<(now() at time zone 'Europe/Rome')::date;
 if TG_OP='DELETE' then return OLD;else return NEW;end if;
end $$;
revoke all on function public.track_waitlist_release_origin_v1() from public,anon,authenticated;
-- Before the existing cancellation hooks attempt notification.
create trigger a_waitlist_release_origin before insert or update or delete on public.appointments for each row execute function public.track_waitlist_release_origin_v1();
create trigger a_waitlist_release_origin before insert or update on public.booking_requests for each row execute function public.track_waitlist_release_origin_v1();

create or replace function public.is_waitlist_self_release_v1(p_entry public.booking_slot_waitlist)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.waitlist_release_origins o
 where o.workspace_id=p_entry.workspace_id and o.appointment_date=p_entry.appointment_date
 and ((o.email_hash is not null and o.email_hash=md5(nullif(lower(trim(p_entry.customer_email::text)),'')))
   or (o.phone_hash is not null and o.phone_hash=md5(nullif(regexp_replace(coalesce(p_entry.customer_phone,''),'\D+','','g'),''))))
 and (nullif(trim(p_entry.requested_operator_id),'') is null and nullif(trim(p_entry.requested_operator_name),'') is null
   or o.operator_id=nullif(trim(p_entry.requested_operator_id),'')
   or o.operator_name=nullif(lower(trim(p_entry.requested_operator_name)),'')
   or (o.operator_id is null and o.operator_name is null and lower(o.service_name)=lower(p_entry.requested_service_name)))
 and p_entry.appointment_time < o.appointment_time + make_interval(mins=>o.duration_minutes)
 and p_entry.appointment_time + make_interval(mins=>greatest(p_entry.requested_duration_minutes,1)) > o.appointment_time);
$$;
revoke all on function public.is_waitlist_self_release_v1(public.booking_slot_waitlist) from public,anon,authenticated;

create or replace function public.waitlist_range_available_times_v1(p_entry public.booking_slot_waitlist)
returns text[] language plpgsql stable security definer set search_path=public as $$
declare
  v_probe public.booking_slot_waitlist%rowtype := p_entry;
  v_minute integer;
  v_result text[] := array[]::text[];
  v_start integer := (p_entry.booking_plan->'range'->>'startMinute')::integer;
  v_end integer := (p_entry.booking_plan->'range'->>'endMinute')::integer;
  v_step integer := (p_entry.booking_plan->'range'->>'stepMinutes')::integer;
begin
  if v_start is null or v_end is null or v_step is null or v_start<0 or v_end>1439 or v_step<1 or v_start>v_end then raise exception 'invalid_waitlist_range'; end if;
  for v_minute in select generate_series(v_start,v_end,v_step) loop
    v_probe.appointment_time := make_time(v_minute/60,v_minute%60,0);
    if not public.is_waitlist_self_release_v1(v_probe) and public.is_waitlist_plan_available_v1(v_probe) then
      v_result := array_append(v_result,to_char(v_probe.appointment_time,'HH24:MI'));
    end if;
  end loop;
  return v_result;
end $$;

CREATE OR REPLACE FUNCTION public.process_public_slot_waitlist(p_workspace_id uuid, p_appointment_date date DEFAULT NULL::date, p_appointment_time time without time zone DEFAULT NULL::time without time zone, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_slot record;
  v_range public.booking_slot_waitlist%rowtype;
  v_available text[];
  v_freed text;
  v_entry public.booking_slot_waitlist%rowtype;
  v_notified_count integer := 0;
  v_date_label text;
  v_operator_label text;
  v_operator_id_filter text := nullif(trim(coalesce(p_requested_operator_id, '')), '');
  v_operator_name_filter text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), '');
begin
  if p_workspace_id is null then
    return 0;
  end if;

  -- Recompute the whole saved range. Already-free times become eligible only
  -- after being observed unavailable and then available again.
  for v_range in select * from public.booking_slot_waitlist
    where workspace_id=p_workspace_id and status='waiting' and booking_plan ? 'range'
      and not range_resolved and appointment_date >= (now() at time zone 'Europe/Rome')::date
      and (p_appointment_date is null or appointment_date=p_appointment_date)
    for update skip locked
  loop
    v_available := public.waitlist_range_available_times_v1(v_range);
    select t into v_freed from unnest(v_available) t
      where not (t = any(coalesce(v_range.range_available_times,array[]::text[]))) order by t limit 1;
    update public.booking_slot_waitlist set range_available_times=v_available,
      range_resolved=(v_freed is not null),
      appointment_time=case when v_freed is not null then v_freed::time else appointment_time end
      where id=v_range.id;
  end loop;

  update public.booking_slot_waitlist
  set
    status = 'notified',
    expires_at = null,
    updated_at = timezone('utc', now())
  where workspace_id = p_workspace_id
    and status = 'expired'
    and notified_at is not null
    and (
      appointment_date > current_date
      or (
        appointment_date = current_date
        and appointment_time > localtime
      )
    )
    and (p_appointment_date is null or appointment_date = p_appointment_date)
    and (p_appointment_time is null or appointment_time = p_appointment_time or booking_plan is not null)
    and (
      v_operator_id_filter is null or booking_plan is not null
      or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
    )
    and (
      v_operator_name_filter is null or booking_plan is not null
      or coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = v_operator_name_filter
    );

  with expired_rows as (
    update public.booking_slot_waitlist
    set
      status = 'expired',
      updated_at = timezone('utc', now())
    where workspace_id = p_workspace_id
      and status in ('waiting', 'notified')
      and (
        appointment_date < current_date
        or (
          appointment_date = current_date
          and appointment_time <= localtime
        )
      )
      and (p_appointment_date is null or appointment_date = p_appointment_date)
      and (p_appointment_time is null or appointment_time = p_appointment_time or booking_plan is not null)
      and (
        v_operator_id_filter is null or booking_plan is not null
        or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
      )
      and (
        v_operator_name_filter is null or booking_plan is not null
        or coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = v_operator_name_filter
      )
    returning *
  )
  insert into public.booking_slot_waitlist_archive (
    source_waitlist_id,
    workspace_id,
    appointment_date,
    appointment_time,
    requested_service_name,
    requested_duration_minutes,
    requested_operator_id,
    requested_operator_name,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    notes,
    archived_status,
    archived_reason,
    notified_at,
    expires_at,
    original_created_at,
    original_updated_at,
    archived_at
  )
  select
    expired_rows.id,
    expired_rows.workspace_id,
    expired_rows.appointment_date,
    expired_rows.appointment_time,
    expired_rows.requested_service_name,
    greatest(coalesce(expired_rows.requested_duration_minutes, 60), 1),
    expired_rows.requested_operator_id,
    expired_rows.requested_operator_name,
    coalesce(expired_rows.customer_name, ''),
    coalesce(expired_rows.customer_surname, ''),
    expired_rows.customer_email,
    coalesce(expired_rows.customer_phone, ''),
    expired_rows.customer_instagram,
    expired_rows.notes,
    'expired',
    'expired_by_slot_time',
    expired_rows.notified_at,
    expired_rows.expires_at,
    expired_rows.created_at,
    expired_rows.updated_at,
    expired_rows.updated_at
  from expired_rows
  on conflict do nothing;

  if p_appointment_date is null then
    for v_slot in select distinct appointment_date from public.booking_slot_waitlist
      where workspace_id=p_workspace_id and status='waiting' and booking_plan ? 'range'
        and range_resolved
    loop
      v_notified_count := v_notified_count + public.process_public_slot_waitlist(p_workspace_id,v_slot.appointment_date,null);
    end loop;
    return v_notified_count;
  end if;

  for v_slot in
    select distinct
      appointment_date,
      appointment_time,
      lower(trim(requested_service_name)) as requested_service_key,
      nullif(trim(coalesce(requested_operator_id, '')), '') as requested_operator_id,
      nullif(lower(trim(coalesce(requested_operator_name, ''))), '') as requested_operator_name
    from public.booking_slot_waitlist
    where workspace_id = p_workspace_id
      and status = 'waiting'
      and (booking_plan is null or not (booking_plan ? 'range') or range_resolved)
      and appointment_date = p_appointment_date
      and (p_appointment_time is null or appointment_time = p_appointment_time or booking_plan is not null)
      and (
        v_operator_id_filter is null or booking_plan is not null
        or coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') = v_operator_id_filter
      )
      and (
        v_operator_name_filter is null or booking_plan is not null
        or coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') = v_operator_name_filter
      )
    order by appointment_date asc, appointment_time asc
  loop
    if exists (
      select 1
      from public.booking_slot_waitlist
      where workspace_id = p_workspace_id
        and appointment_date = v_slot.appointment_date
        and appointment_time = v_slot.appointment_time
        and lower(trim(requested_service_name)) = v_slot.requested_service_key
        and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') =
          coalesce(v_slot.requested_operator_id, '')
        and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') =
          coalesce(v_slot.requested_operator_name, '')
        and status = 'notified'
        and (
          appointment_date > current_date
          or (
            appointment_date = current_date
            and appointment_time > localtime
          )
        )
    ) then
      continue;
    end if;

    select waitlist.*
    into v_entry
    from public.booking_slot_waitlist as waitlist
    where waitlist.workspace_id = p_workspace_id
      and waitlist.appointment_date = v_slot.appointment_date
      and waitlist.appointment_time = v_slot.appointment_time
      and lower(trim(waitlist.requested_service_name)) = v_slot.requested_service_key
      and coalesce(nullif(trim(coalesce(waitlist.requested_operator_id, '')), ''), '') =
        coalesce(v_slot.requested_operator_id, '')
      and coalesce(nullif(lower(trim(coalesce(waitlist.requested_operator_name, ''))), ''), '') =
        coalesce(v_slot.requested_operator_name, '')
      and waitlist.status = 'waiting'
      and (waitlist.booking_plan is null or not (waitlist.booking_plan ? 'range') or waitlist.range_resolved)
      and not public.is_waitlist_self_release_v1(waitlist)
      and public.is_waitlist_plan_available_v1(waitlist)
    order by waitlist.created_at asc
    for update skip locked
    limit 1;

    if v_entry.id is null then
      continue;
    end if;

    update public.booking_slot_waitlist
    set
      status = 'notified',
      notified_at = timezone('utc', now()),
      expires_at = null,
      updated_at = timezone('utc', now())
    where id = v_entry.id
      and status = 'waiting'
      and (booking_plan is null or not (booking_plan ? 'range') or range_resolved)
    returning * into v_entry;

    if v_entry.id is null then
      continue;
    end if;

    perform public.archive_public_slot_waitlist_entry(v_entry.id, 'notified', 'slot_available');

    with cancelled_siblings as (
      update public.booking_slot_waitlist
      set
        status = 'cancelled',
        notified_at = null,
        expires_at = null,
        updated_at = timezone('utc', now())
      where workspace_id = p_workspace_id
        and appointment_date = v_entry.appointment_date
        and appointment_time <> v_entry.appointment_time
        and lower(trim(requested_service_name)) = lower(trim(v_entry.requested_service_name))
        and coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), '') =
          coalesce(nullif(trim(coalesce(v_entry.requested_operator_id, '')), ''), '')
        and coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), '') =
          coalesce(nullif(lower(trim(coalesce(v_entry.requested_operator_name, ''))), ''), '')
        and lower(trim(customer_email::text)) = lower(trim(v_entry.customer_email::text))
        and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') =
          regexp_replace(coalesce(v_entry.customer_phone, ''), '\D+', '', 'g')
        and status = 'waiting'
      and (booking_plan is null or not (booking_plan ? 'range') or range_resolved)
      returning *
    )
    insert into public.booking_slot_waitlist_archive (
      source_waitlist_id,
      workspace_id,
      appointment_date,
      appointment_time,
      requested_service_name,
      requested_duration_minutes,
      requested_operator_id,
      requested_operator_name,
      customer_name,
      customer_surname,
      customer_email,
      customer_phone,
      customer_instagram,
      notes,
      archived_status,
      archived_reason,
      notified_at,
      expires_at,
      original_created_at,
      original_updated_at,
      archived_at
    )
    select
      cancelled_siblings.id,
      cancelled_siblings.workspace_id,
      cancelled_siblings.appointment_date,
      cancelled_siblings.appointment_time,
      cancelled_siblings.requested_service_name,
      greatest(coalesce(cancelled_siblings.requested_duration_minutes, 60), 1),
      cancelled_siblings.requested_operator_id,
      cancelled_siblings.requested_operator_name,
      coalesce(cancelled_siblings.customer_name, ''),
      coalesce(cancelled_siblings.customer_surname, ''),
      cancelled_siblings.customer_email,
      coalesce(cancelled_siblings.customer_phone, ''),
      cancelled_siblings.customer_instagram,
      cancelled_siblings.notes,
      'cancelled',
      'superseded_by_available_slot',
      cancelled_siblings.notified_at,
      cancelled_siblings.expires_at,
      cancelled_siblings.created_at,
      cancelled_siblings.updated_at,
      cancelled_siblings.updated_at
    from cancelled_siblings
    on conflict do nothing;

    v_date_label := to_char(v_entry.appointment_date, 'DD/MM/YYYY');
    v_operator_label := nullif(trim(coalesce(v_entry.requested_operator_name, '')), '');

    perform public.queue_public_customer_push(
      p_workspace_id,
      'custom',
      'Slot disponibile',
      'Si è liberato uno slot per ' || coalesce(nullif(v_entry.booking_plan->>'label',''),v_entry.requested_service_name) ||
        case
          when v_operator_label is not null then ' con ' || v_operator_label
          else ''
        end ||
        ' il ' || v_date_label || ' alle ' || to_char(v_entry.appointment_time, 'HH24:MI') ||
        '. Prenota appena puoi: lo slot è visibile a tutti.',
      jsonb_build_object(
        'type', 'slot_waitlist_available',
        '_dedupeKey', p_workspace_id::text || '|slot_waitlist_available|' || v_entry.id::text,
        'appointmentDate', v_entry.appointment_date,
        'appointmentTime', v_entry.appointment_time,
        'serviceName', v_entry.requested_service_name,
        'bookingPlan', v_entry.booking_plan,
        'operatorId', v_entry.requested_operator_id,
        'operatorName', v_entry.requested_operator_name,
        'waitlistEntryId', v_entry.id
      ),
      v_entry.customer_email,
      v_entry.customer_phone
    );

    v_notified_count := v_notified_count + 1;
  end loop;

  return v_notified_count;
end;
$function$
;
notify pgrst,'reload schema';
