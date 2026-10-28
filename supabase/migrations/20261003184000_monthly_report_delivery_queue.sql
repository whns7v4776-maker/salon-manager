alter table monthly_financial_reports add column closed_at timestamptz;
create or replace function public.queue_monthly_financial_reports() returns void language plpgsql security definer set search_path=public as $$
declare m date=(date_trunc('month',now() at time zone 'Europe/Rome')-interval '1 month')::date;begin
 if extract(day from now() at time zone 'Europe/Rome')=1 and extract(hour from now() at time zone 'Europe/Rome')<9 then return;end if;
 insert into monthly_financial_reports(workspace_id,month,snapshot,recipient,closed_at)
 select w.id,m,financial_month_snapshot(w.id,m),w.owner_email,now() from workspaces w join monthly_report_settings s on s.workspace_id=w.id
 where s.enabled and s.start_month<=m and not exists(select 1 from monthly_financial_reports r where r.workspace_id=w.id and r.month=m and r.closed_at is not null)
 on conflict(workspace_id,month) do update set snapshot=excluded.snapshot,recipient=excluded.recipient,closed_at=excluded.closed_at
 where monthly_financial_reports.status='ready' and monthly_financial_reports.attempts=0;
end $$;
create or replace function public.claim_monthly_financial_reports() returns setof monthly_financial_reports language sql security definer set search_path=public as $$
 update monthly_financial_reports r set status='sending',attempts=attempts+1,lease_until=now()+interval '10 minutes'
 where r.id in (select f.id from monthly_financial_reports f join monthly_report_settings s on s.workspace_id=f.workspace_id
 where s.enabled and f.closed_at is not null and f.month>=s.start_month and f.month<date_trunc('month',now() at time zone 'Europe/Rome')::date and f.attempts<5
 and ((f.status in ('ready','failed') and (f.lease_until is null or f.lease_until<now())) or (f.status='sending' and f.lease_until<now()))
 order by f.created_at for update of f skip locked limit 1) returning r.*;
$$;
revoke all on function queue_monthly_financial_reports(),claim_monthly_financial_reports() from public,anon,authenticated;
grant execute on function queue_monthly_financial_reports(),claim_monthly_financial_reports() to service_role;
select cron.schedule('monthly-financial-report','0 * * * *','select public.queue_monthly_financial_reports();');
select cron.schedule('monthly-financial-report-delivery','* * * * *',$job$
 do $$begin
 if exists(select 1 from monthly_financial_reports r join monthly_report_settings s on s.workspace_id=r.workspace_id where s.enabled and r.closed_at is not null and r.attempts<5 and r.status<>'sent' and (r.lease_until is null or r.lease_until<now())) then
 perform net.http_post(url:='https://mlzrtpqphsdfgsklacmu.supabase.co/functions/v1/monthly-report',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"action":"dispatch"}'::jsonb);
 end if;
 end $$;
$job$);
notify pgrst,'reload schema';
