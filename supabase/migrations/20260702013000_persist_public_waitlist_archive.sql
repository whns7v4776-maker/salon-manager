create table if not exists public.booking_slot_waitlist_archive (
  id uuid primary key default gen_random_uuid(),
  source_waitlist_id uuid,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_date date not null,
  appointment_time time not null,
  requested_service_name text not null,
  requested_duration_minutes integer not null default 60 check (requested_duration_minutes > 0),
  requested_operator_id text,
  requested_operator_name text,
  customer_name text not null default '',
  customer_surname text not null default '',
  customer_email citext not null,
  customer_phone text not null,
  customer_instagram text,
  notes text,
  archived_status text not null default 'expired'
    check (archived_status in ('waiting', 'notified', 'fulfilled', 'expired', 'cancelled', 'dismissed')),
  archived_reason text not null default 'snapshot',
  notified_at timestamptz,
  expires_at timestamptz,
  original_created_at timestamptz,
  original_updated_at timestamptz,
  archived_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists booking_slot_waitlist_archive_identity_status_idx
  on public.booking_slot_waitlist_archive (
    workspace_id,
    appointment_date,
    appointment_time,
    lower(trim(requested_service_name)),
    lower(trim(customer_email::text)),
    regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g'),
    coalesce(nullif(trim(coalesce(requested_operator_id, '')), ''), ''),
    coalesce(nullif(lower(trim(coalesce(requested_operator_name, ''))), ''), ''),
    archived_status
  );

create index if not exists booking_slot_waitlist_archive_customer_idx
  on public.booking_slot_waitlist_archive (
    workspace_id,
    lower(trim(customer_email::text)),
    regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g'),
    archived_at desc
  );

create or replace function public.archive_public_slot_waitlist_entry(
  p_waitlist_id uuid,
  p_archived_status text default null,
  p_archived_reason text default 'snapshot'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.booking_slot_waitlist%rowtype;
  v_archived_status text;
begin
  if p_waitlist_id is null then
    return;
  end if;

  select waitlist.*
  into v_entry
  from public.booking_slot_waitlist as waitlist
  where waitlist.id = p_waitlist_id
  limit 1;

  if v_entry.id is null then
    return;
  end if;

  v_archived_status := lower(trim(coalesce(p_archived_status, v_entry.status, 'expired')));
  if v_archived_status not in ('waiting', 'notified', 'fulfilled', 'expired', 'cancelled', 'dismissed') then
    v_archived_status := 'expired';
  end if;

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
  values (
    v_entry.id,
    v_entry.workspace_id,
    v_entry.appointment_date,
    v_entry.appointment_time,
    v_entry.requested_service_name,
    greatest(coalesce(v_entry.requested_duration_minutes, 60), 1),
    v_entry.requested_operator_id,
    v_entry.requested_operator_name,
    coalesce(v_entry.customer_name, ''),
    coalesce(v_entry.customer_surname, ''),
    v_entry.customer_email,
    coalesce(v_entry.customer_phone, ''),
    v_entry.customer_instagram,
    v_entry.notes,
    v_archived_status,
    nullif(trim(coalesce(p_archived_reason, '')), ''),
    v_entry.notified_at,
    v_entry.expires_at,
    v_entry.created_at,
    v_entry.updated_at,
    coalesce(v_entry.updated_at, v_entry.notified_at, v_entry.created_at, timezone('utc', now()))
  )
  on conflict do nothing;
end;
$$;

create or replace function public.archive_public_slot_waitlist_entry_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.archive_public_slot_waitlist_entry(new.id, new.status, 'created');
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if
      coalesce(old.status, '') is distinct from coalesce(new.status, '')
      or coalesce(old.notified_at, '-infinity'::timestamptz) is distinct from coalesce(new.notified_at, '-infinity'::timestamptz)
      or coalesce(old.expires_at, '-infinity'::timestamptz) is distinct from coalesce(new.expires_at, '-infinity'::timestamptz)
    then
      if not (old.status = 'notified' and new.status = 'cancelled') then
        perform public.archive_public_slot_waitlist_entry(new.id, new.status, 'status_change');
      end if;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists archive_public_slot_waitlist_entry_changes on public.booking_slot_waitlist;
create trigger archive_public_slot_waitlist_entry_changes
after insert or update of status, notified_at, expires_at
on public.booking_slot_waitlist
for each row
execute function public.archive_public_slot_waitlist_entry_trigger();

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
  waitlist.id,
  waitlist.workspace_id,
  waitlist.appointment_date,
  waitlist.appointment_time,
  waitlist.requested_service_name,
  greatest(coalesce(waitlist.requested_duration_minutes, 60), 1),
  waitlist.requested_operator_id,
  waitlist.requested_operator_name,
  coalesce(waitlist.customer_name, ''),
  coalesce(waitlist.customer_surname, ''),
  waitlist.customer_email,
  coalesce(waitlist.customer_phone, ''),
  waitlist.customer_instagram,
  waitlist.notes,
  case
    when lower(trim(coalesce(waitlist.status, ''))) in ('waiting', 'notified', 'fulfilled', 'expired', 'cancelled')
      then lower(trim(waitlist.status))
    else 'expired'
  end,
  'backfill',
  waitlist.notified_at,
  waitlist.expires_at,
  waitlist.created_at,
  waitlist.updated_at,
  coalesce(waitlist.updated_at, waitlist.notified_at, waitlist.created_at, timezone('utc', now()))
from public.booking_slot_waitlist as waitlist
on conflict do nothing;

create or replace function public.cancel_public_slot_waitlist_alerts(
  p_salon_code text,
  p_waitlist_ids uuid[],
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
  v_cancelled_count integer := 0;
  v_cancelled_entry public.booking_slot_waitlist%rowtype;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  if p_waitlist_ids is null or array_length(p_waitlist_ids, 1) is null then
    return 0;
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  for v_cancelled_entry in
    update public.booking_slot_waitlist as waitlist
    set
      status = 'cancelled',
      expires_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
    where waitlist.workspace_id = v_workspace_id
      and waitlist.id = any(p_waitlist_ids)
      and waitlist.status in ('waiting', 'notified', 'expired')
      and (
        (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
    returning *
  loop
    perform public.archive_public_slot_waitlist_entry(
      v_cancelled_entry.id,
      case
        when v_cancelled_entry.notified_at is not null then 'dismissed'
        else 'cancelled'
      end,
      case
        when v_cancelled_entry.notified_at is not null then 'customer_not_needed'
        else 'customer_cancelled'
      end
    );
    v_cancelled_count := v_cancelled_count + 1;
  end loop;

  return coalesce(v_cancelled_count, 0);
end;
$$;

create or replace function public.process_public_slot_waitlist(
  p_workspace_id uuid,
  p_appointment_date date default null,
  p_appointment_time time default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot record;
  v_entry public.booking_slot_waitlist%rowtype;
  v_notified_count integer := 0;
  v_date_label text;
  v_operator_label text;
begin
  if p_workspace_id is null then
    return 0;
  end if;

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
    and (p_appointment_time is null or appointment_time = p_appointment_time);

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
      and (p_appointment_time is null or appointment_time = p_appointment_time)
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
    return 0;
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
      and appointment_date = p_appointment_date
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
      and public.is_public_booking_slot_available(
        p_workspace_id,
        waitlist.appointment_date,
        waitlist.appointment_time,
        waitlist.requested_duration_minutes,
        waitlist.requested_service_name,
        waitlist.requested_operator_id,
        waitlist.requested_operator_name
      )
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
          coalesce(nullif(lower(trim(coalesce(v_entry.requested_operator_name, ''))), '')
          , '')
        and lower(trim(customer_email::text)) = lower(trim(v_entry.customer_email::text))
        and regexp_replace(coalesce(customer_phone, ''), '\D+', '', 'g') =
          regexp_replace(coalesce(v_entry.customer_phone, ''), '\D+', '', 'g')
        and status = 'waiting'
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
      'Si e liberato uno slot per ' || v_entry.requested_service_name ||
        case
          when v_operator_label is not null then ' con ' || v_operator_label
          else ''
        end ||
        ' il ' || v_date_label || ' alle ' || to_char(v_entry.appointment_time, 'HH24:MI') ||
        '. Prenota appena puoi: lo slot e visibile a tutti.',
      jsonb_build_object(
        'type', 'slot_waitlist_available',
        '_dedupeKey', p_workspace_id::text || '|slot_waitlist_available|' || v_entry.id::text,
        'appointmentDate', v_entry.appointment_date,
        'appointmentTime', v_entry.appointment_time,
        'serviceName', v_entry.requested_service_name,
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
$$;

drop function if exists public.get_public_customer_waitlist_alerts(text, citext, text);

create or replace function public.get_public_customer_waitlist_alerts(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns table (
  id uuid,
  workspace_id uuid,
  appointment_date date,
  appointment_time time,
  requested_service_name text,
  requested_duration_minutes integer,
  customer_name text,
  customer_surname text,
  customer_email citext,
  customer_phone text,
  customer_instagram text,
  notes text,
  status text,
  notified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  requested_operator_id text,
  requested_operator_name text,
  archived_status text,
  archived_reason text,
  archived_at timestamptz,
  is_archived boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  perform public.process_public_slot_waitlist(v_workspace_id, null, null);

  return query
  select combined.*
  from (
    select
      waitlist.id,
      waitlist.workspace_id,
      waitlist.appointment_date,
      waitlist.appointment_time,
      waitlist.requested_service_name,
      waitlist.requested_duration_minutes,
      waitlist.customer_name,
      waitlist.customer_surname,
      waitlist.customer_email,
      waitlist.customer_phone,
      waitlist.customer_instagram,
      waitlist.notes,
      waitlist.status,
      waitlist.notified_at,
      waitlist.expires_at,
      waitlist.created_at,
      waitlist.updated_at,
      waitlist.requested_operator_id,
      waitlist.requested_operator_name,
      null::text as archived_status,
      null::text as archived_reason,
      null::timestamptz as archived_at,
      false as is_archived
    from public.booking_slot_waitlist as waitlist
    where waitlist.workspace_id = v_workspace_id
      and waitlist.status in ('waiting', 'notified', 'expired')
      and (
        (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )

    union all

    select
      coalesce(archive.source_waitlist_id, archive.id) as id,
      archive.workspace_id,
      archive.appointment_date,
      archive.appointment_time,
      archive.requested_service_name,
      archive.requested_duration_minutes,
      archive.customer_name,
      archive.customer_surname,
      archive.customer_email,
      archive.customer_phone,
      archive.customer_instagram,
      archive.notes,
      'expired'::text as status,
      archive.notified_at,
      archive.expires_at,
      coalesce(archive.original_created_at, archive.archived_at) as created_at,
      archive.archived_at as updated_at,
      archive.requested_operator_id,
      archive.requested_operator_name,
      archive.archived_status,
      archive.archived_reason,
      archive.archived_at,
      true as is_archived
    from public.booking_slot_waitlist_archive as archive
    where archive.workspace_id = v_workspace_id
      and (
        (v_customer_email is not null and lower(trim(archive.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(archive.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
  ) as combined
  order by coalesce(combined.archived_at, combined.notified_at, combined.updated_at, combined.created_at) desc;
end;
$$;

grant execute on function public.archive_public_slot_waitlist_entry(uuid, text, text) to anon;
grant execute on function public.archive_public_slot_waitlist_entry(uuid, text, text) to authenticated;
grant execute on function public.archive_public_slot_waitlist_entry_trigger() to anon;
grant execute on function public.archive_public_slot_waitlist_entry_trigger() to authenticated;

grant execute on function public.cancel_public_slot_waitlist_alerts(
  text,
  uuid[],
  citext,
  text
) to anon;

grant execute on function public.cancel_public_slot_waitlist_alerts(
  text,
  uuid[],
  citext,
  text
) to authenticated;

grant execute on function public.process_public_slot_waitlist(uuid, date, time) to anon;
grant execute on function public.process_public_slot_waitlist(uuid, date, time) to authenticated;

grant execute on function public.get_public_customer_waitlist_alerts(text, citext, text) to anon;
grant execute on function public.get_public_customer_waitlist_alerts(text, citext, text) to authenticated;

notify pgrst, 'reload schema';
