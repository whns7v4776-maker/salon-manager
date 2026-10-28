drop trigger if exists client_booking_status_push_fallback_trigger on public.booking_requests;
drop function if exists public.queue_client_booking_status_push_fallback();

delete from public.push_notifications
where status = 'queued'
  and event_type = 'booking_request_status_changed'
  and coalesce(payload ->> '_pushTarget', '') = 'client'
  and coalesce(payload ->> '_dedupeKey', '') like '%client-booking-status-fallback%';

notify pgrst, 'reload schema';
