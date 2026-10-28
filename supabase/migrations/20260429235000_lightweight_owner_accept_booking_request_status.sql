create or replace function public.finalize_owner_booking_request_accept_lightweight_v1(
  p_request_id uuid,
  p_appointment_id uuid default null,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_request_customer_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
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

  v_request_customer_name := trim(
    concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, ''))
  );
  v_customer_id := coalesce(p_customer_id, v_request.customer_id);
  v_appointment_id := p_appointment_id;

  if v_appointment_id is null then
    select appointment.id, appointment.customer_id
    into v_appointment_id, v_customer_id
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and (
        appointment.booking_request_id = v_request.id
        or (
          appointment.appointment_date = v_request.appointment_date
          and appointment.appointment_time = v_request.appointment_time
          and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(v_request.requested_service_name, '')))
          and lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_request_customer_name)
        )
      )
    order by appointment.updated_at desc, appointment.created_at desc
    limit 1;
  elsif v_customer_id is null then
    select appointment.customer_id
    into v_customer_id
    from public.appointments as appointment
    where appointment.id = v_appointment_id
      and appointment.workspace_id = v_workspace_id
    limit 1;
  end if;

  begin
    execute 'alter table public.booking_requests disable trigger booking_requests_push_queue_trigger';
  exception
    when others then null;
  end;
  begin
    execute 'alter table public.booking_requests disable trigger sync_client_portal_after_booking_requests_change';
  exception
    when others then null;
  end;

  update public.booking_requests
  set
    customer_id = coalesce(v_customer_id, customer_id),
    status = 'accepted',
    cancellation_source = null,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = v_request.id
    and workspace_id = v_workspace_id;

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

  if v_appointment_id is not null then
    update public.appointments
    set
      booking_request_id = v_request.id,
      customer_id = coalesce(v_customer_id, customer_id),
      updated_at = timezone('utc', now())
    where id = v_appointment_id
      and workspace_id = v_workspace_id;
  end if;

  begin
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  exception
    when others then null;
  end;

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'customerId', v_customer_id,
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
grant execute on function public.finalize_owner_booking_request_accept_lightweight_v1(uuid, uuid, uuid)
to authenticated;
