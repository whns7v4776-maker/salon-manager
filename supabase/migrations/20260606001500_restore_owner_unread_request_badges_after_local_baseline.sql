-- Restore owner unread badges after the removed local baseline accidentally marked
-- existing frontend requests as viewed when a fresh dev build had empty storage.
update public.booking_requests
set viewed_by_salon = false
where viewed_by_salon = true
  and coalesce(origin, 'frontend') = 'frontend'
  and (
    status = 'pending'
    or (
      status = 'cancelled'
      and coalesce(cancellation_source, '') in ('customer', 'cliente')
    )
  );
