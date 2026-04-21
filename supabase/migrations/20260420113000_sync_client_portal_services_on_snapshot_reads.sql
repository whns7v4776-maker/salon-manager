create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_backend_services boolean;
begin
  select exists(
    select 1
    from public.services as service
    where service.workspace_id = p_workspace_id
  )
  into v_has_backend_services;

  if not coalesce(v_has_backend_services, false) then
    return;
  end if;

  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'prezzo', service.price,
          'durataMinuti', service.duration_minutes
        )
        order by coalesce(matched.position, 2147483647), service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select
          existing_item as item,
          existing_position as position
        from jsonb_array_elements(coalesce(portal.servizi, '[]'::jsonb)) with ordinality as existing(existing_item, existing_position)
        where (
          nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
        ) or (
          lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
          and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
        )
        order by
          case
            when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0
            else 1
          end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
    ),
    portal.servizi,
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

create or replace function public.handle_client_portal_services_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  perform public.sync_client_portal_services(v_workspace_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_client_portal_after_services_change on public.services;
create trigger sync_client_portal_after_services_change
after insert or update or delete on public.services
for each row execute procedure public.handle_client_portal_services_sync();

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal public.client_portals%rowtype;
begin
  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.salon_code = lower(trim(p_salon_code))
    and portal.subscription_status = 'active'
  limit 1;

  if v_portal.workspace_id is null then
    return null;
  end if;

  perform public.sync_client_portal_services(v_portal.workspace_id);
  perform public.sync_client_portal_appointments(v_portal.workspace_id);
  perform public.sync_client_portal_booking_requests(v_portal.workspace_id);
  perform public.process_public_slot_waitlist(v_portal.workspace_id, null, null);
  perform public.sync_client_portal_appointments(v_portal.workspace_id);
  perform public.sync_client_portal_booking_requests(v_portal.workspace_id);

  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.workspace_id = v_portal.workspace_id
  limit 1;

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

do $$
declare
  workspace_record record;
begin
  for workspace_record in
    select portal.workspace_id
    from public.client_portals as portal
  loop
    perform public.sync_client_portal_services(workspace_record.workspace_id);
  end loop;
end;
$$;
