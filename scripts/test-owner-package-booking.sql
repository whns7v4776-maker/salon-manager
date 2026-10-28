do $$
declare w uuid=gen_random_uuid(); u uuid=gen_random_uuid(); c uuid=gen_random_uuid(); other uuid=gen_random_uuid(); s uuid=gen_random_uuid(); s2 uuid=gen_random_uuid();
 cat service_package_catalog; pack customer_service_packages; r jsonb; again jsonb; body jsonb; k uuid=gen_random_uuid(); n integer; failed boolean; aid uuid; combo uuid=gen_random_uuid(); group_body jsonb;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Owner package fixture','owner-pkg-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone,email) values(c,w,'Owner package fixture','390000000001',c||'@example.invalid'),(other,w,'Other fixture','390000000002',other||'@example.invalid');
 insert into services(id,workspace_id,name,price,duration_minutes) values(s,w,'Covered fixture',20,30),(s2,w,'Not covered fixture',25,30);
 perform save_salon_benefit_settings(true,false,false,1,1);
 cat=save_service_package(null,0,'One use',jsonb_build_array(jsonb_build_object('kind','service','id',s)),1,3,2000,0);
 pack=assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'cash');
 body=jsonb_build_object('p_customer_name','Owner package fixture','p_customer_phone','390000000001','p_service_name','Covered fixture','p_price',20,'p_duration_minutes',30,'p_appointment_date',current_date+1,'p_appointment_time','10:00','p_salon_code','owner-pkg-'||w,'p_create_booking_request',false);
 r=create_owner_package_appointment_v1(pack.id,c,k,body,false);
 aid=(r->>'appointmentId')::uuid;
 if (select price from appointments where id=aid)<>0 or (select count(*) from service_package_redemptions where package_id=pack.id and state='reserved')<>1 then raise exception 'TEST: booking was not covered'; end if;
 again=create_owner_package_appointment_v1(pack.id,c,k,body,false);
 if again<>r or (select count(*) from appointments where workspace_id=w)<>1 then raise exception 'TEST: retry created duplicate'; end if;
 n=(select count(*) from appointments where workspace_id=w);
 failed=false;
 begin perform create_owner_package_appointment_v1(pack.id,other,gen_random_uuid(),body,false); exception when others then failed=true; end;
 if not failed then raise exception 'TEST: wrong customer accepted'; end if;
 failed=false;
 begin perform create_owner_package_appointment_v1(pack.id,c,gen_random_uuid(),body||'{"p_appointment_time":"12:00"}',false); exception when others then failed=true; end;
 if not failed or (select count(*) from appointments where workspace_id=w)<>n then raise exception 'TEST: exhausted use left an appointment'; end if;
 -- Uncovered service must roll back the newly inserted appointment as well.
 cat=save_service_package(null,0,'Second package',jsonb_build_array(jsonb_build_object('kind','service','id',s)),1,3,2000,0);
 pack=assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'cash');
 failed=false;
 begin perform create_owner_package_appointment_v1(pack.id,c,gen_random_uuid(),body||'{"p_service_name":"Not covered fixture","p_appointment_time":"13:00"}',false); exception when others then failed=true; end;
 if not failed or (select count(*) from appointments where workspace_id=w)<>n then raise exception 'TEST: uncovered service left an appointment'; end if;

 insert into service_compositions(id,workspace_id,name,visibility) values(combo,w,'Covered composition','public');
 insert into service_composition_items(workspace_id,composition_id,service_id,position) values(w,combo,s,0),(w,combo,s2,1);
 cat=save_service_package(null,0,'Composition package',jsonb_build_array(jsonb_build_object('kind','composition','id',combo)),2,3,8000,0);
 pack=assign_service_package(gen_random_uuid(),c,cat.id,cat.revision,current_date,'cash');
 group_body=body||jsonb_build_object('p_group_title','Covered composition','p_idempotency_key',gen_random_uuid()::text,'p_items',jsonb_build_array(
  jsonb_build_object('serviceName','Covered fixture','price',20,'durationMinutes',30,'appointmentDate',current_date+2,'appointmentTime','10:00'),
  jsonb_build_object('serviceName','Not covered fixture','price',25,'durationMinutes',30,'appointmentDate',current_date+2,'appointmentTime','10:30')));
 k=gen_random_uuid();
 r=create_owner_package_appointment_v1(pack.id,c,k,group_body,true);
 if jsonb_array_length(r->'appointmentIds')<>2 or (select count(*) from service_package_redemptions where package_id=pack.id)<>1 then raise exception 'TEST: composition not covered by one use'; end if;
 if exists(select 1 from appointments where appointment_group_id=(r->>'groupId')::uuid and price<>0) then raise exception 'TEST: covered composition still payable'; end if;
 again=create_owner_package_appointment_v1(pack.id,c,k,group_body,true);
 if again<>r or (select count(*) from service_package_redemptions where package_id=pack.id)<>1 then raise exception 'TEST: composition retry consumed again'; end if;
 n=(select count(*) from appointments where workspace_id=w);
 failed=false;
 begin perform create_owner_package_appointment_v1(pack.id,c,gen_random_uuid(),body||jsonb_build_object('p_appointment_date',current_date+400),false); exception when others then failed=true; end;
 if not failed or (select count(*) from appointments where workspace_id=w)<>n then raise exception 'TEST: expired package left an appointment'; end if;
end $$;
