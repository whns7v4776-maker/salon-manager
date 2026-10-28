begin;
-- Controlled availability, rolled back together with all queued notifications.
create or replace function public.is_waitlist_plan_available_v1(p_entry public.booking_slot_waitlist)
returns boolean language sql stable security definer set search_path=public as $$
select p_entry.requested_service_name='QA persistent range' and to_char(p_entry.appointment_time,'HH24:MI') = any(string_to_array(current_setting('salonpro.qa_range_free',true),','))
$$;
do $$
declare r jsonb; wid uuid; rid uuid; e public.booking_slot_waitlist%rowtype; p jsonb;
begin
 select id into wid from public.workspaces where slug='salonpro-lcom';
 p:='{"version":1,"durationMinutes":15,"intervals":[{"startOffsetMinutes":0,"durationMinutes":15}],"range":{"key":"morning","label":"Mattina","startMinute":600,"endMinute":630,"stepMinutes":15}}';
 perform set_config('salonpro.qa_range_free','10:00',true);
 r:=public.join_public_slot_waitlist_v2('salonpro-lcom','QA persistent range',15,current_date+7,'10:30','QA','Range','qa-range@example.invalid','0000000000',null,null,null,null,p);
 rid:=(r->>'waitlistEntryId')::uuid;
 perform public.process_public_slot_waitlist(wid,current_date+7,null);
 select * into e from public.booking_slot_waitlist where id=rid;
 if e.status <> 'waiting' or e.range_resolved then raise exception 'already free slot caused alert'; end if;
 -- The initially free time becomes occupied after registration.
 perform set_config('salonpro.qa_range_free','',true);
 perform public.process_public_slot_waitlist(wid,current_date+7,null);
 -- It then frees again; a request-time occupied-slots snapshot would miss it.
 perform set_config('salonpro.qa_range_free','10:00',true);
 perform public.process_public_slot_waitlist(wid,null,null);
 select * into e from public.booking_slot_waitlist where id=rid;
 if e.status <> 'notified' or e.appointment_time <> '10:00' or not e.range_resolved then raise exception 'newly occupied then freed time was missed: %',e.status; end if;
 if e.booking_plan->'range' is distinct from p->'range' then raise exception 'saved preference lost'; end if;
end $$;
select 'PASS persistent range, baseline, later occupancy, subsequent release and exact booking time' as result;
rollback;
