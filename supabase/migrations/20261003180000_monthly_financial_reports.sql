-- Expenses are cash outflows, separate from sales and stock quantities.
create table public.salon_expenses (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id),
 expense_date date not null, category text not null check(category in ('Affitto','Utenze','Fornitori','Prodotti','Servizi','Altro')),
 description text not null check(length(trim(description)) between 1 and 300),
 amount_cents bigint not null check(amount_cents between 1 and 1000000000),
 paid boolean not null default true, revision integer not null default 1, created_by uuid not null default auth.uid(), created_at timestamptz not null default now()
);
create table public.monthly_report_settings (
 workspace_id uuid primary key references workspaces(id), enabled boolean not null default false,
 start_month date not null default date_trunc('month',now() at time zone 'Europe/Rome')::date
);
create table public.monthly_financial_reports (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),month date not null,
 snapshot jsonb not null, email_payload jsonb, recipient text not null, status text not null default 'ready' check(status in ('ready','sending','sent','failed')),
 attempts integer not null default 0, lease_until timestamptz, sent_at timestamptz, created_at timestamptz not null default now(),
 unique(workspace_id,month),check(month=date_trunc('month',month)::date)
);
create index salon_expenses_period on salon_expenses(workspace_id,expense_date);
do $$ declare t text; begin
 foreach t in array array['salon_expenses','monthly_report_settings','monthly_financial_reports'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public,anon,authenticated',t);
 execute format('grant select on %I to authenticated',t);
 execute format('grant all on %I to service_role',t);
 execute format('create policy owner_read on %I for select to authenticated using(workspace_id=shop_workspace(false))',t);
 end loop;
end $$;
create function public.save_salon_expense(p_id uuid,p_date date,p_category text,p_description text,p_amount bigint,p_paid boolean,p_revision integer default 0)
returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);begin
 if p_date is null or p_date>current_date then raise exception 'Data spesa non valida';end if;
 insert into salon_expenses(id,workspace_id,expense_date,category,description,amount_cents,paid)
 values(p_id,w,p_date,p_category,trim(p_description),p_amount,p_paid)
 on conflict(id) do update set expense_date=excluded.expense_date,category=excluded.category,description=excluded.description,amount_cents=excluded.amount_cents,paid=excluded.paid,revision=salon_expenses.revision+1
 where salon_expenses.workspace_id=w and (salon_expenses.revision=p_revision or (p_revision=0 and salon_expenses.expense_date=excluded.expense_date and salon_expenses.category=excluded.category and salon_expenses.description=excluded.description and salon_expenses.amount_cents=excluded.amount_cents and salon_expenses.paid=excluded.paid));
 if not found then raise exception 'Spesa modificata su un altro dispositivo: ricarica e riprova';end if;
end $$;
create function public.delete_salon_expense(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin delete from salon_expenses where id=p_id and workspace_id=shop_workspace(false);end $$;
create function public.set_monthly_report_enabled(p_enabled boolean) returns void language plpgsql security definer set search_path=public as $$
begin insert into monthly_report_settings(workspace_id,enabled) values(shop_workspace(false),p_enabled)
 on conflict(workspace_id) do update set enabled=excluded.enabled;end $$;
-- Full SQL aggregates avoid the REST row limit. All dates use the salon timezone.
create function public.financial_month_snapshot(p_workspace uuid,p_month date) returns jsonb
language plpgsql security definer set search_path=public as $$
declare lo timestamptz=(p_month::timestamp at time zone 'Europe/Rome'); hi timestamptz=((p_month+interval '1 month')::timestamp at time zone 'Europe/Rome');result jsonb;begin
 select jsonb_build_object('version',1,'month',p_month,'salon',w.salon_name,
 'expenses',coalesce((select jsonb_agg(to_jsonb(e) order by expense_date,id) from salon_expenses e where workspace_id=w.id and expense_date>=p_month and expense_date<p_month+interval '1 month'),'[]'::jsonb),
 'cash',coalesce((select jsonb_agg(to_jsonb(c) order by created_at,id) from cash_movements c where workspace_id=w.id and created_at>=lo and created_at<hi and coalesce(to_jsonb(c)->>'booking_voided','false')<>'true'),'[]'::jsonb),
 'sales',coalesce((select jsonb_agg(to_jsonb(s) order by created_at,id) from shop_sales s where workspace_id=w.id and created_at>=lo and created_at<hi),'[]'::jsonb),
 'saleLines',coalesce((select jsonb_agg(to_jsonb(l)) from shop_sale_lines l join shop_sales s on s.id=l.sale_id and s.workspace_id=l.workspace_id where s.workspace_id=w.id and s.created_at>=lo and s.created_at<hi),'[]'::jsonb),
 'returns',coalesce((select jsonb_agg(to_jsonb(r)) from shop_returns r where workspace_id=w.id and created_at>=lo and created_at<hi),'[]'::jsonb),
 'stock',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('name',p.name,'action',o.payload->>'action')) from shop_stock_movements m join shop_products p on p.id=m.product_id and p.workspace_id=m.workspace_id join shop_operations o on o.id=m.operation_id and o.workspace_id=m.workspace_id where m.workspace_id=w.id and m.created_at>=lo and m.created_at<hi),'[]'::jsonb)) into result from workspaces w where id=p_workspace;
 return result;
