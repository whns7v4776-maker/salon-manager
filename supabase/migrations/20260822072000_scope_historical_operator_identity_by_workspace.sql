-- A legacy appointment can contain an operator UUID copied from an older or
-- foreign workspace snapshot while retaining the correct display name. The
-- public booking checks compare that row with the current workspace operator.
-- Treat equal names as the same lane when one UUID is missing or the two live
-- UUIDs belong to different workspaces. Keep distinct live operators inside
-- the same workspace separate, even when their display names are equal.

create or replace function public.same_public_booking_operator_identity(
  p_left_operator_id text,
  p_left_operator_name text,
  p_right_operator_id text,
  p_right_operator_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_left_id text := nullif(trim(coalesce(p_left_operator_id, '')), '');
  v_right_id text := nullif(trim(coalesce(p_right_operator_id, '')), '');
  v_left_name text := nullif(lower(trim(coalesce(p_left_operator_name, ''))), '');
  v_right_name text := nullif(lower(trim(coalesce(p_right_operator_name, ''))), '');
  v_left_workspace_id uuid;
  v_right_workspace_id uuid;
begin
  if v_left_id is not null and v_right_id is not null then
    if v_left_id = v_right_id then
      return true;
    end if;

    if v_left_name is null or v_right_name is null or v_left_name <> v_right_name then
      return false;
    end if;

    select operator.workspace_id
    into v_left_workspace_id
    from public.operators as operator
    where operator.id::text = v_left_id
    limit 1;

    select operator.workspace_id
    into v_right_workspace_id
    from public.operators as operator
    where operator.id::text = v_right_id
    limit 1;

    if v_left_workspace_id is null or v_right_workspace_id is null then
      return true;
    end if;

    return v_left_workspace_id <> v_right_workspace_id;
  end if;

  if v_left_name is not null and v_right_name is not null then
    return v_left_name = v_right_name;
  end if;

  return coalesce(v_left_id, '') = coalesce(v_right_id, '')
    and coalesce(v_left_name, '') = coalesce(v_right_name, '');
end;
$$;

revoke all on function public.same_public_booking_operator_identity(
  text, text, text, text
) from public;
grant execute on function public.same_public_booking_operator_identity(
  text, text, text, text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
