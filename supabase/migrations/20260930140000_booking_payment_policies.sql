-- Booking payment preferences are independent from subscription and acceptance policies.
-- No backfill: existing reservations retain their original payment arrangements.
create table public.booking_payment_policies (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 customer_id uuid references public.customers(id) on delete cascade,
 mode text not null check(mode in ('salon','full','deposit','inherit')),
 percent integer not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now(),
 check((mode='inherit' and customer_id is not null and percent=0) or (mode='salon' and percent=0) or (mode='full' and percent=100) or (mode='deposit' and percent between 1 and 99))
);
create unique index booking_payment_salon_policy on public.booking_payment_policies(workspace_id) where customer_id is null;
create unique index booking_payment_customer_policy on public.booking_payment_policies(workspace_id,customer_id) where customer_id is not null;
alter table public.booking_payment_policies enable row level security;
revoke all on public.booking_payment_policies from public,anon,authenticated;
grant select on public.booking_payment_policies to authenticated;
grant all on public.booking_payment_policies to service_role;
create policy booking_payment_policy_owner_read on public.booking_payment_policies for select to authenticated
 using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed());
create trigger booking_payment_policy_revision after insert or update or delete on public.booking_payment_policies
 for each row execute function public.touch_cash_sync_revision();

-- Only the payment endpoint can save: it first verifies the Stripe account and rollout.
create function public.save_booking_payment_policy(p_workspace uuid,p_customer uuid,p_mode text,p_percent integer,p_expected_revision bigint)
returns jsonb language plpgsql security definer set search_path=public as $$
declare previous booking_payment_policies; saved booking_payment_policies;
begin
 perform 1 from workspaces where id=p_workspace for update;
 if not found then raise exception 'Salone non trovato'; end if;
 if p_customer is not null and not exists(select 1 from customers where id=p_customer and workspace_id=p_workspace) then
  raise exception 'Cliente non trovato nel salone';
 end if;
 select * into previous from booking_payment_policies where workspace_id=p_workspace and customer_id is not distinct from p_customer;
 if coalesce(previous.revision,0) is distinct from p_expected_revision then
  raise exception 'Impostazione modificata da un altro dispositivo. Ricarica prima di salvare.';
 end if;
 if p_mode is null or p_percent is null or not (
  (p_mode='inherit' and p_customer is not null and p_percent=0) or (p_mode='salon' and p_percent=0) or (p_mode='full' and p_percent=100) or (p_mode='deposit' and p_percent between 1 and 99)
 ) then raise exception 'Regola di pagamento non valida'; end if;
 if previous.id is null then
  insert into booking_payment_policies(workspace_id,customer_id,mode,percent)
  values(p_workspace,p_customer,p_mode,p_percent) returning * into saved;
 else
  update booking_payment_policies set mode=p_mode,percent=p_percent,revision=revision+1,updated_at=now()
  where id=previous.id returning * into saved;
 end if;
 return jsonb_build_object('mode',saved.mode,'percent',saved.percent,'revision',saved.revision);
end $$;
revoke all on function public.save_booking_payment_policy(uuid,uuid,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.save_booking_payment_policy(uuid,uuid,text,integer,bigint) to service_role;

create function public.resolve_booking_payment_policy(p_workspace uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce((select jsonb_build_object('mode',mode,'percent',percent)
 from booking_payment_policies where workspace_id=p_workspace and mode<>'inherit' and (customer_id is null or customer_id=p_customer)
 order by (customer_id is not null) desc limit 1),'{"mode":"salon","percent":0}'::jsonb)
$$;
revoke all on function public.resolve_booking_payment_policy(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_booking_payment_policy(uuid,uuid) to service_role;

create table public.booking_payment_terms (
 request_id uuid primary key references public.booking_requests(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id),
 mode text not null check(mode in ('salon','full','deposit')),
 percent integer not null,
 total_cents bigint not null check(total_cents between 0 and 99999999),
 due_cents bigint not null check(due_cents>=0 and due_cents<=total_cents),
 created_at timestamptz not null default now(),
 check((mode='salon' and percent=0) or (mode='full' and percent=100) or (mode='deposit' and percent between 1 and 99))
);
alter table public.booking_payment_terms enable row level security;
revoke all on public.booking_payment_terms from public,anon,authenticated;
grant select on public.booking_payment_terms to authenticated;
grant all on public.booking_payment_terms to service_role;
create policy booking_payment_terms_owner_read on public.booking_payment_terms for select to authenticated
 using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed());

create function public.snapshot_booking_payment_terms() returns trigger language plpgsql security definer set search_path=public as $$
declare policy jsonb; total bigint; customer uuid; matches integer;
begin
 if new.origin::text<>'frontend' then return new; end if;
 customer=new.customer_id;
 if customer is null and length(trim(coalesce(new.customer_email::text,'')))>0 and length(regexp_replace(coalesce(new.customer_phone,''),'\D','','g'))>0 then
  select count(*),(array_agg(id))[1] into matches,customer from customers where workspace_id=new.workspace_id
  and lower(trim(email::text))=lower(trim(new.customer_email::text))
  and regexp_replace(coalesce(phone,''),'\D','','g')=regexp_replace(new.customer_phone,'\D','','g');
  if matches<>1 then customer=null; end if;
 end if;
 policy=resolve_booking_payment_policy(new.workspace_id,customer);
 -- Default and existing salons take the unchanged booking path.
 if policy->>'mode'='salon' then return new; end if;
 total=round(new.requested_price*100);
 -- Card payments below Stripe's EUR minimum stay payable at the salon.
 if round(total*(policy->>'percent')::numeric/100)<50 then return new; end if;
 insert into booking_payment_terms(request_id,workspace_id,mode,percent,total_cents,due_cents)
 values(new.id,new.workspace_id,policy->>'mode',(policy->>'percent')::integer,total,round(total*(policy->>'percent')::numeric/100));
 return new;
end $$;
revoke all on function public.snapshot_booking_payment_terms() from public,anon,authenticated;
create trigger snapshot_booking_payment_terms after insert on public.booking_requests
 for each row execute function public.snapshot_booking_payment_terms();
