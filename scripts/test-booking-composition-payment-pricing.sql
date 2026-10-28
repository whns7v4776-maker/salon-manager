-- Run with the new composition-pricing migration inside BEGIN / ROLLBACK.
SET CONSTRAINTS ALL DEFERRED;
CREATE TEMP TABLE composition_price_audit(case_name text,result jsonb);
CREATE TEMP TABLE composition_pricing_test_results(name text primary key);
CREATE FUNCTION pg_temp.price_assert(p_ok boolean,p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'PRICING TEST FAILED: %',p_name;END IF;
 INSERT INTO composition_pricing_test_results VALUES(p_name);END $$;
DO $fixture$
DECLARE w uuid=gen_random_uuid();c uuid=gen_random_uuid();op uuid=gen_random_uuid();s1 uuid=gen_random_uuid();s2 uuid=gen_random_uuid();comp uuid=gen_random_uuid();
code text='price-audit-'||gen_random_uuid();owner_mail text='price-audit-'||gen_random_uuid()||'@example.test';settings jsonb;reply jsonb;b jsonb;r uuid;day date=current_date+20;
package uuid=gen_random_uuid();redemption uuid=gen_random_uuid();receipt uuid;req booking_requests;err text;before_count integer;
BEGIN
PERFORM set_config('request.jwt.claims','{}',true);PERFORM set_config('request.jwt.claim.role','',true);
INSERT INTO workspaces(id,salon_name,slug,owner_email,is_internal_tester,subscription_status,auto_accept_booking_requests)
 VALUES(w,'Composition price fixture',code,owner_mail,true,'active',true);
settings=jsonb_build_object('guidedSlotsEnabled',false,'publicSlotIntervalMode','custom','publicSlotMinimumIntervalMinutes',5,
 'publicBookingWindowValue',365,'publicBookingWindowUnit','days','weeklySchedule',
 (select jsonb_agg(jsonb_build_object('weekday',i,'isClosed',false,'startTime','09:00','endTime','18:00')) from generate_series(0,6)i));
INSERT INTO client_portals(workspace_id,owner_email,salon_code,salon_name,availability_settings)
 VALUES(w,owner_mail,code,'Composition price fixture',settings);
INSERT INTO owner_app_snapshots(workspace_id,payload) VALUES(w,jsonb_build_object('workspace',jsonb_build_object('id',w,'ownerEmail',owner_mail,'salonCode',code),
 'clienti','[]'::jsonb,'appuntamenti','[]'::jsonb,'richiestePrenotazione','[]'::jsonb,'availabilitySettings',settings,
 'servizi','[]'::jsonb,'operatori','[]'::jsonb));
INSERT INTO services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
 VALUES(s1,w,'Composition part A',10,20,true,'Barber'),(s2,w,'Composition part B',10,20,true,'Barber');
INSERT INTO operators(id,workspace_id,name,required_role) VALUES(op,w,'Composition operator','Barber');
INSERT INTO customers(id,workspace_id,full_name,email,phone,source)
 VALUES(c,w,'Composition customer','composition-customer@example.test','3331009099','frontend');
INSERT INTO service_compositions(id,workspace_id,name,visibility,is_active,allow_split_operators)
 VALUES(comp,w,'Composition price fixture','public',true,false);
INSERT INTO service_composition_items(workspace_id,composition_id,service_id,position,price_override)
 VALUES(w,comp,s1,0,5),(w,comp,s2,1,5);
PERFORM save_booking_payment_policy(w,null,'full',100,0);
reply=create_public_booking_composition_v1(code,comp,day,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-no-customer-override');
r=(reply->'requestIds'->>0)::uuid;b=prepare_booking_payment_hold_v1(w,r);
INSERT INTO composition_price_audit VALUES('composition_price_override_only',jsonb_build_object(
 'declaredTotal',reply->'totalPrice','storedGroupTotal',(select total_price from appointment_groups where id=(reply->>'groupId')::uuid),
 'storedRequestPrices',(select jsonb_agg(requested_price order by appointment_group_order) from booking_requests where appointment_group_id=(reply->>'groupId')::uuid),
 'canonicalCheckoutDueCents',b->'due_cents','canonicalCheckoutTotalCents',b->'total_cents','expectedCompositionDueCents',1000));
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=10 and (b->>'due_cents')::integer=1000
 AND (select sum(requested_price)=10 and bool_and(requested_price=5) from booking_requests where appointment_group_id=(reply->>'groupId')::uuid),
 'Full composition uses both stored component overrides in group, requests and Checkout');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
INSERT INTO customer_service_price_overrides(workspace_id,customer_id,service_id,price) VALUES(w,c,s1,2);
reply=create_public_booking_composition_v1(code,comp,day+1,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-customer-override');
r=(reply->'requestIds'->>0)::uuid;b=prepare_booking_payment_hold_v1(w,r);
INSERT INTO composition_price_audit VALUES('customer_override_has_priority',jsonb_build_object(
 'declaredTotal',reply->'totalPrice','storedGroupTotal',(select total_price from appointment_groups where id=(reply->>'groupId')::uuid),
 'storedRequestPrices',(select jsonb_agg(requested_price order by appointment_group_order) from booking_requests where appointment_group_id=(reply->>'groupId')::uuid),
 'canonicalCheckoutDueCents',b->'due_cents','canonicalCheckoutTotalCents',b->'total_cents','expectedCompositionDueCents',700));

PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=7 and (b->>'due_cents')::integer=700
 AND (select sum(requested_price)=7 from booking_requests where appointment_group_id=(reply->>'groupId')::uuid),
 'Customer-specific component price wins over composition override');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
PERFORM save_booking_payment_policy(w,null,'deposit',50,1);
reply=create_public_booking_composition_v1(code,comp,day+2,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-deposit');
r=(reply->'requestIds'->>0)::uuid;b=prepare_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=7 and (b->>'total_cents')::integer=700 and (b->>'due_cents')::integer=350
 AND (select sum(due_cents)=350 from booking_payment_terms where request_id in (select unnest(request_ids) from booking_payment_hold_batches where id=(b->>'id')::uuid)),
 'Deposit applies exact percentage to canonical discounted composition prices');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
DELETE FROM customer_service_price_overrides WHERE workspace_id=w;
PERFORM save_booking_payment_policy(w,null,'full',100,2);
INSERT INTO cash_movements(workspace_id,description,amount,payment_method) VALUES(w,'Fixture prepaid composition component',50,'cash') RETURNING id INTO receipt;
INSERT INTO customer_service_packages(id,workspace_id,customer_id,name,entitlements,uses,starts_on,expires_on,price_cents,purchase_movement_id)
 VALUES(package,w,c,'Pricing fixture package',jsonb_build_array(jsonb_build_object('kind','service','id',s1,'componentIds',jsonb_build_array(s1))),5,day-1,day+30,5000,receipt);
INSERT INTO service_package_redemptions(id,workspace_id,package_id,service_key,idempotency_key)
 VALUES(redemption,w,package,'service:'||s1,'pricing-package-component');
PERFORM set_config('salonpro.package_redemption',redemption::text,true);
reply=create_public_booking_composition_v1(code,comp,day+3,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-package');
PERFORM set_config('salonpro.package_redemption','',true);
r=(reply->'requestIds'->>1)::uuid;b=prepare_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=5 and (b->>'due_cents')::integer=500
 AND (select requested_price=0 from booking_requests where id=(reply->'requestIds'->>0)::uuid),
 'Prepaid component stays free and only the discounted uncovered extra is charged');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
UPDATE service_composition_items SET price_override=0 WHERE composition_id=comp AND service_id=s1;
reply=create_public_booking_composition_v1(code,comp,day+4,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-zero-component');
r=(reply->'requestIds'->>1)::uuid;b=prepare_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=5 and (b->>'due_cents')::integer=500
 AND (select requested_price=0 from booking_requests where id=(reply->'requestIds'->>0)::uuid),
 'Genuine stored zero-price composition component is preserved');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert(nullif(current_setting('salonpro.public_composition_pricing_group',true),'') is null,
 'Constructor restores pricing context after successful creation');
PERFORM set_config('salonpro.public_linked_booking','off',true);
req=create_public_booking_request_ultralight_v2(code,'Composition part A',0.01,20,day+5,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,'Barber',op::text,'Composition operator');
b=prepare_booking_payment_hold_v1(w,req.id);
PERFORM pg_temp.price_assert(req.requested_price=10 and req.appointment_group_id is null and (b->>'due_cents')::integer=1000,
 'Standalone caller price hints cannot inherit composition discounts or spoof a free price');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,req.id);
