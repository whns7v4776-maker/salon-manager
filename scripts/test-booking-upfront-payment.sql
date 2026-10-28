-- This suite is run inside BEGIN + the migration + ROLLBACK. Every payment is
-- a synthetic SQL receipt: no Stripe request, charge, or real salon mutation.
create temporary table booking_hold_test_results(name text primary key);
create function pg_temp.hold_assert(p_ok boolean,p_name text) returns void language plpgsql as $$
begin if p_ok is not true then raise exception 'TEST FAILED: %',p_name;end if;
  insert into booking_hold_test_results values(p_name);end $$;
create function pg_temp.hold_error(p_sql text,p_error text,p_name text) returns void language plpgsql as $$
declare message text;begin
  begin execute p_sql;exception when others then get stacked diagnostics message=message_text;
    if message not like '%'||p_error||'%' then raise exception 'TEST FAILED %: expected %, got %',p_name,p_error,message;end if;
    insert into booking_hold_test_results values(p_name);return;end;
  raise exception 'TEST FAILED %: expected error %',p_name,p_error;
end $$;

do $tests$
declare w uuid=gen_random_uuid();c uuid=gen_random_uuid();owner uuid=gen_random_uuid();s uuid=gen_random_uuid();op uuid=gen_random_uuid();
  code text='payment-hold-'||gen_random_uuid();email text='payment-hold-owner-'||gen_random_uuid()||'@example.test';
  req booking_requests;full_request booking_requests;manual_request booking_requests;expired_request booking_requests;
  late_request booking_requests;free_request booking_requests;group_request booking_requests;group_other booking_requests;
  group_id uuid=gen_random_uuid();result jsonb;held jsonb;reserve jsonb;first_expiry timestamptz;batch uuid;
  account text='acct_fixture_'||replace(gen_random_uuid()::text,'-','');initial_count integer;paid bigint;refunded bigint;
  settings jsonb;day date=current_date+20;normal_request uuid;phase jsonb;
  op2 uuid=gen_random_uuid();s2 uuid=gen_random_uuid();phased_service uuid=gen_random_uuid();composition uuid=gen_random_uuid();
  final_hair_service uuid=gen_random_uuid();final_hair_operator uuid=gen_random_uuid();
  no_operator_service uuid=gen_random_uuid();no_operator_request booking_requests;
  phase_request booking_requests;composition_request booking_requests;extra_request booking_requests;spoof_request booking_requests;
  redemption uuid=gen_random_uuid();package uuid=gen_random_uuid();package_receipt uuid;covered booking_requests;receipt_ledger jsonb;
