create or replace function public.normalize_booking_scope_text(p_value text)
returns text
language sql
immutable
as $$
  select coalesce(
    lower(
      regexp_replace(
        regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'),
        '[^a-z0-9 ]',
        '',
        'g'
      )
    ),
    ''
  );
$$;

create or replace function public.get_workspace_service_scope_key(
  p_workspace_id uuid,
  p_service_name text
)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_services jsonb := '[]'::jsonb;
  v_required_role text := '';
  v_service_key text := public.normalize_booking_scope_text(p_service_name);
begin
  if p_workspace_id is null or v_service_key = '' then
    return '';
  end if;

  select coalesce(client_portal.servizi, '[]'::jsonb)
  into v_services
  from public.client_portals as client_portal
  where client_portal.workspace_id = p_workspace_id
  limit 1;

  select public.normalize_booking_scope_text(
    coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')
  )
  into v_required_role
  from jsonb_array_elements(v_services) as service_item
  where public.normalize_booking_scope_text(service_item ->> 'nome') = v_service_key
  limit 1;

  if coalesce(v_required_role, '') <> '' then
    return 'role:' || v_required_role;
  end if;

  return 'service:' || v_service_key;
end;
$$;

create or replace function public.booking_entry_uses_explicit_operator(
  p_operator_id text,
  p_operator_name text
)
returns boolean
language sql
immutable
as $$
  select
    (
      nullif(trim(coalesce(p_operator_id, '')), '') is not null
      and lower(trim(coalesce(p_operator_id, ''))) not like 'salon-capacity::%'
    )
    or nullif(lower(trim(coalesce(p_operator_name, ''))), '') is not null;
$$;

create or replace function public.booking_entry_matches_operator_identity(
  p_left_operator_id text,
  p_left_operator_name text,
  p_right_operator_id text,
  p_right_operator_name text
)
returns boolean
language sql
immutable
as $$
  select
    (
      nullif(trim(coalesce(p_left_operator_id, '')), '') is not null
      and nullif(trim(coalesce(p_right_operator_id, '')), '') is not null
      and trim(coalesce(p_left_operator_id, '')) = trim(coalesce(p_right_operator_id, ''))
    )
    or (
      nullif(lower(trim(coalesce(p_left_operator_name, ''))), '') is not null
      and nullif(lower(trim(coalesce(p_right_operator_name, ''))), '') is not null
      and lower(trim(coalesce(p_left_operator_name, ''))) = lower(trim(coalesce(p_right_operator_name, '')))
    );
$$;

