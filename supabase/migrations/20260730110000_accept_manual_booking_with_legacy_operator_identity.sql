create or replace function public.accept_owner_booking_request_with_operator_v2(
  p_request_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_next_duration_minutes integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_operator_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select operator.id
  into v_operator_id
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '')
      or (
        nullif(trim(coalesce(p_operator_name, '')), '') is not null
        and lower(trim(operator.name)) =
          lower(trim(coalesce(p_operator_name, '')))
      )
    )
  order by
    case
      when operator.id::text = nullif(trim(coalesce(p_operator_id, '')), '') then 0
      else 1
    end,
    operator.updated_at desc
  limit 1;

  if v_operator_id is null then
    raise exception 'operator_not_found';
  end if;

  return public.accept_owner_booking_request_with_operator_v1(
    p_request_id,
    v_operator_id,
    p_next_duration_minutes
  );
end;
$$;

revoke all on function public.accept_owner_booking_request_with_operator_v2(
  uuid,
  text,
  text,
  integer
) from public;
grant execute on function public.accept_owner_booking_request_with_operator_v2(
  uuid,
  text,
  text,
  integer
) to authenticated;
