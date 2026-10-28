-- A public booking can be created for an internal tester workspace even when
-- its commercial subscription is not demo/active. The lost-acknowledgement
-- recovery lookup must use the same workspace eligibility rule, otherwise the
-- client can report a false timeout after the request and owner push exist.
create or replace function public.find_public_booking_request_by_composite(
  p_salon_code text,
  p_appointment_date date,
  p_appointment_time time,
  p_requested_service_name text,
  p_customer_email text default null,
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
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_booking_request record;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = '' then
    return null;
  end if;

  if p_appointment_date is null or p_appointment_time is null or v_requested_service_name = '' then
    return null;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return null;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  limit 1;

  if v_workspace_id is null then
    return null;
  end if;

  select
    booking_request.id,
    booking_request.workspace_id,
    booking_request.status,
    booking_request.appointment_date,
    booking_request.appointment_time,
    booking_request.requested_service_name,
    booking_request.customer_email,
    booking_request.customer_phone,
    booking_request.created_at,
    booking_request.updated_at,
    booking_request.cancellation_source
  into v_booking_request
  from public.booking_requests as booking_request
  where booking_request.workspace_id = v_workspace_id
    and booking_request.appointment_date = p_appointment_date
    and booking_request.appointment_time = p_appointment_time
    and lower(trim(coalesce(booking_request.requested_service_name, ''))) = v_requested_service_name
    and booking_request.status in ('pending', 'accepted')
    and (
      (v_customer_email is not null and booking_request.customer_email = v_customer_email)
      or (v_customer_phone is not null and coalesce(booking_request.customer_phone, '') = v_customer_phone)
    )
  order by
    case booking_request.status when 'accepted' then 0 when 'pending' then 1 else 2 end,
    booking_request.updated_at desc nulls last,
    booking_request.created_at desc nulls last
  limit 1;

  if v_booking_request.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', v_booking_request.id,
    'workspaceId', v_booking_request.workspace_id,
    'status', v_booking_request.status,
    'appointmentDate', v_booking_request.appointment_date,
    'appointmentTime', v_booking_request.appointment_time,
    'serviceName', v_booking_request.requested_service_name,
    'customerEmail', coalesce(v_booking_request.customer_email::text, ''),
    'customerPhone', coalesce(v_booking_request.customer_phone, ''),
    'createdAt', v_booking_request.created_at,
    'updatedAt', v_booking_request.updated_at,
    'cancellationSource', v_booking_request.cancellation_source
  );
end;
$$;

grant execute on function public.find_public_booking_request_by_composite(
  text,
  date,
  time,
  text,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
