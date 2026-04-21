create or replace function public.register_public_customer(
  p_salon_code text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_instagram text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g');
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_instagram text := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_workspace record;
  v_existing_customer record;
  v_customer_id uuid;
  v_duplicate_phone boolean := false;
  v_duplicate_email boolean := false;
begin
  if v_salon_code = '' then
    raise exception 'salon_not_found';
  end if;

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_customer_phone = '' then
    raise exception 'customer_phone_required';
  end if;

  select
    portal.workspace_id,
    portal.owner_email,
    portal.salon_name
  into v_workspace
  from public.client_portals as portal
  where portal.salon_code = v_salon_code
  limit 1;

  if v_workspace.workspace_id is null then
    raise exception 'salon_not_found';
  end if;

  select
    customer.id,
    customer.phone,
    customer.email
  into v_existing_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace.workspace_id
    and (
      regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_customer_phone
      or (
        v_customer_email is not null
        and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if v_existing_customer.id is not null then
    v_duplicate_phone :=
      regexp_replace(coalesce(v_existing_customer.phone, ''), '\D+', '', 'g') = v_customer_phone;
    v_duplicate_email :=
      v_customer_email is not null
      and lower(trim(coalesce(v_existing_customer.email::text, ''))) = v_customer_email::text;

    if v_duplicate_phone and v_duplicate_email then
      raise exception 'duplicate_email_phone';
    elsif v_duplicate_email then
      raise exception 'duplicate_email';
    elsif v_duplicate_phone then
      raise exception 'duplicate_phone';
    end if;
  end if;

  insert into public.customers (
    workspace_id,
    full_name,
    phone,
    email,
    instagram,
    note,
    source,
    viewed_by_salon,
    max_future_appointments,
    max_future_appointments_mode,
    max_daily_appointments
  )
  values (
    v_workspace.workspace_id,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    v_customer_instagram,
    '',
    'frontend',
    false,
    4,
    'monthly',
    1
  )
  returning id into v_customer_id;

  insert into public.push_notifications (
    workspace_id,
    device_id,
    event_type,
    title,
    body,
    payload,
    status
  )
  select
    v_workspace.workspace_id,
    device.id,
    'custom',
    'Nuovo cliente registrato',
    v_customer_name || ' si e registrato dal frontend cliente.',
    jsonb_build_object(
      'type',
      'customer_registered',
      'customerId',
      v_customer_id,
      'customerName',
      v_customer_name,
      'customerEmail',
      coalesce(v_customer_email::text, ''),
      'customerPhone',
      v_customer_phone,
      'source',
      'frontend'
    ),
    'queued'
  from public.push_devices as device
  where device.workspace_id = v_workspace.workspace_id
    and device.recipient_kind = 'owner'
    and device.is_active = true;

  return jsonb_build_object(
    'customerId',
    v_customer_id,
    'workspaceId',
    v_workspace.workspace_id
  );
end;
$$;

grant execute on function public.register_public_customer(text, text, text, text, text) to anon, authenticated;
