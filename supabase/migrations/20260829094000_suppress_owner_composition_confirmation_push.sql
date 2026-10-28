-- A composition created by the salon is already represented by the single
-- appointment_created_by_salon group push. Its technical booking-request rows
-- are born accepted, but that must not turn them into a second customer
-- "Prenotazione confermata" event. Customer-created groups still use the
-- accepted status push; rejected and cancelled groups keep their existing
-- behavior unchanged.

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
  v_backoffice integer := 0;
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
    count(*) filter (where request.origin::text = 'backoffice'),
    max(coalesce(request.cancellation_source, '')) filter (
      where request.status = 'cancelled'::public.request_status
    )
  into
    v_total,
    v_accepted,
    v_rejected,
    v_cancelled,
    v_backoffice,
    v_cancellation_source
  from public.booking_requests as request
  where request.workspace_id = new.workspace_id
    and request.appointment_group_id = new.id;

  if v_total > 0 and v_accepted = v_total then
    -- All-backoffice groups are owner creations. Their canonical finalizer
    -- emits exactly one "Appuntamento aggiunto dal salone" group push.
    if v_backoffice <> v_total then
      perform public.queue_booking_group_status_push_v1(
        new.workspace_id, new.id, 'accepted'::public.request_status, null
      );
    end if;
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

notify pgrst, 'reload schema';
