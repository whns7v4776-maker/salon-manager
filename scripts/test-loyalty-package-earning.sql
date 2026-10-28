do $$
declare w uuid=gen_random_uuid();c uuid=gen_random_uuid();a uuid=gen_random_uuid();sid uuid=gen_random_uuid();cat service_package_catalog;pack customer_service_packages;n bigint; r salon_benefit_settings;u uuid=gen_random_uuid();plain uuid=gen_random_uuid();mix uuid=gen_random_uuid();part uuid=gen_random_uuid();
begin
 set constraints all immediate;
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'QA opt in','qa-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone) values(c,w,'QA','390000000001');
 insert into services(id,workspace_id,name,price,duration_minutes) values(sid,w,'QA',20,30);
 r=save_salon_benefit_settings(true,true,false,1,1);
 if r.loyalty_package_services then raise exception 'Default must be off';end if;
 cat=save_service_package(null,0,'QA',jsonb_build_array(jsonb_build_object('kind','service','id',sid)),4,3,5000,0);
 pack=assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'cash');
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(a,w,c,current_date+1,'10:00','QA','QA',20,30);
 perform apply_owner_service_package(pack.id,a);
 update appointments set completed=true where id=a;
 if exists(select 1 from customer_loyalty_ledger where customer_id=c and reference_key='service:'||a) then raise exception 'Covered service earned while off';end if;
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes,completed)
 values(plain,w,c,current_date+30,'18:00','QA','QA',20,30,true);
 if not exists(select 1 from customer_loyalty_ledger where reference_key='service:'||plain and delta=1) then raise exception 'Normal service lost points';end if;
 select user_id into u from workspace_members where workspace_id=w limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select * into r from salon_benefit_settings where workspace_id=w;
 r=save_loyalty_earning_rule_v2(r.revision,'service',1,500,1,true,true,false,0,'QA',true);
 if not r.loyalty_package_services then raise exception 'Flag not persisted';end if;
 if (owner_benefits_console()->'settings'->>'loyalty_package_services')::boolean is distinct from true
 or (owner_customer_benefits(c)->'settings'->>'loyalty_package_services')::boolean is distinct from true then raise exception 'Flag missing from owner readers';end if;
 r=save_loyalty_earning_rule(r.revision,'service',1,500,1,true,true,false,0,'QA');
 if not r.loyalty_package_services then raise exception 'Old clients overwrite opt in';end if;
 a=gen_random_uuid();
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes)
 values(a,w,c,current_date+2,'10:00','QA','QA',20,30);
 perform apply_owner_service_package(pack.id,a);
 update appointments set completed=true where id=a;
 if not exists(select 1 from customer_loyalty_ledger where reference_key='service:'||a and delta=1) then raise exception 'Opt in not earning';end if;
 r=save_loyalty_earning_rule_v2(r.revision,'service',1,500,1,true,true,false,0,'QA',false);
 if not exists(select 1 from customer_loyalty_ledger where reference_key='service:'||a and delta=1) then raise exception 'Historical points removed';end if;
 insert into appointment_groups(id,workspace_id,customer_id) values(mix,w,c);
 -- Mixed groups earn once for their ordinary service, even with a package line.
 insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes,appointment_group_id)
 values(mix,w,c,current_date+3,'10:00','QA','QA',20,30,mix),
 (part,w,c,current_date+3,'11:00','QA','QA extra',10,30,mix);
 perform apply_owner_service_package(pack.id,mix);
 update appointments set completed=true where id in(mix,part);
 if not exists(select 1 from customer_loyalty_ledger where reference_key='service:'||mix and delta=1) then raise exception 'Mixed group failed to earn';end if;
 begin
 perform save_loyalty_earning_rule_v2(r.revision-1,'service',1,500,1,true,true,false,0,'QA',true);
 raise exception 'TEST stale revision accepted';
 exception when others then if sqlerrm='TEST stale revision accepted' then raise;end if;end;
end $$;
