alter type public.push_delivery_status add value if not exists 'processing';

notify pgrst, 'reload schema';

select public.process_due_auto_accept_booking_requests(200);
