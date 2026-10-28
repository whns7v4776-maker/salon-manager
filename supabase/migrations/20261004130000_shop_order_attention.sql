create or replace function public.shop_control_alerts() returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);begin
 return jsonb_build_object(
 'pending',(select count(*) from shop_service_consumptions where workspace_id=w and state='pending'),
 'expiring',(select count(*) from shop_stock_lots where workspace_id=w and quantity>0 and expires_on<=(now() at time zone 'Europe/Rome')::date+30),
 'purchases_pending',(select count(*) from shop_purchase_orders where workspace_id=w and status in ('ordered','partial')),
 'orders_pending',(select count(*) from shop_orders where workspace_id=w and status='pending' and expires_at>now()),
 'orders_ready',(select count(*) from shop_orders where workspace_id=w and status='ready' and expires_at>now()),
 'orders_due',(select count(*) from shop_orders where workspace_id=w and status='ready' and due_cents>0 and expires_at>now()));
end $$;
