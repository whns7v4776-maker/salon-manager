create or replace function public.handle_backoffice_appointment_delete_client_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid := null;
  v_customer_email citext := null;
  v_customer_phone text := null;
  v_customer_instagram text := null;
  v_customer_full_name text := trim(coalesce(old.customer_name, ''));
  v_customer_first_name text;
  v_customer_last_name text;
  v_existing_request_id uuid;
begin
  if old.workspace_id is null then
    return old;
  end if;

  v_customer_first_name := split_part(v_customer_full_name, ' ', 1);
  if position(' ' in v_customer_full_name) > 0 then
    v_customer_last_name := trim(
      substring(v_customer_full_name from position(' ' in v_customer_full_name) + 1)
    );
  else
    v_customer_last_name := '';
  end if;

  if old.customer_id is not null then
    select
      customer.id,
      nullif(customer.email, ''),
      nullif(customer.phone, ''),
      customer.instagram
    into v_customer_id, v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.id = old.customer_id
      and customer.workspace_id = old.workspace_id;
  end if;

  if v_customer_id is null and v_customer_full_name <> '' then
    select
      customer.id,
      nullif(customer.email, ''),
      nullif(customer.phone, ''),
      customer.instagram
    into v_customer_id, v_customer_email, v_customer_phone, v_customer_instagram
    from public.customers as customer
    where customer.workspace_id = old.workspace_id
      and lower(trim(customer.full_name)) = lower(v_customer_full_name)
    order by
      case when nullif(customer.email, '') is not null or nullif(customer.phone, '') is not null then 0 else 1 end,
      customer.updated_at desc nulls last,
      customer.created_at desc nulls last
    limit 1;
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
    and (
      (
        v_customer_id is not null
        and request.customer_id = v_customer_id
      )
      or (
        lower(trim(concat_ws(' ', request.customer_name, request.customer_surname))) =
        lower(v_customer_full_name)
      )
      or (
        v_customer_email is not null
        and lower(trim(request.customer_email::text)) = lower(trim(v_customer_email::text))
      )
      or (
        nullif(regexp_replace(coalesce(v_customer_phone, ''), '\D+', '', 'g'), '') is not null
        and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
            regexp_replace(coalesce(v_customer_phone, ''), '\D+', '', 'g')
      )
    )
  order by
    case
      when request.status = 'accepted'::public.request_status then 0
      when request.status = 'cancelled'::public.request_status
        and coalesce(request.cancellation_source, '') = 'salone' then 1
      when request.status = 'pending'::public.request_status then 2
      else 3
    end,
    request.updated_at desc nulls last,
    request.created_at desc nulls last
  limit 1;

  if v_existing_request_id is not null then
    update public.booking_requests as request
    set status = 'cancelled',
        cancellation_source = 'salone',
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    where request.id = v_existing_request_id
      and (
        request.status is distinct from 'cancelled'::public.request_status
        or coalesce(request.cancellation_source, '') is distinct from 'salone'
        or request.viewed_by_customer is distinct from false
      );

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
    v_customer_id,
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
