-- Serialize preference changes; optional samples cannot revive revoked consent.
CREATE OR REPLACE FUNCTION public.update_client_gps_reminder_v1(p_salon_code text, p_instance_id text, p_enabled boolean, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_accuracy double precision DEFAULT NULL::double precision, p_speed double precision DEFAULT NULL::double precision, p_observed_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c record; s record; d double precision; previous public.client_gps_reminder_state; stationary timestamptz; reminder_window jsonb;
begin
 if nullif(trim(p_instance_id),'') is null or p_enabled is null then return false; end if;
 select customer.* into c from public.customers customer join public.workspaces w on w.id=customer.workspace_id
 where lower(w.slug)=lower(trim(p_salon_code)) and customer.active_client_app_instance_id=p_instance_id limit 1 for update of customer;
 if c.id is null then return false; end if;
 -- An old in-flight sample is never permission to re-enable an opted-out reminder.
 if p_enabled and p_observed_at is not null and not exists(select 1 from client_gps_reminder_state g
   where g.customer_id=c.id and g.instance_id=p_instance_id and g.enabled) then return true; end if;
 insert into public.client_gps_reminder_state(customer_id,instance_id,enabled) values(c.id,p_instance_id,p_enabled)
 on conflict(customer_id) do update set enabled=excluded.enabled,instance_id=excluded.instance_id,
 distance_m=case when not excluded.enabled or client_gps_reminder_state.instance_id<>excluded.instance_id then null else client_gps_reminder_state.distance_m end,
 observed_at=case when not excluded.enabled or client_gps_reminder_state.instance_id<>excluded.instance_id then null else client_gps_reminder_state.observed_at end,
 stationary_since=case when not excluded.enabled or client_gps_reminder_state.instance_id<>excluded.instance_id then null else client_gps_reminder_state.stationary_since end;
 if not p_enabled or p_observed_at is null then return true; end if;
 reminder_window:=public.get_client_gps_reminder_window_v1(p_salon_code,p_instance_id);
 if reminder_window->>'enabled' is distinct from 'true' or reminder_window->>'startsAt' is null
   or reminder_window->>'endsAt' is null or now()<(reminder_window->>'startsAt')::timestamptz
   or now()>=(reminder_window->>'endsAt')::timestamptz then
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