end $$;
revoke all on function financial_month_snapshot(uuid,date) from public,anon,authenticated;
grant execute on function financial_month_snapshot(uuid,date) to service_role;
create function public.prepare_financial_month(p_month date) returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);rid uuid;begin
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_month>date_trunc('month',now() at time zone 'Europe/Rome')::date or p_month<'2020-01-01' then raise exception 'Mese non valido';end if;
 insert into monthly_financial_reports(workspace_id,month,snapshot,recipient)
 select w,p_month,financial_month_snapshot(w,p_month),owner_email from workspaces where id=w
 on conflict(workspace_id,month) do update set snapshot=excluded.snapshot where monthly_financial_reports.status='ready' and monthly_financial_reports.attempts=0 returning id into rid;
 if rid is null then select id into rid from monthly_financial_reports where workspace_id=w and month=p_month;end if;return rid;
end $$;
-- Close only completed months. Opt-in starts with the month in which it was enabled.
create function public.queue_monthly_financial_reports() returns void language plpgsql security definer set search_path=public as $$
declare m date=(date_trunc('month',now() at time zone 'Europe/Rome')-interval '1 month')::date;begin
 if extract(day from now() at time zone 'Europe/Rome')=1 and extract(hour from now() at time zone 'Europe/Rome')<9 then return;end if;
 insert into monthly_financial_reports(workspace_id,month,snapshot,recipient)
 select w.id,m,financial_month_snapshot(w.id,m),w.owner_email from workspaces w join monthly_report_settings s on s.workspace_id=w.id
 where s.enabled and s.start_month<=m on conflict(workspace_id,month) do nothing;
end $$;
create function public.claim_monthly_financial_reports() returns setof monthly_financial_reports language sql security definer set search_path=public as $$
 update monthly_financial_reports r set status='sending',attempts=attempts+1,lease_until=now()+interval '10 minutes'
 where r.id in (select f.id from monthly_financial_reports f join monthly_report_settings s on s.workspace_id=f.workspace_id
 where s.enabled and f.month>=s.start_month and not (extract(day from now() at time zone 'Europe/Rome')=1 and extract(hour from now() at time zone 'Europe/Rome')<9) and f.month<date_trunc('month',now() at time zone 'Europe/Rome')::date and f.attempts<5
 and ((f.status in ('ready','failed') and (f.lease_until is null or f.lease_until<now())) or (f.status='sending' and f.lease_until<now()))
 order by f.created_at for update of f skip locked limit 1) returning r.*;
$$;
revoke all on function queue_monthly_financial_reports(),claim_monthly_financial_reports() from public,anon,authenticated;
grant execute on function queue_monthly_financial_reports(),claim_monthly_financial_reports() to service_role;
revoke all on function save_salon_expense(uuid,date,text,text,bigint,boolean,integer),delete_salon_expense(uuid),set_monthly_report_enabled(boolean),prepare_financial_month(date) from public,anon;
grant execute on function save_salon_expense(uuid,date,text,text,bigint,boolean,integer),delete_salon_expense(uuid),set_monthly_report_enabled(boolean),prepare_financial_month(date) to authenticated;
select cron.schedule('monthly-financial-report','0 * * * *',$job$
 select public.queue_monthly_financial_reports();
 select net.http_post(url:='https://mlzrtpqphsdfgsklacmu.supabase.co/functions/v1/monthly-report',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"action":"dispatch"}'::jsonb);
$job$);
