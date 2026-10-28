-- A salon cancellation is one terminal customer event even when an older app
-- queues its legacy fallback with a producer-specific explicit _dedupeKey.
-- Keep every other push family and the generic explicit-key guard unchanged.

begin;

create or replace function public.prevent_duplicate_terminal_salon_cancellation_push_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking_request_id text := nullif(
    trim(
      coalesce(
        new.payload ->> 'bookingRequestId',
        new.payload ->> 'requestId',
        ''
      )
    ),
    ''
  );
  v_status_code text := lower(
    nullif(
      trim(
        coalesce(
          new.payload ->> 'statusCode',
          new.payload ->> 'status',
          ''
        )
      ),
      ''
    )
  );
  v_cancellation_source text := lower(
    nullif(trim(coalesce(new.payload ->> 'cancellationSource', '')), '')
  );
begin
  if new.status::text not in ('queued', 'processing', 'sent')
    or v_booking_request_id is null
    or v_status_code <> 'cancelled'
    or v_cancellation_source <> 'salone'
    or new.event_type::text not in (
      'booking_request_status_changed',
      'appointment_cancelled',
      'custom'
    )
  then
    return new;
  end if;

  -- The request id is the canonical identity for this one terminal event.
  -- Serialize independently from _dedupeKey so DB-trigger and legacy-app
  -- producers cannot both enqueue it for the same customer device.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'salonpro:push-terminal-salon-cancel:' ||
      new.workspace_id::text || ':' ||
      coalesce(new.device_id::text, 'no-device') || ':' ||
      v_booking_request_id,
      0
    )
  );

  if exists (
    select 1
    from public.push_notifications as notification
    where notification.workspace_id = new.workspace_id
      and notification.device_id is not distinct from new.device_id
      and notification.status::text in ('queued', 'processing', 'sent')
      and notification.event_type::text in (
        'booking_request_status_changed',
        'appointment_cancelled',
        'custom'
      )
      and nullif(
        trim(
          coalesce(
            notification.payload ->> 'bookingRequestId',
            notification.payload ->> 'requestId',
            ''
          )
        ),
        ''
      ) = v_booking_request_id
      and lower(
        nullif(
          trim(
            coalesce(
              notification.payload ->> 'statusCode',
              notification.payload ->> 'status',
              ''
            )
          ),
          ''
        )
      ) = 'cancelled'
      and lower(
        nullif(
          trim(
            coalesce(notification.payload ->> 'cancellationSource', '')
          ),
          ''
        )
      ) = 'salone'
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists b_prevent_duplicate_terminal_salon_cancellation_push
  on public.push_notifications;

-- Trigger names are ordered for the same timing/event. Run after the existing
-- a_normalize_* customer-push normalizer and before the generic key guard.
create trigger b_prevent_duplicate_terminal_salon_cancellation_push
before insert on public.push_notifications
for each row
execute function public.prevent_duplicate_terminal_salon_cancellation_push_v1();

revoke all on function public.prevent_duplicate_terminal_salon_cancellation_push_v1()
  from public, anon, authenticated;

commit;
