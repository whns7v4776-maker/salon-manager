do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'invoke-send-push-every-minute'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

select cron.schedule(
  'invoke-send-push-every-minute',
  '* * * * *',
  $$
  select
    net.http_post(
      url:='https://mlzrtpqphsdfgsklacmu.supabase.co/functions/v1/send-push',
      headers:=jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body:='{"limit":50}'::jsonb
    ) as request_id;
  $$
);
