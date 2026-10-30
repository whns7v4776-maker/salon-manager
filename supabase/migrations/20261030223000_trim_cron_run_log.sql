-- pg_cron keeps one log row per run and never trims it; with sub-minute jobs
-- the log reached 1 GB and exhausted the Micro disk IO budget. Only that log
-- is trimmed here, never application data.
select cron.unschedule(jobid) from cron.job where jobname = 'trim-cron-run-log';
select cron.schedule(
  'trim-cron-run-log',
  '17 * * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '6 hours'$$
);
