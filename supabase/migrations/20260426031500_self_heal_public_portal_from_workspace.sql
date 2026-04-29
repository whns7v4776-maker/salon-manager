create or replace function public.ensure_client_portal_workspace(p_salon_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_workspace_id uuid;
  v_workspace public.workspaces%rowtype;
begin
  if v_salon_code = '' then
    return null;
  end if;

  select portal.workspace_id
  into v_workspace_id
  from public.client_portals as portal
  where portal.salon_code = v_salon_code
  order by
    case when portal.subscription_status = 'active' then 0 else 1 end,
    portal.updated_at desc nulls last,
    portal.created_at desc nulls last,
    portal.workspace_id desc
  limit 1;

  if v_workspace_id is not null then
    return v_workspace_id;
  end if;

  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = v_salon_code
    and w.subscription_status in ('demo', 'active')
  order by
    case when w.subscription_status = 'active' then 0 else 1 end,
    w.updated_at desc nulls last,
    w.created_at desc nulls last,
    w.id desc
  limit 1;

  if v_workspace.id is null then
    return null;
  end if;

  insert into public.client_portals (
    workspace_id,
    owner_email,
    salon_code,
    salon_name,
    salon_name_display_style,
    salon_name_font_variant,
    business_phone,
    activity_category,
    salon_address,
    street_type,
    street_name,
    street_number,
    city,
    postal_code,
    subscription_plan,
    subscription_status,
    clienti,
    appuntamenti,
    servizi,
    operatori,
    richieste_prenotazione,
    availability_settings
  )
  values (
    v_workspace.id,
    v_workspace.owner_email,
    v_workspace.slug,
    v_workspace.salon_name,
    'corsivo',
    'neon',
    coalesce(v_workspace.owner_phone, ''),
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    v_workspace.subscription_plan,
    v_workspace.subscription_status,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '{}'::jsonb
  )
  on conflict (workspace_id)
  do update set
    owner_email = excluded.owner_email,
    salon_code = excluded.salon_code,
    salon_name = excluded.salon_name,
    business_phone = excluded.business_phone,
    subscription_plan = excluded.subscription_plan,
    subscription_status = excluded.subscription_status,
    updated_at = timezone('utc', now());

  perform public.sync_client_portal_customers(v_workspace.id);
  perform public.sync_client_portal_services(v_workspace.id);
  perform public.sync_client_portal_appointments(v_workspace.id);
  perform public.sync_client_portal_booking_requests(v_workspace.id);
  perform public.process_public_slot_waitlist(v_workspace.id, null, null);

  return v_workspace.id;
end;
$$;

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
begin
  v_workspace_id := public.ensure_client_portal_workspace(p_salon_code);

  if v_workspace_id is null then
    return null;
  end if;

  perform public.sync_client_portal_customers(v_workspace_id);
  perform public.sync_client_portal_services(v_workspace_id);
  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);
  perform public.process_public_slot_waitlist(v_workspace_id, null, null);
  perform public.sync_client_portal_appointments(v_workspace_id);
  perform public.sync_client_portal_booking_requests(v_workspace_id);

  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.workspace_id = v_workspace_id
  limit 1;

  if v_portal.workspace_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', v_portal.salon_name,
      'salonNameDisplayStyle', v_portal.salon_name_display_style,
      'salonNameFontVariant', v_portal.salon_name_font_variant,
      'businessPhone', v_portal.business_phone,
      'activityCategory', v_portal.activity_category,
      'salonAddress', v_portal.salon_address,
      'streetType', v_portal.street_type,
      'streetName', v_portal.street_name,
      'streetNumber', v_portal.street_number,
      'city', v_portal.city,
      'postalCode', v_portal.postal_code,
      'subscriptionPlan', v_portal.subscription_plan,
      'subscriptionStatus', v_portal.subscription_status,
      'customerReminderHoursBefore', v_portal.customer_reminder_hours_before,
      'createdAt', v_portal.created_at,
      'updatedAt', v_portal.updated_at
    ),
    'clienti', v_portal.clienti,
    'appuntamenti', v_portal.appuntamenti,
    'servizi', v_portal.servizi,
    'operatori', v_portal.operatori,
    'richiestePrenotazione', v_portal.richieste_prenotazione,
    'availabilitySettings', v_portal.availability_settings,
    'serviceCardColorOverrides', coalesce(v_portal.service_card_color_overrides, '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_portal.role_card_color_overrides, '{}'::jsonb)
  );
end;
$$;

