create or replace function public.create_owner_appointment_by_email_v1(
  p_owner_email citext,
  p_salon_code text,
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_operator_id text default null,
  p_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_normalized_customer_name text;
  v_normalized_customer_phone text;
  v_normalized_customer_email citext;
  v_normalized_customer_instagram text;
  v_normalized_customer_note text;
  v_normalized_customer_source text;
  v_normalized_service_name text;
  v_normalized_operator_id text;
  v_normalized_operator_name text;
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

  v_normalized_customer_name := trim(coalesce(p_customer_name, ''));
  v_normalized_customer_phone := nullif(trim(coalesce(p_customer_phone, '')), '');
  v_normalized_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_normalized_customer_instagram := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_normalized_customer_note := trim(coalesce(p_customer_note, ''));
  v_normalized_customer_source :=
    case
      when lower(trim(coalesce(p_customer_source, ''))) = 'frontend' then 'frontend'
      else 'salon'
    end;
  v_normalized_service_name := trim(coalesce(p_service_name, ''));
  v_normalized_operator_id := nullif(trim(coalesce(p_operator_id, '')), '');
  v_normalized_operator_name := nullif(trim(coalesce(p_operator_name, '')), '');

  if v_normalized_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_normalized_service_name = '' then
    raise exception 'service_name_required';
  end if;

  if p_appointment_date is null or p_appointment_time is null then
    raise exception 'appointment_datetime_required';
  end if;

  if p_duration_minutes is null or p_duration_minutes <= 0 then
    raise exception 'invalid_duration';
  end if;

  if p_price is null or p_price < 0 then
    raise exception 'invalid_price';
  end if;

  if p_create_customer_record then
    select c.id
    into v_customer_id
    from public.customers as c
    where c.workspace_id = v_workspace_id
      and (
        (v_normalized_customer_phone is not null and c.phone = v_normalized_customer_phone)
        or (v_normalized_customer_email is not null and c.email = v_normalized_customer_email)
        or lower(trim(c.full_name)) = lower(v_normalized_customer_name)
      )
    order by c.updated_at desc, c.created_at desc
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
        v_workspace_id,
        v_normalized_customer_name,
        v_normalized_customer_phone,
        v_normalized_customer_email,
        v_normalized_customer_instagram,
        v_normalized_customer_note,
        v_normalized_customer_source,
        true
      )
      returning id into v_customer_id;
    else
      update public.customers
      set
        full_name = v_normalized_customer_name,
        phone = coalesce(v_normalized_customer_phone, phone),
        email = coalesce(v_normalized_customer_email, email),
        instagram = coalesce(v_normalized_customer_instagram, instagram),
        note = case when v_normalized_customer_note <> '' then v_normalized_customer_note else note end,
        source = v_normalized_customer_source,
        viewed_by_salon = true,
        updated_at = timezone('utc', now())
      where id = v_customer_id;
    end if;
  end if;

  insert into public.appointments (
    workspace_id,
    customer_id,
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
    v_workspace_id,
    v_customer_id,
    p_appointment_date,
    p_appointment_time,
    v_normalized_customer_name,
    v_normalized_service_name,
    p_price,
    p_duration_minutes,
    v_normalized_operator_id,
    v_normalized_operator_name,
    false,
    false,
    false,
    'backoffice'
  )
  returning id into v_appointment_id;

  return jsonb_build_object(
    'appointmentId', v_appointment_id,
    'customerId', v_customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.create_owner_appointment_by_email_v1(citext, text, text, text, citext, text, text, text, boolean, text, numeric, integer, date, time, text, text) to anon;
grant execute on function public.create_owner_appointment_by_email_v1(citext, text, text, text, citext, text, text, text, boolean, text, numeric, integer, date, time, text, text) to authenticated;
