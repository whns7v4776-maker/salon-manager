begin;
do $$
declare e public.booking_slot_waitlist%rowtype; v_payload jsonb; v_service jsonb; result boolean;
begin
 select id into e.workspace_id from public.workspaces where slug='salonpro-lcom' limit 1;
 if e.workspace_id is null then select id into e.workspace_id from public.workspaces where subscription_status in ('demo','active') limit 1; end if;
 v_payload:=public.get_public_portal_owner_payload_cached_v1(e.workspace_id);
 select value into v_service from jsonb_array_elements(v_payload->'servizi') where coalesce(value->>'nome','')<>'' limit 1;
 e.appointment_date:=current_date+7;e.appointment_time:='10:00';e.requested_service_name:=v_service->>'nome';e.requested_duration_minutes:=45;
 e.customer_name:='QA';e.customer_surname:='Waitlist';e.customer_email:='qa-waitlist@example.invalid';e.customer_phone:='0000000000';
 e.booking_plan:=jsonb_build_object('version',1,'intervals',jsonb_build_array(jsonb_build_object('startOffsetMinutes',0,'durationMinutes',45)),'phased',false);
 result:=public.is_waitlist_plan_available_v1(e);
 if result is null then raise exception 'simple plan returned null';end if;
 e.booking_plan:=e.booking_plan || '{"phased":true}'::jsonb;
 result:=public.is_waitlist_plan_available_v1(e);
 if result is null then raise exception 'phased plan returned null';end if;
 e.booking_plan:=e.booking_plan || jsonb_build_object('dependencyServiceId','00000000-0000-0000-0000-000000000001');
 begin result:=public.is_waitlist_plan_available_v1(e); exception when others then
   if sqlerrm not like '%service%' and sqlerrm not like '%dependency%' then raise;end if;
 end;
 e.booking_plan:=jsonb_build_object('version',1,'compositionId','00000000-0000-0000-0000-000000000001');
 result:=public.is_waitlist_plan_available_v1(e);
 if result then raise exception 'nonexistent composition accepted';end if;
end $$;
select 'PASS canonical simple, phased, dependency and composition RPC dispatch' as result;

-- Transaction-only stub: isolate persistence from live salon occupancy.
create or replace function public.is_waitlist_plan_available_v1(p_entry public.booking_slot_waitlist)
returns boolean language sql stable security definer set search_path=public as $$ select p_entry.requested_service_name='QA waitlist plan' and p_entry.requested_duration_minutes <= coalesce(nullif(current_setting('salonpro.qa_free_minutes',true),''),'0')::integer $$;
do $$
declare slug text; wid uuid; r jsonb; p jsonb; saved public.booking_slot_waitlist%rowtype; alerts jsonb;
begin
 select w.slug,w.id into slug,wid from public.workspaces w where subscription_status in ('demo','active') limit 1;
 p:='{"version":1,"serviceId":"qa","compositionId":null,"dependencyServiceId":null,"label":"QA completo","durationMinutes":45,"phased":false,"allowSplitOperators":true,"requiredRole":null,"intervals":[{"startOffsetMinutes":0,"durationMinutes":45}]}'::jsonb;
 r:=public.join_public_slot_waitlist_v2(slug,'QA waitlist plan',45,current_date+7,'10:00','QA','Waitlist','qa-waitlist@example.invalid','0000000000',null,null,null,null,p);
 select * into saved from public.booking_slot_waitlist where id=(r->>'waitlistEntryId')::uuid;
 if saved.booking_plan is distinct from p or saved.requested_duration_minutes<>45 then raise exception 'plan did not persist';end if;
 r:=public.join_public_slot_waitlist_v2(slug,'QA waitlist plan',45,current_date+7,'10:00','QA','Waitlist','qa-waitlist@example.invalid','0000000000',null,null,null,null,p);
 if not coalesce((r->>'alreadyJoined')::boolean,false) then raise exception 'repeat registration not idempotent';end if;
 begin
 perform public.join_public_slot_waitlist_v2(slug,'QA waitlist plan',60,current_date+7,'10:00','QA','Waitlist','qa-waitlist@example.invalid','0000000000',null,null,null,null,p||'{"durationMinutes":60}'::jsonb);
 raise exception 'changed plan silently accepted';
 exception when others then if sqlerrm <> 'waitlist_existing_plan_differs' then raise;end if; end;
 alerts:=public.get_public_customer_waitlist_alerts_v2(slug,'qa-waitlist@example.invalid','0000000000');
 if not exists(select 1 from jsonb_array_elements(alerts) a where a->'booking_plan'=p) then raise exception 'saved plan not restored';end if;
 perform set_config('salonpro.qa_free_minutes','15',true);
 perform public.process_public_slot_waitlist(wid,current_date+7,'10:15',null,null);
 if exists(select 1 from public.booking_slot_waitlist where id=saved.id and status<>'waiting') then raise exception 'unavailable complete plan notified';end if;
 perform set_config('salonpro.qa_free_minutes','45',true);
 perform public.process_public_slot_waitlist(wid,current_date+7,'10:15',null,null);
 if not exists(select 1 from public.booking_slot_waitlist where id=saved.id and status='notified' and booking_plan=p) then raise exception 'complete plan not notified after later phase freed';end if;
end $$;
select 'PASS persistence, reload, duplicate registration, immutable active plan, no premature alert' as result;

rollback;