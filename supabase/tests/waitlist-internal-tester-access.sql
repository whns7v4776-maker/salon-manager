begin;
do $$
declare r jsonb;
begin
 if not exists(select 1 from public.workspaces where slug='salonpro-lcom' and is_internal_tester) then raise exception 'tester fixture missing'; end if;
 r:=public.join_public_slot_waitlist_v2('salonpro-lcom','Barba Uomo',15,'2026-09-21','10:00','QA','Waitlist','qa-waitlist@example.invalid','0000000000',null,null,null,'Alex','{"version":1,"durationMinutes":15,"phased":false,"intervals":[{"startOffsetMinutes":0,"durationMinutes":15}]}');
 if r->>'status' <> 'waiting' then raise exception 'tester alert not saved: %',r; end if;
 update public.workspaces set is_internal_tester=false,subscription_status='expired' where slug='salonpro-lcom';
 begin
 perform public.join_public_slot_waitlist_v2('salonpro-lcom','Barba Uomo',15,'2026-09-21','10:00','QA','Waitlist','qa-waitlist@example.invalid','0000000000',null,null,null,'Alex','{"version":1,"durationMinutes":15}');
 raise exception 'expired non-tester was accepted';
 exception when raise_exception then if sqlerrm <> 'workspace_not_found' then raise; end if; end;
end $$;
select 'PASS tester allowed; expired non-tester rejected' as result;
rollback;