UPDATE service_composition_items SET price_override=null WHERE composition_id=comp;
UPDATE services SET price=5,original_price=10,discount_enabled=true,discount_valid_from=day+10,discount_valid_to=day+11 WHERE id=s1;
reply=create_public_booking_composition_v1(code,comp,day+6,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-inactive-promotion');
r=(reply->'requestIds'->>0)::uuid;b=prepare_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=20 and (b->>'due_cents')::integer=2000,
 'Without a composition override inactive promotions keep canonical catalog totals');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
reply=create_public_booking_composition_v1(code,comp,day+10,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-active-promotion');
r=(reply->'requestIds'->>0)::uuid;b=prepare_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=15 and (b->>'due_cents')::integer=1500,
 'Without a composition override active promotions preserve canonical discounted totals');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
UPDATE service_composition_items SET price_override=7 WHERE composition_id=comp AND service_id=s1;
reply=create_public_booking_composition_v1(code,comp,day+11,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-composition-before-promotion');
r=(reply->'requestIds'->>0)::uuid;b=prepare_booking_payment_hold_v1(w,r);
PERFORM pg_temp.price_assert((reply->>'totalPrice')::numeric=17 and (b->>'due_cents')::integer=1700,
 'Explicit composition component price takes precedence over standalone promotions');
PERFORM cancel_unstarted_booking_payment_hold_v1(w,r);
UPDATE service_compositions SET is_active=false WHERE id=comp;
before_count=(SELECT count(*) FROM booking_requests WHERE workspace_id=w);
BEGIN
 PERFORM create_public_booking_composition_v1(code,comp,day+12,time '10:00','Composition customer','','composition-customer@example.test','3331009099',null,null,op::text,'Composition operator','price-fixture-inactive-composition');
EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS err=message_text;END;
PERFORM pg_temp.price_assert(err LIKE '%composition_unavailable%' AND (SELECT count(*)=before_count FROM booking_requests WHERE workspace_id=w),
 'Inactive public compositions remain unavailable and leave no partial booking');
PERFORM pg_temp.price_assert(nullif(current_setting('salonpro.public_composition_pricing_group',true),'') is null,
 'Failed constructor never leaks a composition pricing context');
END $fixture$;
SET CONSTRAINTS ALL IMMEDIATE;
DO $count$ BEGIN IF (SELECT count(*) FROM composition_pricing_test_results)<>12 THEN RAISE EXCEPTION 'Expected12 completed composition pricing checks';END IF;END $count$;
SELECT count(*) as pricing_checks,jsonb_agg(name order by name) as checks FROM composition_pricing_test_results;
