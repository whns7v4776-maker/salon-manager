begin;
do $$
declare w record; a uuid; settings jsonb; saved jsonb; day date := current_date+40;
begin
  select ws.* into w from public.workspaces ws where ws.is_internal_tester and exists(select 1 from auth.users u where lower(u.email)=lower(ws.owner_email::text)) and exists(select 1 from public.client_portals p where p.salon_code=ws.slug) limit 1;
  if w.id is null then raise exception 'test_workspace_missing'; end if;
  select id into a from auth.users where lower(email)=lower(w.owner_email::text) limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'email',w.owner_email,'role','authenticated')::text,true);
  select availability_settings into settings from public.client_portals where salon_code=w.slug limit 1;
  settings := settings || jsonb_build_object('slotIntervalMinutes',5,'scheduledSlotIntervalMinutes',15,'scheduledSlotIntervalEffectiveFrom',day::text,'slotIntervalUpdatedAt',clock_timestamp(),'dateSlotIntervals','[]'::jsonb);
  perform public.update_client_portal_availability_settings(w.owner_email,w.slug,settings);
  select availability_settings into saved from public.client_portals where salon_code=w.slug limit 1;
  if public.availability_slot_interval_for_date(saved,day)<>15 then raise exception 'schedule_not_saved'; end if;
  if public.availability_slot_interval_for_date(saved,day-1)<>5 then raise exception 'schedule_started_early'; end if;
  settings := (settings - 'scheduledSlotIntervalMinutes' - 'scheduledSlotIntervalEffectiveFrom') || jsonb_build_object('slotIntervalUpdatedAt',clock_timestamp());
  perform public.update_client_portal_availability_settings(w.owner_email,w.slug,settings);
  select availability_settings into saved from public.client_portals where salon_code=w.slug limit 1;
  if public.availability_slot_interval_for_date(saved,day)<>5 then raise exception 'cancel_failed'; end if;
  -- Immediate change uses the same durable server settings as scheduling.
  settings := settings || jsonb_build_object('slotIntervalMinutes',20,'slotIntervalUpdatedAt',clock_timestamp(),'dateSlotIntervals',jsonb_build_array(jsonb_build_object('date',(day+1)::text,'slotIntervalMinutes',5)));
  perform public.update_client_portal_availability_settings(w.owner_email,w.slug,settings);
  select availability_settings into saved from public.client_portals where salon_code=w.slug limit 1;
  if public.availability_slot_interval_for_date(saved,current_date)<>20 then raise exception 'immediate_change_not_persisted'; end if;
  if public.availability_slot_interval_for_date(saved,day)<>20 then raise exception 'immediate_change_future_not_persisted'; end if;
  if public.availability_slot_interval_for_date(saved,day+1)<>5 then raise exception 'protected_date_changed'; end if;

end $$;
select 'immediate change, scheduling, protected dates and cancellation PASS' as result;
rollback;
