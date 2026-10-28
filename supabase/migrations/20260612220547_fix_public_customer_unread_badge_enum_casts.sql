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
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
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
    and request.status <> 'pending'::public.request_status
    and (
      (v_customer_email is not null and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
    and (
      request.status::text in ('accepted', 'auto_accepted', 'rejected', 'declined')
      or (
        request.status::text = 'cancelled'
        and lower(trim(coalesce(request.cancellation_source, ''))) = 'salone'
      )
    )
  order by request.updated_at desc, request.created_at desc;
end;
$$;

grant execute on function public.get_public_customer_unread_booking_badge_rows(text, citext, text) to anon;
grant execute on function public.get_public_customer_unread_booking_badge_rows(text, citext, text) to authenticated;
