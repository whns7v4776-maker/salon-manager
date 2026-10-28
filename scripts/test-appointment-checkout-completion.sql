do $$
declare w uuid=gen_random_uuid();u uuid=gen_random_uuid();c uuid=gen_random_uuid();a uuid=gen_random_uuid();b uuid=gen_random_uuid();m jsonb; r jsonb; failed boolean=false; sp uuid; req uuid; upfront uuid; balance uuid;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Checkout fixture','checkout-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone) values(c,w,'Checkout fixture','390000000001');
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(a,w,c,current_date,'10:00','Checkout fixture','Service',12,30),(b,w,c,current_date,'11:00','Checkout fixture','Other service',12,30);
 m=prepare_owner_appointment_checkout_v1(a,w);
 if (select completed or cashed_in from appointments where id=a) then raise exception 'TEST prepared checkout falsely completed'; end if;
 if (prepare_owner_appointment_checkout_v1(a,w)->>'id')<>m->>'id' then raise exception 'TEST duplicate movement'; end if;
 r=collect_owner_appointment_checkout_v1((m->>'id')::uuid,w,'cash');
 if not (select completed and cashed_in from appointments where id=a) then raise exception 'TEST payment did not complete service'; end if;
 perform collect_owner_appointment_checkout_v1((m->>'id')::uuid,w,'cash');
 if (select count(*) from cash_movements where appointment_id=a)<>1 then raise exception 'TEST duplicate income'; end if;
 insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method) values(w,b,'Ordinary receipt',12,'cash');
 if (select completed from appointments where id=b) then raise exception 'TEST unrelated payment completed appointment'; end if;
 begin perform collect_owner_appointment_checkout_v1((m->>'id')::uuid,gen_random_uuid(),'cash'); exception when others then failed=true; end;
 if not failed then raise exception 'TEST other salon checkout allowed'; end if;
 a=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(a,w,c,current_date,'14:00','Checkout fixture','Transfer service',12,30);
 m=prepare_owner_appointment_checkout_v1(a,w);
 perform collect_owner_appointment_checkout_v1((m->>'id')::uuid,w,'bank_transfer');
 if not (select completed and cashed_in from appointments where id=a) then raise exception 'TEST transfer completion missing'; end if;
 -- Opening a Stripe attempt is not payment. Confirmed settlement completes once.
 a=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(a,w,c,current_date,'15:00','Checkout fixture','Stripe service',12,30);
 m=prepare_owner_appointment_checkout_v1(a,w);
 insert into cash_stripe_payments(workspace_id,movement_id,account_id,amount_cents,status) values(w,(m->>'id')::uuid,'acct_checkout_fixture',1200,'open') returning id into sp;
 if (select completed from appointments where id=a) then raise exception 'TEST unpaid Stripe completed service'; end if;
 perform settle_cash_stripe(sp,'acct_checkout_fixture','cs_checkout_fixture',1200,'eur','pi_checkout_fixture');
 if not (select completed and cashed_in from appointments where id=a) then raise exception 'TEST paid Stripe failed completion'; end if;
 -- An underpaid receipt cannot complete a service.
 a=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(a,w,c,current_date,'16:00','Checkout fixture','Partial service',12,30);
 m=prepare_owner_appointment_checkout_v1(a,w);
 update cash_movements set amount=5 where id=(m->>'id')::uuid;
 perform collect_owner_appointment_checkout_v1((m->>'id')::uuid,w,'cash');
 if (select completed from appointments where id=a) then raise exception 'TEST partial payment completed service'; end if;

 -- A split unpaid deposit and balance are collected together, without duplicate revenue.
 a=gen_random_uuid(); req=gen_random_uuid(); upfront=gen_random_uuid(); balance=gen_random_uuid();
 insert into booking_requests(id,workspace_id,customer_id,requested_service_name,requested_price,appointment_date,appointment_time,customer_name,customer_email,customer_phone) values(req,w,c,'Split service',12,current_date,'17:00','Checkout fixture',u||'@example.invalid','390000000001');
 insert into appointments(id,workspace_id,customer_id,booking_request_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(a,w,c,req,current_date,'17:00','Checkout fixture','Split service',12,30);
 insert into cash_movements(id,workspace_id,appointment_id,description,amount) values(upfront,w,null,'Deposit',6),(balance,w,a,'Balance',6);
 insert into booking_payment_orders(request_id,workspace_id,appointment_id,upfront_movement_id,balance_movement_id,total_cents,due_cents) values(req,w,a,upfront,balance,1200,600);
 m=prepare_owner_appointment_checkout_v1(a,w);
 if (m->>'importo')::numeric<>12 or (m->>'digitalAvailable')::boolean then raise exception 'TEST split balance incorrect'; end if;
 perform collect_owner_appointment_checkout_v1((m->>'id')::uuid,w,'cash');
 if not (select completed and cashed_in from appointments where id=a) or (select count(*) from cash_movements where id in(upfront,balance) and payment_method='cash')<>2 then raise exception 'TEST split collection incomplete'; end if;
 perform collect_owner_appointment_checkout_v1((m->>'id')::uuid,w,'cash');
 if (select sum(amount) from cash_movements where id in(upfront,balance))<>12 then raise exception 'TEST split duplicated'; end if;
end $$;
