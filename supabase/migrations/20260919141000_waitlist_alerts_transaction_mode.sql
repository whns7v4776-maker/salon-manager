-- Listing alerts also processes availability and updates expired subscriptions.
-- PostgREST must allow a read-write transaction for that existing behavior.
alter function public.get_public_customer_waitlist_alerts_v2(text,citext,text) volatile;
notify pgrst, 'reload schema';
