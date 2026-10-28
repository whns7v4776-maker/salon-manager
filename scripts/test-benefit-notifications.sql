do $$
declare w uuid=gen_random_uuid();c uuid=gen_random_uuid();u uuid=gen_random_uuid();r salon_loyalty_rewards;ledger uuid;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Notification fixture','notice-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone) values(c,w,'Notice fixture','390000000000');
 r=save_loyalty_reward_terms(null,0,'Reward fixture',10,'fixed',5,'{}','',null,true);
 if exists(select 1 from customer_benefit_notifications where workspace_id=w) then raise exception 'TEST model save notified customer';end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description) values(w,c,10,'service','test','Fixture') returning id into ledger;
 if (select count(*) from customer_benefit_notifications where workspace_id=w)<>1 then raise exception 'TEST milestone not notified';end if;
 perform record_benefit_notification(w,c,'threshold:'||ledger,'Duplicate','Duplicate');
 if (select count(*) from customer_benefit_notifications where workspace_id=w)<>1 then raise exception 'TEST duplicate history';end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description) values(w,c,-10,'reward','test-redeem','Fixture') returning id into ledger;
 update customer_loyalty_ledger set delta=0 where id=ledger;
 if (select count(*) from customer_benefit_notifications where workspace_id=w)<>3 then raise exception 'TEST redemption and return history';end if;
 if exists(select 1 from push_notifications where workspace_id=w) then raise exception 'TEST push queued without a device';end if;
 insert into push_devices(workspace_id,owner_email,expo_push_token,recipient_kind,customer_phone,is_active) values(w,u||'@example.invalid','ExponentPushToken['||replace(gen_random_uuid()::text,'-','')||']','client','390000000000',true);
 perform record_benefit_notification(w,c,'device-test','Fixture delivery','Rollback-only push');
 if (select count(*) from push_notifications where workspace_id=w and payload->>'type'='customer_benefit')<>1 then raise exception 'TEST targeted push not queued';end if;
 perform record_benefit_notification(w,c,'device-test','Fixture delivery','Rollback-only push');
 if (select count(*) from push_notifications where workspace_id=w)<>1 then raise exception 'TEST duplicate push';end if;
 if has_function_privilege('anon','record_benefit_notification(uuid,uuid,text,text,text)','EXECUTE') then raise exception 'TEST public notification write';end if;
end $$;
