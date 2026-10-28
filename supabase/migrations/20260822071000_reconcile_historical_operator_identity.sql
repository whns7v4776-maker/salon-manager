-- Historical appointments can retain an operator UUID that no longer exists
-- after the salon republishes its operator catalog. If that row still carries
-- the same operator name, it must occupy the current operator lane instead of
-- creating a false free slot. Two live operators with distinct UUIDs remain
-- distinct even if they happen to share a display name.

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
  v_left_is_canonical boolean := false;
  v_right_is_canonical boolean := false;
begin
  if v_left_id is not null and v_right_id is not null then
    if v_left_id = v_right_id then
      return true;
    end if;

    if v_left_name is null or v_right_name is null or v_left_name <> v_right_name then
      return false;
    end if;

    select exists (
      select 1 from public.operators as operator
      where operator.id::text = v_left_id
    ) into v_left_is_canonical;
    select exists (
      select 1 from public.operators as operator
      where operator.id::text = v_right_id
    ) into v_right_is_canonical;

    return not v_left_is_canonical or not v_right_is_canonical;
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
