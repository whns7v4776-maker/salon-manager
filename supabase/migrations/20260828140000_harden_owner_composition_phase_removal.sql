-- Removing one component from an owner composition changes the logical
-- appointment; it does not cancel the customer's whole booking. Keep the
-- surviving component rows, rebuild the group contract atomically and queue
-- exactly one operator-aware customer update.

-- A total-price rewrite is part of the phase-removal aggregate repair. Let the
-- caller suppress only the owner-composition creation finalizer for that
-- transaction, without disabling or replacing the trigger itself.
create or replace function public.finalize_owner_composition_created_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(
    current_setting('salonpro.skip_owner_composition_created_push', true),
    ''
  ) = 'on' then
    return new;
  end if;

  if new.status = 'active' then
    perform public.queue_owner_composition_created_push_v1(
      new.workspace_id,
      new.id
    );
  end if;

  return new;
end;
$$;

-- Updating group metadata also advances updated_at. Suppress the existing
-- final-status aggregation only for the phase-removal transaction so it cannot
-- emit an accepted/cancelled group notification beside the canonical update.
create or replace function public.queue_final_booking_group_status_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_accepted integer := 0;
  v_rejected integer := 0;
  v_cancelled integer := 0;
  v_cancellation_source text := '';
begin
  if coalesce(
    current_setting('salonpro.skip_booking_group_status_push', true),
    ''
  ) = 'on' then
    return new;
  end if;

  select
    count(*),
    count(*) filter (where request.status = 'accepted'::public.request_status),
    count(*) filter (where request.status = 'rejected'::public.request_status),
    count(*) filter (where request.status = 'cancelled'::public.request_status),
    max(coalesce(request.cancellation_source, '')) filter (
      where request.status = 'cancelled'::public.request_status
    )
  into v_total, v_accepted, v_rejected, v_cancelled, v_cancellation_source
  from public.booking_requests as request
  where request.workspace_id = new.workspace_id
    and request.appointment_group_id = new.id;

  if v_total > 0 and v_accepted = v_total then
    perform public.queue_booking_group_status_push_v1(
      new.workspace_id, new.id, 'accepted'::public.request_status, null
    );
  elsif v_total > 0 and v_rejected = v_total then
    perform public.queue_booking_group_status_push_v1(
      new.workspace_id, new.id, 'rejected'::public.request_status, null
    );
  elsif v_total > 0 and v_cancelled = v_total and new.status = 'cancelled' then
    perform public.queue_booking_group_status_push_v1(
      new.workspace_id,
      new.id,
      'cancelled'::public.request_status,
      coalesce(nullif(v_cancellation_source, ''), 'salone')
    );
  end if;

  return new;
end;
$$;

