-- Run in a transaction after the migration; never delivers real notifications.
begin;
create or replace function public.queue_public_customer_push(p_workspace_id uuid,p_event_type public.push_event_type,p_title text,p_body text,p_payload jsonb default '{}',p_customer_email citext default null,p_customer_phone text default null) returns integer language sql as $$ select 1 $$;
set local session_replication_role=replica;
do $$
declare a public.appointments; c public.customers; due timestamp; n integer; code text;
begin
 select ap.* into a from public.appointments ap join public.customers cu on cu.id=ap.customer_id limit 1;
 if a.id is null then raise exception 'Fixture missing'; end if;
 select * into c from public.customers where id=a.customer_id;
 due:=(now()+interval '28 minutes') at time zone 'Europe/Rome';
 update public.appointments set appointment_date=due::date,appointment_time=due::time,completed=false,no_show=false,appointment_group_id=null where id=a.id;
 update public.customers set active_client_app_instance_id='gps-transaction-test' where id=c.id;
 insert into public.client_gps_reminder_state(customer_id,instance_id,enabled,distance_m,observed_at,stationary_since)
 values(c.id,'gps-transaction-test',true,1500,now(),now()-interval '3 minutes')
 on conflict(customer_id) do update set instance_id=excluded.instance_id,enabled=true,distance_m=1500,observed_at=now(),stationary_since=now()-interval '3 minutes';
 delete from public.client_gps_reminder_sent;
 n:=public.queue_due_gps_reminders_v1();
 if not exists(select 1 from public.client_gps_reminder_sent where appointment_id=a.id) then raise exception 'Stationary reminder missing'; end if;
 if public.queue_due_gps_reminders_v1()<>0 then raise exception 'Duplicate reminder'; end if;
 delete from public.client_gps_reminder_sent;
 update public.client_gps_reminder_state set stationary_since=null where customer_id=c.id;
 perform public.queue_due_gps_reminders_v1();
 if exists(select 1 from public.client_gps_reminder_sent where appointment_id=a.id) then raise exception 'Moving customer notified'; end if;
 update public.client_gps_reminder_state set stationary_since=now()-interval '3 minutes',observed_at=now()-interval '5 minutes' where customer_id=c.id;
 perform public.queue_due_gps_reminders_v1();
 if exists(select 1 from public.client_gps_reminder_sent where appointment_id=a.id) then raise exception 'Stale GPS notified'; end if;
 update public.client_gps_reminder_state set observed_at=now(),distance_m=100 where customer_id=c.id;
 perform public.queue_due_gps_reminders_v1();
 if exists(select 1 from public.client_gps_reminder_sent where appointment_id=a.id) then raise exception 'Nearby customer notified'; end if;
 update public.client_gps_reminder_state set distance_m=1500,enabled=false where customer_id=c.id;
 perform public.queue_due_gps_reminders_v1();
 if exists(select 1 from public.client_gps_reminder_sent where appointment_id=a.id) then raise exception 'Opt-out ignored'; end if;
 select slug into code from public.workspaces where id=c.workspace_id;
 insert into public.salon_directory_profiles(workspace_id,display_name,address,city,latitude,longitude,address_confirmed)
 values(c.workspace_id,'GPS test','Test address','Test',45.0,9.0,true)
 on conflict(workspace_id) do update set latitude=45.0,longitude=9.0,address_confirmed=true;
 perform public.update_client_gps_reminder_v1(code,'gps-transaction-test',false);
 perform public.update_client_gps_reminder_v1(code,'gps-transaction-test',true,45.02,9.0,10,0,now()-interval '2 minutes');
 perform public.update_client_gps_reminder_v1(code,'gps-transaction-test',true,45.02,9.0,10,0,now());
 if not exists(select 1 from public.client_gps_reminder_state where customer_id=c.id and stationary_since=now()-interval '2 minutes' and distance_m>500) then raise exception 'Stationary samples not recognized'; end if;
 -- Invalid / unknown speed must not preserve an earlier stationary result.
 perform public.update_client_gps_reminder_v1(code,'gps-transaction-test',true,45.02,9.0,10,-1,now()+interval '1 second');
 if exists(select 1 from public.client_gps_reminder_state where customer_id=c.id and stationary_since is not null) then raise exception 'Unknown speed accepted'; end if;
 perform public.update_client_gps_reminder_v1(code,'gps-transaction-test',false);
 if exists(select 1 from public.client_gps_reminder_state where customer_id=c.id and (enabled or observed_at is not null or distance_m is not null)) then raise exception 'Revocation did not clear observations'; end if;
 if public.update_client_gps_reminder_v1('salonpro-lcom','wrong-instance',true) then raise exception 'Invalid session accepted'; end if;
end $$;
rollback;
