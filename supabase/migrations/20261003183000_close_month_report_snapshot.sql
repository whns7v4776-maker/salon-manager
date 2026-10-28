-- A preview downloaded during the month must be refreshed when the month closes.
create or replace function public.queue_monthly_financial_reports() returns void language plpgsql security definer set search_path=public as $$
declare m date=(date_trunc('month',now() at time zone 'Europe/Rome')-interval '1 month')::date;begin
 if extract(day from now() at time zone 'Europe/Rome')=1 and extract(hour from now() at time zone 'Europe/Rome')<9 then return;end if;
 insert into monthly_financial_reports(workspace_id,month,snapshot,recipient)
 select w.id,m,financial_month_snapshot(w.id,m),w.owner_email from workspaces w join monthly_report_settings s on s.workspace_id=w.id
 where s.enabled and s.start_month<=m
 on conflict(workspace_id,month) do update set snapshot=excluded.snapshot,recipient=excluded.recipient
 where monthly_financial_reports.status='ready' and monthly_financial_reports.attempts=0;
end $$;
revoke all on function queue_monthly_financial_reports() from public,anon,authenticated;
grant execute on function queue_monthly_financial_reports() to service_role;
