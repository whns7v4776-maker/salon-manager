-- Run with the pending identity migration inside BEGIN ... ROLLBACK.
-- No fixture is committed and no real salon data is read or changed.
do $$
declare
  w uuid = gen_random_uuid(); u uuid = gen_random_uuid();
  other_w uuid = gen_random_uuid(); other_u uuid = gen_random_uuid();
  public_service uuid = gen_random_uuid(); component_service uuid = gen_random_uuid();
  unique_service uuid = gen_random_uuid(); foreign_service uuid = gen_random_uuid();
  group_id uuid = gen_random_uuid(); a uuid; a2 uuid; cid uuid; bad boolean;
  p shop_products; v_metadata jsonb; malformed jsonb;
begin
  insert into auth.users(id,email) values(u,u||'@example.invalid'),(other_u,other_u||'@example.invalid');
  insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values
    (w,'Identity fixture','identity-'||w,u||'@example.invalid','active',now()+interval '1 year'),
    (other_w,'Foreign identity fixture','identity-'||other_w,other_u||'@example.invalid','active',now()+interval '1 year');
  insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid'),(other_w,other_u,other_u||'@example.invalid');
  perform set_config('request.jwt.claim.sub',u::text,true);
  perform shop_set_enabled(true,1);
  perform shop_consumption_settings(true,2);
  p = shop_create_product(gen_random_uuid(),'{"name":"Identity test product","sku":"IDENTITY","purpose":"professional","unit":"ml","pack_size":1000,"price_cents":0,"cost_cents":1000,"minimum_retail":0,"minimum_professional":0}');
  perform shop_adjust_stock(gen_random_uuid(),p.id,'professional','receive',1000,'Identity fixture stock',0);
  insert into services(id,workspace_id,name,required_role,price,duration_minutes,composition_only) values
    (public_service,w,'Shared name','Barber',10,30,false),
    (component_service,w,'Shared name','Barber',10,30,true),
    (unique_service,w,'Unique service','Barber',10,30,false),
    (foreign_service,other_w,'Shared name','Barber',10,30,false);
  perform shop_recipe_save(public_service,0,jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',10)));
  perform shop_recipe_save(component_service,0,jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',25)));
  perform shop_recipe_save(unique_service,0,jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',40)));
  insert into appointment_groups(id,workspace_id,title,source,metadata) values(group_id,w,'Composed fixture','salon','{}');

  -- An explicit same-workspace service ID wins over duplicate names and survives
  -- a subsequent catalogue rename. It never applies both component recipes.
  a = gen_random_uuid();
  insert into appointments(id,workspace_id,appointment_group_id,appointment_group_order,service_id,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
    values(a,w,group_id,1,component_service,current_date,'10:00','Fixture','Old component name','Barber',10,30);
  update appointments set completed=true where id=a;
  if (select professional_qty from shop_products where id=p.id)<>975 or
    (select count(*) from shop_service_consumptions where appointment_id=a and state='applied')<>1 then
    raise exception 'Explicit component UUID missed or applied multiple recipes';
  end if;

  -- Unique normalized name + role supports old appointments without a UUID.
  a = gen_random_uuid();
  insert into appointments(id,workspace_id,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
    values(a,w,current_date,'11:00','Fixture',' unique SERVICE ','barber',10,30);
  update appointments set completed=true where id=a;
  if (select professional_qty from shop_products where id=p.id)<>935 then raise exception 'Unique legacy identity not consumed'; end if;

  -- Two components in one group each consume their own dose once. Position,
  -- name and time match saved booking snapshots, rather than current names.
  a = gen_random_uuid(); a2 = gen_random_uuid();
  v_metadata = jsonb_build_object('operatorAssignments',jsonb_build_array(
    jsonb_build_object('position',2,'serviceId',public_service,'serviceName','Public at booking','date',current_date,'time','12:00'),
    jsonb_build_object('position',3,'serviceId',component_service,'serviceName','Component at booking','date',current_date,'time','12:30')));
  update appointment_groups set metadata=v_metadata where id=group_id;
  insert into appointments(id,workspace_id,appointment_group_id,appointment_group_order,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes) values
    (a,w,group_id,2,current_date,'12:00','Fixture','Public at booking','Barber',10,30),
    (a2,w,group_id,3,current_date,'12:30','Fixture','Component at booking','Barber',10,30);
  update appointments set completed=true where id in(a,a2);
  if (select professional_qty from shop_products where id=p.id)<>900 or
    (select count(*) from shop_service_consumptions where appointment_id in(a,a2) and state='applied')<>2 then
    raise exception 'Group component snapshot identities missed or double consumed';
  end if;
  update appointments set completed=false where id in(a,a2);
  update appointments set completed=true where id in(a,a2);
  if (select professional_qty from shop_products where id=p.id)<>900 then raise exception 'Recompletion consumed group twice'; end if;

  -- An ambiguous historical component must complete normally, with one pending
  -- review and no inventory/operation change. Empty retries must never succeed.
  a = gen_random_uuid();
  insert into appointments(id,workspace_id,appointment_group_id,appointment_group_order,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
    values(a,w,group_id,4,current_date,'13:00','Fixture','Shared name','Barber',10,30);
  update appointments set completed=true where id=a;
  select id into cid from shop_service_consumptions where appointment_id=a;
  if cid is null or not (select completed from appointments where id=a) or
    not (select identity_review_required and state='pending' and lines='[]'::jsonb and issue like '%manualmente%' from shop_service_consumptions where id=cid) or
    (select professional_qty from shop_products where id=p.id)<>900 or exists(select 1 from shop_operations where id=cid) then
    raise exception 'Ambiguous recipe blocked completion, disappeared or changed stock';
  end if;
  bad=false;
  begin perform shop_resolve_consumption(cid,1,'retry'); exception when others then bad=sqlerrm like '%manualmente%'; end;
  if not bad or not (select state='pending' and revision=1 from shop_service_consumptions where id=cid)
    or exists(select 1 from shop_operations where id=cid) then raise exception 'Unresolved empty retry reported success'; end if;
  update appointments set completed=false where id=a;
  update appointments set completed=true where id=a;
  if (select count(*) from shop_service_consumptions where appointment_id=a)<>1 then raise exception 'Duplicate pending identity issue'; end if;
  perform shop_resolve_consumption(cid,1,'dismiss','Consumption checked manually');
  if (select state from shop_service_consumptions where id=cid)<>'dismissed' or
    (select professional_qty from shop_products where id=p.id)<>900 then raise exception 'Manual dismissal changed stock or failed'; end if;

  -- Invalid array shapes, malformed UUIDs, foreign workspace UUIDs and stale
  -- component snapshots cannot select a recipe or prevent appointment completion.
  for malformed in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('operatorAssignments',jsonb_build_object('serviceId',component_service)),
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',5,'serviceId','not-a-uuid','serviceName','Shared name','date',current_date,'time','14:00'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',5,'serviceId',foreign_service,'serviceName','Shared name','date',current_date,'time','14:00'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',99,'serviceId',component_service,'serviceName','Shared name','date',current_date,'time','14:00'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',5,'serviceId',component_service,'serviceName','Other component','date',current_date,'time','14:00'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',5,'serviceId',component_service,'serviceName','Shared name','date',current_date,'time','15:00')))
  )) loop
    a=gen_random_uuid();
    update appointment_groups set metadata=malformed where id=group_id;
    insert into appointments(id,workspace_id,appointment_group_id,appointment_group_order,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
      values(a,w,group_id,5,current_date,'14:00','Fixture','Shared name','Barber',10,30);
    update appointments set completed=true where id=a;
    if not (select completed from appointments where id=a) or
      not exists(select 1 from shop_service_consumptions where appointment_id=a and identity_review_required and state='pending') or
      (select professional_qty from shop_products where id=p.id)<>900 then
      raise exception 'Invalid metadata selected a recipe or blocked completion';
    end if;
  end loop;

  -- Contradictory matching provenance must fail closed even when a local name
  -- would otherwise be unique. Invalid entries cannot disappear in an inner join.
  for malformed in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',6,'serviceId','not-a-uuid','serviceName','Unique service','date',current_date,'time','14:30'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(jsonb_build_object('position',6,'serviceId',foreign_service,'serviceName','Unique service','date',current_date,'time','14:30'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(
      jsonb_build_object('position',6,'serviceId',unique_service,'serviceName','Unique service','date',current_date,'time','14:30'),
      jsonb_build_object('position',6,'serviceId',component_service,'serviceName','Unique service','date',current_date,'time','14:30'))),
    jsonb_build_object('operatorAssignments',jsonb_build_array(
      jsonb_build_object('position',6,'serviceId',unique_service,'serviceName','Unique service','date',current_date,'time','14:30'),
      jsonb_build_object('position',6,'serviceId',foreign_service,'serviceName','Unique service','date',current_date,'time','14:30')))
  )) loop
    a=gen_random_uuid();
    update appointment_groups set metadata=malformed where id=group_id;
    insert into appointments(id,workspace_id,appointment_group_id,appointment_group_order,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
      values(a,w,group_id,6,current_date,'14:30','Fixture','Unique service','Barber',10,30);
    update appointments set completed=true where id=a;
    if not (select completed from appointments where id=a) or
      not exists(select 1 from shop_service_consumptions where appointment_id=a and identity_review_required and state='pending') or
      (select professional_qty from shop_products where id=p.id)<>900 then
      raise exception 'Contradictory snapshot incorrectly fell back to unique name';
    end if;
  end loop;

  -- Explicit foreign IDs are invalid even if a local unique name could match.
  a=gen_random_uuid();
  insert into appointments(id,workspace_id,service_id,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
    values(a,w,foreign_service,current_date,'15:00','Fixture','Unique service','Barber',10,30);
  update appointments set completed=true where id=a;
  if not exists(select 1 from shop_service_consumptions where appointment_id=a and identity_review_required and state='pending') or
    (select professional_qty from shop_products where id=p.id)<>900 then raise exception 'Foreign appointment service UUID accepted'; end if;

  -- Known dependency UUIDs can identify duplicate-name components. Keep this
  -- independent of group order/requestIds, which can change after reorganization.
  a=gen_random_uuid();
  update appointment_groups set metadata=jsonb_build_object('dependencyParentServiceId',component_service,'dependencyServiceId',unique_service) where id=group_id;
  insert into appointments(id,workspace_id,appointment_group_id,appointment_group_order,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes)
    values(a,w,group_id,9,current_date,'16:00','Fixture','Shared name','Barber',10,30);
  update appointments set completed=true where id=a;
  if (select professional_qty from shop_products where id=p.id)<>875 then raise exception 'Dependency service identity not used'; end if;

  -- The AFTER INSERT path must see the just-created row as well as UPDATE.
  a=gen_random_uuid();
  insert into appointments(id,workspace_id,service_id,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes,completed)
    values(a,w,unique_service,current_date,'17:00','Fixture','Unique service','Barber',10,30,true);
  if (select professional_qty from shop_products where id=p.id)<>835 or
    not exists(select 1 from shop_service_consumptions where appointment_id=a and state='applied') then
    raise exception 'Completed insert could not resolve its own service identity';
  end if;

  a=gen_random_uuid();
  insert into appointments(id,workspace_id,service_id,appointment_date,appointment_time,customer_name,service_name,required_role,price,duration_minutes,completed,no_show)
    values(a,w,unique_service,current_date,'18:00','Fixture','Unique service','Barber',10,30,true,true);
  if exists(select 1 from shop_service_consumptions where appointment_id=a) or
    (select professional_qty from shop_products where id=p.id)<>835 then raise exception 'No-show generated consumption'; end if;

  if has_function_privilege('authenticated','shop_consumption_service_identity(uuid)','EXECUTE') or
    has_function_privilege('anon','shop_consumption_service_identity(uuid)','EXECUTE') or
    has_function_privilege('authenticated','shop_apply_consumption(uuid)','EXECUTE') then
    raise exception 'Internal recipe identity/worker exposed';
  end if;
end $$;
