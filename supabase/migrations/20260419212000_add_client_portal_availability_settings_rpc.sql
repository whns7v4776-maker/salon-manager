create or replace function public.get_client_portal_availability_settings(p_salon_code text)
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

grant execute on function public.get_client_portal_availability_settings(text) to anon, authenticated;
