-- Run with the migration in a transaction, then ROLLBACK. No real customer data.
do $$
declare w uuid=gen_random_uuid(); u uuid=gen_random_uuid(); c uuid=gen_random_uuid(); other uuid=gen_random_uuid(); s uuid=gen_random_uuid();
 cat service_package_catalog; pack customer_service_packages; again customer_service_packages; aid uuid=gen_random_uuid(); rid uuid; failed boolean; n integer;
 token text; payload jsonb; response jsonb; gift customer_gift_cards; reward salon_loyalty_rewards; operation uuid; points bigint;
 s2 uuid=gen_random_uuid(); combo uuid=gen_random_uuid(); group_id uuid=gen_random_uuid(); aid2 uuid; combo_pack customer_service_packages;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status) values(w,'Package transaction test','pkg-'||w,u||'@example.invalid','active');
 update workspaces set subscription_ends_at=now()+interval '1 year' where id=w;
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone,email) values(c,w,'Package fixture','390000000001',c||'@example.invalid'),(other,w,'Other fixture','390000000002',other||'@example.invalid');
 insert into services(id,workspace_id,name,price,duration_minutes) values(s,w,'Package test service',20,30);
 cat=save_service_package(null,0,'Three visits',jsonb_build_array(jsonb_build_object('kind','service','id',s)),3,3,5700,0);
 failed=false;
 begin perform assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'cash'); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: disabled packages allowed assignment'; end if;
 perform save_salon_benefit_settings(true,false,false,1,1);
 pack=assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'cash');
 again=assign_service_package(pack.id,c,cat.id,cat.revision,current_date,'cash');
 if again.id<>pack.id or (select count(*) from cash_movements where workspace_id=w)<>1 then raise exception 'TEST: duplicate purchase'; end if;
 -- Both entry points read the same customer ledger; never another customer's package.
 if jsonb_array_length(owner_customer_benefits(c)->'packages')<>1 or
    jsonb_array_length(owner_customer_benefits(other)->'packages')<>0 then
   raise exception 'TEST: customer package wallet isolation';
 end if;
 failed=false;
 begin perform assign_service_package(pack.id,other,cat.id,cat.revision,current_date,'cash');
 exception when others then failed=true; end;
 if not failed then raise exception 'TEST: purchase reassigned to another customer'; end if;
 aid2=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid2,w,other,current_date+1,'11:00','Other fixture','Package test service',20,30);
 failed=false;
 begin perform apply_owner_service_package(pack.id,aid2); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: another customer spent package'; end if;
 if exists(select 1 from service_package_redemptions where package_id=pack.id) or
    (select price from appointments where id=aid2)<>20 then
   raise exception 'TEST: rejected cross-customer use changed balance or price';
 end if;
 delete from appointments where id=aid2;
 perform save_service_package(cat.id,cat.revision,'Changed terms',cat.entitlements,6,6,9900,10);
 if (select uses from customer_service_packages where id=pack.id)<>3 or (select price_cents from customer_service_packages where id=pack.id)<>5700 then raise exception 'TEST: purchased snapshot changed'; end if;
 failed=false;
 begin perform save_service_package(cat.id,cat.revision,'Stale edit',cat.entitlements,3,3,5000,0); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: stale catalogue edit accepted'; end if;
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,current_date+1,'10:00','Package fixture','Package test service',20,30);
 rid=apply_owner_service_package(pack.id,aid);
 if (select price from appointments where id=aid)<>0 then raise exception 'TEST: covered price'; end if;
 if apply_owner_service_package(pack.id,aid)<>rid then raise exception 'TEST: duplicate redemption'; end if;
 failed=false;
 begin insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method) values(w,aid,'Double charge',20,'cash'); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: covered appointment charged twice'; end if;
 failed=false;
 begin update appointments set appointment_date=current_date+400 where id=aid; exception when others then failed=true; end;
 if not failed then raise exception 'TEST: moved beyond validity'; end if;
 update appointments set completed=true where id=aid;
 set constraints package_appointment_lifecycle immediate;
 if (select state from service_package_redemptions where id=rid)<>'consumed' then raise exception 'TEST: completion not consumed'; end if;
 failed=false;
 begin delete from appointments where id=aid; exception when others then failed=true; end;
 if not failed then raise exception 'TEST: deleted consumed history'; end if;
 -- No-show releases a second reservation; reactivation cannot get a free visit.
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,current_date+2,'10:00','Package fixture','Package test service',20,30);
 rid=apply_owner_service_package(pack.id,aid);
 update appointments set no_show=true where id=aid;
 if (select state from service_package_redemptions where id=rid)<>'released' then raise exception 'TEST: no-show credit not released'; end if;
 failed=false;
 begin update appointments set no_show=false where id=aid; exception when others then failed=true; end;
 if not failed then raise exception 'TEST: released reservation reactivated'; end if;
 perform save_salon_benefit_settings(false,false,false,1,2);
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,current_date+3,'10:00','Package fixture','Package test service',20,30);
 perform apply_owner_service_package(pack.id,aid);
 if (select count(*) from service_package_redemptions where package_id=pack.id and state<>'released')<>2 then raise exception 'TEST: disabling erased purchased rights'; end if;
 failed=false;
 begin delete from cash_movements where id=pack.purchase_movement_id; exception when others then failed=true; end;
 if not failed then raise exception 'TEST: package receipt deleted'; end if;
 -- Authenticated public booking: same slot engine, prepaid price and no payment terms.
 insert into customer_login_credentials(customer_id,password_hash) values(c,extensions.crypt('fixture-only-password',extensions.gen_salt('bf')));
 token=create_customer_payment_session('pkg-'||w,c||'@example.invalid','390000000001','fixture-only-password')->>'token';
 payload=jsonb_build_object('p_salon_code','pkg-'||w,'p_requested_service_name','Package test service','p_requested_price',20,'p_requested_duration_minutes',30,
 'p_appointment_date',current_date+5,'p_appointment_time','10:00','p_customer_name','Package','p_customer_surname','fixture','p_customer_email',c||'@example.invalid','p_customer_phone','390000000001');
 response=create_package_booking(pack.id,token,'public-test','create_public_booking_request_ultralight_v4',payload);
 if (select requested_price from booking_requests where id=(response->>'id')::uuid)<>0 then raise exception 'TEST: public package charged'; end if;
 if exists(select 1 from booking_payment_terms where request_id=(response->>'id')::uuid) then raise exception 'TEST: public covered service has deposit'; end if;
 if create_package_booking(pack.id,token,'public-test','create_public_booking_request_ultralight_v4',payload)<>response then raise exception 'TEST: public idempotency'; end if;
 failed=false;
 begin perform create_package_booking(pack.id,token,'public-exhausted','create_public_booking_request_ultralight_v4',payload||jsonb_build_object('p_appointment_date',current_date+6)); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: package overspent'; end if;
 failed=false;
 begin perform customer_package_wallet('pkg-'||w,c||'@example.invalid','390000000001',repeat('a',64)); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: wallet without authentication'; end if;
 -- Acceptance cannot bring back the list price; cancellation frees the reservation.
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,booking_request_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,(response->>'id')::uuid,current_date+5,'10:00','Package fixture','Package test service',999,30);
 if (select price from appointments where id=aid)<>0 then raise exception 'TEST: acceptance restored normal price'; end if;
 delete from appointments where id=aid;
 update booking_requests set status='cancelled' where id=(response->>'id')::uuid;
 set constraints package_request_lifecycle immediate;
 if (select state from service_package_redemptions where package_id=pack.id and idempotency_key='public-test')<>'released' then raise exception 'TEST: cancellation did not release'; end if;
 -- Loyalty only after completion, exactly once, reversible on mistaken completion.
 perform save_salon_benefit_settings(false,true,true,5,3);
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,other,current_date+8,'10:00','Other fixture','Package test service',20,30);
 set constraints service_loyalty_lifecycle immediate;
 if exists(select 1 from customer_loyalty_ledger where customer_id=other) then raise exception 'TEST: points before completed service'; end if;
 update appointments set completed=true where id=aid;
 update appointments set completed=true where id=aid;
 select sum(delta) into points from customer_loyalty_ledger where customer_id=other;
 if points<>5 then raise exception 'TEST: duplicated points'; end if;
 reward=save_loyalty_reward(null,0,'Reward fixture',5);
 operation=gen_random_uuid();
 perform redeem_loyalty_reward(other,reward.id,reward.revision,operation);
 perform redeem_loyalty_reward(other,reward.id,reward.revision,operation);
 if (select sum(delta) from customer_loyalty_ledger where customer_id=other)<>0 then raise exception 'TEST: reward idempotency'; end if;
 failed=false;
 begin perform redeem_loyalty_reward(other,reward.id,reward.revision,gen_random_uuid()); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: overspent points'; end if;
 update appointments set completed=false where id=aid;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=other)<>-5 then raise exception 'TEST: reversed points'; end if;
 update appointments set completed=true where id=aid;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=other)<>0 then raise exception 'TEST: restored completion points'; end if;
 -- Gift credit is not another receipt. Test partial coverage, retry and release.
 select count(*) into n from cash_movements where workspace_id=w;
 gift=issue_customer_gift_card(gen_random_uuid(),other,3000,current_date+100,'Test sender','Happy gift',null);
 if (select count(*) from cash_movements where workspace_id=w)<>n then raise exception 'TEST: complimentary gift created cash'; end if;
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,other,current_date+9,'10:00','Other fixture','Package test service',20,30);
 rid=apply_customer_gift_card(gift.id,aid,1500);
 if (select price from appointments where id=aid)<>5 then raise exception 'TEST: gift residual price'; end if;
 if apply_customer_gift_card(gift.id,aid,1500)<>rid then raise exception 'TEST: gift retry'; end if;
 set constraints gift_appointment_lifecycle immediate;
 update appointments set no_show=true where id=aid;
 if (select state from gift_card_uses where id=rid)<>'released' then raise exception 'TEST: gift cancellation release'; end if;
 failed=false;
 begin update appointments set no_show=false where id=aid; exception when others then failed=true; end;
 if not failed then raise exception 'TEST: gift reuse on same appointment'; end if;
 gift=issue_customer_gift_card(gen_random_uuid(),other,5000,null,'Paid sender','Paid gift','cash');
 perform issue_customer_gift_card(gift.id,other,5000,null,'Paid sender','Paid gift','cash');
 if (select count(*) from cash_movements where workspace_id=w)<>n+1 then raise exception 'TEST: paid gift double receipt'; end if;
 failed=false;
 begin delete from cash_movements where id=gift.purchase_movement_id; exception when others then failed=true; end;
 if not failed then raise exception 'TEST: gift receipt not protected'; end if;
 -- Multi-component owner service consumes exactly one purchased use.
 perform save_salon_benefit_settings(true,true,true,5,4);
 insert into services(id,workspace_id,name,price,duration_minutes) values(s2,w,'Second component',10,15);
 insert into service_compositions(id,workspace_id,name,visibility) values(combo,w,'Full combination','public');
 insert into service_composition_items(workspace_id,composition_id,service_id,position) values(w,combo,s,0),(w,combo,s2,1);
 cat=save_service_package(null,0,'Combination package',jsonb_build_array(jsonb_build_object('kind','composition','id',combo)),3,3,8400,0);
 combo_pack=assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'card');
 insert into appointment_groups(id,workspace_id,customer_id,title,source) values(group_id,w,c,'Full combination','salon');
 aid=gen_random_uuid();aid2=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes,appointment_group_id)
 values(aid,w,c,current_date+12,'10:00','Package fixture','Package test service',20,30,group_id),(aid2,w,c,current_date+12,'10:30','Package fixture','Second component',10,15,group_id);
 rid=apply_owner_service_package(combo_pack.id,aid);
 if (select count(*) from service_package_booking_lines where redemption_id=rid)<>2 or (select sum(price) from appointments where appointment_group_id=group_id)<>0 then raise exception 'TEST: combination coverage'; end if;
 update appointments set completed=true where id=aid;
 if (select state from service_package_redemptions where id=rid)<>'reserved' then raise exception 'TEST: partial combination consumed early'; end if;
 update appointments set completed=true where id=aid2;
 if (select state from service_package_redemptions where id=rid)<>'consumed' then raise exception 'TEST: combination not consumed'; end if;
 if (select count(*) from service_package_redemptions where package_id=combo_pack.id)<>1 then raise exception 'TEST: combination multiple uses'; end if;
 if (select sum(delta) from customer_loyalty_ledger where workspace_id=w and reference_key='service:'||group_id)<>5 then raise exception 'TEST: combination duplicated points'; end if;
 insert into operators(workspace_id,name) values(w,'Fixture operator');
 payload=payload||jsonb_build_object('p_composition_id',combo,'p_appointment_date',current_date+15,'p_idempotency_key','combo-public');
 payload=payload-'p_requested_service_name'-'p_requested_price'-'p_requested_duration_minutes';
 response=create_package_booking(combo_pack.id,token,'combo-public','create_public_booking_composition_v1',payload);
 if jsonb_array_length(response->'requestIds')<>2 then raise exception 'TEST: public combination missing components'; end if;
 if (select total_price from appointment_groups where id=(response->>'groupId')::uuid)<>0 then raise exception 'TEST: public combination still payable'; end if;
 update services set linked_service_config=jsonb_build_object('clientChoiceRequired',true,'suggestedServiceIds',jsonb_build_array(s2)) where id=s;
 payload=(payload-'p_composition_id')||jsonb_build_object('p_parent_service_name','Package test service','p_dependency_service_id',s2,'p_appointment_date',current_date+16,'p_idempotency_key','dependency-public');
 response=create_package_booking(pack.id,token,'dependency-public','create_public_booking_dependency_v1',payload);
 if (response->>'packagePayablePrice')::numeric is distinct from 10::numeric then raise exception 'TEST: package also covered paid extra'; end if;
 if (select total_price from appointment_groups where id=(response->>'groupId')::uuid)<>10 then raise exception 'TEST: extra group total'; end if;
 -- Future online purchases stay server-only and snapshot the order before payment.
 operation=gen_random_uuid();
 perform prepare_service_package_order(operation,w,c,cat.id,cat.revision);
 update service_package_orders set provider_session_id='fixture-session' where id=operation;
 perform save_service_package(cat.id,cat.revision,'New combination price',cat.entitlements,6,6,15000,0);
 failed=false;
 begin perform activate_paid_service_package_order(operation,'fixture-session',1,'eur'); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: incorrect payment activated order'; end if;
 failed=false;
 begin perform activate_paid_service_package_order(operation,null,null,null); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: missing payment fields activated order'; end if;
 select count(*) into n from cash_movements where workspace_id=w;
 perform activate_paid_service_package_order(operation,'fixture-session',8400,'eur');
 perform activate_paid_service_package_order(operation,'fixture-session',8400,'eur');
 if (select price_cents from customer_service_packages where id=operation)<>8400 or (select uses from customer_service_packages where id=operation)<>3 or (select count(*) from cash_movements where workspace_id=w)<>n+1 then raise exception 'TEST: online order snapshot or double receipt'; end if;
 if jsonb_array_length(customer_package_wallet('pkg-'||w,c||'@example.invalid','390000000001',token))<>3 then raise exception 'TEST: authenticated package wallet'; end if;
 if jsonb_array_length(customer_benefits_wallet('pkg-'||w,c||'@example.invalid','390000000001',token)->'packages')<>3 then raise exception 'TEST: frontend benefits wallet'; end if;
 if jsonb_array_length(owner_customer_benefits(other)->'giftCards')<>2 then raise exception 'TEST: owner benefits aggregate'; end if;
 failed=false;
 begin perform owner_customer_benefits(gen_random_uuid()); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: foreign customer access'; end if;
 if has_function_privilege('anon','public.assign_service_package(uuid,uuid,uuid,integer,date,public.payment_method)','EXECUTE')
 or has_table_privilege('authenticated','public.customer_service_packages','INSERT') or has_table_privilege('anon','public.customer_service_packages','SELECT')
 or has_function_privilege('authenticated','public.activate_paid_service_package_order(uuid,text,bigint,text)','EXECUTE') then raise exception 'TEST: privilege leak'; end if;
 if jsonb_array_length(owner_benefits_console()->'catalog')<1 then raise exception 'TEST: salon console missing catalogue';end if;
 if (find_salon_gift_card('salonpro-gift:'||gift.code)->>'id')::uuid<>other then raise exception 'TEST: gift lookup wrong customer';end if;
 failed=false;begin perform find_salon_gift_card('UNKNOWN');exception when others then failed=true;end;
 if not failed then raise exception 'TEST: unknown gift lookup';end if;
 response=to_jsonb(save_gift_card_template(null,0,'Gift preset',5000,3,'Auguri',false));
 perform save_gift_card_template((response->>'id')::uuid,1,'New preset',7000,6,'New',false);
 if (select amount_cents from customer_gift_cards where id=gift.id)<>gift.amount_cents then raise exception 'TEST: gift template changed issued card';end if;
 failed=false;begin perform save_gift_card_template((response->>'id')::uuid,1,'Stale',1,1,'',false);exception when others then failed=true;end;
 if not failed then raise exception 'TEST: stale template accepted';end if;
 if has_function_privilege('anon','public.owner_benefits_console()','EXECUTE') or has_function_privilege('anon','public.find_salon_gift_card(text)','EXECUTE') or has_table_privilege('authenticated','public.gift_card_deliveries','INSERT') then raise exception 'TEST: console privilege leak';end if;
 raise notice 'Package tests passed: disabled issue, idempotency, immutable purchase, optimistic edits, coverage, double charge, expiry, consume, release, historical protection, existing rights';
end $$;
