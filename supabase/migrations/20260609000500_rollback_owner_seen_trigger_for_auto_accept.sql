drop trigger if exists keep_owner_accepted_booking_requests_seen_trigger on public.booking_requests;
drop function if exists public.keep_owner_accepted_booking_requests_seen();

delete from public.push_notifications as notification
using public.push_devices as device,
      public.booking_requests as booking_request
where notification.device_id = device.id
  and device.recipient_kind = 'owner'
  and notification.event_type = 'booking_request_created'
  and notification.status = 'queued'
  and nullif(
    trim(coalesce(notification.payload ->> 'bookingRequestId', notification.payload ->> 'requestId', '')),
    ''
  ) = booking_request.id::text
  and booking_request.status = 'accepted'::public.request_status;

notify pgrst, 'reload schema';
