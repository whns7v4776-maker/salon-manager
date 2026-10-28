create or replace function public.get_client_portal_catalog(p_salon_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_payload jsonb := '{}'::jsonb;
  v_workspace_payload jsonb := '{}'::jsonb;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
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

  v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
  v_workspace_payload := coalesce(v_owner_payload -> 'workspace', '{}'::jsonb);

  return jsonb_build_object(
    'workspace',
      jsonb_build_object(
        'id', v_workspace.id,
        'ownerEmail', coalesce(nullif(trim(v_workspace_payload ->> 'ownerEmail'), ''), v_workspace.owner_email::text),
        'salonCode', coalesce(nullif(trim(v_workspace_payload ->> 'salonCode'), ''), v_workspace.slug),
        'salonName', coalesce(nullif(trim(v_workspace_payload ->> 'salonName'), ''), v_workspace.salon_name),
        'salonNameDisplayStyle', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameDisplayStyle'), ''), 'corsivo'),
        'salonNameFontVariant', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameFontVariant'), ''), 'neon'),
        'businessPhone', coalesce(nullif(trim(v_workspace_payload ->> 'businessPhone'), ''), coalesce(v_workspace.owner_phone, '')),
        'activityCategory', coalesce(nullif(trim(v_workspace_payload ->> 'activityCategory'), ''), ''),
        'salonAddress', coalesce(nullif(trim(v_workspace_payload ->> 'salonAddress'), ''), ''),
        'streetType', coalesce(nullif(trim(v_workspace_payload ->> 'streetType'), ''), ''),
        'streetName', coalesce(nullif(trim(v_workspace_payload ->> 'streetName'), ''), ''),
        'streetNumber', coalesce(nullif(trim(v_workspace_payload ->> 'streetNumber'), ''), ''),
        'city', coalesce(nullif(trim(v_workspace_payload ->> 'city'), ''), ''),
        'postalCode', coalesce(nullif(trim(v_workspace_payload ->> 'postalCode'), ''), ''),
        'subscriptionPlan', v_workspace.subscription_plan,
        'subscriptionStatus', v_workspace.subscription_status,
        'customerReminderHoursBefore',
          greatest(
            0,
            least(
              168,
              coalesce(
                nullif(trim(coalesce(v_workspace_payload ->> 'customerReminderHoursBefore', '')), '')::integer,
                v_workspace.customer_reminder_hours_before,
                24
              )
            )
          ),
        'createdAt', v_workspace.created_at,
        'updatedAt', v_workspace.updated_at
      ),
    'clienti', '[]'::jsonb,
    'appuntamenti', '[]'::jsonb,
    'servizi', coalesce(v_owner_payload -> 'servizi', '[]'::jsonb),
    'operatori', coalesce(v_owner_payload -> 'operatori', '[]'::jsonb),
    'richiestePrenotazione', '[]'::jsonb,
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$$;
grant execute on function public.get_client_portal_catalog(text) to anon, authenticated;
