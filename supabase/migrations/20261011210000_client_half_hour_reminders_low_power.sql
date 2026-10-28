-- Reuse the existing explicit opt-in and sent ledger. Ordinary salon reminders
-- are unchanged. GPS samples are optional; they never decide whether to remind.
create or replace function public.get_client_gps_reminder_window_v1(p_salon_code text, p_instance_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.customers; appointment_at timestamptz;
begin
 if nullif(trim(p_instance_id),'') is null then return jsonb_build_object('enabled',false); end if;
 if (select count(*) from customers cu join workspaces w on w.id=cu.workspace_id
     where lower(trim(w.slug))=lower(trim(p_salon_code)) and cu.active_client_app_instance_id=p_instance_id
       and coalesce(cu.is_active,true)) <> 1 then return jsonb_build_object('enabled',false); end if;
 select cu.* into c from customers cu join workspaces w on w.id=cu.workspace_id
 where lower(trim(w.slug))=lower(trim(p_salon_code)) and cu.active_client_app_instance_id=p_instance_id
   and coalesce(cu.is_active,true);
 if c.id is null or c.active_client_platform::text not in ('ios','android') or c.active_client_platform is null
    or c.notification_permission is distinct from 'granted'
    or not exists(select 1 from client_gps_reminder_state g where g.customer_id=c.id and g.enabled and g.instance_id=p_instance_id)
 then return jsonb_build_object('enabled',false); end if;
 select ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') into appointment_at
 from appointments a
 left join booking_requests b on b.id=a.booking_request_id and b.workspace_id=a.workspace_id
 where a.customer_id=c.id and a.workspace_id=c.workspace_id and not a.completed and not a.no_show
   and (a.booking_request_id is null or b.status='accepted')
   and ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') > now()+interval '25 minutes'
   and (a.appointment_group_id is null or not exists(select 1 from appointments earlier
     where earlier.appointment_group_id=a.appointment_group_id and earlier.workspace_id=a.workspace_id
       and (earlier.appointment_date,earlier.appointment_time,earlier.id)<(a.appointment_date,a.appointment_time,a.id)))
 order by a.appointment_date,a.appointment_time,a.id limit 1;
 return jsonb_build_object('enabled',true,'startsAt',appointment_at-interval '35 minutes','endsAt',appointment_at-interval '25 minutes');
end $$;
revoke all on function public.get_client_gps_reminder_window_v1(text,text) from public;
grant execute on function public.get_client_gps_reminder_window_v1(text,text) to anon,authenticated;

create or replace function public.queue_due_gps_reminders_v1()
returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; sent integer; location_hint boolean; body text;
begin
 if not pg_try_advisory_xact_lock(hashtext('queue_due_gps_reminders_v1')) then return 0; end if;
 update client_gps_reminder_state set distance_m=null,observed_at=null,stationary_since=null
   where observed_at<now()-interval '10 minutes';
 for r in
 select a.*,c.email,c.phone,w.salon_name,g.distance_m,g.observed_at,g.stationary_since,
   ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') as starts_at
 from appointments a
 join customers c on c.id=a.customer_id and c.workspace_id=a.workspace_id
 join workspaces w on w.id=a.workspace_id
 join client_gps_reminder_state g on g.customer_id=c.id
 left join booking_requests b on b.id=a.booking_request_id and b.workspace_id=a.workspace_id
 where g.enabled and g.instance_id=c.active_client_app_instance_id
   and coalesce(c.is_active,true) and c.active_client_platform::text in ('ios','android')
   and c.notification_permission='granted'
   and not a.completed and not a.no_show and (a.booking_request_id is null or b.status='accepted')
   and ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') between now()+interval '25 minutes' and now()+interval '30 minutes'
   and (a.appointment_group_id is null or not exists(select 1 from appointments earlier
     where earlier.appointment_group_id=a.appointment_group_id and earlier.workspace_id=a.workspace_id
       and (earlier.appointment_date,earlier.appointment_time,earlier.id)<(a.appointment_date,a.appointment_time,a.id)))
 for update of g skip locked
 loop
  insert into client_gps_reminder_sent values(r.id,r.starts_at) on conflict do nothing;
  if not found then continue; end if;
  location_hint:=coalesce(r.observed_at>now()-interval '2 minutes' and r.stationary_since<=now()-interval '2 minutes' and r.distance_m>500,false);
  body:='Ti ricordiamo l’appuntamento alle '||to_char(r.appointment_time,'HH24:MI')||' presso '||coalesce(r.salon_name,'il salone')||'. Ti aspettiamo!';
  if location_hint then body:=body||' Se sei ancora lontano o in ritardo, avvisa il salone, per favore.'; end if;
  select public.queue_public_customer_push(r.workspace_id,'custom','Il tuo appuntamento è tra poco',body,
   jsonb_build_object('type','appointment_reminder','appointmentId',r.id,'appointmentDate',r.appointment_date,
     'appointmentTime',r.appointment_time,'halfHourReminder',true,'gpsReminder',location_hint,
     '_dedupeKey','half-hour:'||r.id::text||':'||r.starts_at::text),r.email,r.phone) into sent;
  if coalesce(sent,0)=0 then delete from client_gps_reminder_sent where appointment_id=r.id and appointment_at=r.starts_at;
  else n:=n+1; end if;
 end loop;
 return n;
end $$;
revoke all on function public.queue_due_gps_reminders_v1() from public,anon,authenticated;
grant execute on function public.queue_due_gps_reminders_v1() to service_role;
-- The existing minute cron continues calling the same no-argument function.

-- Accept optional foreground observations only in the short reminder window.
CREATE OR REPLACE FUNCTION public.update_client_gps_reminder_v1(p_salon_code text, p_instance_id text, p_enabled boolean, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision, p_speed double precision DEFAULT NULL::double precision, p_observed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; s record; d double precision; previous public.client_gps_reminder_state; stationary timestamptz;
begin
 if nullif(trim(p_instance_id),'') is null or p_enabled is null then return false; end if;
 select customer.* into c from public.customers customer join public.workspaces w on w.id=customer.workspace_id
 where lower(w.slug)=lower(trim(p_salon_code)) and customer.active_client_app_instance_id=p_instance_id limit 1;
 if c.id is null then return false; end if;
 insert into public.client_gps_reminder_state(customer_id,instance_id,enabled) values(c.id,p_instance_id,p_enabled)
 on conflict(customer_id) do update set enabled=excluded.enabled,instance_id=excluded.instance_id,
 distance_m=case when not excluded.enabled or client_gps_reminder_state.instance_id<>excluded.instance_id then null else client_gps_reminder_state.distance_m end,
 observed_at=case when not excluded.enabled or client_gps_reminder_state.instance_id<>excluded.instance_id then null else client_gps_reminder_state.observed_at end,
 stationary_since=case when not excluded.enabled or client_gps_reminder_state.instance_id<>excluded.instance_id then null else client_gps_reminder_state.stationary_since end;
 if not p_enabled or p_observed_at is null then return true; end if;
 if not exists(select 1 from public.appointments a where a.customer_id=c.id and not a.completed and not a.no_show
 and ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') between now()+interval '25 minutes' and now()+interval '35 minutes') then
 update public.client_gps_reminder_state set distance_m=null,observed_at=null,stationary_since=null where customer_id=c.id;
 return true; end if;
 select * into previous from public.client_gps_reminder_state where customer_id=c.id for update;
 if p_observed_at<=previous.observed_at then return true; end if;
 if p_observed_at < now()-interval '2 minutes' or p_observed_at>now()+interval '10 seconds'
 or p_accuracy is null or not(p_accuracy between 0 and 60)
 or p_latitude is null or not(p_latitude between -90 and 90)
 or p_longitude is null or not(p_longitude between -180 and 180) then
 update public.client_gps_reminder_state set stationary_since=null,observed_at=null where customer_id=c.id;
 return true; end if;
 select * into s from public.salon_directory_profiles where workspace_id=c.workspace_id and address_confirmed and latitude is not null;
 if s.workspace_id is null then return true; end if;
 d:=6371000*acos(least(1.0,greatest(-1.0,sin(radians(p_latitude))*sin(radians(s.latitude))+cos(radians(p_latitude))*cos(radians(s.latitude))*cos(radians(s.longitude-p_longitude)))));
 -- Unknown speed never proves that a person is stationary. Approaching or any motion resets the window.
 stationary:=case when p_speed between 0 and 0.5 and d>500 then p_observed_at else null end;
 if stationary is not null and previous.observed_at>=p_observed_at-interval '2 minutes'
 and abs(previous.distance_m-d)<=40 and previous.stationary_since is not null then stationary:=previous.stationary_since; end if;
 update public.client_gps_reminder_state set distance_m=d,observed_at=p_observed_at,stationary_since=stationary where customer_id=c.id;
 return true;
end $function$
;
