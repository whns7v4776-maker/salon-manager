do $$
declare w uuid=gen_random_uuid();u uuid=gen_random_uuid();sid uuid=gen_random_uuid();aid uuid=gen_random_uuid();aid2 uuid=gen_random_uuid();p shop_products;p2 shop_products;lid uuid;cid uuid;op uuid;rev bigint;bad boolean;recipe jsonb;payload jsonb;data jsonb;begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Stock control fixture','stockcontrol-'||w,u||'@example.invalid','active',now()+interval '1 year');
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');perform set_config('request.jwt.claim.sub',u::text,true);
 perform shop_set_enabled(true,1);
 p=shop_create_product(gen_random_uuid(),'{"name":"Shampoo test","sku":"STOCK","purpose":"both","unit":"ml","pack_size":250,"price_cents":2000,"cost_cents":1000,"minimum_retail":1,"minimum_professional":100}');
 p2=shop_create_product(gen_random_uuid(),'{"name":"Mask test","sku":"MASK","purpose":"professional","unit":"g","pack_size":500,"price_cents":0,"cost_cents":500,"minimum_retail":0,"minimum_professional":10}');
 perform shop_adjust_stock(gen_random_uuid(),p.id,'retail','receive',8,'Initial stock',0);
 select stock_revision into rev from shop_products where id=p.id;
 op=gen_random_uuid();perform shop_register_lot(op,p.id,'retail','EXPIRED',current_date-2,2,rev);perform shop_register_lot(op,p.id,'retail','EXPIRED',current_date-2,2,rev);
 if (select sum(quantity) from shop_stock_lots where product_id=p.id)<>2 then raise exception 'Duplicate lot association';end if;
 select stock_revision into rev from shop_products where id=p.id;
 perform shop_register_lot(gen_random_uuid(),p.id,'retail','FRESH',current_date+30,4,rev);
 bad=false;begin perform shop_checkout(gen_random_uuid(),null,'cash',jsonb_build_array(jsonb_build_object('id',p.id,'quantity',7,'revision',p.revision)));exception when others then bad=true;end;
 if not bad or (select retail_qty from shop_products where id=p.id)<>8 or exists(select 1 from shop_sales where workspace_id=w) then raise exception 'Expired units sold or partial sale';end if;
 bad=false;begin update shop_products set reserved_qty=7 where id=p.id;exception when others then bad=true;end;if not bad then raise exception 'Expired reservation accepted';end if;
 perform shop_adjust_stock(gen_random_uuid(),p.id,'retail','transfer',2,'Internal use',0);
 if (select quantity from shop_stock_lots where product_id=p.id and bucket='professional' and code='FRESH')<>500 or (select professional_qty from shop_products where id=p.id)<>500 then raise exception 'Transfer lost batch or units';end if;
 update shop_settings set storefront_enabled=true,pickup_enabled=true where workspace_id=w;update shop_products set published=true where id=p.id;
 if (public_shop_catalog('stockcontrol-'||w)->'products'->0->>'available')::numeric<>4 then raise exception 'Expired public stock exposed';end if;
 select id into lid from shop_stock_lots where product_id=p.id and code='EXPIRED';
 op=gen_random_uuid();perform shop_discard_lot(op,lid,1,2,'Expired stock');perform shop_discard_lot(op,lid,1,2,'Expired stock');
 if (select retail_qty from shop_products where id=p.id)<>4 or shop_expired_quantity(p.id,'retail')<>0 then raise exception 'Discard wrong';end if;

 update shop_settings set storefront_enabled=true,pickup_enabled=true where workspace_id=w;
 update shop_products set published=true where id=p.id;
 if (public_shop_cart('stockcontrol-'||w,array[p.id])->0->>'available')::numeric<>4 then raise exception 'Public available quantity wrong';end if;
 -- Count is atomic and rejects stale devices, even when a previous row was valid.
 select stock_revision into rev from shop_products where id=p.id;
 bad=false;begin perform shop_inventory_count(gen_random_uuid(),jsonb_build_array(jsonb_build_object('product_id',p.id,'bucket','retail','quantity',3,'stock_revision',rev),jsonb_build_object('product_id',p2.id,'bucket','professional','quantity',10,'stock_revision',-1)),'Stocktake');exception when others then bad=true;end;
 if not bad or (select retail_qty from shop_products where id=p.id)<>4 then raise exception 'Partial count committed';end if;
 op=gen_random_uuid();payload=jsonb_build_array(jsonb_build_object('product_id',p.id,'bucket','retail','quantity',3,'stock_revision',rev));
 perform shop_inventory_count(op,payload,'Stocktake');perform shop_inventory_count(op,payload,'Stocktake');
 if (select retail_qty from shop_products where id=p.id)<>3 then raise exception 'Count retry wrong';end if;
 insert into services(id,workspace_id,name,price,duration_minutes) values(sid,w,'Treatment test',20,30);
 recipe=jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',100),jsonb_build_object('product_id',p2.id,'quantity',10));

 bad=false;begin perform shop_recipe_save(sid,0,jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',20,'unit','g','pack_size',250)));exception when others then bad=true;end;if not bad then raise exception 'Stale dose units accepted';end if;
 perform shop_recipe_save(sid,0,recipe);
 insert into appointments(id,workspace_id,service_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(aid,w,sid,current_date,'10:00','Fixture','Treatment test',20,30);
 update appointments set completed=true where id=aid;
 if exists(select 1 from shop_service_consumptions where workspace_id=w) then raise exception 'Auto consumption default enabled';end if;
 perform shop_consumption_settings(true,2);
 if exists(select 1 from shop_service_consumptions where workspace_id=w) then raise exception 'Retroactive consumption';end if;
 insert into appointments(id,workspace_id,service_id,appointment_date,appointment_time,customer_name,service_name,price,duration_minutes) values(aid2,w,sid,current_date,'11:00','Fixture','Treatment test',20,30);
 update appointments set completed=true where id=aid2;
 select id into cid from shop_service_consumptions where appointment_id=aid2;
 if cid is null or (select state from shop_service_consumptions where id=cid)<>'pending' or (select professional_qty from shop_products where id=p.id)<>500 or not (select completed from appointments where id=aid2) then raise exception 'Shortage froze appointment or partial consumption';end if;
 perform shop_recipe_save(sid,1,jsonb_build_array(jsonb_build_object('product_id',p.id,'quantity',1)));
 perform shop_adjust_stock(gen_random_uuid(),p2.id,'professional','receive',100,'Receipt mask',0);
 perform shop_resolve_consumption(cid,1,'retry');
 if (select professional_qty from shop_products where id=p.id)<>400 or (select professional_qty from shop_products where id=p2.id)<>90 then raise exception 'Retry rewrote recipe snapshot';end if;
 update appointments set completed=false where id=aid2;update appointments set completed=true where id=aid2;
 if (select professional_qty from shop_products where id=p.id)<>400 or (select quantity from shop_stock_lots where product_id=p.id and bucket='professional')<>400 then raise exception 'Repeated completion double consumption';end if;
 data=shop_control_console();if (data->'report'->>'consumption_cents')::numeric<>410 then raise exception 'Consumption cost snapshot wrong';end if;
 -- Sale report uses original costs, returns and retained cost for discarded returns.
 op=gen_random_uuid();perform shop_checkout(op,null,'cash',jsonb_build_array(jsonb_build_object('id',p.id,'quantity',2,'revision',p.revision)));
 perform shop_return(gen_random_uuid(),op,p.id,1,false,'Damaged return');
 data=shop_control_console();if (data->'report'->>'revenue_cents')::numeric<>2000 or (data->'report'->>'cost_cents')::numeric<>2000 then raise exception 'Sale or damaged-return report wrong';end if;
 if has_function_privilege('anon','shop_register_lot(uuid,uuid,text,text,date,numeric,bigint)','EXECUTE') or has_function_privilege('authenticated','shop_apply_consumption(uuid)','EXECUTE') or has_table_privilege('authenticated','shop_stock_lots','UPDATE') then raise exception 'Excess privileges';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);bad=false;begin perform shop_control_console();exception when others then bad=true;end;if not bad then raise exception 'Foreign read allowed';end if;
end $$;
