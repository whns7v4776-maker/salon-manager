-- Runner wraps migration + this suite in one BEGIN/ROLLBACK. No real push delivery.
create temporary table gps_low_power_results(name text primary key);
create temporary table gps_captured_pushes(appointment_id uuid,payload jsonb,body text);
create function pg_temp.gps_assert(ok boolean,name text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'TEST FAILED: %',name;end if;insert into gps_low_power_results values(name);end $$;
create or replace function public.queue_public_customer_push(p_workspace_id uuid,p_event_type public.push_event_type,p_title text,p_body text,p_payload jsonb default '{}',p_customer_email citext default null,p_customer_phone text default null)
returns integer language plpgsql as $$
begin
 if p_workspace_id::text is distinct from current_setting('salonpro.qa.workspace',true) or current_setting('salonpro.qa.fail_push',true)='true' then return 0;end if;
 insert into gps_captured_pushes values((p_payload->>'appointmentId')::uuid,p_payload,p_body);return 1;
end $$;
set local session_replication_role=replica;
do $tests$
declare w uuid=gen_random_uuid();c uuid=gen_random_uuid();a uuid=gen_random_uuid();other uuid=gen_random_uuid();grp uuid=gen_random_uuid();
 code text='gps-low-power-'||gen_random_uuid();instance text='gps-low-power-'||gen_random_uuid();at timestamp;reminder_window jsonb;
begin
 perform set_config('salonpro.qa.workspace',w::text,true);
 insert into workspaces(id,salon_name,slug,owner_email,is_internal_tester,subscription_status)
 values(w,'GPS Low Power QA',code,'gps-qa@example.test',true,'active');
 insert into customers(id,workspace_id,full_name,email,phone,source,active_client_app_instance_id,active_client_platform,notification_permission)
 values(c,w,'GPS Low Power QA','gps-qa-client@example.test','3331230042','frontend',instance,'ios','granted');
 insert into client_gps_reminder_state(customer_id,instance_id,enabled) values(c,instance,true);
 at:=(now()+interval '28 minutes') at time zone 'Europe/Rome';
 insert into appointments(id,workspace_id,customer_id,customer_name,service_name,price,duration_minutes,appointment_date,appointment_time)
 values(a,w,c,'GPS Low Power QA','QA',20,20,at::date,at::time);
 reminder_window:=get_client_gps_reminder_window_v1(code,instance);
 perform pg_temp.gps_assert(reminder_window->>'enabled'='true' and (reminder_window->>'startsAt')::timestamptz=now()-interval '7 minutes' and (reminder_window->>'endsAt')::timestamptz=now()+interval '3 minutes','Authorized window is exactly 35 to 25 minutes before appointment');
 perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert((select count(*)=1 from gps_captured_pushes),'No GPS observation still queues one half-hour reminder');
 perform pg_temp.gps_assert((select payload->>'gpsReminder'='false' and payload->>'halfHourReminder'='true' and payload->>'_dedupeKey' like 'half-hour:%' from gps_captured_pushes limit 1),'Fallback uses its own dedupe key independent of ordinary reminders');
 perform queue_due_gps_reminders_v1();perform pg_temp.gps_assert((select count(*)=1 from gps_captured_pushes),'Repeated cron cannot duplicate reminder');
 -- Nearby, moving and stale locations must not suppress the reminder.
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 update client_gps_reminder_state set distance_m=100,observed_at=now(),stationary_since=now()-interval '3 minutes' where customer_id=c;
 perform queue_due_gps_reminders_v1();perform pg_temp.gps_assert((select count(*)=1 and bool_and(payload->>'gpsReminder'='false') from gps_captured_pushes),'Nearby client still receives ordinary half-hour reminder');
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 update client_gps_reminder_state set distance_m=1500,stationary_since=null where customer_id=c;
 perform queue_due_gps_reminders_v1();perform pg_temp.gps_assert((select count(*)=1 and bool_and(payload->>'gpsReminder'='false') from gps_captured_pushes),'Moving client still receives ordinary half-hour reminder');
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 update client_gps_reminder_state set observed_at=now()-interval '5 minutes',stationary_since=now()-interval '8 minutes' where customer_id=c;
 perform queue_due_gps_reminders_v1();perform pg_temp.gps_assert((select count(*)=1 and bool_and(payload->>'gpsReminder'='false') from gps_captured_pushes),'Stale location cannot suppress or enrich reminder');
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 update client_gps_reminder_state set observed_at=now(),stationary_since=now()-interval '3 minutes' where customer_id=c;
 perform queue_due_gps_reminders_v1();perform pg_temp.gps_assert((select count(*)=1 and bool_and(payload->>'gpsReminder'='true') from gps_captured_pushes),'Fresh stationary distant location only enriches same one reminder');
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 perform set_config('salonpro.qa.fail_push','true',true);perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from client_gps_reminder_sent where appointment_id=a),'No device or failed enqueue does not consume sent ledger');
 perform set_config('salonpro.qa.fail_push','false',true);perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert((select count(*)=1 from gps_captured_pushes),'Unsent reminder can retry within due window');
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 update client_gps_reminder_state set enabled=false where customer_id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'enabled'='false','Explicit opt-out disables notification and GPS window');
 perform update_client_gps_reminder_v1(code,instance,true,45,9,10,0,now());
 perform pg_temp.gps_assert((select enabled=false from client_gps_reminder_state where customer_id=c),'Late location sample cannot re-enable revoked reminder consent');
 update client_gps_reminder_state set enabled=true,instance_id='wrong' where customer_id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'enabled'='false','Old installation cannot collect or notify');
 update client_gps_reminder_state set instance_id=instance where customer_id=c;
 update customers set notification_permission='denied' where id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'enabled'='false','Denied notifications suppress reminder and optional location');
 update customers set notification_permission=null where id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes),'Unknown notification permission is never treated as granted');
 update customers set notification_permission='granted',active_client_platform=null where id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'enabled'='false','Missing native platform never opens GPS window or extra reminder');
 update customers set active_client_platform='android' where id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert((select count(*)=1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'enabled'='true','Android uses same half-hour server reminder and short window');
 delete from client_gps_reminder_sent where appointment_id=a;truncate gps_captured_pushes;
 update customers set is_active=false where id=c;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'enabled'='false','Removed client has no reminder or GPS window');
 update customers set is_active=true where id=c;
 update appointments set completed=true where id=a;perform queue_due_gps_reminders_v1();
 reminder_window:=get_client_gps_reminder_window_v1(code,instance);
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and reminder_window->>'startsAt' is null,'Completed appointment has no reminder or GPS window');
 update appointments set completed=false,no_show=true where id=a;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'startsAt' is null,'No-show appointment has no reminder or GPS window');
 update appointments set no_show=false where id=a;
 delete from appointments where id=a;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'startsAt' is null,'Canceled or removed appointment leaves no GPS window');
 -- A group receives one reminder at its first component, never at the second.
 insert into appointments(id,workspace_id,customer_id,customer_name,service_name,price,duration_minutes,appointment_date,appointment_time,appointment_group_id)
 values(a,w,c,'GPS QA','Colore',20,20,at::date,at::time,grp),(other,w,c,'GPS QA','Piega',20,20,at::date,(at+interval '1 minute')::time,grp);
 perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert((select count(*)=1 and bool_and(appointment_id=a) from gps_captured_pushes),'Multi-phase appointment queues only first phase');
 delete from client_gps_reminder_sent where appointment_id in(a,other);truncate gps_captured_pushes;
 update appointments set appointment_time=(at-interval '8 minutes')::time where id=a;perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and get_client_gps_reminder_window_v1(code,instance)->>'startsAt' is null,'Later group phase never opens a separate reminder window');
 delete from appointments where id in(a,other);
 at:=(now()+interval '1 day') at time zone 'Europe/Rome';
 insert into appointments(id,workspace_id,customer_id,customer_name,service_name,price,duration_minutes,appointment_date,appointment_time)
 values(a,w,c,'GPS QA','QA',20,20,at::date,at::time);
 perform queue_due_gps_reminders_v1();
 perform pg_temp.gps_assert(not exists(select 1 from gps_captured_pushes) and (get_client_gps_reminder_window_v1(code,instance)->>'startsAt')::timestamptz=now()+interval '1 day'-interval '35 minutes','Distant appointment exposes future window but queues no early reminder');
 update client_gps_reminder_state set observed_at=now(),distance_m=1500,stationary_since=now()-interval '3 minutes' where customer_id=c;
 perform update_client_gps_reminder_v1(code,instance,true,45,9,10,0,now());
 perform pg_temp.gps_assert((select observed_at is null and distance_m is null from client_gps_reminder_state where customer_id=c),'Outside short window location observation is discarded');
 perform pg_temp.gps_assert(get_client_gps_reminder_window_v1(code,'invalid')->>'enabled'='false','Invalid installation cannot read appointment window');
 perform pg_temp.gps_assert(get_client_gps_reminder_window_v1('wrong',instance)->>'enabled'='false','Other salon code cannot read appointment window');
 insert into customers(workspace_id,full_name,email,phone,source,active_client_app_instance_id,active_client_platform,notification_permission)
 values(w,'Duplicate install QA','duplicate@example.test','3331230043','frontend',instance,'ios','granted');
 perform pg_temp.gps_assert(get_client_gps_reminder_window_v1(code,instance)->>'enabled'='false','Ambiguous installation cannot read another customer appointment');
end $tests$;
select count(*)::int as passed_checks,jsonb_agg(name order by name) as checks from gps_low_power_results;
