create or replace function public.customer_benefits_wallet(p_salon_code text,p_email text,p_phone text,p_token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb; c uuid; w uuid;
begin
 ctx=verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);
 if ctx is null then raise exception 'Verifica la password per accedere ai vantaggi'; end if;
 c=(ctx->>'customerId')::uuid;w=(ctx->>'workspaceId')::uuid;
 return jsonb_build_object('settings',coalesce((select to_jsonb(s)-'workspace_id' from salon_benefit_settings s where workspace_id=w),'{}'),
 'points',(select coalesce(sum(delta),0) from customer_loyalty_ledger where workspace_id=w and customer_id=c),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r)) from salon_loyalty_rewards r where workspace_id=w and not archived),'[]'),
 'giftCards',coalesce((select jsonb_agg(to_jsonb(g)-'purchase_movement_id'||jsonb_build_object('salon_name',(select salon_name from workspaces where id=w),'customer_name',(select full_name from customers where id=g.customer_id),'available_cents',g.amount_cents-(select coalesce(sum(amount_cents),0) from gift_card_uses where gift_card_id=g.id and state<>'released'))) from customer_gift_cards g where workspace_id=w and customer_id=c),'[]'),
 'packages',customer_package_wallet(p_salon_code,p_email,p_phone,p_token));
end $$;
create or replace function public.owner_customer_benefits(p_customer uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id();
begin
 if w is null or not workspace_access_allowed() or not exists(select 1 from customers where id=p_customer and workspace_id=w) then raise exception 'Cliente non accessibile'; end if;
 return jsonb_build_object(
 'settings',coalesce((select to_jsonb(s) from salon_benefit_settings s where workspace_id=w),'{}'),
 'points',(select coalesce(sum(delta),0) from customer_loyalty_ledger where workspace_id=w and customer_id=p_customer),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by points_cost) from salon_loyalty_rewards r where workspace_id=w),'[]'),
 'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by name) from service_package_catalog c where workspace_id=w),'[]'),
 'packages',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object(
   'available',p.uses-(select count(*) from service_package_redemptions r where r.package_id=p.id and state<>'released'),
   'reserved',(select count(*) from service_package_redemptions r where r.package_id=p.id and state='reserved'),
   'consumed',(select count(*) from service_package_redemptions r where r.package_id=p.id and state='consumed')) order by expires_on)
   from customer_service_packages p where workspace_id=w and customer_id=p_customer),'[]'),
 'giftCards',coalesce((select jsonb_agg(to_jsonb(g)||jsonb_build_object('salon_name',(select salon_name from workspaces where id=w),'customer_name',(select full_name from customers where id=g.customer_id),'available',g.amount_cents-(select coalesce(sum(amount_cents),0) from gift_card_uses u where u.gift_card_id=g.id and state<>'released')))
   from customer_gift_cards g where workspace_id=w and customer_id=p_customer),'[]'));
end $$;
