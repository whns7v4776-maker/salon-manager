do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'process-auto-accept-booking-requests-every-15-seconds'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'process-auto-accept-booking-requests-every-5-seconds'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

select cron.schedule(
  'process-auto-accept-booking-requests-every-5-seconds',
  '5 seconds',
  $$
  select public.process_due_auto_accept_booking_requests(50);
  $$
);
