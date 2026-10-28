-- No coordinate history: retain only distance and a short stationary observation window.
create table public.client_gps_reminder_state (
 customer_id uuid primary key references public.customers(id) on delete cascade,
 instance_id text not null, enabled boolean not null default false,
 distance_m double precision, observed_at timestamptz, stationary_since timestamptz
);
alter table public.client_gps_reminder_state enable row level security;
revoke all on public.client_gps_reminder_state from anon, authenticated;
create table public.client_gps_reminder_sent (
 appointment_id uuid not null references public.appointments(id) on delete cascade,
 appointment_at timestamptz not null, primary key(appointment_id, appointment_at)
);
alter table public.client_gps_reminder_sent enable row level security;
revoke all on public.client_gps_reminder_sent from anon, authenticated;

create function public.update_client_gps_reminder_v1(p_salon_code text, p_instance_id text,
 p_enabled boolean, p_latitude double precision default null, p_longitude double precision default null,
 p_accuracy double precision default null, p_speed double precision default null, p_observed_at timestamptz default null)
returns boolean language plpgsql security definer set search_path=public as $$
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
 and ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') between now() and now()+interval '1 hour') then
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
end $$;
revoke all on function public.update_client_gps_reminder_v1(text,text,boolean,double precision,double precision,double precision,double precision,timestamptz) from public;
grant execute on function public.update_client_gps_reminder_v1(text,text,boolean,double precision,double precision,double precision,double precision,timestamptz) to anon,authenticated;

create function public.queue_due_gps_reminders_v1() returns integer language plpgsql security definer set search_path=public as $$
declare r record; n integer:=0; sent integer;
begin
 if not pg_try_advisory_xact_lock(hashtext('queue_due_gps_reminders_v1')) then return 0; end if;
 update public.client_gps_reminder_state set distance_m=null,observed_at=null,stationary_since=null where observed_at<now()-interval '10 minutes';
 for r in
 select a.*,c.email,c.phone,w.salon_name,((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') as starts_at
 from public.appointments a join public.customers c on c.id=a.customer_id
 join public.workspaces w on w.id=a.workspace_id
 join public.client_gps_reminder_state g on g.customer_id=c.id
 where g.enabled and g.instance_id=c.active_client_app_instance_id
 and g.observed_at>now()-interval '2 minutes' and g.stationary_since<=now()-interval '2 minutes'
 and g.distance_m>500 and a.completed=false and a.no_show=false
 and ((a.appointment_date+a.appointment_time) at time zone 'Europe/Rome') between now()+interval '25 minutes' and now()+interval '30 minutes'
 and (a.appointment_group_id is null or not exists(select 1 from public.appointments earlier where earlier.appointment_group_id=a.appointment_group_id and earlier.workspace_id=a.workspace_id and (earlier.appointment_date,earlier.appointment_time,earlier.id)<(a.appointment_date,a.appointment_time,a.id)))
 loop
  insert into public.client_gps_reminder_sent values(r.id,r.starts_at) on conflict do nothing;
  if not found then continue; end if;
  select public.queue_public_customer_push(r.workspace_id,'custom','Il tuo appuntamento è tra poco',
   'Ti ricordiamo l’appuntamento alle '||to_char(r.appointment_time,'HH24:MI')||' presso '||coalesce(r.salon_name,'il salone')||'. Se non puoi venire o sei in ritardo, avvisa il salone, per favore.',
   jsonb_build_object('type','appointment_reminder','appointmentId',r.id,'appointmentDate',r.appointment_date,'appointmentTime',r.appointment_time,'gpsReminder',true),r.email,r.phone) into sent;
  if coalesce(sent,0)=0 then delete from public.client_gps_reminder_sent where appointment_id=r.id and appointment_at=r.starts_at; else n:=n+1; end if;
 end loop;
 return n;
end $$;
revoke all on function public.queue_due_gps_reminders_v1() from public,anon,authenticated;
grant execute on function public.queue_due_gps_reminders_v1() to service_role;
select cron.schedule('client-gps-reminders','* * * * *','select public.queue_due_gps_reminders_v1()');
