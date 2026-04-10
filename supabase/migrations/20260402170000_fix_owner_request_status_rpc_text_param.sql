drop function if exists public.update_owner_booking_request_status(uuid, public.request_status);
drop function if exists public.update_owner_booking_request_status_by_email(citext, text, uuid, public.request_status);

create or replace function public.update_owner_booking_request_status(
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_normalized_status public.request_status;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
  end if;

  return public.update_owner_booking_request_status_core(v_workspace_id, p_request_id, v_normalized_status);
end;
$$;

create or replace function public.update_owner_booking_request_status_by_email(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_normalized_status public.request_status;
begin
  select w.id
  into v_workspace_id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = lower(trim(coalesce(p_owner_email::text, '')))
    and w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  v_normalized_status := case lower(trim(coalesce(p_status, '')))
    when 'accepted' then 'accepted'::public.request_status
    when 'rejected' then 'rejected'::public.request_status
    when 'cancelled' then 'cancelled'::public.request_status
    else null
  end;

  if v_normalized_status is null then
    raise exception 'invalid_request_status';
  end if;

  return public.update_owner_booking_request_status_core(v_workspace_id, p_request_id, v_normalized_status);
end;
$$;

grant execute on function public.update_owner_booking_request_status(uuid, text) to authenticated;
grant execute on function public.update_owner_booking_request_status_by_email(citext, text, uuid, text) to anon;
grant execute on function public.update_owner_booking_request_status_by_email(citext, text, uuid, text) to authenticated;
