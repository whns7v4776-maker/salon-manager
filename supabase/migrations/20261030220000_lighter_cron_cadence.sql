-- Micro compute was saturated by sub-minute jobs: auto-accept keeps its
-- per-minute catch-up, and slot holds tolerate half a minute of delay.
select cron.alter_job(jobid, schedule := '15 seconds')
from cron.job where jobname = 'process-auto-accept-booking-requests-every-5-seconds';

select cron.alter_job(jobid, schedule := '30 seconds')
from cron.job where jobname = 'release-owner-slot-holds';
