-- Cancellations, bookings and released holds already refresh the waitlist on
-- the spot; this sweep is only a safety net, so every five minutes is enough.
select cron.alter_job(jobid, schedule := '*/5 * * * *')
from cron.job where jobname = 'refresh-pending-waitlist-ranges';
