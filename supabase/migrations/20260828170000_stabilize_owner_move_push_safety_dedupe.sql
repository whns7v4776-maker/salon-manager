-- The direct owner-move RPC queues the customer push atomically. The client
-- also has a delayed safety-net after publishing the portal snapshot. A later
-- resize can update appointments.updated_at before that safety-net runs; v2
-- would then derive a different move revision and enqueue the same push twice.
--
-- v3 receives the revision returned by the original move. If the atomic row
-- for that exact mutation already exists, the safety-net is a no-op. A later
-- legitimate move still has a new revision and therefore remains deliverable.

create or replace function public.queue_customer_appointment_rescheduled_push_v3(
  p_workspace_id uuid,
  p_booking_request_id uuid,
  p_appointment_id uuid,
  p_previous_date date,
  p_previous_time time,
  p_next_date date,
  p_next_time time,
  p_service_name text,
  p_customer_name text,
  p_operator_name text default null,
  p_previous_operator_name text default null,
  p_move_revision text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revision_input text := nullif(trim(coalesce(p_move_revision, '')), '');
  v_revision text;
  v_original_dedupe_key text;
begin
  if v_revision_input ~ '^[0-9]{20}$' then
    v_revision := v_revision_input;
  elsif v_revision_input is not null then
    begin
      v_revision := to_char(
        v_revision_input::timestamptz at time zone 'UTC',
        'YYYYMMDDHH24MISSUS'
      );
    exception
      when others then
        v_revision := null;
    end;
  end if;

  if p_workspace_id is not null
    and p_booking_request_id is not null
    and v_revision is not null then
    v_original_dedupe_key := lower(
      p_workspace_id::text || '|appointment_rescheduled_by_salon|' ||
      coalesce(p_appointment_id::text, p_booking_request_id::text) ||
      '|move|' || v_revision
    );

    if exists (
      select 1
      from public.push_notifications as notification
      where notification.workspace_id = p_workspace_id
        and notification.status::text in ('queued', 'processing', 'sent')
        and lower(
          trim(coalesce(notification.payload ->> '_dedupeKey', ''))
        ) = v_original_dedupe_key
    ) then
      return 0;
    end if;
  end if;

  -- No atomic row was found (or an older caller supplied no usable revision):
  -- preserve the established v2 safety behavior.
  return public.queue_customer_appointment_rescheduled_push_v2(
    p_workspace_id,
    p_booking_request_id,
    p_appointment_id,
    p_previous_date,
    p_previous_time,
    p_next_date,
    p_next_time,
    p_service_name,
    p_customer_name,
    p_operator_name,
    p_previous_operator_name
  );
end;
$$;

revoke all on function public.queue_customer_appointment_rescheduled_push_v3(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) from public, anon;
grant execute on function public.queue_customer_appointment_rescheduled_push_v3(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) to authenticated, service_role;

comment on function public.queue_customer_appointment_rescheduled_push_v3(
  uuid, uuid, uuid, date, time, date, time, text, text, text, text, text
) is 'Queues the delayed owner-move safety push without changing the original move revision after later appointment mutations.';

notify pgrst, 'reload schema';
