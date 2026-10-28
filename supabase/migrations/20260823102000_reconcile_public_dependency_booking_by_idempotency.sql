-- A dependency booking is created as one logical group made of two requests.
-- The mobile client can lose the acknowledgement while the database commits
-- (or while automatic acceptance materializes the group).  Reconcile by the
-- original idempotency key instead of guessing from service/time, which is not
-- safe when the same customer books for a family member or friend.

create or replace function public.find_public_booking_dependency_by_idempotency_v1(
  p_salon_code text,
  p_idempotency_key text,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_group public.appointment_groups%rowtype;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
  v_request_ids jsonb := '[]'::jsonb;
  v_item_count integer := 0;
  v_all_accepted boolean := false;
  v_any_active boolean := false;
  v_root_request record;
begin
  if lower(trim(coalesce(p_salon_code, ''))) = ''
    or trim(coalesce(p_idempotency_key, '')) = ''
    or (v_customer_email is null and v_customer_phone is null)
  then
    return null;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(p_salon_code))
    and (
      workspace.is_internal_tester is true
      or workspace.subscription_status in ('demo', 'active')
    )
  limit 1;

  if v_workspace_id is null then
    return null;
  end if;

  select appointment_group.*
  into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.source = 'frontend'
    and appointment_group.idempotency_key = trim(p_idempotency_key)
    and appointment_group.status = 'active'
    and coalesce(appointment_group.metadata ->> 'dependencyServiceId', '') <> ''
  limit 1;

  if v_group.id is null then
    return null;
  end if;

  -- Do not disclose a group merely because its idempotency key is known.
  if not exists (
    select 1
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group.id
      and (
        (v_customer_email is not null and request.customer_email = v_customer_email)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
  ) then
    return null;
  end if;

  select
    coalesce(
      jsonb_agg(request.id order by request.appointment_group_order, request.created_at, request.id),
      '[]'::jsonb
    ),
    count(*)::integer,
    bool_and(request.status = 'accepted'::public.request_status),
    bool_or(request.status in ('pending'::public.request_status, 'accepted'::public.request_status))
  into v_request_ids, v_item_count, v_all_accepted, v_any_active
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group.id
    and request.status in ('pending'::public.request_status, 'accepted'::public.request_status);

  -- A dependency is valid only when both phases are present.  Never turn a
  -- partial write into a false success acknowledgement.
  if v_item_count <> 2 or not coalesce(v_any_active, false) then
    return null;
  end if;

  select
    request.id,
    request.status,
    request.created_at,
    request.viewed_by_salon
  into v_root_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group.id
    and request.status in ('pending'::public.request_status, 'accepted'::public.request_status)
  order by request.appointment_group_order nulls first, request.created_at, request.id
  limit 1;

  return jsonb_build_object(
    'id', v_root_request.id,
    'groupId', v_group.id,
    'requestIds', v_request_ids,
    'itemCount', v_item_count,
    'status', case when coalesce(v_all_accepted, false) then 'accepted' else 'pending' end,
    'createdAt', v_root_request.created_at,
    'viewedBySalon', coalesce(v_root_request.viewed_by_salon, false)
  );
end;
$$;

grant execute on function public.find_public_booking_dependency_by_idempotency_v1(
  text,
  text,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
