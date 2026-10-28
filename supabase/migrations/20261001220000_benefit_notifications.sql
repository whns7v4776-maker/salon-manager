create table public.customer_benefit_notifications (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id),
 customer_id uuid not null references customers(id), event_key text not null, title text not null, body text not null,
 created_at timestamptz not null default now(), unique(workspace_id,event_key)
);
create index benefit_notification_history on public.customer_benefit_notifications(workspace_id,customer_id,created_at desc);
alter table public.customer_benefit_notifications enable row level security;
revoke all on public.customer_benefit_notifications from public,anon,authenticated;
grant select on public.customer_benefit_notifications to authenticated;
grant all on public.customer_benefit_notifications to service_role;
create policy benefit_notifications_owner on public.customer_benefit_notifications for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());
create function public.record_benefit_notification(w uuid,c uuid,k text,t text,b text)
returns void language plpgsql security definer set search_path=public as $$
declare event_id uuid; customer customers;
begin
 select * into customer from customers where id=c and workspace_id=w;
 if not found then return; end if;
 insert into customer_benefit_notifications(workspace_id,customer_id,event_key,title,body) values(w,c,k,t,b)
 on conflict(workspace_id,event_key) do nothing returning id into event_id;
 if event_id is null then return; end if;
 perform queue_public_customer_push(w,'custom',t,b,jsonb_build_object('type','customer_benefit','_pushTarget','client','recipientRole','client','eventId',event_id,'benefitEventId',event_id,'customerName',customer.full_name,'screen','notifications'),customer.email::citext,customer.phone);
end $$;
create function public.notify_customer_benefit_change() returns trigger language plpgsql security definer set search_path=public as $$
declare balance bigint; threshold_names text;
begin
 if tg_table_name='customer_service_packages' then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'package:'||new.id,'Il tuo pacchetto è pronto',new.name||': trovi utilizzi e validità in Pacchetti e vantaggi.');
 elsif tg_table_name='customer_gift_cards' then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'gift:'||new.id,'Hai ricevuto una gift card','Il salone ti ha assegnato un buono regalo. Apri i tuoi vantaggi per vedere valore e dettagli.');
 elsif tg_table_name='customer_loyalty_ledger' then
 if tg_op='UPDATE' and new.kind='reward' and old.delta<0 and new.delta=0 then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'reward-returned:'||new.id,'Punti fedeltà restituiti','Il premio prenotato è stato annullato. I punti sono nuovamente disponibili.');
 elsif new.kind='reward' and new.delta<0 then
 perform record_benefit_notification(new.workspace_id,new.customer_id,'reward:'||new.id,'Premio fedeltà utilizzato',new.description||'. Utilizzati '||abs(new.delta)||' punti.');
 elsif new.kind='service' and new.delta>0 then
 select coalesce(sum(delta),0) into balance from customer_loyalty_ledger where workspace_id=new.workspace_id and customer_id=new.customer_id;
 select string_agg(name,', ' order by points_cost) into threshold_names from salon_loyalty_rewards where workspace_id=new.workspace_id and not archived and points_cost<=balance and points_cost>balance-new.delta and (expires_on is null or expires_on>=(now() at time zone 'Europe/Rome')::date);
 if threshold_names is not null then perform record_benefit_notification(new.workspace_id,new.customer_id,'threshold:'||new.id,'Hai raggiunto un premio',left(threshold_names,180)||'. Chiedi al salone di utilizzarlo in cassa.'); end if;
 end if;
 end if;
 return null;
end $$;
create trigger notify_package_assigned after insert on public.customer_service_packages for each row execute function notify_customer_benefit_change();
create trigger notify_gift_assigned after insert on public.customer_gift_cards for each row execute function notify_customer_benefit_change();
create trigger notify_loyalty_event after insert or update on public.customer_loyalty_ledger for each row execute function notify_customer_benefit_change();
revoke all on function public.record_benefit_notification(uuid,uuid,text,text,text),public.notify_customer_benefit_change() from public,anon,authenticated;

create or replace function public.customer_benefits_wallet(p_salon_code text,p_email text,p_phone text,p_token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb; c uuid; w uuid;
begin
 ctx=verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);
 if ctx is null then raise exception 'Verifica la password per accedere ai vantaggi'; end if;
 c=(ctx->>'customerId')::uuid;w=(ctx->>'workspaceId')::uuid;
 return jsonb_build_object('settings',coalesce((select to_jsonb(s)-'workspace_id' from salon_benefit_settings s where workspace_id=w),'{}'),
 'points',(select coalesce(sum(delta),0) from customer_loyalty_ledger where workspace_id=w and customer_id=c),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r)) from salon_loyalty_rewards r where workspace_id=w and not archived),'[]'),
 'giftCards',coalesce((select jsonb_agg(to_jsonb(g)-'purchase_movement_id'||jsonb_build_object('salon_name',(select salon_name from workspaces where id=w),'customer_name',(select full_name from customers where id=g.customer_id),'available_cents',g.amount_cents-(select coalesce(sum(amount_cents),0) from gift_card_uses where gift_card_id=g.id and state<>'released'))) from customer_gift_cards g where workspace_id=w and customer_id=c),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select id,title,body,created_at from customer_benefit_notifications where workspace_id=w and customer_id=c order by created_at desc limit 100) n),'[]'),
 'packages',customer_package_wallet(p_salon_code,p_email,p_phone,p_token));
end $$;
