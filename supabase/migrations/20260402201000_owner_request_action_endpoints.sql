create or replace function public.accept_owner_booking_request_by_email_v1(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_customer_id uuid default null,
  p_appointment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = v_workspace_id
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  if p_appointment_id is not null then
    update public.appointments
    set
      booking_request_id = p_request_id,
      customer_id = coalesce(p_customer_id, customer_id),
      operator_id = coalesce(nullif(trim(coalesce(v_request.requested_operator_id, '')), ''), operator_id),
      operator_name = coalesce(nullif(trim(coalesce(v_request.requested_operator_name, '')), ''), operator_name),
      updated_at = timezone('utc', now())
    where id = p_appointment_id
      and workspace_id = v_workspace_id;
  end if;

  update public.booking_requests
  set
    status = 'accepted',
    customer_id = coalesce(p_customer_id, customer_id),
    cancellation_source = null,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = p_request_id
    and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'appointmentId', p_appointment_id,
    'customerId', coalesce(p_customer_id, v_request.customer_id),
    'workspaceId', v_workspace_id
  );
end;
$$;

create or replace function public.reject_owner_booking_request_by_email_v1(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = v_workspace_id
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  update public.booking_requests
  set
    status = 'rejected',
    cancellation_source = null,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = p_request_id
    and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'appointmentId', null,
    'customerId', v_request.customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

create or replace function public.cancel_owner_booking_request_by_email_v1(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_deleted_appointment_id uuid;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = v_workspace_id
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.booking_request_id = p_request_id
  returning appointment.id into v_deleted_appointment_id;

  update public.booking_requests
  set
    status = 'cancelled',
    cancellation_source = 'salone',
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = p_request_id
    and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'appointmentId', v_deleted_appointment_id,
    'customerId', v_request.customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.accept_owner_booking_request_by_email_v1(citext, text, uuid, uuid, uuid) to anon;
grant execute on function public.accept_owner_booking_request_by_email_v1(citext, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.reject_owner_booking_request_by_email_v1(citext, text, uuid) to anon;
grant execute on function public.reject_owner_booking_request_by_email_v1(citext, text, uuid) to authenticated;
grant execute on function public.cancel_owner_booking_request_by_email_v1(citext, text, uuid) to anon;
grant execute on function public.cancel_owner_booking_request_by_email_v1(citext, text, uuid) to authenticated;
