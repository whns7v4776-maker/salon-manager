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
      'createdAt', v_portal.created_at,
      'updatedAt', v_portal.updated_at
    ),
    'clienti', v_portal.clienti,
    'appuntamenti', v_portal.appuntamenti,
    'servizi', v_portal.servizi,
    'operatori', v_portal.operatori,
    'richiestePrenotazione', v_portal.richieste_prenotazione,
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;