create or replace function public.update_owner_booking_request_status_core(
  p_workspace_id uuid,
  p_request_id uuid,
  p_status public.request_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_requests%rowtype;
  v_customer_id uuid;
  v_existing_appointment_id uuid;
  v_result_appointment_id uuid;
  v_request_customer_name text;
  v_request_operator_id text;
  v_request_operator_name text;
  v_request_scope_key text;
  v_request_uses_explicit_operator boolean;
begin
  if p_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select br.*
  into v_request
  from public.booking_requests as br
  where br.id = p_request_id
    and br.workspace_id = p_workspace_id
  limit 1;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  v_request_customer_name := trim(concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, '')));
  v_request_operator_id := nullif(trim(coalesce(v_request.requested_operator_id, '')), '');
  v_request_operator_name := nullif(lower(trim(coalesce(v_request.requested_operator_name, ''))), '');
  v_request_scope_key := public.get_workspace_service_scope_key(
    p_workspace_id,
    trim(coalesce(v_request.requested_service_name, ''))
  );
  v_request_uses_explicit_operator := public.booking_entry_uses_explicit_operator(
    v_request_operator_id,
    v_request_operator_name
  );

  if p_status = 'accepted' then
    if v_request.status = 'accepted' then
      select appointment.id
      into v_existing_appointment_id
      from public.appointments as appointment
      where appointment.workspace_id = p_workspace_id
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

      return jsonb_build_object(
        'appointmentId', v_existing_appointment_id,
        'customerId', v_request.customer_id,
        'workspaceId', p_workspace_id
      );
    end if;

    perform pg_advisory_xact_lock(hashtext(p_workspace_id::text || ':' || v_request.appointment_date::text));

    if exists (
      select 1
      from public.appointments as appointment
      where appointment.workspace_id = p_workspace_id
        and appointment.appointment_date = v_request.appointment_date
        and tsrange(
          (v_request.appointment_date::timestamp + v_request.appointment_time),
          (v_request.appointment_date::timestamp + v_request.appointment_time + make_interval(mins => greatest(coalesce(v_request.requested_duration_minutes, 60), 1))),
          '[)'
        ) && tsrange(
          (appointment.appointment_date::timestamp + appointment.appointment_time),
          (appointment.appointment_date::timestamp + appointment.appointment_time + make_interval(mins => greatest(coalesce(appointment.duration_minutes, 60), 1))),
          '[)'
        )
        and appointment.booking_request_id is distinct from v_request.id
        and (
          case
            when v_request_uses_explicit_operator then
              public.booking_entry_uses_explicit_operator(
                nullif(trim(coalesce(appointment.operator_id, '')), ''),
                nullif(lower(trim(coalesce(appointment.operator_name, ''))), '')
              )
              and public.booking_entry_matches_operator_identity(
                v_request_operator_id,
                v_request_operator_name,
                nullif(trim(coalesce(appointment.operator_id, '')), ''),
                nullif(lower(trim(coalesce(appointment.operator_name, ''))), '')
              )
            else
              not public.booking_entry_uses_explicit_operator(
                nullif(trim(coalesce(appointment.operator_id, '')), ''),
                nullif(lower(trim(coalesce(appointment.operator_name, ''))), '')
              )
              and public.get_workspace_service_scope_key(
                p_workspace_id,
                trim(coalesce(appointment.service_name, ''))
              ) = v_request_scope_key
          end
        )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    if exists (
      select 1
      from public.booking_requests as other_request
      where other_request.workspace_id = p_workspace_id
        and other_request.id <> v_request.id
        and other_request.status in ('pending', 'accepted')
        and other_request.appointment_date = v_request.appointment_date
        and tsrange(
          (v_request.appointment_date::timestamp + v_request.appointment_time),
          (v_request.appointment_date::timestamp + v_request.appointment_time + make_interval(mins => greatest(coalesce(v_request.requested_duration_minutes, 60), 1))),
          '[)'
        ) && tsrange(
          (other_request.appointment_date::timestamp + other_request.appointment_time),
          (other_request.appointment_date::timestamp + other_request.appointment_time + make_interval(mins => greatest(coalesce(other_request.requested_duration_minutes, 60), 1))),
          '[)'
        )
        and (
          case
            when v_request_uses_explicit_operator then
              public.booking_entry_uses_explicit_operator(
                nullif(trim(coalesce(other_request.requested_operator_id, '')), ''),
                nullif(lower(trim(coalesce(other_request.requested_operator_name, ''))), '')
              )
              and public.booking_entry_matches_operator_identity(
                v_request_operator_id,
                v_request_operator_name,
                nullif(trim(coalesce(other_request.requested_operator_id, '')), ''),
                nullif(lower(trim(coalesce(other_request.requested_operator_name, ''))), '')
              )
            else
              not public.booking_entry_uses_explicit_operator(
                nullif(trim(coalesce(other_request.requested_operator_id, '')), ''),
                nullif(lower(trim(coalesce(other_request.requested_operator_name, ''))), '')
              )
              and public.get_workspace_service_scope_key(
                p_workspace_id,
                trim(coalesce(other_request.requested_service_name, ''))
              ) = v_request_scope_key
          end
        )
    ) then
      raise exception 'booking_request_conflict';
    end if;

    select customer.id
    into v_customer_id
    from public.customers as customer
    where customer.workspace_id = p_workspace_id
      and (
        (nullif(regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'), '') is not null and customer.phone = regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'))
        or (nullif(lower(trim(coalesce(v_request.customer_email::text, ''))), '') is not null and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(coalesce(v_request.customer_email::text, ''))))
        or lower(trim(coalesce(customer.full_name, ''))) = lower(v_request_customer_name)
      )
    order by customer.updated_at desc, customer.created_at desc
    limit 1;

    if v_customer_id is null then
      insert into public.customers (
        workspace_id,
        full_name,
        phone,
        email,
        instagram,
        note,
        source,
        viewed_by_salon
      )
      values (
        p_workspace_id,
        v_request_customer_name,
        regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'),
        nullif(lower(trim(coalesce(v_request.customer_email::text, ''))), '')::citext,
        nullif(trim(coalesce(v_request.customer_instagram, '')), ''),
        coalesce(v_request.notes, ''),
        case when v_request.origin = 'frontend' then 'frontend' else 'salon' end,
        true
      )
      returning id into v_customer_id;
    else
      update public.customers
      set
        full_name = v_request_customer_name,
        phone = coalesce(nullif(regexp_replace(coalesce(v_request.customer_phone, ''), '\D+', '', 'g'), ''), phone),
        email = coalesce(nullif(lower(trim(coalesce(v_request.customer_email::text, ''))), '')::citext, email),
        instagram = coalesce(nullif(trim(coalesce(v_request.customer_instagram, '')), ''), instagram),
        note = case when nullif(trim(coalesce(v_request.notes, '')), '') is not null then trim(v_request.notes) else note end,
        source = case when v_request.origin = 'frontend' then 'frontend' else 'salon' end,
        viewed_by_salon = true,
        updated_at = timezone('utc', now())
      where id = v_customer_id;
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
      customer_id = v_customer_id,
      status = 'accepted',
      cancellation_source = null,
      viewed_by_customer = false,
      updated_at = timezone('utc', now())
    where id = v_request.id;

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

    select appointment.id
    into v_existing_appointment_id
    from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
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

    if v_existing_appointment_id is null then
      insert into public.appointments (
        workspace_id,
        customer_id,
        booking_request_id,
        appointment_date,
        appointment_time,
        customer_name,
        service_name,
        price,
        duration_minutes,
        operator_id,
        operator_name,
        completed,
        no_show,
        cashed_in,
        created_by
      )
      values (
        p_workspace_id,
        v_customer_id,
        v_request.id,
        v_request.appointment_date,
        v_request.appointment_time,
        v_request_customer_name,
        trim(coalesce(v_request.requested_service_name, '')),
        greatest(coalesce(v_request.requested_price, 0), 0),
        greatest(coalesce(v_request.requested_duration_minutes, 60), 1),
        v_request_operator_id,
        nullif(trim(coalesce(v_request.requested_operator_name, '')), ''),
        false,
        false,
        false,
        case when v_request.origin = 'frontend' then 'frontend' else 'backoffice' end
      )
      returning id into v_result_appointment_id;
    else
      update public.appointments
      set
        customer_id = v_customer_id,
        booking_request_id = v_request.id,
        appointment_date = v_request.appointment_date,
        appointment_time = v_request.appointment_time,
        customer_name = v_request_customer_name,
        service_name = trim(coalesce(v_request.requested_service_name, '')),
        price = greatest(coalesce(v_request.requested_price, 0), 0),
        duration_minutes = greatest(coalesce(v_request.requested_duration_minutes, 60), 1),
        operator_id = v_request_operator_id,
        operator_name = nullif(trim(coalesce(v_request.requested_operator_name, '')), ''),
        updated_at = timezone('utc', now())
      where id = v_existing_appointment_id;

      v_result_appointment_id := v_existing_appointment_id;
    end if;

    begin
      perform public.sync_client_portal_booking_requests(p_workspace_id);
    exception
      when others then null;
    end;

    begin
      perform public.process_public_slot_waitlist(
        p_workspace_id,
        v_request.appointment_date,
        v_request.appointment_time
      );
    exception
      when others then null;
    end;

    return jsonb_build_object(
      'appointmentId', v_result_appointment_id,
      'customerId', v_customer_id,
      'workspaceId', p_workspace_id
    );
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
    status = p_status,
    cancellation_source = case when p_status = 'cancelled' then 'salone' else null end,
    viewed_by_customer = false,
    updated_at = timezone('utc', now())
  where id = v_request.id;

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

  with deleted_appointments as (
    delete from public.appointments as appointment
    where appointment.workspace_id = p_workspace_id
      and (
        appointment.booking_request_id = v_request.id
        or (
          appointment.appointment_date = v_request.appointment_date
          and appointment.appointment_time = v_request.appointment_time
          and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(v_request.requested_service_name, '')))
          and lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_request_customer_name)
        )
      )
    returning appointment.id
  )
  select id
  into v_result_appointment_id
  from deleted_appointments
  limit 1;

  begin
    perform public.sync_client_portal_booking_requests(p_workspace_id);
  exception
    when others then null;
  end;

  if p_status = 'cancelled' then
    begin
      perform public.process_public_slot_waitlist(
        p_workspace_id,
        v_request.appointment_date,
        v_request.appointment_time
      );
    exception
      when others then null;
    end;
  end if;

  return jsonb_build_object(
    'appointmentId', v_result_appointment_id,
    'customerId', v_request.customer_id,
    'workspaceId', p_workspace_id
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
