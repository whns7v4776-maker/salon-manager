-- Execute inside BEGIN / ROLLBACK: no expenses, reports or settings are retained.
do $$ declare w uuid;owner_id uuid;eid uuid=gen_random_uuid();first_id uuid;second_id uuid;s jsonb;blocked boolean=false;begin
 select m.workspace_id,m.user_id into w,owner_id from workspace_members m where role='owner' limit 1;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'role','authenticated')::text,true);
 if has_function_privilege('anon','public.financial_month_snapshot(uuid,date)','execute') or has_function_privilege('authenticated','public.claim_monthly_financial_reports()','execute') then raise exception 'Report worker access leak';end if;
 s=financial_month_snapshot(w,'2026-09-01');
 if jsonb_typeof(s->'cash')<>'array' or jsonb_typeof(s->'expenses')<>'array' then raise exception 'snapshot shape';end if;
 perform save_salon_expense(eid,current_date,'Altro','QA monthly expense',12345,true,0);
 perform save_salon_expense(eid,current_date,'Altro','QA monthly expense',12345,true,0);
 if (select count(*) from salon_expenses where id=eid)<>1 then raise exception 'idempotency';end if;
 begin perform save_salon_expense(eid,current_date,'Altro','QA changed expense',23456,true,0);exception when others then blocked=true;end;
 if not blocked then raise exception 'stale revision accepted';end if;
 perform delete_salon_expense(eid);
 insert into monthly_report_settings(workspace_id,enabled,start_month) values(w,true,'1999-01-01') on conflict(workspace_id) do update set enabled=true,start_month='1999-01-01';
 insert into monthly_financial_reports(workspace_id,month,snapshot,recipient,closed_at) values(w,'1999-01-01','{}','qa@example.invalid',now());
 select id into first_id from claim_monthly_financial_reports() limit 1;
 select id into second_id from claim_monthly_financial_reports() limit 1;
 if first_id is null or first_id=second_id then raise exception 'Delivery lease failed';end if;
 update monthly_report_settings set enabled=false where workspace_id=w;
 if exists(select 1 from claim_monthly_financial_reports() where workspace_id=w) then raise exception 'Opt-out ignored';end if;
end $$;