create or replace function public.find_public_customer_by_credentials(
  p_salon_code text,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_workspace_id uuid;
  v_workspace record;
  v_match record;
  v_portal_match record;
  v_portal_match_count integer := 0;
  v_backfilled_customer_id uuid;
begin
  if v_salon_code = '' then
    return null;
  end if;

  if v_customer_email is null and v_customer_phone is null then
    return null;
  end if;

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);

  if v_workspace_id is null then
    return null;
  end if;

  select
    v_workspace_id as workspace_id,
    coalesce(portal.clienti, '[]'::jsonb) as clienti
  into v_workspace
  from public.client_portals as portal
  where portal.workspace_id = v_workspace_id
  limit 1;

  with ranked_matches as (
    select
      customer.id,
      customer.full_name,
      customer.phone,
      customer.email,
      customer.instagram,
      customer.note,
      customer.source,
      customer.viewed_by_salon,
      case
        when v_customer_email is not null
          and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
        then true
        else false
      end as same_email,
      case
        when v_customer_phone is not null
          and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        then true
        else false
      end as same_phone,
      (
        case
          when v_customer_email is not null
            and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
          then 2
          else 0
        end
        +
        case
          when v_customer_phone is not null
            and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
          then 2
          else 0
        end
      ) as score
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and (
        (v_customer_email is not null and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
        )
      )
  ),
  best_match as (
    select *
    from ranked_matches
    where score > 0
    order by score desc, viewed_by_salon asc, id desc
    limit 1
  )
  select
    best_match.*,
    (
      select count(*)
      from ranked_matches
      where ranked_matches.score = best_match.score
    ) as same_score_count
  into v_match
  from best_match;

  if v_match.id is null then
    with portal_ranked_matches as (
      select
        item,
        coalesce(nullif(trim(item ->> 'nome'), ''), '') as full_name,
        coalesce(nullif(trim(item ->> 'telefono'), ''), '') as phone,
        coalesce(nullif(lower(trim(item ->> 'email')), ''), '') as email,
        coalesce(nullif(trim(item ->> 'instagram'), ''), '') as instagram,
        coalesce(nullif(trim(item ->> 'nota'), ''), '') as note,
        case
          when lower(coalesce(item ->> 'fonte', '')) = 'frontend' then 'frontend'
          else 'salone'
        end as source,
        coalesce((item ->> 'viewedBySalon')::boolean, false) as viewed_by_salon,
        (
          case
            when v_customer_email is not null
              and lower(trim(coalesce(item ->> 'email', ''))) = v_customer_email::text
            then 2
            else 0
          end
          +
          case
            when v_customer_phone is not null
              and right(regexp_replace(coalesce(item ->> 'telefono', ''), '\D+', '', 'g'), 10) = v_customer_phone
            then 2
            else 0
          end
        ) as score
      from jsonb_array_elements(coalesce(v_workspace.clienti, '[]'::jsonb)) as item
    ),
    best_portal_match as (
      select *
      from portal_ranked_matches
      where score > 0
      order by score desc, viewed_by_salon asc, full_name asc
      limit 1
    )
    select
      best_portal_match.*,
      (
        select count(*)
        from portal_ranked_matches
        where portal_ranked_matches.score = best_portal_match.score
      ) as same_score_count
    into v_portal_match
    from best_portal_match;

    v_portal_match_count := coalesce(v_portal_match.same_score_count, 0);

    if v_portal_match_count = 1 and v_portal_match.score > 0 then
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
        nullif(v_portal_match.full_name, ''),
        nullif(v_portal_match.phone, ''),
        nullif(v_portal_match.email, '')::citext,
        nullif(v_portal_match.instagram, ''),
        coalesce(v_portal_match.note, ''),
        case
          when v_portal_match.source = 'frontend' then 'frontend'
          else 'salone'
        end,
        coalesce(v_portal_match.viewed_by_salon, false)
      )
      on conflict do nothing
      returning id into v_backfilled_customer_id;

      if v_backfilled_customer_id is not null then
        perform public.sync_client_portal_customers(v_workspace_id);

        select
          customer.id,
          customer.full_name,
          customer.phone,
          customer.email,
          customer.instagram,
          customer.note,
          customer.source,
          customer.viewed_by_salon,
          true as same_email,
          true as same_phone,
          4 as score,
          1 as same_score_count
        into v_match
        from public.customers as customer
        where customer.id = v_backfilled_customer_id
        limit 1;
      end if;
    end if;
  end if;

  if v_match.id is null or coalesce(v_match.same_score_count, 0) > 1 then
    return null;
  end if;

  return jsonb_build_object(
    'customerId', v_match.id,
    'nome', coalesce(v_match.full_name, ''),
    'telefono', coalesce(v_match.phone, ''),
    'email', coalesce(v_match.email::text, ''),
    'instagram', coalesce(v_match.instagram, ''),
    'nota', coalesce(v_match.note, ''),
    'fonte',
      case
        when v_match.source = 'frontend' then 'frontend'
        else 'salone'
      end,
    'viewedBySalon', coalesce(v_match.viewed_by_salon, false)
  );
end;
$$;

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
  v_workspace_id uuid;
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

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);

  if v_workspace_id is null then
    raise exception 'salon_not_found';
  end if;

  select
    workspace.id as workspace_id,
    workspace.owner_email,
    workspace.salon_name
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = v_workspace_id
  limit 1;

  select
    customer.id,
    customer.phone,
    customer.email
  into v_existing_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
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
    v_workspace_id,
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

  perform public.sync_client_portal_customers(v_workspace_id);

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
    v_workspace_id,
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
  where device.workspace_id = v_workspace_id
    and device.recipient_kind = 'owner'
    and device.is_active = true;

  return jsonb_build_object(
    'customerId',
    v_customer_id,
    'workspaceId',
    v_workspace_id
  );
end;
$$;

