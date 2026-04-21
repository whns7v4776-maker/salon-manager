create or replace function public.update_client_portal_availability_settings(
  p_owner_email text,
  p_salon_code text,
  p_availability_settings jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal public.client_portals%rowtype;
begin
  update public.client_portals as portal
  set
    availability_settings = coalesce(p_availability_settings, '{}'::jsonb),
    updated_at = timezone('utc'::text, now())
  where
    lower(trim(portal.owner_email)) = lower(trim(coalesce(p_owner_email, '')))
    and lower(trim(portal.salon_code)) = lower(trim(coalesce(p_salon_code, '')))
  returning portal.* into v_portal;

  if not found then
    select portal.*
    into v_portal
    from public.client_portals as portal
    where lower(trim(portal.salon_code)) = lower(trim(coalesce(p_salon_code, '')))
      and lower(trim(portal.owner_email)) = lower(trim(coalesce(p_owner_email, '')))
    limit 1;
  end if;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', coalesce(v_portal.snapshot->'workspace'->>'salonName', ''),
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

grant execute on function public.update_client_portal_availability_settings(text, text, jsonb) to anon, authenticated;
