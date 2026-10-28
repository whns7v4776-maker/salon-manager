-- A role color is an owner preference, not a device preference. Persist only
-- the selected role key atomically so a stale full snapshot cannot overwrite
-- unrelated owner data and a reinstall can restore the exact same palette.

create or replace function public.set_owner_role_card_color_v1(
  p_workspace_id uuid,
  p_role_key text,
  p_color text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_role_key text := lower(trim(coalesce(p_role_key, '')));
  v_color text := upper(trim(coalesce(p_color, '')));
  v_role_colors jsonb;
begin
  if p_workspace_id is null
    or p_workspace_id is distinct from public.current_workspace_id()
    or not public.workspace_access_allowed()
  then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if v_role_key = '' then
    raise exception 'invalid_role_key' using errcode = '22023';
  end if;

  if v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'invalid_role_color' using errcode = '22023';
  end if;

  insert into public.owner_app_snapshots as snapshot (
    workspace_id,
    payload
  )
  values (
    p_workspace_id,
    jsonb_build_object(
      'roleCardColorOverrides',
      jsonb_build_object(v_role_key, v_color)
    )
  )
  on conflict (workspace_id) do update
  set payload = jsonb_set(
    coalesce(snapshot.payload, '{}'::jsonb),
    '{roleCardColorOverrides}',
    coalesce(snapshot.payload -> 'roleCardColorOverrides', '{}'::jsonb)
      || jsonb_build_object(v_role_key, v_color),
    true
  )
  returning coalesce(
    snapshot.payload -> 'roleCardColorOverrides',
    '{}'::jsonb
  )
  into v_role_colors;

  return v_role_colors;
end;
$$;

revoke all on function public.set_owner_role_card_color_v1(uuid, text, text)
  from public;
grant execute on function public.set_owner_role_card_color_v1(uuid, text, text)
  to authenticated;

notify pgrst, 'reload schema';
