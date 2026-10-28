-- Report reading is independent of Shop activation and does not expose Shop's internal mutation helper.
create or replace function public.financial_report_workspace() returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id();begin
 if w is null or not workspace_access_allowed() or not exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and role='owner') then raise exception 'Accesso non consentito';end if;
 return w;
end $$;
revoke all on function financial_report_workspace() from public,anon;
grant execute on function financial_report_workspace() to authenticated;
do $$ declare t text;begin
 foreach t in array array['salon_expenses','monthly_report_settings','monthly_financial_reports'] loop
 execute format('drop policy owner_read on %I',t);
 execute format('create policy owner_read on %I for select to authenticated using(workspace_id=(select financial_report_workspace()))',t);
 end loop;
end $$;
notify pgrst,'reload schema';
