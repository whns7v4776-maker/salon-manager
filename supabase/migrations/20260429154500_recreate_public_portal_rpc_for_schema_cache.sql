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

create or replace function public.get_client_portal_availability_settings(p_salon_code text)
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
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

grant execute on function public.ensure_client_portal_workspace(text) to anon, authenticated;
grant execute on function public.get_client_portal_snapshot(text) to anon, authenticated;
grant execute on function public.get_client_portal_availability_settings(text) to anon, authenticated;

notify pgrst, 'reload schema';
