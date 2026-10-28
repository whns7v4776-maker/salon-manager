create or replace function public.handle_backoffice_appointment_delete_client_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_email citext := null;
  v_customer_phone text := null;
  v_customer_instagram text := null;
  v_customer_first_name text;
  v_customer_last_name text;
  v_existing_request_id uuid;
begin
  if old.workspace_id is null then
    return old;
  end if;

  begin
    perform public.process_public_slot_waitlist(
      old.workspace_id,
      old.appointment_date,
      null
    );
  exception
    when others then
      null;
  end;

  v_customer_first_name := split_part(trim(coalesce(old.customer_name, '')), ' ', 1);
  if position(' ' in trim(coalesce(old.customer_name, ''))) > 0 then
    v_customer_last_name := trim(
      substring(
        trim(coalesce(old.customer_name, ''))
        from position(' ' in trim(coalesce(old.customer_name, ''))) + 1
      )
    );
  else
    v_customer_last_name := '';
  end if;

  if old.customer_id is not null then
    select
      nullif(customer.email, ''),
      nullif(customer.phone, ''),
      customer.instagram
    into v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.id = old.customer_id
      and customer.workspace_id = old.workspace_id;
  end if;

  if old.booking_request_id is not null then
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where request.id = old.booking_request_id
      and request.workspace_id = old.workspace_id
      and (
        request.status is distinct from 'cancelled'::public.request_status
        or coalesce(request.cancellation_source, '') is distinct from 'salone'
        or request.viewed_by_customer is distinct from false
      );

    return old;
  end if;

  select request.id
  into v_existing_request_id
  from public.booking_requests as request
  where request.workspace_id = old.workspace_id
    and request.appointment_date = old.appointment_date
    and request.appointment_time = old.appointment_time
    and lower(trim(request.requested_service_name)) = lower(trim(old.service_name))
    and request.status = 'cancelled'::public.request_status
    and coalesce(request.cancellation_source, '') = 'salone'
    and (
      (
        old.customer_id is not null
        and request.customer_id = old.customer_id
      )
      or (
        lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
        lower(trim(coalesce(old.customer_name, '')))
      )
    )
  order by request.updated_at desc nulls last, request.created_at desc nulls last
  limit 1;

  if v_existing_request_id is not null then
    update public.booking_requests
    set viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where id = v_existing_request_id
      and viewed_by_customer is distinct from false;

    return old;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return old;
  end if;

  insert into public.booking_requests (
    workspace_id,
    customer_id,
    requested_service_name,
    requested_price,
    requested_duration_minutes,
    appointment_date,
    appointment_time,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    origin,
    status,
    cancellation_source,
    viewed_by_salon,
    viewed_by_customer
  ) values (
    old.workspace_id,
    old.customer_id,
    old.service_name,
    old.price,
    old.duration_minutes,
    old.appointment_date,
    old.appointment_time,
    v_customer_first_name,
    v_customer_last_name,
    coalesce(v_customer_email, ''),
    coalesce(v_customer_phone, ''),
    v_customer_instagram,
    'backoffice',
    'cancelled',
    'salone',
    true,
    false
  );

  return old;
end;
$$;

drop trigger if exists backoffice_appointment_delete_client_cancellation_trigger on public.appointments;
create trigger backoffice_appointment_delete_client_cancellation_trigger
after delete on public.appointments
for each row
execute procedure public.handle_backoffice_appointment_delete_client_cancellation();

notify pgrst, 'reload schema';
