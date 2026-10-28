begin;
create or replace function public.is_waitlist_plan_available_v1(p_entry public.booking_slot_waitlist)
returns boolean language sql stable security definer set search_path=public as $$ select p_entry.requested_service_name='QA self release' $$;
do $$
declare e public.booking_slot_waitlist%rowtype; wid uuid; plan jsonb; owner_id uuid; other_id uuid; v_result text[];
begin
 select id into wid from public.workspaces where slug='salonpro-lcom';
 plan:='{"version":1,"durationMinutes":15,"intervals":[{"startOffsetMinutes":0,"durationMinutes":15}],"range":{"key":"morning","startMinute":600,"endMinute":615,"stepMinutes":15}}';
 insert into public.booking_slot_waitlist(workspace_id,appointment_date,appointment_time,requested_service_name,requested_duration_minutes,customer_name,customer_email,customer_phone,status,booking_plan,requested_operator_id,range_resolved)
 values(wid,current_date+7,'10:00','QA self release',15,'QA','qa-self@example.invalid','0000000001','waiting',plan,'qa-operator',true) returning id into owner_id;
 insert into public.booking_slot_waitlist(workspace_id,appointment_date,appointment_time,requested_service_name,requested_duration_minutes,customer_name,customer_email,customer_phone,status,booking_plan,requested_operator_id,range_resolved)
 values(wid,current_date+7,'10:00','QA self release',15,'QA','qa-other@example.invalid','0000000002','waiting',plan,'qa-operator',true) returning id into other_id;
 insert into public.waitlist_release_origins(source_key,workspace_id,appointment_date,appointment_time,duration_minutes,operator_id,service_name,email_hash,phone_hash)
 values('qa-self',wid,current_date+7,'10:00',15,'qa-operator','QA self release',md5('qa-self@example.invalid'),md5('0000000001'));
 select * into e from public.booking_slot_waitlist where id=owner_id;
 if not public.is_waitlist_self_release_v1(e) then raise exception 'own release not recognized';end if;
 v_result:=public.waitlist_range_available_times_v1(e);
 if '10:00'=any(v_result) or not ('10:15'=any(v_result)) then raise exception 'range suppression affects wrong times';end if;
 perform public.process_public_slot_waitlist(wid,current_date+7,null);
 if (select status from public.booking_slot_waitlist where id=owner_id)<>'waiting' then raise exception 'self customer notified';end if;
 if (select status from public.booking_slot_waitlist where id=other_id)<>'notified' then raise exception 'other customer not notified';end if;
 -- New occupancy removes the previous exclusion only for that resource.
 insert into public.booking_requests(workspace_id,appointment_date,appointment_time,requested_service_name,requested_duration_minutes,customer_name,customer_email,customer_phone,status,requested_operator_id,requested_price)
 values(wid,current_date+7,'10:00','QA self release',15,'QA','qa-other@example.invalid','0000000002','pending','qa-operator',0);
 if public.is_waitlist_self_release_v1(e) then raise exception 'exclusion survived new occupancy';end if;
 update public.booking_requests set status='cancelled' where workspace_id=wid and requested_service_name='QA self release' and customer_email='qa-other@example.invalid';
 if public.is_waitlist_self_release_v1(e) then raise exception 'another customer release excludes previous customer';end if;
 select * into e from public.booking_slot_waitlist where id=other_id;
 if not public.is_waitlist_self_release_v1(e) then raise exception 'cancellation trigger did not record identity';end if;
end $$;
select 'PASS own release suppressed, other customer notified, other range time retained, new occupancy resets exclusion' as result;
rollback;
