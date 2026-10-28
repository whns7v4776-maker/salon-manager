do $$
declare w uuid=gen_random_uuid();u uuid=gen_random_uuid();c uuid=gen_random_uuid();c2 uuid=gen_random_uuid();a uuid=gen_random_uuid();b uuid=gen_random_uuid();m uuid;sid uuid=gen_random_uuid();sale uuid=gen_random_uuid();rule salon_benefit_settings; n bigint; failed boolean; old_rule uuid; sp uuid=gen_random_uuid(); g uuid=gen_random_uuid(); m2 uuid;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Earning fixture','earning-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone) values(c,w,'Earning fixture','390000000001'),(c2,w,'Other fixture','390000000002');
 insert into services(id,workspace_id,name,price,duration_minutes) values(sid,w,'Earning service',12,30);
 rule=save_salon_benefit_settings(false,true,false,1,1);
 rule=save_loyalty_earning_rule(rule.revision,'spend',1,500,1,true,true,true,0,'Ogni visita conta');
 old_rule=rule.loyalty_rule_id;
 failed=false;begin perform save_loyalty_earning_rule(rule.revision-1,'service',2,500,1,true,true,true,0,'');exception when others then failed=true;end;
 if not failed then raise exception 'TEST stale rule accepted';end if;
 failed=false;begin perform save_loyalty_earning_rule(rule.revision,'spend',1,0,1,true,true,true,0,'');exception when others then failed=true;end;
 if not failed then raise exception 'TEST zero conversion accepted';end if;
 failed=false;begin perform save_loyalty_earning_rule(rule.revision,'spend',1,500,1,true,false,false,0,'');exception when others then failed=true;end;
 if not failed then raise exception 'TEST empty earning scope accepted';end if;
 perform save_loyalty_reward_terms(null,0,'Two points',2,'fixed',1,'{}','',null,true);
 perform save_loyalty_reward_terms(null,0,'Three points',3,'fixed',1,'{}','',null,true);
 set constraints all immediate;
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(a,w,c,current_date+10,'10:00','Earning fixture','Earning service',12,30);
 insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method) values(w,a,'Earning cash',12,'cash') returning id into m;
 if exists(select 1 from loyalty_spend_sources where workspace_id=w) then raise exception 'TEST points before performed service';end if;
 update appointments set completed=true where id=a;
 select sum(delta) into n from customer_loyalty_ledger where customer_id=c;
 if n<>2 then raise exception 'TEST 12 euro should give 2 points, got %',n;end if;
 update appointments set completed=true where id=a;
 update cash_movements set description='Re-read without payment change' where id=m;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>2 then raise exception 'TEST duplicate earning';end if;
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes,completed)
 values(b,w,c,current_date+11,'10:00','Earning fixture','Earning service',3,30,true);
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>2 then raise exception 'TEST unpaid earning';end if;
 insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method) values(w,b,'Second payment',3,'cash');
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>3 then raise exception 'TEST carry 12 plus 3 should give 3 points';end if;
 if (select count(*) from customer_benefit_notifications where customer_id=c)<>2 then raise exception 'TEST incremental threshold notifications';end if;
 -- Cancel mistaken completion and restore once under the original rule.
 update appointments set completed=false where id=b;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>2 then raise exception 'TEST reversal';end if;
 update appointments set completed=true where id=b;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>3 then raise exception 'TEST restoration';end if;
 -- New rate applies only to new sources; saving identical formula preserves remainder pool.
 rule=save_loyalty_earning_rule(rule.revision,'spend',1,500,1,true,true,true,0,'Nuovo testo');
 if rule.loyalty_rule_id<>old_rule then raise exception 'TEST message change reset pool';end if;
 rule=save_loyalty_earning_rule(rule.revision,'spend',1,500,2,false,true,true,0,'Nuova formula');
 if rule.loyalty_rule_id=old_rule then raise exception 'TEST changed rate reused old pool';end if;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>3 then raise exception 'TEST points rewritten on rule change';end if;
 -- Shop sale 12 euro => 4 points; return 3 => 2 points. No anonymous attribution.
 insert into shop_sales(id,workspace_id,customer_id,customer_name,total_cents,payment_method,created_by) values(sale,w,c,'Earning fixture',1200,'cash',u);
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>7 then raise exception 'TEST shop earning';end if;
 insert into shop_products(id,workspace_id,name,sku,purpose,unit,price_cents,cost_cents) values(sp,w,'Fixture','QA-'||sp,'retail','piece',300,100);
 insert into shop_returns(id,workspace_id,sale_id,product_id,quantity,amount_cents,restock,reason,created_by) values(gen_random_uuid(),w,sale,sp,1,300,false,'Fixture refund',u);
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>5 then raise exception 'TEST shop partial refund';end if;
 -- Disable new earning; refund existing purchases still reconciles.
 rule=save_salon_benefit_settings(false,false,false,1,rule.revision);
 insert into shop_sales(id,workspace_id,customer_id,total_cents,payment_method,created_by) values(gen_random_uuid(),w,c,5000,'cash',u);
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>5 then raise exception 'TEST disabled loyalty awarded points';end if;
 insert into shop_returns(id,workspace_id,sale_id,product_id,quantity,amount_cents,restock,reason,created_by) values(gen_random_uuid(),w,sale,sp,3,900,false,'Remaining refund',u);
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>3 then raise exception 'TEST disabled refund failed';end if;
 -- Stripe earns only after paid and completed, reverses partial/full refund.
 rule=save_salon_benefit_settings(false,true,false,1,rule.revision);
 rule=save_loyalty_earning_rule(rule.revision,'spend',1,500,1,false,true,false,1000,'');
 a=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes,completed)
 values(a,w,c2,current_date+12,'10:00','Other fixture','Earning service',20,30,true);
 insert into cash_movements(workspace_id,appointment_id,description,amount) values(w,a,'Stripe fixture',20) returning id into m;
 insert into cash_stripe_payments(workspace_id,movement_id,account_id,amount_cents,status) values(w,m,'acct_fixture',2000,'open') returning id into sp;
 if exists(select 1 from customer_loyalty_ledger where customer_id=c2) then raise exception 'TEST unpaid Stripe awarded';end if;
 perform settle_cash_stripe(sp,'acct_fixture','cs_earning_fixture',2000,'eur','pi_earning_fixture');
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c2)<>4 then raise exception 'TEST paid Stripe missing';end if;
 update cash_stripe_payments set refunded_cents=500 where movement_id=m;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c2)<>3 then raise exception 'TEST Stripe partial refund';end if;
 update cash_stripe_payments set refunded_cents=1100 where movement_id=m;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c2)<>0 then raise exception 'TEST minimum after refund';end if;
 -- Two receipt identities (revised appointment) contribute once, including a detached balance.
 rule=save_loyalty_earning_rule(rule.revision,'spend',1,500,1,false,true,false,0,'');
 b=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes,completed)
 values(b,w,c2,current_date+15,'10:00','Other fixture','Earning service',25,30,true);
 insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method) values(w,b,'Upfront receipt',10,'cash') returning id into m;
 insert into appointment_payment_revisions(appointment_id,workspace_id,total_cents) values(b,w,2500);
 insert into appointment_revision_receipts(movement_id,appointment_id,workspace_id,kind) values(m,b,w,'upfront');
 insert into cash_movements(workspace_id,description,amount) values(w,'Balance receipt',15) returning id into m2;
 insert into appointment_revision_receipts(movement_id,appointment_id,workspace_id,kind) values(m2,b,w,'balance');
 update cash_movements set payment_method='cash' where id=m2;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c2)<>5 then raise exception 'TEST detached balance receipt missing or counted twice';end if;
 -- A composed service earns only after every phase completes.
 insert into appointment_groups(id,workspace_id,customer_id,title,source) values(g,w,c,'Earning group','salon');
 insert into appointments(id,workspace_id,customer_id,appointment_group_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(gen_random_uuid(),w,c,g,current_date+16,'10:00','Earning fixture','Earning service',8,15),
 (gen_random_uuid(),w,c,g,current_date+16,'10:15','Earning fixture','Earning service',7,15);
 insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method)
 select w,id,'Group receipt',price,'cash' from appointments where appointment_group_id=g;
 update appointments set completed=true where appointment_group_id=g and price=8;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>3 then raise exception 'TEST unfinished group earned';end if;
 update appointments set completed=true where appointment_group_id=g;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>6 then raise exception 'TEST logical group amount';end if;
 -- Ignored unrelated updates must not create retroactive points or double legacy earning.
 rule=save_loyalty_earning_rule(rule.revision,'service',7,500,1,false,true,false,0,'');
 update appointments set completed=false where id=a;
 update appointments set completed=true where id=a;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c2)<>5 then raise exception 'TEST spend source earned again as service';end if;
 -- Config auth isolation and no publicly callable award primitive.
 if has_function_privilege('authenticated','public.sync_loyalty_spend_source(uuid,uuid,text,uuid,boolean)','execute') or has_function_privilege('anon','public.save_loyalty_earning_rule(integer,text,integer,integer,integer,boolean,boolean,boolean,integer,text)','execute') then raise exception 'TEST earning privilege leak';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 failed=false;begin perform save_loyalty_earning_rule(rule.revision,'spend',1,500,1,true,true,true,0,'');exception when others then failed=true;end;
 if not failed then raise exception 'TEST foreign rule write';end if;
end $$;
