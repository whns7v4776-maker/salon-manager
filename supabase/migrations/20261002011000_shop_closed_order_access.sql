-- Preserve access to issued orders when the storefront is switched off.
create or replace function public_shop_catalog(p_salon_code text,p_search text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid;s shop_settings;begin
 select id into w from workspaces where slug=lower(trim(p_salon_code)) and (is_internal_tester or subscription_status in ('demo','active'));
 select * into s from shop_settings where workspace_id=w;
 if w is null or not coalesce(s.enabled and s.storefront_enabled,false) then return jsonb_build_object('visible',false,'products','[]'::jsonb,'count',0,'orders_supported',exists(select 1 from shop_orders where workspace_id=w));end if;
 if p_page<0 or p_page>100000 or length(p_search)>120 then raise exception 'Ricerca non valida';end if;
 return jsonb_build_object('visible',true,'pickup_enabled',s.pickup_enabled,'hold_hours',s.hold_hours,'gift_enabled',s.gift_enabled,'rewards_enabled',s.rewards_enabled,'count',(select count(*) from shop_products where workspace_id=w and published and not archived and purpose<>'professional' and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||category||' '||variant))>0)),
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from (select id,name,brand,category,variant,image_url,price_cents,retail_qty-reserved_qty available,revision from shop_products where workspace_id=w and published and not archived and purpose<>'professional' and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||category||' '||variant))>0) order by name,id limit 24 offset p_page*24) p),'[]'));
end $$;
