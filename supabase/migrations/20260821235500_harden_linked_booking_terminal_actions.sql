-- Keep every phase of a public composition in the same terminal state even
-- when an older client only sends the id of the card currently on screen.

create or replace function public.cancel_public_booking_request_or_group_v2(
  p_salon_code text,
  p_request_id uuid,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_group_id uuid;
  v_request record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_cancelled_request_ids uuid[] := array[]::uuid[];
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or coalesce(workspace.is_internal_tester, false)
    )
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select request.appointment_group_id
  into v_group_id
  from public.booking_requests as request
  where request.id = p_request_id
    and request.workspace_id = v_workspace_id
    and lower(trim(coalesce(request.customer_email::text, ''))) =
      lower(trim(coalesce(p_customer_email, '')))
    and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
      regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
  limit 1;

  if not found then
    raise exception 'booking_request_not_found';
  end if;

  -- The guard lets the compatibility trigger below delegate an old one-card
  -- cancellation here without recursively reopening the same group.
  perform set_config('salonpro.linked_customer_cancel_active', 'on', true);

  for v_request in
    select request.id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and (
        (v_group_id is not null and request.appointment_group_id = v_group_id)
        or (v_group_id is null and request.id = p_request_id)
      )
      and lower(trim(coalesce(request.customer_email::text, ''))) =
        lower(trim(coalesce(p_customer_email, '')))
      and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
        regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g')
      and request.status::text in ('pending', 'accepted')
    order by request.appointment_group_order nulls first, request.created_at, request.id
  loop
    v_result := public.cancel_public_booking_request(
      p_salon_code,
      v_request.id,
      p_customer_email::citext,
      p_customer_phone
    );
    v_results := v_results || jsonb_build_array(v_result);
    v_cancelled_request_ids := array_append(v_cancelled_request_ids, v_request.id);
  end loop;

  if v_group_id is not null and not exists (
    select 1
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group_id
      and request.status::text in ('pending', 'accepted')
  ) then
    update public.appointment_groups
    set status = 'cancelled',
        updated_at = timezone('utc', now())
    where id = v_group_id
      and workspace_id = v_workspace_id;
  end if;

  perform set_config('salonpro.linked_customer_cancel_active', 'off', true);

  return jsonb_build_object(
    'bookingRequestId', p_request_id,
    'appointmentGroupId', v_group_id,
    'cancelledRequestIds', to_jsonb(v_cancelled_request_ids),
    'cancelled', true,
    'results', v_results
  );
end;
$$;

revoke all on function public.cancel_public_booking_request_or_group_v2(text, uuid, text, text)
  from public;
grant execute on function public.cancel_public_booking_request_or_group_v2(text, uuid, text, text)
  to anon, authenticated;

create or replace function public.cascade_legacy_linked_customer_cancellation_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text;
begin
  if new.appointment_group_id is null
    or new.status::text <> 'cancelled'
    or coalesce(new.cancellation_source, '') <> 'cliente'
    or old.status::text not in ('pending', 'accepted')
    or coalesce(current_setting('salonpro.linked_customer_cancel_active', true), '') = 'on'
  then
    return new;
  end if;

  select workspace.slug
  into v_salon_code
  from public.workspaces as workspace
  where workspace.id = new.workspace_id
  limit 1;

  if v_salon_code is not null then
    perform public.cancel_public_booking_request_or_group_v2(
      v_salon_code,
      new.id,
      new.customer_email::text,
      new.customer_phone
    );
  end if;

  return new;
end;
$$;

drop trigger if exists cascade_legacy_linked_customer_cancellation_v1
  on public.booking_requests;
create trigger cascade_legacy_linked_customer_cancellation_v1
after update of status, cancellation_source on public.booking_requests
for each row
when (
  new.appointment_group_id is not null
  and new.status::text = 'cancelled'
  and new.cancellation_source = 'cliente'
  and old.status::text in ('pending', 'accepted')
)
execute function public.cascade_legacy_linked_customer_cancellation_v1();

-- Owner actions also resolve the persisted group by request id. This replaces
-- the former one-card implementation without requiring an app update.
create or replace function public.update_owner_booking_request_status_v2(
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
  v_group_id uuid;
  v_normalized_status public.request_status;
  v_request record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_appointment_ids jsonb := '[]'::jsonb;
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

  select request.appointment_group_id
  into v_group_id
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = p_request_id
  for update;

  if not found then
    raise exception 'booking_request_not_found';
  end if;

  for v_request in
    select request.id, request.appointment_group_order, request.appointment_group_size
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and (
        (v_group_id is not null and request.appointment_group_id = v_group_id)
        or (v_group_id is null and request.id = p_request_id)
      )
    order by request.appointment_group_order nulls first, request.created_at, request.id
  loop
    v_result := public.update_owner_booking_request_status_core(
      v_workspace_id,
      v_request.id,
      v_normalized_status
    );
    v_results := v_results || jsonb_build_array(v_result);

    if v_normalized_status = 'accepted' then
      update public.appointments
      set appointment_group_id = v_group_id,
          appointment_group_order = v_request.appointment_group_order,
          appointment_group_size = v_request.appointment_group_size
      where workspace_id = v_workspace_id
        and booking_request_id = v_request.id;
    end if;

    if nullif(v_result ->> 'appointmentId', '') is not null then
      v_appointment_ids := v_appointment_ids ||
        jsonb_build_array(v_result ->> 'appointmentId');
    end if;
  end loop;

  if v_group_id is not null then
    update public.appointment_groups
    set status = case
          when v_normalized_status in ('rejected', 'cancelled') then 'cancelled'
          else 'active'
        end,
        updated_at = timezone('utc', now())
    where id = v_group_id
      and workspace_id = v_workspace_id;
  end if;

  return jsonb_build_object(
    'requestId', p_request_id,
    'groupId', v_group_id,
    'status', v_normalized_status,
    'appointmentIds', v_appointment_ids,
    'results', v_results
  );
end;
$$;

revoke all on function public.update_owner_booking_request_status_v2(uuid, text)
  from public;
grant execute on function public.update_owner_booking_request_status_v2(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
