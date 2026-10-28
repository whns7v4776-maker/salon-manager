do $$
declare w uuid=gen_random_uuid();u uuid=gen_random_uuid();c uuid=gen_random_uuid();o uuid=gen_random_uuid();a jsonb;b jsonb;
begin
 insert into auth.users(id,email) values(u,u||'@example.invalid');
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status) values(w,'Attention fixture','attention-'||w,u||'@example.invalid','active');
 update workspaces set subscription_ends_at=now()+interval '1 year' where id=w;
 insert into workspace_members(workspace_id,user_id,email) values(w,u,u||'@example.invalid');
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into customers(id,workspace_id,full_name,phone,email) values(c,w,'Attention fixture','390000000001',c||'@example.invalid');
 insert into shop_orders(id,workspace_id,customer_id,customer_name,payload,total_cents,due_cents,expires_at) values(o,w,c,'Attention fixture','{}',1000,1000,now()+interval '1 day');
 a=shop_control_alerts();b=shop_control_alerts();
 if (a->>'orders_pending')::int<>1 or a<>b then raise exception 'TEST pending badge disappeared after read';end if;
 update shop_orders set status='ready' where id=o;a=shop_control_alerts();
 if (a->>'orders_pending')::int<>0 or (a->>'orders_ready')::int<>1 or (a->>'orders_due')::int<>1 then raise exception 'TEST ready/payment badge missing';end if;
 update shop_orders set status='collected' where id=o;a=shop_control_alerts();
 if (a->>'orders_ready')::int<>0 or (a->>'orders_due')::int<>0 then raise exception 'TEST completed badge remained';end if;
 update shop_orders set status='pending',expires_at=now()-interval '1 second' where id=o;a=shop_control_alerts();
 if (a->>'orders_pending')::int<>0 then raise exception 'TEST expired order counted';end if;
 update shop_orders set status='ready',due_cents=0,gift_cents=1000,expires_at=now()+interval '1 day' where id=o;a=shop_control_alerts();
 if (a->>'orders_ready')::int<>1 or (a->>'orders_due')::int<>0 then raise exception 'TEST paid order wrongly counted as due';end if;
end $$;