create or replace function public.cancel_owner_composition_phase_v1(
  p_appointment_id uuid,
  p_cancellation_event_id text default null,
  p_owner_email citext default null,
  p_salon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_group_id uuid;
  v_target public.appointments%rowtype;
  v_group public.appointment_groups%rowtype;
  v_removed_request public.booking_requests%rowtype;
  v_first_remaining public.appointments%rowtype;
  v_first_remaining_request public.booking_requests%rowtype;
  v_customer_email citext;
  v_customer_phone text;
  v_recipient_email citext;
  v_recipient_phone text;
  v_original_count integer := 0;
  v_remaining_count integer := 0;
  v_group_request_count integer := 0;
  v_remaining_title text := '';
  v_remaining_total_price numeric(10, 2) := 0;
  v_item_pauses jsonb := '[]'::jsonb;
  v_remaining_request_ids jsonb := '[]'::jsonb;
  v_operator_assignments jsonb := '[]'::jsonb;
  v_split_operators boolean := false;
  v_customer_commitment_minutes integer := 0;
  v_terminal_pause integer := 0;
  v_customer_commitment_end timestamp;
  v_timeline text := '';
  v_event_id text;
  v_body text;
  v_previous_skip_appointment_delete text := coalesce(
    current_setting('salonpro.skip_appointment_delete_client_cancellation', true),
    ''
  );
  v_previous_skip_booking_request_push text := coalesce(
    current_setting('salonpro.skip_booking_request_push', true),
    ''
  );
  v_previous_skip_owner_composition_push text := coalesce(
    current_setting('salonpro.skip_owner_composition_created_push', true),
    ''
  );
  v_previous_skip_booking_group_push text := coalesce(
    current_setting('salonpro.skip_booking_group_status_push', true),
    ''
  );
begin
  if auth.uid() is not null and public.workspace_access_allowed() then
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null then
    select workspace.id
    into v_workspace_id
    from public.workspaces as workspace
    where lower(trim(workspace.owner_email::text)) = lower(trim(coalesce(p_owner_email::text, '')))
      and workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    limit 1;
  end if;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  -- Resolve the group without taking an appointment lock first. Every caller
  -- then acquires the same group row before any component row, so two
  -- simultaneous phase removals serialize instead of locking siblings in an
  -- opposing order.
  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id;

  if v_target.id is null then
    raise exception 'appointment_not_found';
  end if;
  if v_target.appointment_group_id is null then
    raise exception 'appointment_not_linked';
  end if;

  v_group_id := v_target.appointment_group_id;

  select appointment_group.*
  into v_group
  from public.appointment_groups as appointment_group
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group_id
  for update;

  if v_group.id is null then
    raise exception 'appointment_group_not_found';
  end if;

  -- Re-read and lock the target only after the group lock. A concurrent move
  -- out of this group is rejected rather than deleting a row under stale
  -- membership assumptions.
  select appointment.*
  into v_target
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = p_appointment_id
    and appointment.appointment_group_id = v_group_id
  for update;

  if v_target.id is null then
    raise exception 'appointment_group_changed';
  end if;

  perform appointment.id
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id
  order by appointment.id
  for update;

  perform request.id
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id
  order by request.id
  for update;

  select count(*)::integer
  into v_original_count
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  if v_original_count <= 1 then
    raise exception 'cannot_remove_last_group_phase';
  end if;

  select count(*)::integer
  into v_group_request_count
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id;

  -- Prefer the explicit one-to-one link. The positional fallback repairs old
  -- composition rows that predate booking_request_id persistence, but never
  -- guesses across groups.
  if v_target.booking_request_id is not null then
    select request.*
    into v_removed_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.id = v_target.booking_request_id
      and request.appointment_group_id = v_group_id;
  end if;

  if v_removed_request.id is null then
    select request.*
    into v_removed_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group_id
      and request.appointment_group_order is not distinct from
        v_target.appointment_group_order
    order by
      (
        request.appointment_date = v_target.appointment_date
        and request.appointment_time = v_target.appointment_time
        and lower(trim(request.requested_service_name)) =
          lower(trim(v_target.service_name))
      ) desc,
      request.created_at,
      request.id
    limit 1;
  end if;

  if v_removed_request.id is null then
    select request.*
    into v_removed_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group_id
      and request.appointment_date = v_target.appointment_date
      and request.appointment_time = v_target.appointment_time
      and lower(trim(request.requested_service_name)) =
        lower(trim(v_target.service_name))
    order by request.created_at, request.id
    limit 1;
  end if;

  if v_removed_request.id is null and v_group_request_count > 0 then
    raise exception 'composition_phase_request_not_resolved';
  end if;

  -- Capture the recipient before deleting the technical request. Deleting the
  -- row prevents a false cancelled/unread card both now and in customer
  -- history; the durable removal audit lives in the update push payload.
  v_recipient_email := nullif(
    lower(trim(coalesce(v_removed_request.customer_email::text, ''))),
    ''
  )::citext;
  v_recipient_phone := nullif(trim(coalesce(v_removed_request.customer_phone, '')), '');

  perform set_config(
    'salonpro.skip_appointment_delete_client_cancellation',
    'on',
    true
  );
  perform set_config('salonpro.skip_booking_request_push', 'on', true);
  perform set_config('salonpro.skip_owner_composition_created_push', 'on', true);
  perform set_config('salonpro.skip_booking_group_status_push', 'on', true);

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.id = v_target.id;

  if v_removed_request.id is not null then
    delete from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.id = v_removed_request.id;
  end if;

  -- Preserve the pause attached to each surviving component while shifting its
  -- position. The same ordered snapshot supplies all group aggregates, so
  -- title, price and commitment metadata cannot diverge.
  with ordered as (
    select
      appointment.*,
      (row_number() over (
        order by appointment.appointment_group_order nulls last,
          appointment.appointment_time,
          appointment.id
      ))::integer as next_order,
      (count(*) over ())::integer as next_size
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_group_id = v_group_id
  ), surviving as (
    select
      ordered.*,
      coalesce((
        select greatest(
          0,
          least(
            180,
            case
              when coalesce(pause_item.value ->> 'pauseAfterMinutes', '') ~ '^[0-9]+$'
                then (pause_item.value ->> 'pauseAfterMinutes')::integer
              else 0
            end
          )
        )
        from jsonb_array_elements(
          case
            when jsonb_typeof(
              coalesce(v_group.metadata, '{}'::jsonb) -> 'itemPauses'
            ) = 'array'
              then coalesce(v_group.metadata, '{}'::jsonb) -> 'itemPauses'
            else '[]'::jsonb
          end
        ) as pause_item(value)
        where coalesce(pause_item.value ->> 'position', '') ~ '^[0-9]+$'
          and (pause_item.value ->> 'position')::integer =
            ordered.appointment_group_order
        limit 1
      ), 0)::integer as pause_after_minutes
    from ordered
  )
  select
    coalesce(
      string_agg(
        coalesce(nullif(trim(surviving.service_name), ''), 'Servizio'),
        ' + ' order by surviving.next_order
      ),
      ''
    ),
    coalesce(sum(surviving.price), 0)::numeric(10, 2),
    coalesce(max(surviving.next_size), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', surviving.next_order,
          'pauseAfterMinutes', surviving.pause_after_minutes
        )
        order by surviving.next_order
      ),
      '[]'::jsonb
    ),
    coalesce(sum(
      greatest(coalesce(surviving.duration_minutes, 60), 1)
      + surviving.pause_after_minutes
    ), 0)::integer,
    coalesce(max(surviving.pause_after_minutes) filter (
      where surviving.next_order = surviving.next_size
    ), 0)::integer,
    max(
      surviving.appointment_date::timestamp
      + surviving.appointment_time
      + make_interval(
        mins => greatest(coalesce(surviving.duration_minutes, 60), 1)
          + surviving.pause_after_minutes
      )
    ) filter (where surviving.next_order = surviving.next_size)
  into
    v_remaining_title,
    v_remaining_total_price,
    v_remaining_count,
    v_item_pauses,
    v_customer_commitment_minutes,
    v_terminal_pause,
    v_customer_commitment_end
  from surviving;

  if v_remaining_count < 1 then
    raise exception 'cannot_remove_last_group_phase';
  end if;

  with ordered as (
    select
      appointment.id,
      (row_number() over (
        order by appointment.appointment_group_order nulls last,
          appointment.appointment_time,
          appointment.id
      ))::integer as next_order,
      (count(*) over ())::integer as next_size
    from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_group_id = v_group_id
  )
  update public.appointments as appointment
  set appointment_group_order = ordered.next_order,
      appointment_group_size = ordered.next_size,
      updated_at = timezone('utc', now())
  from ordered
  where appointment.workspace_id = v_workspace_id
    and appointment.id = ordered.id;

  with ordered as (
    select
      request.id,
      (row_number() over (
        order by request.appointment_group_order nulls last,
          request.appointment_time,
          request.id
      ))::integer as next_order,
      (count(*) over ())::integer as next_size
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group_id
  )
  update public.booking_requests as request
  set appointment_group_order = ordered.next_order,
      appointment_group_size = ordered.next_size,
      updated_at = timezone('utc', now())
  from ordered
  where request.workspace_id = v_workspace_id
    and request.id = ordered.id;

  select coalesce(
    jsonb_agg(
      request.id
      order by request.appointment_group_order,
        request.appointment_time,
        request.id
    ),
    '[]'::jsonb
  )
  into v_remaining_request_ids
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.appointment_group_id = v_group_id;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'position', appointment.appointment_group_order,
          'serviceId', appointment.service_id,
          'serviceName', appointment.service_name,
          'date', appointment.appointment_date,
          'time', to_char(appointment.appointment_time, 'HH24:MI'),
          'durationMinutes', appointment.duration_minutes,
          'operatorId', coalesce(
            nullif(
              trim(appointment.phase_operator_assignments #>> '{initial,id}'),
              ''
            ),
            nullif(trim(coalesce(appointment.operator_id, '')), '')
          ),
          'operatorName', coalesce(
            nullif(
              trim(appointment.phase_operator_assignments #>> '{initial,name}'),
              ''
            ),
            nullif(trim(coalesce(appointment.operator_name, '')), '')
          )
        )
        order by appointment.appointment_group_order,
          appointment.appointment_time,
          appointment.id
      ),
      '[]'::jsonb
    ),
    count(distinct nullif(lower(coalesce(
      nullif(trim(appointment.phase_operator_assignments #>> '{initial,id}'), ''),
      nullif(trim(coalesce(appointment.operator_id, '')), ''),
      nullif(trim(appointment.phase_operator_assignments #>> '{initial,name}'), ''),
      nullif(trim(coalesce(appointment.operator_name, '')), ''),
      ''
    )), '')) > 1
  into v_operator_assignments, v_split_operators
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  update public.appointment_groups as appointment_group
  set title = v_remaining_title,
      total_price = v_remaining_total_price,
      metadata = coalesce(appointment_group.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'itemCount', v_remaining_count,
          'itemPauses', v_item_pauses,
          'terminalPauseMinutes', v_terminal_pause,
          'customerCommitmentMinutes', v_customer_commitment_minutes,
          'customerCommitmentEndLocal', case
            when v_terminal_pause > 0 and v_customer_commitment_end is not null
              then to_char(v_customer_commitment_end, 'YYYY-MM-DD"T"HH24:MI:SS')
            else null
          end
        )
        || case
          when coalesce(appointment_group.metadata, '{}'::jsonb) ? 'requestIds'
            then jsonb_build_object('requestIds', v_remaining_request_ids)
          else '{}'::jsonb
        end
        || case
          when coalesce(appointment_group.metadata, '{}'::jsonb) ? 'operatorAssignments'
            then jsonb_build_object(
              'operatorAssignments', v_operator_assignments,
              'splitOperators', v_split_operators
            )
          else '{}'::jsonb
        end,
      updated_at = timezone('utc', now())
  where appointment_group.workspace_id = v_workspace_id
    and appointment_group.id = v_group_id;

  select appointment.*
  into v_first_remaining
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id
  order by appointment.appointment_group_order,
    appointment.appointment_time,
    appointment.id
  limit 1;

  if v_first_remaining.booking_request_id is not null then
    select request.*
    into v_first_remaining_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.id = v_first_remaining.booking_request_id;
  end if;

  if v_first_remaining_request.id is null then
    select request.*
    into v_first_remaining_request
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.appointment_group_id = v_group_id
    order by request.appointment_group_order,
      request.appointment_time,
      request.id
    limit 1;
  end if;

  -- Build the visible timeline from the surviving appointments after their
  -- canonical 1..N reindex. Initial and reprise operators remain attached to
  -- their own service instead of being flattened to the first component.
  select coalesce(
    string_agg(
      concat(
        coalesce(nullif(trim(appointment.service_name), ''), 'Servizio'),
        ' alle ',
        to_char(appointment.appointment_time, 'HH24:MI'),
        case
          when nullif(trim(coalesce(
            appointment.phase_operator_assignments #>> '{initial,name}',
            appointment.phase_snapshot ->> 'initialOperatorName',
            appointment.operator_name,
            ''
          )), '') is not null
          then ' con ' || trim(coalesce(
            appointment.phase_operator_assignments #>> '{initial,name}',
            appointment.phase_snapshot ->> 'initialOperatorName',
            appointment.operator_name
          ))
          else ''
        end,
        case
          when lower(coalesce(
            appointment.phase_snapshot ->> 'finalPhaseEnabled',
            'false'
          )) = 'true'
            and nullif(trim(coalesce(
              appointment.phase_operator_assignments #>> '{final,name}',
              appointment.phase_snapshot ->> 'finalOperatorName',
              ''
            )), '') is not null
            and lower(trim(coalesce(
              appointment.phase_operator_assignments #>> '{final,name}',
              appointment.phase_snapshot ->> 'finalOperatorName',
              ''
            ))) is distinct from lower(trim(coalesce(
              appointment.phase_operator_assignments #>> '{initial,name}',
              appointment.phase_snapshot ->> 'initialOperatorName',
              appointment.operator_name,
              ''
            )))
          then ', ripresa con ' || trim(coalesce(
            appointment.phase_operator_assignments #>> '{final,name}',
            appointment.phase_snapshot ->> 'finalOperatorName'
          ))
          else ''
        end
      ),
      ' · ' order by appointment.appointment_group_order,
        appointment.appointment_time,
        appointment.id
    ),
    ''
  )
  into v_timeline
  from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_group_id = v_group_id;

  if v_recipient_email is null then
    v_recipient_email := nullif(
      lower(trim(coalesce(v_first_remaining_request.customer_email::text, ''))),
      ''
    )::citext;
  end if;
  if v_recipient_phone is null then
    v_recipient_phone := nullif(
      trim(coalesce(v_first_remaining_request.customer_phone, '')),
      ''
    );
  end if;

  v_recipient_email := coalesce(
    v_recipient_email,
    nullif(lower(trim(coalesce(v_group.metadata ->> 'customerEmail', ''))), '')::citext
  );
  v_recipient_phone := coalesce(
    v_recipient_phone,
    nullif(trim(coalesce(v_group.metadata ->> 'customerPhone', '')), '')
  );

  if (v_recipient_email is null or v_recipient_phone is null)
    and v_target.customer_id is not null
  then
    select
      nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext,
      nullif(trim(coalesce(customer.phone, '')), '')
    into v_customer_email, v_customer_phone
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.id = v_target.customer_id;

    v_recipient_email := coalesce(v_recipient_email, v_customer_email);
    v_recipient_phone := coalesce(v_recipient_phone, v_customer_phone);
  end if;

  -- Restore every local guard before the explicit canonical queue call. This
  -- also prevents the RPC from leaking a skip flag into a caller-managed
  -- transaction.
  perform set_config(
    'salonpro.skip_appointment_delete_client_cancellation',
    v_previous_skip_appointment_delete,
    true
  );
  perform set_config(
    'salonpro.skip_booking_request_push',
    v_previous_skip_booking_request_push,
    true
  );
  perform set_config(
    'salonpro.skip_owner_composition_created_push',
    v_previous_skip_owner_composition_push,
    true
  );
  perform set_config(
    'salonpro.skip_booking_group_status_push',
    v_previous_skip_booking_group_push,
    true
  );

  v_event_id := coalesce(
    nullif(trim(p_cancellation_event_id), ''),
    concat(
      'phase-',
      v_target.id::text,
      '-',
      extract(epoch from clock_timestamp())::bigint::text
    )
  );
  v_body := 'È stata rimossa la fase ' || trim(v_target.service_name)
    || '. Restano: ' || v_timeline
    || '. Data: ' || to_char(v_first_remaining.appointment_date, 'DD/MM/YYYY') || '.';

  if v_recipient_email is not null or v_recipient_phone is not null then
    perform public.queue_public_customer_push(
      v_workspace_id,
      'custom'::public.push_event_type,
      'Appuntamento aggiornato dal salone',
      v_body,
      jsonb_build_object(
        'type', 'appointment_updated',
        'event_type', 'appointment_updated',
        'notificationType', 'appointment_updated',
        '_pushEventType', 'appointment_updated',
        '_pushAudience', 'public',
        '_pushTarget', 'client',
        '_dedupeKey', concat_ws(
          '|',
          v_workspace_id::text,
          'composition_phase_removed',
          v_event_id
        ),
        'eventId', v_event_id,
        'notificationScope', 'appointment_group',
        'appointmentGroupId', v_group_id,
        'appointmentId', v_first_remaining.id,
        'anchorAppointmentId', v_first_remaining.id,
        'bookingRequestId', v_first_remaining_request.id,
        'anchorBookingRequestId', v_first_remaining_request.id,
        'removedAppointmentId', v_target.id,
        'removedBookingRequestId', v_removed_request.id,
        'appointmentDate', v_first_remaining.appointment_date,
        -- Every component time already appears next to its own operator in the
        -- timeline, so the native compact formatter must not append one time.
        'appointmentTime', null,
        'anchorAppointmentTime', to_char(
          v_first_remaining.appointment_time,
          'HH24:MI'
        ),
        'customerName', v_target.customer_name,
        'serviceName', v_timeline,
        'operatorName', '',
        'bookingTimeline', v_timeline,
        'groupTitle', v_remaining_title,
        'removedServiceName', v_target.service_name,
        'customerEmail', coalesce(v_recipient_email::text, ''),
        'customerPhone', coalesce(v_recipient_phone, ''),
        'source', 'owner'
      ),
      v_recipient_email,
      v_recipient_phone
    );
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace_id,
    'appointmentId', v_target.id,
    'removedAppointmentId', v_target.id,
    'appointmentGroupId', v_group_id,
    'anchorAppointmentId', v_first_remaining.id,
    'anchorBookingRequestId', v_first_remaining_request.id,
    'removedBookingRequestId', v_removed_request.id,
    'removedOnlyPhase', true,
    'remainingAppointmentCount', v_remaining_count,
    'groupTitle', v_remaining_title,
    'totalPrice', v_remaining_total_price,
    'customerEmail', coalesce(v_recipient_email::text, ''),
    'customerPhone', coalesce(v_recipient_phone, '')
  );
end;
$$;

revoke all on function public.cancel_owner_composition_phase_v1(
  uuid, text, citext, text
) from public;
grant execute on function public.cancel_owner_composition_phase_v1(
  uuid, text, citext, text
) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