begin
  perform set_config('request.jwt.claims','{}',true);perform set_config('request.jwt.claim.role','',true);
  insert into workspaces(id,salon_name,slug,owner_email,is_internal_tester,subscription_status,auto_accept_booking_requests)
    values(w,'Booking Payment Hold Fixture',code,email,true,'active',true);
  settings=jsonb_build_object('guidedSlotsEnabled',false,'publicSlotIntervalMode','custom','publicSlotMinimumIntervalMinutes',5,
    'publicBookingWindowValue',365,'publicBookingWindowUnit','days','weeklySchedule',
    (select jsonb_agg(jsonb_build_object('weekday',i,'isClosed',false,'startTime','09:00','endTime','18:00')) from generate_series(0,6)i));
  insert into client_portals(workspace_id,owner_email,salon_code,salon_name,availability_settings)
    values(w,email,code,'Booking Payment Hold Fixture',settings);
  insert into owner_app_snapshots(workspace_id,payload) values(w,jsonb_build_object('workspace',jsonb_build_object('id',w,'ownerEmail',email,'salonCode',code),
    'clienti','[]'::jsonb,'appuntamenti','[]'::jsonb,'richiestePrenotazione','[]'::jsonb,'availabilitySettings',settings,
    'servizi',jsonb_build_array(jsonb_build_object('id',s,'nome','Hold Fixture Service','prezzo',20,'durataMinuti',20,'online',true,'requiredRole','Barber')),
    'operatori',jsonb_build_array(jsonb_build_object('id',op,'nome','Hold Fixture Operator','requiredRole','Barber'))));
  insert into services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
    values(s,w,'Hold Fixture Service',20,20,true,'Barber');
  insert into operators(id,workspace_id,name,required_role) values(op,w,'Hold Fixture Operator','Barber');
  insert into customers(id,workspace_id,full_name,email,phone,source) values(c,w,'Hold Fixture Customer','hold-fixture@example.test','3332000000','frontend');
  insert into push_devices(workspace_id,owner_email,expo_push_token,platform,audience,recipient_kind,is_active)
    values(w,email,'ExponentPushToken[holdfixtureowner000000000]','ios','auth','owner',true);
  insert into push_devices(workspace_id,owner_email,customer_email,customer_phone,expo_push_token,platform,audience,recipient_kind,is_active)
    values(w,email,'hold-fixture@example.test','3332000000','ExponentPushToken[holdfixtureclient00000000]','ios','public','client',true);
  insert into cash_stripe_accounts(workspace_id,account_id,livemode) values(w,account,false);
  perform save_booking_payment_policy(w,null,'deposit',50,0);
  req=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  perform pg_temp.hold_assert(req.status='pending' and req.payment_hold_state='awaiting_payment','Deposit creates unpaid hold instead of accepted booking');
  perform pg_temp.hold_assert(not exists(select 1 from appointments where booking_request_id=req.id),'Unpaid hold has no appointment');
  perform pg_temp.hold_assert(not exists(select 1 from push_notifications where workspace_id=w),'Unpaid hold emits no owner or confirmation push');
  held=prepare_booking_payment_hold_v1(w,req.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert((held->>'due_cents')::bigint=1000 and (held->>'total_cents')::bigint=2000,'Deposit amount is frozen from server agreement');
  perform pg_temp.hold_assert(cardinality((select request_ids from booking_payment_hold_batches where id=batch))=1,'Ordinary hold seals one canonical request');
  perform pg_temp.hold_assert((select booking_voided and payment_method is null from cash_movements m join booking_payment_orders o on o.upfront_movement_id=m.id where o.request_id=req.id),'Unpaid hold is excluded from real receipts and cash debt');
  perform pg_temp.hold_error(format('update booking_requests set status=''cancelled'' where id=%L::uuid',req.id),'booking_payment_session_must_be_reconciled','Legacy cancellation cannot release capacity while Checkout may remain payable');
  perform pg_temp.hold_error(format('delete from booking_requests where id=%L::uuid',req.id),'booking_payment_hold_receipt_history','Held history cannot be deleted through legacy owner APIs');
  perform pg_temp.hold_error(format('select create_public_booking_request_ultralight_v4(%L,''Hold Fixture Service'',20,20,%L::date,''10:00''::time,''Other Customer'','''',''other-hold@example.test'',''3332999999'',null,null,''Barber'',%L,%L)',code,day,op::text,'Hold Fixture Operator'),'slot_unavailable','Competing customer cannot create a booking into the held operator slot');
  perform pg_temp.hold_assert((select count(*)=1 from booking_requests where workspace_id=w),'Failed competing booking leaves no partial request');
  perform pg_temp.hold_assert((select cliente='' from get_public_booking_occupancy_phased_v1(code,day) where id='pending-'||req.id::text),'Live phased occupancy retains capacity while redacting held customer name');
  result=customer_booking_payment_notices(w,c);
  perform pg_temp.hold_assert(result->0->>'appointmentDate'=day::text and result->0->>'appointmentTime'='10:00',
    'Recovered unpaid checkout identifies the persisted appointment day and time');
  result=get_client_portal_snapshot(code);
  perform pg_temp.hold_assert(jsonb_array_length(result->'richiestePrenotazione')=0,'Unpaid hold is absent from ordinary customer notifications');
  perform pg_temp.hold_assert(jsonb_array_length(result->'paymentHoldOccupancy')=1
    and not (result->'paymentHoldOccupancy'->0 ? 'email') and not (result->'paymentHoldOccupancy'->0 ? 'nome'),'Unpaid capacity is exposed without customer identity');
  perform pg_temp.hold_assert(is_public_booking_slot_available(w,day,time '10:00',20,'Hold Fixture Service',op::text,'Hold Fixture Operator') is false,'Canonical availability blocks capacity while payment is pending');
  perform pg_temp.hold_error(format('select accept_booking_request_or_group_core_v3(%L::uuid,%L::uuid)',w,req.id),'booking_payment_required','Older owner acceptance cannot confirm an unpaid hold');
  perform pg_temp.hold_error(format('update booking_requests set status=''accepted'' where id=%L::uuid',req.id),'booking_payment_required','Direct status publish cannot confirm an unpaid hold');
  update booking_requests set payment_hold_state='paid',payment_hold_batch_id=null where id=req.id;
  perform pg_temp.hold_assert((select payment_hold_state='awaiting_payment' and payment_hold_batch_id=batch from booking_requests where id=req.id),'Stale full upsert cannot forge payment or erase batch');
  perform pg_temp.hold_error(format('update cash_movements set payment_method=''card'' where id=(select upfront_movement_id from booking_payment_orders where request_id=%L::uuid)',req.id),
    'booking_payment_requires_stripe_verification','Manual receipt edit cannot fake verified upfront payment');
  update booking_requests set created_at=now()-interval '1 minute' where id=req.id;
  perform process_due_auto_accept_booking_requests(100);
  perform pg_temp.hold_assert((select status='pending' from booking_requests where id=req.id),'Autoaccept timer skips unpaid hold');
  reserve=reserve_booking_payment_hold_v1(w,req.id,account,false);first_expiry=(reserve->>'checkout_expires_at')::timestamptz;
  perform pg_temp.hold_assert((reserve->>'expires_at')::timestamptz=(held->>'expires_at')::timestamptz,'Starting Checkout never extends the original five-minute slot hold');
  perform pg_temp.hold_assert(first_expiry>now()+interval '35 minutes' and first_expiry<now()+interval '37 minutes' and (reserve->>'expires_at')::timestamptz<now()+interval '6 minutes' and reserve->>'receipt_email'='hold-fixture@example.test','Checkout freezes valid expiry and receipt identity');
  reserve=reserve_booking_payment_hold_v1(w,req.id,account,false);
  perform pg_temp.hold_assert((reserve->>'checkout_expires_at')::timestamptz=first_expiry,'Network retry preserves exact Stripe idempotency parameters');
  perform pg_temp.hold_error(format('select reserve_booking_payment_hold_v1(%L::uuid,%L::uuid,''acct_other'',false)',w,req.id),'booking_payment_account_mismatch','Checkout rejects another connected account');
  perform attach_booking_payment_hold_checkout_v1(batch,account,false,'cs_fixture_deposit','https://checkout.stripe.com/c/pay/cs_fixture_deposit');
  perform pg_temp.hold_error(format('select settle_booking_payment_hold_v1(%L::uuid,%L,false,''cs_fixture_deposit'',999,''eur'',''pi_fixture_deposit'')',batch,account),
    'booking_payment_settlement_mismatch','Amount mismatch cannot settle or confirm');
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_deposit',1000,'eur','pi_fixture_deposit');
  perform pg_temp.hold_assert(result->>'state'='paid' and result->>'bookingStatus'='accepted','Verified deposit atomically confirms automatic booking');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert((select count(*)=1 from appointments where booking_request_id=req.id),'Verified deposit creates exactly one appointment');
  perform pg_temp.hold_assert((select a.cashed_in is false and o.appointment_id=a.id and o.balance_movement_id is not null
    from appointments a join booking_payment_orders o on o.request_id=a.booking_request_id where a.booking_request_id=req.id),'Deposit attaches receipt and creates only unpaid salon balance');
  perform pg_temp.hold_assert(booking_payment_received_cents(req.id)=1000 and booking_payment_paid_cents(req.id)=1000,'Deposit cash receipt is counted once');
  initial_count=(select count(*) from push_notifications where workspace_id=w);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_deposit',1000,'eur','pi_fixture_deposit');
  perform pg_temp.hold_assert(result->'replayed'='true'::jsonb and (select count(*)=initial_count from push_notifications where workspace_id=w),'Repeated Stripe webhook adds no receipt appointment or push');
  result=customer_booking_payment_notices(w,c);
  perform pg_temp.hold_assert(jsonb_array_length(result)=0,'Paid deposit has no misleading payment-required notice');
  perform refund_booking_payment_hold_v1(batch,account,false,'pi_fixture_deposit',333);
  perform pg_temp.hold_assert(booking_payment_paid_cents(req.id)=667 and booking_payment_received_cents(req.id)=1000,'Verified refund changes net receipt without inventing customer debt');

  perform save_booking_payment_policy(w,null,'full',100,1);
  full_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day,time '11:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  held=prepare_booking_payment_hold_v1(w,full_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert((held->>'due_cents')::bigint=2000 and full_request.status='pending','Full balance also requires payment before booking');
  perform reserve_booking_payment_hold_v1(w,full_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_full',2000,'eur','pi_fixture_full');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and (select cashed_in from appointments where booking_request_id=full_request.id),'Verified full balance confirms an already-paid appointment');
  perform pg_temp.hold_assert((select balance_movement_id is null from booking_payment_orders where request_id=full_request.id)
    and booking_payment_received_cents(full_request.id)=2000,'Full balance creates one receipt and no redundant debt');

  update workspaces set auto_accept_booking_requests=false where id=w;
  manual_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day,time '12:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  held=prepare_booking_payment_hold_v1(w,manual_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,manual_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_manual',2000,'eur','pi_fixture_manual');
  perform pg_temp.hold_assert(result->>'bookingStatus'='pending' and not exists(select 1 from appointments where booking_request_id=manual_request.id),'Verified payment preserves explicit salon approval');
  perform pg_temp.hold_assert((select payment_hold_state='paid' and status='pending' from booking_requests where id=manual_request.id),'Paid manual request is released as ordinary pending');
  perform accept_booking_request_or_group_core_v3(w,manual_request.id);
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert((select cashed_in from appointments where booking_request_id=manual_request.id),'Salon can accept the already-paid manual request');

  expired_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day,time '13:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  held=prepare_booking_payment_hold_v1(w,expired_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_error(format('select expire_booking_payment_hold_v1(%L::uuid,null,null,null)',batch),'booking_payment_hold_not_expired','Clock cannot expire an active unstarted hold');
  result=cancel_unstarted_booking_payment_hold_v1(w,expired_request.id);
  perform pg_temp.hold_assert(result->>'state'='expired' and (select status='cancelled' and viewed_by_salon and viewed_by_customer from booking_requests where id=expired_request.id),'User cancellation releases an unstarted hold silently');
  perform pg_temp.hold_assert(is_public_booking_slot_available(w,day,time '13:00',20,'Hold Fixture Service',op::text,'Hold Fixture Operator'),'Cancelled unpaid hold releases capacity');
  perform pg_temp.hold_assert(not exists(select 1 from appointments where booking_request_id=expired_request.id),'Cancelled unpaid hold never leaves a calendar entry');

  late_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day,time '14:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  held=prepare_booking_payment_hold_v1(w,late_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,late_request.id,account,false);
  perform attach_booking_payment_hold_checkout_v1(batch,account,false,'cs_fixture_late','https://checkout.stripe.com/c/pay/cs_fixture_late');
  update booking_payment_hold_batches set expires_at=now()-interval '1 minute' where id=batch;
  perform pg_temp.hold_error(format('select expire_booking_payment_hold_v1(%L::uuid,null,null,null)',batch),'booking_payment_expiration_mismatch','Local clock cannot free an open Stripe session');
  result=claim_due_booking_payment_holds_v1(20);
  perform pg_temp.hold_assert(jsonb_array_length(result)=1,'Sweep leases due started batch once');
  result=claim_due_booking_payment_holds_v1(20);
  perform pg_temp.hold_assert(jsonb_array_length(result)=0,'Concurrent sweep cannot reclaim a leased batch immediately');
  perform expire_booking_payment_hold_v1(batch,account,false,'cs_fixture_late');
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_late',2000,'eur','pi_fixture_late');
  perform pg_temp.hold_assert(result->>'state'='paid_conflict' and not exists(select 1 from appointments where booking_request_id=late_request.id),'Late successful receipt cannot resurrect an expired booking');
  perform pg_temp.hold_assert(booking_payment_received_cents(late_request.id)=2000,'Late payment receipt remains recorded for review/refund');
  result=customer_booking_payment_notices(w,c);
  perform pg_temp.hold_assert(exists(select 1 from jsonb_array_elements(result)x where x->>'status'='paid_conflict' and (x->>'paidCents')::integer=2000 and x ? 'groupRequestIds'
    and x->>'appointmentDate'=day::text and x->>'appointmentTime'='14:00'),'Late payment has a durable review notice and no checkout CTA');
  perform refund_booking_payment_hold_v1(batch,account,false,'pi_fixture_late',2000);
  result=customer_booking_payment_notices(w,c);
  perform pg_temp.hold_assert(not exists(select 1 from jsonb_array_elements(result)x where x->>'batchId'=batch::text),'Full verified refund resolves late-payment review notice');

  update workspaces set auto_accept_booking_requests=true where id=w;
  insert into appointment_groups(id,workspace_id,title,source,status,total_price,idempotency_key,metadata)
    values(group_id,w,'Two phase fixture','frontend','active',40,'hold-fixture-group-'||gen_random_uuid(),jsonb_build_object('kind','composition'));
  insert into booking_requests(workspace_id,customer_id,customer_email,customer_phone,customer_name,requested_service_name,
    requested_price,requested_duration_minutes,appointment_date,appointment_time,origin,status,requested_operator_id,requested_operator_name,
    required_role,appointment_group_id,appointment_group_order)
    values(w,c,'hold-fixture@example.test','3332000000','Hold Fixture Customer','Hold Fixture Service',20,20,day,time '15:00','frontend','pending',op::text,'Hold Fixture Operator','Barber',group_id,0)
    returning * into group_request;
  insert into booking_requests(workspace_id,customer_id,customer_email,customer_phone,customer_name,requested_service_name,
    requested_price,requested_duration_minutes,appointment_date,appointment_time,origin,status,requested_operator_id,requested_operator_name,
    required_role,appointment_group_id,appointment_group_order)
    values(w,c,'hold-fixture@example.test','3332000000','Hold Fixture Customer','Hold Fixture Service',20,20,day,time '15:20','frontend','pending',op::text,'Hold Fixture Operator','Barber',group_id,1)
    returning * into group_other;
  held=prepare_booking_payment_hold_v1(w,group_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert(jsonb_array_length(held->'request_ids')=2 and (held->>'due_cents')::bigint=4000,'Linked services share one exact-price Checkout batch');
  perform pg_temp.hold_assert((select count(distinct payment_hold_batch_id)=1 from booking_requests where appointment_group_id=group_id),'Every phase belongs to one sealed payment barrier');
  perform pg_temp.hold_error(format('select accept_booking_request_or_group_core_v3(%L::uuid,%L::uuid)',w,group_other.id),'booking_payment_required','No sibling can bypass the whole-group unpaid barrier');
  perform reserve_booking_payment_hold_v1(w,group_other.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_group',4000,'eur','pi_fixture_group');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and (select count(*)=2 from appointments where appointment_group_id=group_id),'Single verified group payment confirms all phases atomically');
  perform pg_temp.hold_assert((select count(*)=2 and sum(due_cents)=4000 from booking_payment_hold_allocations where batch_id=batch),'Group receipt allocation preserves exact paid total without duplicate Stripe intents');
  perform refund_booking_payment_hold_v1(batch,account,false,'pi_fixture_group',333);
  select sum(booking_payment_hold_refunded_for_movement_v1(upfront_movement_id)) into refunded
    from booking_payment_hold_allocations where batch_id=batch;
  perform pg_temp.hold_assert(refunded=333 and booking_payment_paid_cents(group_request.id)+booking_payment_paid_cents(group_other.id)=3667,'Partial group refund assigns every cent once');


  -- Actual legacy public constructor: caller price hints cannot evade deposits.
  spoof_request=create_public_booking_request_ultralight_v2(code,'Hold Fixture Service',0.01,20,day+1,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator');
  perform pg_temp.hold_assert(spoof_request.requested_price=20 and spoof_request.payment_hold_state='awaiting_payment','Legacy one-cent price hint cannot bypass canonical upfront payment');
  perform prepare_booking_payment_hold_v1(w,spoof_request.id);

  -- Actual public phased constructor, two different operators and released processing time.
  insert into operators(id,workspace_id,name,required_role) values(op2,w,'Hold Final Operator','Barber');
  phase=jsonb_build_object('mode','phased','initialDurationMinutes',20,'processingDurationMinutes',20,
    'finalDurationMinutes',20,'finalServiceName','Hold Phase Service','finalPhaseEnabled',true);
  insert into services(id,workspace_id,name,price,duration_minutes,is_online,required_role,phase_config)
    values(phased_service,w,'Hold Phase Service',30,60,true,'Barber',phase);
  phase_request=create_public_phased_booking_request_with_assignments_v1(code,'Hold Phase Service',30,60,day+2,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator',op2::text,'Hold Final Operator',phase);
  held=prepare_booking_payment_hold_v1(w,phase_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert(phase_request.payment_hold_state='awaiting_payment' and phase_request.requested_duration_minutes=60
    and phase_request.phase_operator_assignments->'final'->>'id'=op2::text,'Canonical phased builder preserves complete unpaid phase assignments');
  perform pg_temp.hold_assert(phased_operator_interval_conflicts_v1(w,day+2,time '10:00',20,op::text,'Hold Fixture Operator',null,null)
    and phased_operator_interval_conflicts_v1(w,day+2,time '10:40',20,op2::text,'Hold Final Operator',null,null),'Both assigned phase operators are reserved during their active phases');
  perform pg_temp.hold_assert(not phased_operator_interval_conflicts_v1(w,day+2,time '10:20',20,op::text,'Hold Fixture Operator',null,null),'Phased processing time does not falsely consume an operator');
  result=get_client_portal_snapshot(code);
  perform pg_temp.hold_assert(exists(select 1 from jsonb_array_elements(result->'paymentHoldOccupancy')x where x->>'id'=phase_request.id::text
    and x->'phaseOperatorAssignments'->'final'->>'id'=op2::text),'Public hold capacity preserves both phase assignments');
  perform reserve_booking_payment_hold_v1(w,phase_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_phase',3000,'eur','pi_fixture_phase');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and exists(select 1 from appointments where booking_request_id=phase_request.id),'Verified payment releases the actual phased booking atomically');
  perform set_config('salonpro.phased_slot_prevalidated','off',true);


  insert into operators(id,workspace_id,name,required_role) values(final_hair_operator,w,'Hold Hair Final Operator','Hair Stylist');
  insert into services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
    values(final_hair_service,w,'Hold Hair Final Service',10,20,true,'Hair Stylist');
  phase=phase||jsonb_build_object('finalServiceId',final_hair_service,'finalServiceName','Hold Hair Final Service');
  update services set phase_config=phase where id=phased_service;
  update services set is_online=false where id=final_hair_service;
  phase_request=create_public_phased_booking_request_with_assignments_v1(code,'Hold Phase Service',30,60,day+11,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator',final_hair_operator::text,'Hold Hair Final Operator',phase);
  held=prepare_booking_payment_hold_v1(w,phase_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,phase_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_final_role',3000,'eur','pi_fixture_final_role');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and exists(select 1 from appointments where booking_request_id=phase_request.id),
    'Linked final phase uses its canonical different role even when hidden online');
  perform set_config('salonpro.phased_slot_prevalidated','off',true);


  phase=phase||jsonb_build_object('finalServiceId',null,'finalServiceName','Legacy final phase label');
  update services set phase_config=phase where id=phased_service;
  phase_request=create_public_phased_booking_request_with_assignments_v1(code,'Hold Phase Service',30,60,day+12,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator',op2::text,'Hold Final Operator',phase);
  held=prepare_booking_payment_hold_v1(w,phase_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,phase_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_legacy_label',3000,'eur','pi_fixture_legacy_label');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and exists(select 1 from appointments where booking_request_id=phase_request.id),
    'Legacy plain final-phase label preserves the parent operator capability');
  perform set_config('salonpro.phased_slot_prevalidated','off',true);

  -- Real composition constructor and package binder: covered component + paid extra.
  insert into services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
    values(s2,w,'Hold Extra Service',10,10,true,'Barber');
  insert into service_compositions(id,workspace_id,name,visibility,is_active,allow_split_operators)
    values(composition,w,'Hold Public Composition','public',true,false);
  insert into service_composition_items(workspace_id,composition_id,service_id,position)
    values(w,composition,s,0),(w,composition,s2,1);
  result=create_public_booking_composition_v1(code,composition,day+3,time '10:00','Hold Fixture Customer','',
    'hold-fixture@example.test','3332000000',null,null,op::text,'Hold Fixture Operator','hold-composition-'||composition);
  perform pg_temp.hold_assert(result->>'paymentHoldState'='awaiting_payment' and jsonb_array_length(result->'requestIds')=2,'Real composition JSON declares unpaid payment barrier for every phase');
  select * into composition_request from booking_requests where id=(result->'requestIds'->>0)::uuid;
  held=prepare_booking_payment_hold_v1(w,composition_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert((held->>'due_cents')::integer=3000 and jsonb_array_length(held->'request_ids')=2,'Real composition seals one Checkout for the canonical combined price');
  perform cancel_unstarted_booking_payment_hold_v1(w,composition_request.id);

  insert into cash_movements(workspace_id,description,amount,payment_method) values(w,'Fixture prepaid package',50,'cash') returning id into package_receipt;
  insert into customer_service_packages(id,workspace_id,customer_id,name,entitlements,uses,starts_on,expires_on,price_cents,purchase_movement_id)
    values(package,w,c,'Fixture package',jsonb_build_array(jsonb_build_object('kind','service','id',s,'componentIds',jsonb_build_array(s))),5,day-1,day+30,5000,package_receipt);
  insert into service_package_redemptions(id,workspace_id,package_id,service_key,idempotency_key)
    values(redemption,w,package,'service:'||s,'package-covered-fixture');
  perform set_config('salonpro.package_redemption',redemption::text,true);
  result=create_public_booking_composition_v1(code,composition,day+4,time '10:00','Hold Fixture Customer','',
    'hold-fixture@example.test','3332000000',null,null,op::text,'Hold Fixture Operator','hold-package-extra-'||composition);
  perform set_config('salonpro.package_redemption','',true);
  select * into covered from booking_requests where id=(result->'requestIds'->>0)::uuid;
  select * into extra_request from booking_requests where id=(result->'requestIds'->>1)::uuid;
  held=prepare_booking_payment_hold_v1(w,extra_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert(covered.requested_price=0 and (held->>'due_cents')::integer=1000,'Prepaid package component is not charged again; Checkout includes only uncovered extra');
  perform pg_temp.hold_assert((select payment_hold_state='awaiting_payment' and payment_hold_batch_id=batch from booking_requests where id=covered.id),'Covered phase also waits for the whole-group extra payment');
  perform pg_temp.hold_error(format('select accept_booking_request_or_group_core_v3(%L::uuid,%L::uuid)',w,covered.id),'booking_payment_required','Package-covered sibling cannot confirm before extra payment');
  perform reserve_booking_payment_hold_v1(w,extra_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_package_extra',1000,'eur','pi_fixture_package_extra');
  perform pg_temp.hold_assert(result->>'bookingStatus'='pending' and not exists(select 1 from appointments where booking_request_id=covered.id),'Paid composition preserves its explicit salon approval setting');
  update booking_requests set created_at=now()-interval '1 minute' where appointment_group_id=covered.appointment_group_id;
  perform process_due_auto_accept_booking_requests(100);
  perform pg_temp.hold_assert((select bool_and(status='pending') from booking_requests where appointment_group_id=covered.appointment_group_id)
    and not exists(select 1 from appointments where appointment_group_id=covered.appointment_group_id),'Automatic timer cannot bypass the paid composition manual approval flag');
  perform accept_booking_request_or_group_core_v3(w,covered.id);
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and exists(select 1 from appointments where booking_request_id=covered.id and price=0),'Package-covered and paid extra phases become appointments together');
  perform pg_temp.hold_assert(not exists(select 1 from booking_payment_orders where request_id=covered.id),'Covered phase produces no second payment receipt');


  perform set_config('salonpro.public_linked_booking','off',true);
  redemption=gen_random_uuid();
  insert into service_package_redemptions(id,workspace_id,package_id,service_key,idempotency_key)
    values(redemption,w,package,'service:'||s,'package-fully-covered-fixture');
  perform set_config('salonpro.package_redemption',redemption::text,true);
  covered=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day+6,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  perform set_config('salonpro.package_redemption','',true);
  perform pg_temp.hold_assert(covered.requested_price=0 and covered.payment_hold_state is null,'Entirely prepaid package booking needs no second online payment');
  perform pg_temp.hold_assert(not exists(select 1 from booking_payment_orders where request_id=covered.id),'Entirely covered booking creates no extra payment order');
  insert into customer_service_price_overrides(workspace_id,customer_id,service_id,price) values(w,c,s,0);
  covered=create_public_booking_request_ultralight_v2(code,'Hold Fixture Service',20,20,day+7,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator');
  perform pg_temp.hold_assert(covered.requested_price=0 and covered.payment_hold_state is null,'Legitimate stored free customer override remains free');
  delete from customer_service_price_overrides where workspace_id=w and customer_id=c and service_id=s;

  update services set linked_service_config=jsonb_build_object('dependencyMode','automatic','requiredServiceIds',jsonb_build_array(s2)) where id=s;
  result=create_public_booking_dependency_v1(code,'Hold Fixture Service',s2,day+8,time '10:00','Hold Fixture Customer','',
    'hold-fixture@example.test','3332000000',null,null,op::text,'Hold Fixture Operator','hold-dependency-'||s);
  perform pg_temp.hold_assert(result->>'paymentHoldState'='awaiting_payment' and jsonb_array_length(result->'requestIds')=2,'Real dependency constructor exposes one unpaid linked group');
  select * into composition_request from booking_requests where id=(result->'requestIds'->>0)::uuid;
  held=prepare_booking_payment_hold_v1(w,composition_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert((held->>'due_cents')::integer=3000,'Dependent services use one combined canonical Checkout amount');
  perform reserve_booking_payment_hold_v1(w,composition_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_dependency',3000,'eur','pi_fixture_dependency');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'bookingStatus'='accepted' and (select count(*)=2 from appointments where appointment_group_id=composition_request.appointment_group_id),'Paid automatic dependency confirms both services once');
  update services set linked_service_config='{}'::jsonb where id=s;
  perform set_config('salonpro.public_linked_booking','off',true);

  -- Availability changes during Checkout must never create an overlapping appointment.
  extra_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Extra Service',10,10,day+5,time '13:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  held=prepare_booking_payment_hold_v1(w,extra_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,extra_request.id,account,false);
  settings=settings||jsonb_build_object('lunchBreakEnabled',true,'lunchBreakStart','13:00','lunchBreakEnd','14:00');
  update client_portals set availability_settings=settings where workspace_id=w;
  update owner_app_snapshots set payload=jsonb_set(payload,'{availabilitySettings}',settings) where workspace_id=w;
  perform set_config('salonpro.time_guard_reads_v1','{}',true);
  perform set_config('salonpro.public_booking_context_workspace_id','',true);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_lunch',1000,'eur','pi_fixture_lunch');
  perform pg_temp.hold_assert(result->>'state'='paid_conflict' and not exists(select 1 from appointments where booking_request_id=extra_request.id),'Lunch break added during payment prevents confirmation and retains receipt for refund');
  settings=settings||jsonb_build_object('lunchBreakEnabled',false);
  update client_portals set availability_settings=settings where workspace_id=w;
  update owner_app_snapshots set payload=jsonb_set(payload,'{availabilitySettings}',settings) where workspace_id=w;


  extra_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Extra Service',10,10,day+9,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  held=prepare_booking_payment_hold_v1(w,extra_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,extra_request.id,account,false);
  update services set is_online=false where id=s2;
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_offline_service',1000,'eur','pi_fixture_offline_service');
  perform pg_temp.hold_assert(result->>'state'='paid_conflict' and not exists(select 1 from appointments where booking_request_id=extra_request.id),'Service disabled during payment is reviewed instead of silently confirmed');
  update services set is_online=true where id=s2;

  -- An expired history is never revived by a fresh retry at the same time.
  extra_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Extra Service',10,10,day+10,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  perform cancel_unstarted_booking_payment_hold_v1(w,extra_request.id);
  spoof_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Extra Service',10,10,day+10,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  perform pg_temp.hold_assert(spoof_request.id<>extra_request.id and spoof_request.payment_hold_state='awaiting_payment'
    and (select payment_hold_state='expired' and status='cancelled' from booking_requests where id=extra_request.id),'Retry creates a new hold and preserves expired payment history');
  perform cancel_unstarted_booking_payment_hold_v1(w,spoof_request.id);


  insert into services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
    values(no_operator_service,w,'Hold No Operator Service',10,20,true,'Solo Capacity');
  no_operator_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold No Operator Service',10,20,day+13,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Solo Capacity',null,null));
  held=prepare_booking_payment_hold_v1(w,no_operator_request.id);batch=(held->>'id')::uuid;
  perform pg_temp.hold_assert(no_operator_request.requested_operator_id is null and no_operator_request.payment_hold_state='awaiting_payment',
    'Real constructor supports payment hold for salon capacity without configured role operators');
  perform pg_temp.hold_error(format('select create_public_booking_request_ultralight_v4(%L,''Hold No Operator Service'',10,20,%L::date,''10:00''::time,''Other Capacity Customer'','''',''other-capacity@example.test'',''3332999988'',null,null,''Solo Capacity'',null,null)',code,day+13),
    'slot_unavailable','Competing customer cannot take held salon capacity without operators');
  perform reserve_booking_payment_hold_v1(w,no_operator_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_no_operator',1000,'eur','pi_fixture_no_operator');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and exists(select 1 from appointments where booking_request_id=no_operator_request.id and operator_id is null),
    'Paid salon-capacity booking confirms without inventing an operator requirement');

  phase=jsonb_build_object('mode','phased','initialDurationMinutes',20,'processingDurationMinutes',20,
    'finalDurationMinutes',20,'finalServiceName','Hold No Operator Service','finalPhaseEnabled',true);
  update services set phase_config=phase,duration_minutes=60 where id=no_operator_service;
  no_operator_request=create_public_phased_booking_request_with_assignments_v1(code,'Hold No Operator Service',10,60,day+14,time '10:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Solo Capacity',null,null,null,null,phase);
  held=prepare_booking_payment_hold_v1(w,no_operator_request.id);batch=(held->>'id')::uuid;
  perform reserve_booking_payment_hold_v1(w,no_operator_request.id,account,false);
  result=settle_booking_payment_hold_v1(batch,account,false,'cs_fixture_no_operator_phase',1000,'eur','pi_fixture_no_operator_phase');
  set constraints all immediate;set constraints all deferred;
  perform pg_temp.hold_assert(result->>'state'='paid' and exists(select 1 from appointments where booking_request_id=no_operator_request.id),
    'Both phased intervals preserve capacity mode when no operators are configured');
  perform set_config('salonpro.phased_slot_prevalidated','off',true);

  perform save_booking_payment_policy(w,null,'salon',0,2);
  free_request=jsonb_populate_record(null::booking_requests,public.create_public_booking_request_ultralight_v4(code,'Hold Fixture Service',20,20,day,time '16:00',
    'Hold Fixture Customer','','hold-fixture@example.test','3332000000',null,null,'Barber',op::text,'Hold Fixture Operator'));
  perform pg_temp.hold_assert(free_request.payment_hold_state is null,'Payment in salon keeps the existing booking path');
  perform pg_temp.hold_assert(not has_function_privilege('anon','public.settle_booking_payment_hold_v1(uuid,text,boolean,text,bigint,text,text)','execute')
    and not has_function_privilege('authenticated','public.reserve_booking_payment_hold_v1(uuid,uuid,text,boolean)','execute'),'Public clients cannot forge settlement or bind Stripe accounts');
end $tests$;
set constraints all immediate;
do $count$ begin
  if (select count(*) from booking_hold_test_results)<>87 then raise exception 'Expected 87 completed booking-payment checks';end if;
end $count$;
select count(*) as passed_checks, jsonb_agg(name order by name) as checks
from booking_hold_test_results;
