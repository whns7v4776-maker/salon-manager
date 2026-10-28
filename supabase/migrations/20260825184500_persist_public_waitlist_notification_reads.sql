alter table public.booking_slot_waitlist
  add column if not exists viewed_by_customer boolean not null default false;

create index if not exists booking_slot_waitlist_customer_unread_idx
  on public.booking_slot_waitlist (workspace_id, status, viewed_by_customer, appointment_date, appointment_time)
  where status = 'notified' and viewed_by_customer = false;

create or replace function public.reset_public_waitlist_notification_read_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'notified'
    and (
      old.status is distinct from new.status
      or old.notified_at is distinct from new.notified_at
    ) then
    new.viewed_by_customer := false;
  end if;

  return new;
end;
$$;

drop trigger if exists reset_public_waitlist_notification_read_state
  on public.booking_slot_waitlist;
create trigger reset_public_waitlist_notification_read_state
before update of status, notified_at
on public.booking_slot_waitlist
for each row
execute function public.reset_public_waitlist_notification_read_state();

create or replace function public.get_public_customer_unread_waitlist_badge_rows(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns table (
  id uuid,
  appointment_date date,
  appointment_time time,
  requested_service_name text,
  requested_operator_id text,
  requested_operator_name text,
  notified_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    waitlist.id,
    waitlist.appointment_date,
    waitlist.appointment_time,
    waitlist.requested_service_name,
    waitlist.requested_operator_id,
    waitlist.requested_operator_name,
    waitlist.notified_at,
    waitlist.created_at,
    waitlist.updated_at
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace_id
    and waitlist.status = 'notified'
    and waitlist.viewed_by_customer = false
    and (
      waitlist.appointment_date > timezone('Europe/Rome', now())::date
      or (
        waitlist.appointment_date = timezone('Europe/Rome', now())::date
        and waitlist.appointment_time > timezone('Europe/Rome', now())::time
      )
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
  order by waitlist.notified_at desc nulls last, waitlist.updated_at desc;
end;
$$;

create or replace function public.mark_public_customer_waitlist_alerts_viewed(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_waitlist_ids uuid[] default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_updated_count integer := 0;
begin
  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  update public.booking_slot_waitlist as waitlist
  set viewed_by_customer = true
  where waitlist.workspace_id = v_workspace_id
    and waitlist.status = 'notified'
    and waitlist.viewed_by_customer = false
    and (
      p_waitlist_ids is null
      or (
        cardinality(p_waitlist_ids) > 0
        and waitlist.id = any(p_waitlist_ids)
      )
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(waitlist.customer_email::text)) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    );

  get diagnostics v_updated_count = row_count;
  return coalesce(v_updated_count, 0);
end;
$$;

revoke all on function public.get_public_customer_unread_waitlist_badge_rows(
  text,
  citext,
  text
) from public;
revoke all on function public.mark_public_customer_waitlist_alerts_viewed(
  text,
  citext,
  text,
  uuid[]
) from public;

grant execute on function public.get_public_customer_unread_waitlist_badge_rows(
  text,
  citext,
  text
) to anon, authenticated;
grant execute on function public.mark_public_customer_waitlist_alerts_viewed(
  text,
  citext,
  text,
  uuid[]
) to anon, authenticated;

notify pgrst, 'reload schema';
