-- Closed reports must not be rewritten by a later manual preview.
create or replace function public.prepare_financial_month(p_month date) returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=financial_report_workspace();rid uuid;begin
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month>date_trunc('month',now() at time zone 'Europe/Rome')::date or p_month<'2020-01-01' then raise exception 'Mese non valido';end if;
 insert into monthly_financial_reports(workspace_id,month,snapshot,recipient)
 select w,p_month,financial_month_snapshot(w,p_month),owner_email from workspaces where id=w
 on conflict(workspace_id,month) do update set snapshot=excluded.snapshot where monthly_financial_reports.status='ready' and monthly_financial_reports.attempts=0 and monthly_financial_reports.closed_at is null returning id into rid;
 if rid is null then select id into rid from monthly_financial_reports where workspace_id=w and month=p_month;end if;return rid;
end $$;
