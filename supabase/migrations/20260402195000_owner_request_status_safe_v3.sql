create or replace function public.update_owner_booking_request_status_by_email_v3(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_status text,
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
  v_normalized_status public.request_status;
  v_request public.booking_requests%rowtype;
  v_result_appointment_id uuid;
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

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
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

  if v_normalized_status = 'accepted' then
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

      v_result_appointment_id := p_appointment_id;
    else
      select appointment.id
      into v_result_appointment_id
      from public.appointments as appointment
      where appointment.workspace_id = v_workspace_id
        and appointment.booking_request_id = p_request_id
      order by appointment.updated_at desc, appointment.created_at desc
      limit 1;
    end if;
  elsif v_normalized_status = 'cancelled' then
    delete from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.booking_request_id = p_request_id
    returning appointment.id into v_result_appointment_id;
  end if;

  update public.booking_requests
  set
    status = v_normalized_status,
    customer_id = coalesce(p_customer_id, customer_id),
    cancellation_source = case when v_normalized_status = 'cancelled' then 'salone' else null end,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = p_request_id
    and workspace_id = v_workspace_id;

  return jsonb_build_object(
    'appointmentId', v_result_appointment_id,
    'customerId', coalesce(p_customer_id, v_request.customer_id),
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.update_owner_booking_request_status_by_email_v3(citext, text, uuid, text, uuid, uuid) to anon;
grant execute on function public.update_owner_booking_request_status_by_email_v3(citext, text, uuid, text, uuid, uuid) to authenticated;
