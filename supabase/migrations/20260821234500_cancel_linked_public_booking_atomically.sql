-- A public dependency/composition is one customer booking.  Cancellation must
-- discover the persisted group from the request id instead of trusting a
-- possibly stale client snapshot that may only contain the first phase.

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

notify pgrst, 'reload schema';
