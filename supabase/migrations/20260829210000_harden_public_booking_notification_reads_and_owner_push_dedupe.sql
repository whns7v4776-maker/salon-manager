-- Keep public group metadata available to the single internal tester even
-- when its workspace does not have a normal demo/active subscription.

create or replace function public.get_public_booking_group_members_v1(
  p_salon_code text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with selected_workspace as (
    select workspace.id
    from public.workspaces as workspace
    where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
      and (
        workspace.subscription_status in ('demo', 'active')
        or workspace.is_internal_tester is true
      )
    limit 1
  )
  select jsonb_build_object(
    'requests', coalesce((
      select jsonb_object_agg(
        request.id::text,
        jsonb_build_object(
          'appointmentGroupId', request.appointment_group_id,
          'appointmentGroupOrder', request.appointment_group_order,
          'appointmentGroupSize', request.appointment_group_size
        )
      )
      from public.booking_requests as request
      join selected_workspace on selected_workspace.id = request.workspace_id
      where request.appointment_group_id is not null
    ), '{}'::jsonb),
    'appointments', coalesce((
      select jsonb_object_agg(
        appointment.id::text,
        jsonb_build_object(
          'appointmentGroupId', appointment.appointment_group_id,
          'appointmentGroupOrder', appointment.appointment_group_order,
          'appointmentGroupSize', appointment.appointment_group_size
        )
      )
      from public.appointments as appointment
      join selected_workspace on selected_workspace.id = appointment.workspace_id
      where appointment.appointment_group_id is not null
    ), '{}'::jsonb)
  );
$$;

revoke all on function public.get_public_booking_group_members_v1(text)
  from public;
grant execute on function public.get_public_booking_group_members_v1(text)
  to anon, authenticated;

-- Keep the authoritative unread snapshot aligned with the CAS endpoint below.
-- A normal pending booking is still an owner-side request and must not count as
-- a customer notification. The sole pending exception is an operator change
-- explicitly waiting for the customer's response; exposing its updated_at is
-- required for an exact, non-stale acknowledgement.

create or replace function public.get_public_customer_unread_booking_badge_rows(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns table (
  id uuid,
  appointment_group_id uuid,
  status public.request_status,
  cancellation_source text,
  viewed_by_customer boolean,
  customer_email citext,
  customer_phone text,
  appointment_date date,
  appointment_time time,
  requested_service_name text,
  updated_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    request.id,
    request.appointment_group_id,
    request.status,
    request.cancellation_source,
    request.viewed_by_customer,
    request.customer_email,
    request.customer_phone,
    request.appointment_date,
    request.appointment_time,
    request.requested_service_name,
    request.updated_at,
    request.created_at
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.viewed_by_customer = false
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) =
          v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') =
          v_customer_phone
      )
    )
    and (
      (
        request.status::text = 'pending'
        and request.operator_change_status = 'pending'
      )
      or request.status::text in (
        'accepted',
        'auto_accepted',
        'rejected',
        'declined'
      )
      or (
        request.status::text = 'cancelled'
        and lower(trim(coalesce(request.cancellation_source, ''))) = 'salone'
      )
    )
  order by request.updated_at desc, request.created_at desc;
end;
$$;

revoke all on function public.get_public_customer_unread_booking_badge_rows(
  text, citext, text
) from public;
grant execute on function public.get_public_customer_unread_booking_badge_rows(
  text, citext, text
) to anon, authenticated;

-- A close/background acknowledgement must apply to the notification snapshot
-- that the customer actually opened, never to a newer mutation of the same
-- booking row. p_events is an array with this public contract:
--   requestId, expectedStatus, expectedCancellationSource,
--   expectedAppointmentDate, expectedAppointmentTime, expectedServiceName,
--   expectedUpdatedAt.
-- statusCode/eventVersion and the non-prefixed date/time/service fields remain
-- accepted aliases for callers that already use the push payload vocabulary.

