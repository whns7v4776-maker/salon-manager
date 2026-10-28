begin;
do $$
declare w record; u record; owner_id uuid; result jsonb; cid uuid; got uuid; cnt integer;
begin
  select ws.* into w from public.workspaces ws where ws.is_internal_tester and exists(select 1 from public.customers c where c.workspace_id=ws.id and c.email is not null and c.phone is not null) and exists(select 1 from auth.users a where lower(a.email)=lower(ws.owner_email::text)) limit 1;
  if w.id is null then raise exception 'test_workspace_missing'; end if;
  select id into owner_id from auth.users where lower(email)=lower(w.owner_email::text) limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',owner_id,'email',w.owner_email,'role','authenticated')::text,true);
  if public.current_workspace_id() <> w.id then raise exception 'workspace_mismatch'; end if;
  select * into u from public.customers where workspace_id=w.id and email is not null and phone is not null limit 1;
  update public.customer_communications set reminder_cancelled_at=now() where workspace_id=w.id and reminder_starts_at is not null;
  result:= public.save_owner_customer_popup_v1('Test popup','Test transazionale senza invii','[]',true,'test-popup-controls-rollback',(now() at time zone 'Europe/Rome')-interval '1 minute',(now() at time zone 'Europe/Rome')+interval '2 days');
  cid:=(result->>'communicationId')::uuid;
  if (result->>'queuedCount')::int<>0 then raise exception 'popup_queued_push'; end if;
  if (public.save_owner_customer_popup_v1('Test popup','Test transazionale senza invii','[]',true,'test-popup-controls-rollback',(now() at time zone 'Europe/Rome')-interval '1 minute',(now() at time zone 'Europe/Rome')+interval '2 days')->>'communicationId')::uuid <> cid then raise exception 'idempotency_failed'; end if;
  -- Simulate a customer who was not a recipient when the popup was created.
  delete from public.customer_communication_recipients where communication_id=cid and customer_id=u.id;
  select communication_id into got from public.claim_public_customer_daily_reminder(w.slug,u.email,u.phone);
  if got is distinct from cid then raise exception 'future_customer_not_included'; end if;
  select count(*) into cnt from public.claim_public_customer_daily_reminder(w.slug,u.email,u.phone);
  if cnt<>0 then raise exception 'same_day_repeated'; end if;
  delete from public.customer_communication_reminder_days where communication_id=cid;
  select communication_id into got from public.claim_public_customer_daily_reminder(w.slug,u.email,u.phone);
  if got is distinct from cid then raise exception 'next_day_missing'; end if;
  if not public.dismiss_public_customer_popup_v1(cid,w.slug,u.email,u.phone) then raise exception 'dismiss_failed'; end if;
  delete from public.customer_communication_reminder_days where communication_id=cid;
  select count(*) into cnt from public.claim_public_customer_daily_reminder(w.slug,u.email,u.phone);
  if cnt<>0 then raise exception 'dismissal_not_persistent'; end if;
  delete from public.customer_communication_reminder_dismissals where communication_id=cid;
  perform public.cancel_owner_customer_popup_v1(cid);
  select count(*) into cnt from public.claim_public_customer_daily_reminder(w.slug,u.email,u.phone);
  if cnt<>0 then raise exception 'cancelled_popup_shown'; end if;
end $$;
select 'popup: idempotency, future recipients, daily repeat, permanent dismissal, owner cancellation PASS' as result;

rollback;
