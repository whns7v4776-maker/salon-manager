create or replace function public.merge_client_portal_availability_settings(
  p_existing jsonb,
  p_incoming jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_existing jsonb := coalesce(p_existing, '{}'::jsonb);
  v_incoming jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_result jsonb := coalesce(p_incoming, '{}'::jsonb);
  v_existing_guided_ts timestamptz;
  v_incoming_guided_ts timestamptz;
  v_existing_weekly_ts timestamptz;
  v_incoming_weekly_ts timestamptz;
  v_existing_slot_ts timestamptz;
  v_incoming_slot_ts timestamptz;
  v_existing_contact_ts timestamptz;
  v_incoming_contact_ts timestamptz;
begin
  begin
    v_existing_guided_ts := nullif(trim(coalesce(v_existing ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_existing_guided_ts := null;
  end;

  begin
    v_incoming_guided_ts := nullif(trim(coalesce(v_incoming ->> 'guidedSlotsUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_incoming_guided_ts := null;
  end;

  begin
    v_existing_weekly_ts := nullif(trim(coalesce(v_existing ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_existing_weekly_ts := null;
  end;

  begin
    v_incoming_weekly_ts := nullif(trim(coalesce(v_incoming ->> 'weeklyScheduleUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_incoming_weekly_ts := null;
  end;

  begin
    v_existing_slot_ts := nullif(trim(coalesce(v_existing ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_existing_slot_ts := null;
  end;

  begin
    v_incoming_slot_ts := nullif(trim(coalesce(v_incoming ->> 'slotIntervalUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_incoming_slot_ts := null;
  end;

  begin
    v_existing_contact_ts := nullif(trim(coalesce(v_existing ->> 'customServiceContactUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_existing_contact_ts := null;
  end;

  begin
    v_incoming_contact_ts := nullif(trim(coalesce(v_incoming ->> 'customServiceContactUpdatedAt', '')), '')::timestamptz;
  exception when others then
    v_incoming_contact_ts := null;
  end;

  if v_existing_guided_ts is not null
     and (v_incoming_guided_ts is null or v_existing_guided_ts > v_incoming_guided_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(v_result, '{guidedSlotsEnabled}', coalesce(v_existing -> 'guidedSlotsEnabled', 'false'::jsonb), true),
          '{guidedSlotsStrategy}', coalesce(v_existing -> 'guidedSlotsStrategy', to_jsonb('balanced'::text)), true
        ),
        '{guidedSlotsVisibility}', coalesce(v_existing -> 'guidedSlotsVisibility', to_jsonb('recommended_first'::text)), true
      ),
      '{guidedSlotsUpdatedAt}', coalesce(v_existing -> 'guidedSlotsUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_weekly_ts is not null
     and (v_incoming_weekly_ts is null or v_existing_weekly_ts > v_incoming_weekly_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(v_result, '{weeklySchedule}', coalesce(v_existing -> 'weeklySchedule', '[]'::jsonb), true),
                '{dateOverrides}', coalesce(v_existing -> 'dateOverrides', '[]'::jsonb), true
              ),
              '{vacationRanges}', coalesce(v_existing -> 'vacationRanges', '[]'::jsonb), true
            ),
            '{lunchBreakEnabled}', coalesce(v_existing -> 'lunchBreakEnabled', 'false'::jsonb), true
          ),
          '{lunchBreakStart}', coalesce(v_existing -> 'lunchBreakStart', to_jsonb('13:00'::text)), true
        ),
        '{lunchBreakEnd}', coalesce(v_existing -> 'lunchBreakEnd', to_jsonb('14:00'::text)), true
      ),
      '{weeklyScheduleUpdatedAt}', coalesce(v_existing -> 'weeklyScheduleUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_slot_ts is not null
     and (v_incoming_slot_ts is null or v_existing_slot_ts > v_incoming_slot_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(v_result, '{slotIntervalMinutes}', coalesce(v_existing -> 'slotIntervalMinutes', to_jsonb(30)), true),
        '{dateSlotIntervals}', coalesce(v_existing -> 'dateSlotIntervals', '[]'::jsonb), true
      ),
      '{slotIntervalUpdatedAt}', coalesce(v_existing -> 'slotIntervalUpdatedAt', 'null'::jsonb), true
    );
  end if;

  if v_existing_contact_ts is not null
     and (v_incoming_contact_ts is null or v_existing_contact_ts > v_incoming_contact_ts) then
    v_result := jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              v_result,
              '{customServiceContactEnabled}',
              coalesce(v_existing -> 'customServiceContactEnabled', 'false'::jsonb),
              true
            ),
            '{customServiceContactTitle}',
            coalesce(v_existing -> 'customServiceContactTitle', to_jsonb('Un servizio pensato su misura per te'::text)),
            true
          ),
          '{customServiceContactMessage}',
          coalesce(v_existing -> 'customServiceContactMessage', to_jsonb(''::text)),
          true
        ),
        '{customServiceContactWhatsappMessage}',
        coalesce(v_existing -> 'customServiceContactWhatsappMessage', to_jsonb(''::text)),
        true
      ),
      '{customServiceContactUpdatedAt}',
      coalesce(v_existing -> 'customServiceContactUpdatedAt', 'null'::jsonb),
      true
    );
  end if;

  return v_result;
end;
$$;

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
  v_workspace_id uuid;
  v_portal public.client_portals%rowtype;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  update public.client_portals as portal
  set
    availability_settings = public.merge_client_portal_availability_settings(
      portal.availability_settings,
      coalesce(p_availability_settings, '{}'::jsonb)
    ),
    updated_at = timezone('utc'::text, now())
  where portal.workspace_id = v_workspace_id
    and lower(trim(portal.owner_email::text)) = lower(trim(coalesce(p_owner_email, '')))
    and lower(trim(portal.salon_code)) = lower(trim(coalesce(p_salon_code, '')))
  returning portal.* into v_portal;

  if not found then
    raise exception 'workspace_not_found';
  end if;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', coalesce(v_portal.salon_name, ''),
      'updatedAt', v_portal.updated_at
    ),
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

revoke all on function public.update_client_portal_availability_settings(text, text, jsonb)
  from public, anon;
grant execute on function public.update_client_portal_availability_settings(text, text, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
