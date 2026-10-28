-- Public services with processing, dependencies and compositions are one
-- logical booking. Validate every real busy phase first, then accept and
-- materialize the complete group in one transaction.

create or replace function public.accept_booking_request_or_group_core_v3(
  p_workspace_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor public.booking_requests%rowtype;
  v_request record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_appointment_ids jsonb := '[]'::jsonb;
begin
  if p_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select request.*
  into v_anchor
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and request.id = p_request_id
  for update;

  if v_anchor.id is null then
    raise exception 'booking_request_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_workspace_id::text || ':' || v_anchor.appointment_date::text)
  );

  -- Lock the complete logical booking. A failure below rolls back every row.
  perform request.id
  from public.booking_requests as request
  where request.workspace_id = p_workspace_id
    and (
      (v_anchor.appointment_group_id is not null
        and request.appointment_group_id = v_anchor.appointment_group_id)
      or (v_anchor.appointment_group_id is null and request.id = v_anchor.id)
    )
  order by request.appointment_group_order nulls first, request.created_at, request.id
  for update;

  -- Revalidate the whole plan before creating even one Agenda card. This uses
  -- only the operator-busy initial/final phases; processing/posa stays free.
  for v_request in
    select request.id
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and (
        (v_anchor.appointment_group_id is not null
          and request.appointment_group_id = v_anchor.appointment_group_id)
        or (v_anchor.appointment_group_id is null and request.id = v_anchor.id)
      )
      and request.origin = 'frontend'
      and request.status = 'pending'::public.request_status
    order by request.appointment_group_order nulls first, request.created_at, request.id
  loop
    perform public.validate_booking_request_auto_accept_v1(
      p_workspace_id,
      v_request.id
    );
  end loop;

  for v_request in
    select
      request.id,
      request.status,
      request.appointment_group_order,
      request.appointment_group_size
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and (
        (v_anchor.appointment_group_id is not null
          and request.appointment_group_id = v_anchor.appointment_group_id)
        or (v_anchor.appointment_group_id is null and request.id = v_anchor.id)
      )
      and request.status in ('pending', 'accepted')
    order by request.appointment_group_order nulls first, request.created_at, request.id
  loop
    if v_request.status = 'pending'::public.request_status then
      v_result := public.update_owner_booking_request_status_core(
        p_workspace_id,
        v_request.id,
        'accepted'::public.request_status
      );
    else
      select jsonb_build_object(
        'appointmentId', appointment.id,
        'customerId', appointment.customer_id,
        'workspaceId', p_workspace_id
      )
      into v_result
      from public.appointments as appointment
      where appointment.workspace_id = p_workspace_id
        and appointment.booking_request_id = v_request.id
      limit 1;
      v_result := coalesce(v_result, '{}'::jsonb);
    end if;

    perform public.materialize_booking_request_phases_v1(
      p_workspace_id,
      v_request.id
    );

    update public.appointments as appointment
    set appointment_group_id = v_anchor.appointment_group_id,
        appointment_group_order = v_request.appointment_group_order,
        appointment_group_size = v_request.appointment_group_size,
        updated_at = timezone('utc', now())
    where appointment.workspace_id = p_workspace_id
      and appointment.booking_request_id = v_request.id;

    v_results := v_results || jsonb_build_array(v_result);
    if nullif(v_result ->> 'appointmentId', '') is not null then
      v_appointment_ids := v_appointment_ids ||
        jsonb_build_array(v_result ->> 'appointmentId');
    end if;
  end loop;

  if v_anchor.appointment_group_id is not null then
    update public.appointment_groups as appointment_group
    set status = 'active',
        updated_at = timezone('utc', now())
    where appointment_group.workspace_id = p_workspace_id
      and appointment_group.id = v_anchor.appointment_group_id;
  end if;

  return jsonb_build_object(
    'requestId', p_request_id,
    'groupId', v_anchor.appointment_group_id,
    'status', 'accepted',
    'appointmentIds', v_appointment_ids,
    'results', v_results
  );
end;
$$;

revoke all on function public.accept_booking_request_or_group_core_v3(uuid, uuid)
  from public;

-- Keep the existing app contract, but make its default Accept action resolve
-- the persisted group rather than only the card currently visible.
create or replace function public.accept_owner_booking_request_atomic_v2(
  p_owner_email citext,
  p_salon_code text,
  p_request_id uuid,
  p_customer_id uuid default null,
  p_appointment_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where lower(trim(coalesce(workspace.owner_email::text, ''))) =
        lower(trim(coalesce(p_owner_email::text, '')))
    and workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or coalesce(workspace.is_internal_tester, false)
    )
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  if p_appointment_id is not null then
    update public.appointments as appointment
    set booking_request_id = p_request_id,
        customer_id = coalesce(p_customer_id, appointment.customer_id),
        updated_at = timezone('utc', now())
    where appointment.id = p_appointment_id
      and appointment.workspace_id = v_workspace_id;
  end if;

  return public.accept_booking_request_or_group_core_v3(
    v_workspace_id,
    p_request_id
  );
end;
$$;

revoke all on function public.accept_owner_booking_request_atomic_v2(
  citext, text, uuid, uuid, uuid
) from public;
grant execute on function public.accept_owner_booking_request_atomic_v2(
  citext, text, uuid, uuid, uuid
) to authenticated;

-- Server auto-accept now works per logical booking. The global advisory lock
-- plus the helper's row locks prevent the cron and an owner tap from racing.
create or replace function public.process_due_auto_accept_booking_requests(
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_processed integer := 0;
  v_row record;
begin
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;

  perform set_config('salonpro.auto_accept_processor_running', 'on', true);

  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

  for v_row in
    select candidate.id, candidate.workspace_id
    from public.booking_requests as candidate
    where candidate.origin = 'frontend'
      and candidate.status = 'pending'::public.request_status
      and candidate.created_at <= v_now - interval '15 seconds'
      and public.resolve_customer_online_auto_accept_v1(
        candidate.workspace_id,
        candidate.customer_id
      ) is true
      and (
        candidate.appointment_group_id is null
        or candidate.id = (
          select member.id
          from public.booking_requests as member
          where member.workspace_id = candidate.workspace_id
            and member.appointment_group_id = candidate.appointment_group_id
            and member.status in ('pending', 'accepted')
          order by member.appointment_group_order nulls first,
                   member.created_at,
                   member.id
          limit 1
        )
      )
      and (
        candidate.appointment_group_id is null
        or not exists (
          select 1
          from public.booking_requests as member
          where member.workspace_id = candidate.workspace_id
            and member.appointment_group_id = candidate.appointment_group_id
            and (
              member.origin <> 'frontend'
              or member.status not in ('pending', 'accepted')
              or member.created_at > v_now - interval '15 seconds'
              or public.resolve_customer_online_auto_accept_v1(
                member.workspace_id,
                member.customer_id
              ) is not true
            )
        )
      )
    order by candidate.created_at, candidate.id
    limit greatest(coalesce(p_limit, 50), 1)
  loop
    begin
      perform public.accept_booking_request_or_group_core_v3(
        v_row.workspace_id,
        v_row.id
      );
      perform public.queue_owner_badge_refresh_after_auto_accept(
        v_row.workspace_id,
        v_row.id
      );
      v_processed := v_processed + 1;
    exception when others then
      if position('booking_request_conflict' in SQLERRM) > 0
        or position('booking_request_not_found' in SQLERRM) > 0 then
        null;
      else
        raise notice 'process_due_auto_accept_booking_requests failed for %: %',
          v_row.id,
          SQLERRM;
      end if;
    end;
  end loop;

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception when others then
  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
