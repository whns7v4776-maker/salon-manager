-- Check a five-minute hold even while the customer has closed the app.
-- The worker expires/verifies Stripe before releasing capacity. Its twenty
-- leases run with concurrent I/O, so the request timeout covers provider calls.
do $schedule$
declare job bigint;endpoint text;
begin
  if not exists(select 1 from pg_namespace where nspname='cron')
    or not exists(select 1 from pg_namespace where nspname='net') then
    raise exception 'booking_payment_hold_scheduler_unavailable';
  end if;
  select jobid into job from cron.job where jobname='booking-payment-hold-reconciliation' limit 1;
  if job is not null then perform cron.unschedule(job);end if;
  endpoint='https://mlzrtpqphsdfgsklacmu.supabase.co/functions/v1/cash-stripe?action=booking-sweep';
  perform cron.schedule('booking-payment-hold-reconciliation','15 seconds',
    format('select net.http_post(url := %L, headers := ''{"Content-Type":"application/json"}''::jsonb, body := ''{}''::jsonb, timeout_milliseconds := 120000);',endpoint));
end $schedule$;
