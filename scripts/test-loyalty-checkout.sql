do $$
declare w uuid=gen_random_uuid();u uuid=gen_random_uuid();c uuid=gen_random_uuid();sid uuid=gen_random_uuid();aid uuid=gen_random_uuid(); aid2 uuid=gen_random_uuid();r salon_loyalty_rewards; allocation loyalty_checkout_uses; failed boolean; mid uuid;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Loyalty fixture','loyalty-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone) values(c,w,'Loyalty fixture','390000000000');
 insert into services(id,workspace_id,name,price,duration_minutes) values(sid,w,'Loyalty service',20,30);
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description) values(w,c,100,'service','fixture','Fixture points');
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,current_date,'10:00','Loyalty fixture','Loyalty service',20,30), (aid2,w,c,current_date,'11:00','Loyalty fixture','Loyalty service',20,30);
 r=save_loyalty_reward_terms(null,0,'Ten percent',10,'percent',10,array[sid],'Test',current_date+30,false);
 if loyalty_reward_quote(aid,r.id)<>200 then raise exception 'TEST percent quote'; end if;
 insert into cash_movements(workspace_id,appointment_id,description,amount) values(w,aid,'Fixture due',20) returning id into mid;
 allocation=apply_loyalty_checkout_reward(aid,r.id,r.revision);
 if allocation.discount_cents<>200 or (select price from appointments where id=aid)<>18 or (select amount from cash_movements where id=mid)<>18 then raise exception 'TEST checkout total'; end if;
 if (apply_loyalty_checkout_reward(aid,r.id,r.revision)).id<>allocation.id or (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>90 then raise exception 'TEST duplicate spend'; end if;
 r=save_loyalty_reward_terms(r.id,r.revision,'Changed',50,'fixed',10,'{}','',null,true);
 if (select snapshot->>'points_cost' from loyalty_checkout_uses where id=allocation.id)<>'10' then raise exception 'TEST immutable snapshot'; end if;
 failed=false;begin update cash_movements set amount=20 where id=mid;exception when others then failed=true;end;
 if not failed then raise exception 'TEST stale checkout amount accepted';end if;
 update appointments set no_show=true where id=aid;
 set constraints loyalty_checkout_lifecycle immediate;
 if (select sum(delta) from customer_loyalty_ledger where customer_id=c)<>100 then raise exception 'TEST cancellation refund';end if;
 r=save_loyalty_reward_terms(r.id,r.revision,'Free service',10,'service',0,array[sid],'',null,false);
 if loyalty_reward_quote(aid2,r.id)<>2000 then raise exception 'TEST free service';end if;
 update appointments set price=15 where id=aid2;
 if loyalty_reward_quote(aid2,r.id) is not null then raise exception 'TEST stacking off';end if;
 r=save_loyalty_reward_terms(r.id,r.revision,'Free service',10,'service',0,array[sid],'',null,true);
 if loyalty_reward_quote(aid2,r.id)<>1500 then raise exception 'TEST stacking on';end if;
 r=save_loyalty_reward_terms(r.id,r.revision,'Expired',10,'fixed',5,'{}','',current_date-1,true);
 if loyalty_reward_quote(aid2,r.id) is not null then raise exception 'TEST expired';end if;
 r=save_loyalty_reward_terms(r.id,r.revision,'Too many points',1000,'fixed',5,'{}','',null,true);
 if loyalty_reward_quote(aid2,r.id) is not null then raise exception 'TEST points overspend';end if;
 r=save_loyalty_reward_terms(r.id,r.revision,'Fixed five',10,'fixed',5,'{}','',null,true);
 update appointments set completed=true where id=aid2;
 allocation=apply_loyalty_checkout_reward(aid2,r.id,r.revision);
 if allocation.discount_cents<>500 or allocation.state<>'consumed' then raise exception 'TEST completed checkout';end if;
 failed=false;begin perform redeem_loyalty_reward(c,r.id,r.revision,gen_random_uuid());exception when others then failed=true;end;
 if not failed then raise exception 'TEST financial reward bypassed checkout';end if;

 -- A zero-price service reward, a paid appointment and a foreign service scope.
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,current_date,'12:00','Loyalty fixture','Loyalty service',20,30);
 r=save_loyalty_reward_terms(r.id,r.revision,'Free service',10,'service',0,array[sid],'',null,false);
 allocation=apply_loyalty_checkout_reward(aid,r.id,r.revision);
 if (select price from appointments where id=aid)<>0 or allocation.discount_cents<>2000 then raise exception 'TEST free service not zero';end if;
 update appointments set completed=true where id=aid;
 set constraints loyalty_checkout_lifecycle immediate;
 if (select state from loyalty_checkout_uses where id=allocation.id)<>'consumed' then raise exception 'TEST completion not consumed';end if;
 aid=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(aid,w,c,current_date,'13:00','Loyalty fixture','Loyalty service',20,30);
 insert into cash_movements(workspace_id,appointment_id,description,amount,payment_method) values(w,aid,'Paid fixture',20,'cash');
 if loyalty_reward_quote(aid,r.id) is not null then raise exception 'TEST already paid discounted';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 failed=false;begin perform loyalty_checkout_options(aid2);exception when others then failed=true;end;
 if not failed then raise exception 'TEST foreign workspace leak';end if;
end $$;