create or replace function public.mark_public_booking_notification_events_viewed_v2(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_events jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_updated_count integer := 0;
begin
  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    return 0;
  end if;

  if jsonb_array_length(p_events) = 0 then
    return 0;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  with raw_events as (
    select event.value as payload
    from jsonb_array_elements(p_events) with ordinality as event(value, position)
    where jsonb_typeof(event.value) = 'object'
      and event.position <= 500
  ),
  parsed_events as (
    select distinct
      case
        when trim(coalesce(payload ->> 'requestId', '')) ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(payload ->> 'requestId')::uuid
        else null
      end as request_id,
      case lower(trim(coalesce(
        payload ->> 'expectedStatus',
        payload ->> 'statusCode',
        payload ->> 'status',
        ''
      )))
        when 'accettata' then 'accepted'
        when 'confermata' then 'accepted'
        when 'rifiutata' then 'rejected'
        when 'declined' then 'rejected'
        when 'annullata' then 'cancelled'
        when 'in attesa' then 'pending'
        else lower(trim(coalesce(
          payload ->> 'expectedStatus',
          payload ->> 'statusCode',
          payload ->> 'status',
          ''
        )))
      end as expected_status,
      lower(trim(coalesce(
        payload ->> 'expectedCancellationSource',
        payload ->> 'cancellationSource',
        ''
      ))) as expected_cancellation_source,
      trim(coalesce(
        payload ->> 'expectedAppointmentDate',
        payload ->> 'appointmentDate',
        ''
      )) as expected_appointment_date,
      left(trim(coalesce(
        payload ->> 'expectedAppointmentTime',
        payload ->> 'appointmentTime',
        ''
      )), 5) as expected_appointment_time,
      lower(regexp_replace(trim(coalesce(
        payload ->> 'expectedServiceName',
        payload ->> 'serviceName',
        ''
      )), '\s+', ' ', 'g')) as expected_service_name,
      case
        when trim(coalesce(
          payload ->> 'expectedUpdatedAt',
          payload ->> 'eventVersion',
          payload ->> 'updatedAt',
          ''
        )) ~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
        then trim(coalesce(
          payload ->> 'expectedUpdatedAt',
          payload ->> 'eventVersion',
          payload ->> 'updatedAt'
        ))::timestamptz
        else null
      end as expected_updated_at
    from raw_events
  ),
  matched_anchors as (
    select distinct
      request.id,
      request.appointment_group_id,
      case lower(request.status::text)
        when 'auto_accepted' then 'accepted'
        when 'declined' then 'rejected'
        else lower(request.status::text)
      end as expected_status,
      lower(trim(coalesce(request.cancellation_source, ''))) as expected_cancellation_source,
      event.expected_updated_at
    from parsed_events as event
    join public.booking_requests as request
      on request.workspace_id = v_workspace_id
      and request.id = event.request_id
      and request.viewed_by_customer = false
      and case lower(request.status::text)
        when 'auto_accepted' then 'accepted'
        when 'declined' then 'rejected'
        else lower(request.status::text)
      end = event.expected_status
      and lower(trim(coalesce(request.cancellation_source, ''))) =
        event.expected_cancellation_source
      and request.appointment_date::text = event.expected_appointment_date
      and left(request.appointment_time::text, 5) = event.expected_appointment_time
      and lower(regexp_replace(trim(coalesce(request.requested_service_name, '')), '\s+', ' ', 'g')) =
        event.expected_service_name
      and event.expected_updated_at is not null
      and request.updated_at = event.expected_updated_at
      and (
        request.status::text <> 'pending'
        or request.operator_change_status = 'pending'
      )
      and (
        (
          v_customer_email is not null
          and lower(trim(coalesce(request.customer_email::text, ''))) =
            v_customer_email::text
        )
        or (
          v_customer_phone is not null
          and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
            v_customer_phone
        )
      )
  )
  update public.booking_requests as request
  set
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where request.workspace_id = v_workspace_id
    and request.viewed_by_customer = false
    and (
      request.status::text <> 'pending'
      or request.operator_change_status = 'pending'
    )
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) =
          v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
    )
    and exists (
      select 1
      from matched_anchors as anchor
      where (
        anchor.appointment_group_id is null
        and request.id = anchor.id
      )
      or (
        anchor.appointment_group_id is not null
        and request.appointment_group_id = anchor.appointment_group_id
        -- A later status or same-status mutation is a new event. Keep it
        -- unread even if another phase of the old group event was closed.
        and case lower(request.status::text)
          when 'auto_accepted' then 'accepted'
          when 'declined' then 'rejected'
          else lower(request.status::text)
        end = anchor.expected_status
        and lower(trim(coalesce(request.cancellation_source, ''))) =
          anchor.expected_cancellation_source
        and request.updated_at <= anchor.expected_updated_at
      )
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count > 0 then
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  end if;

  return v_updated_count;
end;
$$;

revoke all on function public.mark_public_booking_notification_events_viewed_v2(
  text, citext, text, jsonb
) from public;
grant execute on function public.mark_public_booking_notification_events_viewed_v2(
  text, citext, text, jsonb
) to anon, authenticated;

comment on function public.mark_public_booking_notification_events_viewed_v2(
  text, citext, text, jsonb
) is 'Marks only exact customer booking notification snapshots as viewed; linked phases with the same event/status are acknowledged atomically and pending operator-change notifications are supported.';

-- Every booking producer ultimately inserts into push_notifications through
-- queue_public_customer_push. Normalize there (via a table trigger) instead of
-- rewriting the many historical producer functions. This also covers legacy
-- and safety-net producers while leaving reminders, waitlist alerts and salon
-- communications untouched.
--
-- Some producers intentionally used statusCode for an event revision
-- (`rescheduled:*`, `operator_change_pending:*`) or serviceName for a rich
-- composition timeline. Preserve those values under eventStatusCode and
-- displayServiceName before publishing the exact booking-row CAS snapshot.

create or replace function public.normalize_public_customer_booking_push_payload_v2(
  p_workspace_id uuid,
  p_payload jsonb,
  p_queue_event_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_type text;
  v_target text;
  v_request_id_text text;
  v_group_id_text text;
  v_appointment_id_text text;
  v_request_id uuid;
  v_group_id uuid;
  v_appointment_id uuid;
  v_request public.booking_requests%rowtype;
  v_status_code text;
  v_previous_status jsonb;
  v_previous_status_code jsonb;
  v_previous_service_name jsonb;
begin
  if p_workspace_id is null then
    return v_payload;
  end if;

  v_type := lower(trim(coalesce(
    nullif(v_payload ->> 'type', ''),
    nullif(v_payload ->> 'event_type', ''),
    nullif(v_payload ->> 'eventType', ''),
    nullif(v_payload ->> 'notificationType', ''),
    nullif(v_payload ->> '_pushEventType', ''),
    nullif(p_queue_event_type, ''),
    ''
  )));
  v_target := lower(trim(coalesce(
    nullif(v_payload ->> '_pushTarget', ''),
    nullif(v_payload ->> '_pushAudience', ''),
    'client'
  )));

  if v_target in ('owner', 'auth')
    or v_type like '%reminder%'
    or v_type like '%waitlist%'
    or v_type like '%slot_available%'
    or v_type in ('customer_communication', 'owner_badge_refresh')
    or (
      v_type not like '%booking%'
      and v_type not like '%appointment%'
      and v_type not like '%operator_change%'
    )
  then
    return v_payload;
  end if;

  v_request_id_text := trim(coalesce(
    nullif(v_payload ->> 'bookingRequestId', ''),
    nullif(v_payload ->> 'requestId', ''),
    ''
  ));
  if v_request_id_text ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_request_id := v_request_id_text::uuid;
  end if;

  v_appointment_id_text := trim(coalesce(v_payload ->> 'appointmentId', ''));
  if v_appointment_id_text ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_appointment_id := v_appointment_id_text::uuid;
  end if;

  v_group_id_text := trim(coalesce(v_payload ->> 'appointmentGroupId', ''));
  if v_group_id_text ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_group_id := v_group_id_text::uuid;
  end if;

  if v_request_id is not null then
    select request.*
    into v_request
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and request.id = v_request_id;
  end if;

  if v_request.id is null and v_appointment_id is not null then
    select request.*
    into v_request
    from public.appointments as appointment
    join public.booking_requests as request
      on request.workspace_id = appointment.workspace_id
      and request.id = appointment.booking_request_id
    where appointment.workspace_id = p_workspace_id
      and appointment.id = v_appointment_id;
  end if;

  if v_request.id is null and v_group_id is not null then
    select request.*
    into v_request
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and request.appointment_group_id = v_group_id
    order by
      request.appointment_group_order nulls last,
      request.created_at,
      request.id
    limit 1;
  end if;

  -- Every audited customer booking producer supplies at least one stable
  -- request/appointment/group anchor. Do not guess by customer/date/service if
  -- an unknown future producer omits it: a wrong CAS snapshot is worse than an
  -- unacknowledgeable legacy push.
  if v_request.id is null then
    return v_payload;
  end if;

  v_status_code := lower(v_request.status::text);
  v_previous_status := coalesce(v_payload -> 'eventStatus', v_payload -> 'status');
  v_previous_status_code := coalesce(
    v_payload -> 'eventStatusCode',
    v_payload -> 'statusCode'
  );
  v_previous_service_name := coalesce(
    v_payload -> 'displayServiceName',
    v_payload -> 'serviceName'
  );

  return v_payload || jsonb_build_object(
    -- Preserve producer-specific presentation/revision values.
    'eventStatus', v_previous_status,
    'eventStatusCode', v_previous_status_code,
    'displayServiceName', v_previous_service_name,
    -- Canonical booking notification identity and exact CAS snapshot.
    'requestId', v_request.id,
    'bookingRequestId', v_request.id,
    'appointmentGroupId', v_request.appointment_group_id,
    'status', v_status_code,
    'statusCode', v_status_code,
    'bookingStatus', v_status_code,
    'bookingStatusCode', v_status_code,
    'cancellationSource', coalesce(v_request.cancellation_source, ''),
    'appointmentDate', v_request.appointment_date,
    'appointmentTime', to_char(v_request.appointment_time, 'HH24:MI'),
    'serviceName', v_request.requested_service_name,
    'anchorServiceName', v_request.requested_service_name,
    'updatedAt', v_request.updated_at,
    'eventAt', v_request.updated_at,
    'eventVersion', v_request.updated_at,
    'operatorChangeStatus', v_request.operator_change_status
  );
end;
$$;

revoke all on function public.normalize_public_customer_booking_push_payload_v2(
  uuid, jsonb, text
) from public;

create or replace function public.normalize_public_customer_booking_push_row_v2()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.device_id is not null
    and exists (
      select 1
      from public.push_devices as device
      where device.id = new.device_id
        and device.workspace_id = new.workspace_id
        and device.recipient_kind = 'client'
    )
  then
    new.payload := public.normalize_public_customer_booking_push_payload_v2(
      new.workspace_id,
      new.payload,
      new.event_type::text
    );
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_public_customer_booking_push_row_v2()
  from public;

-- PostgreSQL executes same-kind triggers alphabetically. The `a_` prefix keeps
-- normalization before the owner-created semantic dedupe below.
drop trigger if exists a_normalize_public_customer_booking_push_row_v2
  on public.push_notifications;
create trigger a_normalize_public_customer_booking_push_row_v2
before insert on public.push_notifications
for each row execute function public.normalize_public_customer_booking_push_row_v2();

-- Persist one semantic claim for an owner-created accepted appointment. This
-- bridges separate queue_public_customer_push invocations whose explicit
-- _dedupeKey values differ (appointment_created_by_salon versus the generic
-- accepted status event). A frontend-created request is deliberately not a
-- candidate unless an explicit owner-created event for that exact request/group
-- already proves that the two payloads describe the same logical event.

create or replace function public.owner_created_customer_accept_push_key_v1(
  p_workspace_id uuid,
  p_payload jsonb,
  p_assume_owner_created boolean default false
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_type text;
  v_status text;
  v_request_id_text text;
  v_group_id_text text;
  v_request_id uuid;
  v_group_id uuid;
  v_request_origin text;
  v_is_canonical boolean := false;
  v_is_generic boolean := false;
begin
  if p_workspace_id is null then
    return null;
  end if;

  v_type := lower(trim(coalesce(
    v_payload ->> 'type',
    v_payload ->> 'event_type',
    v_payload ->> 'notificationType',
    v_payload ->> '_pushEventType',
    ''
  )));
  v_status := lower(trim(coalesce(
    v_payload ->> 'statusCode',
    v_payload ->> 'status',
    ''
  )));
  v_is_canonical := v_type in (
    'appointment_created_by_salon',
    'owner_created_client_push'
  );
  v_is_generic := v_type = 'booking_request_status_changed';

  if not v_is_canonical and not v_is_generic then
    return null;
  end if;

  if v_is_generic and v_status not in ('accepted', 'auto_accepted', 'accettata') then
    return null;
  end if;

  if v_is_canonical
    and v_status not in ('', 'accepted', 'auto_accepted', 'accettata')
  then
    return null;
  end if;

  v_request_id_text := trim(coalesce(
    v_payload ->> 'bookingRequestId',
    v_payload ->> 'requestId',
    ''
  ));
  if v_request_id_text ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_request_id := v_request_id_text::uuid;
  end if;

  v_group_id_text := trim(coalesce(v_payload ->> 'appointmentGroupId', ''));
  if v_group_id_text ~*
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    v_group_id := v_group_id_text::uuid;
  end if;

  if v_request_id is not null then
    select request.appointment_group_id, request.origin::text
    into v_group_id, v_request_origin
    from public.booking_requests as request
    where request.workspace_id = p_workspace_id
      and request.id = v_request_id;

    -- Keep a valid group supplied by the canonical payload when an old
    -- technical request row has already been pruned.
    if not found and v_group_id_text ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      v_group_id := v_group_id_text::uuid;
    end if;
  end if;

  if v_is_generic
    and not p_assume_owner_created
    and coalesce(v_request_origin, '') <> 'backoffice'
  then
    return null;
  end if;

  if v_group_id is not null then
    return 'owner-created-accepted|group|' || v_group_id::text;
  end if;

  if v_request_id is not null then
    return 'owner-created-accepted|request|' || v_request_id::text;
  end if;

  return null;
end;
$$;

revoke all on function public.owner_created_customer_accept_push_key_v1(
  uuid, jsonb, boolean
) from public;

create table if not exists public.public_customer_push_semantic_claims (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  semantic_key text not null,
  notification_id uuid not null,
  device_id uuid references public.push_devices(id) on delete set null,
  claimed_kind text not null check (claimed_kind in ('canonical', 'generic')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, semantic_key)
);

create index if not exists public_customer_push_semantic_claim_notification_idx
  on public.public_customer_push_semantic_claims (notification_id);

alter table public.public_customer_push_semantic_claims enable row level security;

comment on table public.public_customer_push_semantic_claims is
  'Internal persistent cross-invocation claims for one customer push per logical owner-created accepted appointment.';

-- Seed claims from already-persisted deliveries so a delayed legacy caller
-- cannot enqueue the other representation after this migration is applied.
with semantic_notifications as (
  select
    notification.workspace_id,
    notification.device_id,
    notification.id as notification_id,
    notification.created_at,
    notification.status::text as delivery_status,
    public.owner_created_customer_accept_push_key_v1(
      notification.workspace_id,
      notification.payload,
      false
    ) as semantic_key,
    case
      when lower(trim(coalesce(
        notification.payload ->> 'type',
        notification.payload ->> 'event_type',
        notification.payload ->> 'notificationType',
        notification.payload ->> '_pushEventType',
        ''
      ))) in ('appointment_created_by_salon', 'owner_created_client_push')
      then 'canonical'
      else 'generic'
    end as claimed_kind
  from public.push_notifications as notification
  join public.push_devices as device
    on device.id = notification.device_id
    and device.recipient_kind = 'client'
  where notification.status::text in ('queued', 'processing', 'sent')
),
preferred_claims as (
  select distinct on (workspace_id, semantic_key)
    workspace_id,
    semantic_key,
    notification_id,
    device_id,
    claimed_kind
  from semantic_notifications
  where semantic_key is not null
  order by
    workspace_id,
    semantic_key,
    case delivery_status when 'sent' then 0 when 'processing' then 1 else 2 end,
    case claimed_kind when 'canonical' then 0 else 1 end,
    created_at,
    notification_id
)
insert into public.public_customer_push_semantic_claims (
  workspace_id,
  semantic_key,
  notification_id,
  device_id,
  claimed_kind
)
select
  preferred.workspace_id,
  preferred.semantic_key,
  preferred.notification_id,
  preferred.device_id,
  preferred.claimed_kind
from preferred_claims as preferred
on conflict (workspace_id, semantic_key) do nothing;

-- If deployment catches both representations while they are still queued,
-- retain the claimed delivery and remove only the other unsent duplicate.
-- Sent/processing history is never rewritten.
delete from public.push_notifications as duplicate
using public.public_customer_push_semantic_claims as claim
where duplicate.workspace_id = claim.workspace_id
  and duplicate.id <> claim.notification_id
  and duplicate.status::text = 'queued'
  and public.owner_created_customer_accept_push_key_v1(
    duplicate.workspace_id,
    duplicate.payload,
    true
  ) = claim.semantic_key;

create or replace function public.dedupe_owner_created_customer_accept_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_status text;
  v_semantic_key text;
  v_forced_semantic_key text;
  v_is_canonical boolean := false;
  v_is_generic boolean := false;
  v_claim public.public_customer_push_semantic_claims%rowtype;
  v_existing_id uuid;
  v_existing_status text;
  v_existing_kind text;
begin
  if new.workspace_id is null
    or new.device_id is null
    or not exists (
      select 1
      from public.push_devices as device
      where device.id = new.device_id
        and device.workspace_id = new.workspace_id
        and device.recipient_kind = 'client'
    )
  then
    return new;
  end if;

  v_type := lower(trim(coalesce(
    new.payload ->> 'type',
    new.payload ->> 'event_type',
    new.payload ->> 'notificationType',
    new.payload ->> '_pushEventType',
    ''
  )));
  v_status := lower(trim(coalesce(
    new.payload ->> 'statusCode',
    new.payload ->> 'status',
    ''
  )));
  v_is_canonical := v_type in (
    'appointment_created_by_salon',
    'owner_created_client_push'
  );
  v_is_generic := v_type = 'booking_request_status_changed'
    and v_status in ('accepted', 'auto_accepted', 'accettata');

  if not v_is_canonical and not v_is_generic then
    return new;
  end if;

  v_semantic_key := public.owner_created_customer_accept_push_key_v1(
    new.workspace_id,
    new.payload,
    false
  );

  -- A generic accepted event can be queued just before the writer persists
  -- origin=backoffice. It is suppressible only if the explicit canonical event
  -- for that exact request/group has already claimed the semantic identity.
  if v_semantic_key is null and v_is_generic then
    v_forced_semantic_key := public.owner_created_customer_accept_push_key_v1(
      new.workspace_id,
      new.payload,
      true
    );

    if v_forced_semantic_key is not null
      and exists (
        select 1
        from public.public_customer_push_semantic_claims as claim
        where claim.workspace_id = new.workspace_id
          and claim.semantic_key = v_forced_semantic_key
          and claim.claimed_kind = 'canonical'
      )
    then
      v_semantic_key := v_forced_semantic_key;
    else
      -- This remains a normal frontend-created acceptance.
      return new;
    end if;
  end if;

  if v_semantic_key is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    new.workspace_id::text || '|' || v_semantic_key,
    0
  ));

  select claim.*
  into v_claim
  from public.public_customer_push_semantic_claims as claim
  where claim.workspace_id = new.workspace_id
    and claim.semantic_key = v_semantic_key
  for update;

  if not found then
    -- Cover a generic row inserted just before this trigger existed or before
    -- its request origin became backoffice. An explicit canonical row may
    -- replace that row only while it is still safely queued.
    select
      notification.id,
      notification.status::text,
      case
        when lower(trim(coalesce(
          notification.payload ->> 'type',
          notification.payload ->> 'event_type',
          notification.payload ->> 'notificationType',
          notification.payload ->> '_pushEventType',
          ''
        ))) in ('appointment_created_by_salon', 'owner_created_client_push')
        then 'canonical'
        else 'generic'
      end
    into v_existing_id, v_existing_status, v_existing_kind
    from public.push_notifications as notification
    where notification.workspace_id = new.workspace_id
      and notification.id <> new.id
      and notification.status::text in ('queued', 'processing', 'sent')
      and public.owner_created_customer_accept_push_key_v1(
        notification.workspace_id,
        notification.payload,
        v_is_canonical
      ) = v_semantic_key
    order by
      case notification.status::text when 'sent' then 0 when 'processing' then 1 else 2 end,
      case
        when lower(trim(coalesce(
          notification.payload ->> 'type',
          notification.payload ->> 'event_type',
          notification.payload ->> 'notificationType',
          notification.payload ->> '_pushEventType',
          ''
        ))) in ('appointment_created_by_salon', 'owner_created_client_push')
        then 0
        else 1
      end,
      notification.created_at,
      notification.id
    limit 1;

    if v_existing_id is not null then
      insert into public.public_customer_push_semantic_claims (
        workspace_id,
        semantic_key,
        notification_id,
        device_id,
        claimed_kind
      )
      select
        new.workspace_id,
        v_semantic_key,
        v_existing_id,
        notification.device_id,
        v_existing_kind
      from public.push_notifications as notification
      where notification.id = v_existing_id
      on conflict (workspace_id, semantic_key) do nothing;

      if v_is_canonical
        and v_existing_kind = 'generic'
        and v_existing_status = 'queued'
      then
        delete from public.push_notifications
        where id = v_existing_id
          and status::text = 'queued';

        if found then
          update public.public_customer_push_semantic_claims
          set
            notification_id = new.id,
            device_id = new.device_id,
            claimed_kind = 'canonical',
            updated_at = timezone('utc', now())
          where workspace_id = new.workspace_id
            and semantic_key = v_semantic_key;

          return new;
        end if;

        -- The worker claimed it between inspection and deletion.
        return null;
      end if;

      return null;
    end if;

    insert into public.public_customer_push_semantic_claims (
      workspace_id,
      semantic_key,
      notification_id,
      device_id,
      claimed_kind
    )
    values (
      new.workspace_id,
      v_semantic_key,
      new.id,
      new.device_id,
      case when v_is_canonical then 'canonical' else 'generic' end
    );

    return new;
  end if;

  select notification.status::text
  into v_existing_status
  from public.push_notifications as notification
  where notification.id = v_claim.notification_id;

  -- Failed deliveries may be retried by a later invocation. A missing row is
  -- treated as an already-retained historical claim, so cleanup cannot make a
  -- duplicate old appointment deliverable again.
  if v_existing_status = 'failed' then
    update public.public_customer_push_semantic_claims
    set
      notification_id = new.id,
      device_id = new.device_id,
      claimed_kind = case when v_is_canonical then 'canonical' else 'generic' end,
      updated_at = timezone('utc', now())
    where workspace_id = new.workspace_id
      and semantic_key = v_semantic_key;

    return new;
  end if;

  if v_is_canonical
    and v_claim.claimed_kind = 'generic'
    and v_existing_status = 'queued'
  then
    delete from public.push_notifications
    where id = v_claim.notification_id
      and status::text = 'queued';

    if found then
      update public.public_customer_push_semantic_claims
      set
        notification_id = new.id,
        device_id = new.device_id,
        claimed_kind = 'canonical',
        updated_at = timezone('utc', now())
      where workspace_id = new.workspace_id
        and semantic_key = v_semantic_key;

      return new;
    end if;

    -- The worker already moved the generic row to processing.
    return null;
  end if;

  return null;
end;
$$;

revoke all on function public.dedupe_owner_created_customer_accept_push_v1()
  from public;

drop trigger if exists dedupe_owner_created_customer_accept_push_v1
  on public.push_notifications;
create trigger dedupe_owner_created_customer_accept_push_v1
before insert on public.push_notifications
for each row execute function public.dedupe_owner_created_customer_accept_push_v1();

notify pgrst, 'reload schema';
