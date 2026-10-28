begin;
do $$
declare e public.booking_slot_waitlist%rowtype; candidate integer; found_slot boolean:=false; base public.appointments%rowtype; probe public.appointments%rowtype;
begin
 select id into e.workspace_id from public.workspaces where slug='salonpro-lcom';
 e.appointment_date:=current_date+9; e.requested_service_name:='Barba Uomo'; e.requested_duration_minutes:=15;
 e.requested_operator_id:='832b99ca-f81c-40f4-a214-1d026aa22632';e.customer_name:='QA';e.customer_surname:='Hold';e.customer_email:='qa-hold@example.invalid';e.customer_phone:='0000000000';
 e.booking_plan:='{"version":1,"durationMinutes":15,"requiredRole":"Barber","intervals":[{"startOffsetMinutes":0,"durationMinutes":15}]}';
 for candidate in select generate_series(540,1080,15) loop
   e.appointment_time:=make_time(candidate/60,candidate%60,0);
   if public.is_waitlist_plan_available_v1(e) then found_slot:=true;exit;end if;
 end loop;
 if not found_slot then raise exception 'no free slot for hold test';end if;
 insert into public.owner_slot_release_holds(source_key,workspace_id,appointment_date,appointment_time,duration_minutes,service_name,operator_id)
 values('qa-hold',e.workspace_id,e.appointment_date,e.appointment_time,15,e.requested_service_name,e.requested_operator_id);
 if public.is_waitlist_plan_available_v1(e) then raise exception 'customer can book during hold';end if;
 perform set_config('salonpro.owner_unrestricted','on',true);
 if not public.is_waitlist_plan_available_v1(e) then raise exception 'owner cannot replace during hold';end if;
 perform set_config('salonpro.owner_unrestricted','off',true);
 update public.owner_slot_release_holds set release_at=clock_timestamp()-interval '1 second' where source_key='qa-hold';
 if not public.is_waitlist_plan_available_v1(e) then raise exception 'expired hold still blocks';end if;
 perform set_config('salonpro.owner_unrestricted','on',true);
 select * into base from public.appointments where workspace_id=e.workspace_id limit 1;
 if base.id is null then raise exception 'appointment fixture missing';end if;
 probe:=base;probe.id:=gen_random_uuid();probe.booking_request_id:=null;probe.appointment_date:=e.appointment_date;probe.appointment_time:=e.appointment_time;
 insert into public.appointments select (probe).*;
 delete from public.appointments where id=probe.id;
 if not exists(select 1 from public.owner_slot_release_holds where source_key='appointments:'||probe.id::text and release_at>clock_timestamp()+interval '55 seconds') then raise exception 'owner deletion did not create 60 second hold';end if;
 probe.id:=gen_random_uuid();insert into public.appointments select (probe).*;
 perform set_config('salonpro.customer_slot_release','on',true);
 delete from public.appointments where id=probe.id;
 if exists(select 1 from public.owner_slot_release_holds where source_key='appointments:'||probe.id::text) then raise exception 'customer deletion incorrectly held';end if;
end $$;
select 'PASS owner hold, owner replacement, expiry and immediate customer deletion' as result;
rollback;
