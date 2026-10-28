-- The exact notification reader was added to an already-applied migration in
-- one environment, so the migration history could say "applied" while
-- PostgREST legitimately had no callable function. Publish it in a new,
-- forward-only migration and force a schema-cache reload.

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

notify pgrst, 'reload schema';
