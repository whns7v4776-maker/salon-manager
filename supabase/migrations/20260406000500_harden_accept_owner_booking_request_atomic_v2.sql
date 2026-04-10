create or replace function public.accept_owner_booking_request_atomic_v2(
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
  v_workspace public.workspaces%rowtype;
  v_request public.booking_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select w.*
  into v_workspace
  from public.workspaces as w
  where w.id = v_workspace_id
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found';
  end if;

  if nullif(lower(trim(coalesce(p_salon_code, ''))), '') is not null
     and v_workspace.slug <> lower(trim(p_salon_code)) then
    raise exception 'workspace_access_denied';
  end if;

  if nullif(lower(trim(coalesce(p_owner_email::text, ''))), '') is not null
     and lower(trim(v_workspace.owner_email::text)) <> lower(trim(p_owner_email::text)) then
    raise exception 'workspace_access_denied';
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

  execute 'alter table public.booking_requests disable trigger booking_requests_push_queue_trigger';
  execute 'alter table public.booking_requests disable trigger sync_client_portal_after_booking_requests_change';

  update public.booking_requests
  set
    status = 'accepted'::public.request_status,
    customer_id = coalesce(p_customer_id, customer_id),
    cancellation_source = null,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = p_request_id
    and workspace_id = v_workspace_id;

  execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
  execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';

  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);

  return jsonb_build_object(
    'appointmentId', p_appointment_id,
    'customerId', coalesce(p_customer_id, v_request.customer_id),
    'workspaceId', v_workspace_id
  );
exception
  when others then
    begin
      execute 'alter table public.booking_requests enable trigger booking_requests_push_queue_trigger';
    exception
      when others then null;
    end;

    begin
      execute 'alter table public.booking_requests enable trigger sync_client_portal_after_booking_requests_change';
    exception
      when others then null;
    end;

    raise;
end;
$$;
