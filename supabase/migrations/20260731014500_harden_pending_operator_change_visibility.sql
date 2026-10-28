create or replace function public.keep_operator_change_status_consistent()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status::text <> 'pending'
    and new.operator_change_status = 'pending' then
    new.operator_change_status := case
      when new.status::text in ('accepted', 'auto_accepted') then 'accepted'
      else 'rejected'
    end;
    new.operator_change_responded_at := coalesce(
      new.operator_change_responded_at,
      timezone('utc', now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists keep_operator_change_status_consistent
  on public.booking_requests;
create trigger keep_operator_change_status_consistent
before insert or update of status, operator_change_status
on public.booking_requests
for each row
execute function public.keep_operator_change_status_consistent();

update public.booking_requests
set
  operator_change_status = case
    when status::text in ('accepted', 'auto_accepted') then 'accepted'
    else 'rejected'
  end,
  operator_change_responded_at = coalesce(
    operator_change_responded_at,
    timezone('utc', now())
  ),
  updated_at = timezone('utc', now())
where status::text <> 'pending'
  and operator_change_status = 'pending';

create or replace function public.get_public_booking_operator_changes_v1(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text
)
returns table (
  request_id uuid,
  operator_change_status text,
  service_name text,
  appointment_date date,
  appointment_time time,
  duration_minutes integer,
  original_operator_id text,
  original_operator_name text,
  proposed_operator_id text,
  proposed_operator_name text,
  requested_at timestamptz,
  expires_at timestamptz,
  responded_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    request.id,
    request.operator_change_status,
    request.requested_service_name,
    request.appointment_date,
    request.appointment_time,
    request.requested_duration_minutes,
    request.operator_change_original_id,
    request.operator_change_original_name,
    request.operator_change_proposed_id,
    request.operator_change_proposed_name,
    request.operator_change_requested_at,
    request.operator_change_expires_at,
    request.operator_change_responded_at
  from public.booking_requests as request
  join public.workspaces as workspace
    on workspace.id = request.workspace_id
  where lower(trim(workspace.slug)) = lower(trim(coalesce(p_salon_code, '')))
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
      ''
    ) is not null
    and lower(trim(coalesce(request.customer_email::text, ''))) =
      lower(trim(coalesce(p_customer_email, '')))
    and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
      right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10)
    and request.operator_change_status is not null
    and (
      (
        request.status::text = 'pending'
        and request.operator_change_status = 'pending'
      )
      or (
        request.operator_change_status <> 'pending'
        and request.operator_change_responded_at >=
          timezone('utc', now()) - interval '30 days'
      )
    )
  order by request.operator_change_requested_at desc nulls last;
$$;

revoke all on function public.get_public_booking_operator_changes_v1(
  text,
  text,
  text
) from public;
grant execute on function public.get_public_booking_operator_changes_v1(
  text,
  text,
  text
) to anon, authenticated;

create or replace function public.get_public_customer_unread_booking_badge_rows(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns table (
  id uuid,
  status public.request_status,
  cancellation_source text,
  viewed_by_customer boolean,
  customer_email citext,
  customer_phone text,
  appointment_date date,
  appointment_time time,
  requested_service_name text,
  updated_at timestamptz,
  created_at timestamptz
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
    request.id,
    request.status,
    request.cancellation_source,
    request.viewed_by_customer,
    request.customer_email,
    request.customer_phone,
    request.appointment_date,
    request.appointment_time,
    request.requested_service_name,
    request.updated_at,
    request.created_at
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.viewed_by_customer = false
    and (
      (
        request.status::text = 'pending'
        and request.operator_change_status = 'pending'
      )
      or request.status::text in ('accepted', 'auto_accepted', 'rejected', 'declined')
      or (
        request.status::text = 'cancelled'
        and lower(trim(coalesce(request.cancellation_source, ''))) = 'salone'
      )
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) =
          v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
  order by request.updated_at desc, request.created_at desc;
end;
$$;

revoke all on function public.get_public_customer_unread_booking_badge_rows(
  text,
  citext,
  text
) from public;
grant execute on function public.get_public_customer_unread_booking_badge_rows(
  text,
  citext,
  text
) to anon, authenticated;
