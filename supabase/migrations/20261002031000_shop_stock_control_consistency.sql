-- Preserve UI dose units and keep overview warnings aligned with usable stock.
create or replace function shop_recipe_save(p_service uuid,p_revision integer,p_lines jsonb) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();r shop_service_recipes;p shop_products;l jsonb;snapshot jsonb='[]';q numeric;begin
 if not exists(select 1 from services where id=p_service and workspace_id=w) then raise exception 'Servizio non valido';end if;
 select * into r from shop_service_recipes where service_id=p_service;
 if coalesce(r.revision,0) is distinct from p_revision then raise exception 'Ricetta aggiornata su un altro dispositivo: riaprila';end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)>30 then raise exception 'Massimo 30 prodotti per servizio';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'product_id' having count(*)>1) then raise exception 'Prodotto ripetuto';end if;
 for l in select * from jsonb_array_elements(p_lines) loop
 select * into p from shop_products where workspace_id=w and id=(l->>'product_id')::uuid;
 q=(l->>'quantity')::numeric;
 if not found or p.archived or p.purpose='retail' or q is null or q<=0 or q>1000000 or q<>round(q,3) or (p.unit='piece' and q<>trunc(q)) then raise exception 'Controlla prodotto a uso interno e dose';end if;
 if (l ? 'unit' and l->>'unit' is distinct from p.unit) or (l ? 'pack_size' and (l->>'pack_size')::numeric is distinct from p.pack_size) then raise exception 'Formato del prodotto aggiornato: riapri la ricetta prima di impostare le dosi';end if;
 snapshot=snapshot||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',q,'unit',p.unit,'pack_size',p.pack_size));
 end loop;
 insert into shop_service_recipes(workspace_id,service_id,lines) values(w,p_service,snapshot) on conflict(service_id) do update set lines=excluded.lines,revision=shop_service_recipes.revision+1,updated_at=now();
end $$;
create or replace function public.shop_console(p_search text default '',p_page integer default 0,p_archived boolean default false,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id();begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito';end if;
 if p_history_page<0 or p_history_page>100000 or p_page<0 or p_page>100000 or length(p_search)>120 then raise exception 'Ricerca non valida';end if;
 return jsonb_build_object(
 'settings',coalesce((select to_jsonb(s) from shop_settings s where workspace_id=w),'{"enabled":false,"revision":1}'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from (select * from shop_products where workspace_id=w and archived=p_archived and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||sku||' '||coalesce(barcode,'')||' '||variant))>0) order by name,id limit 30 offset p_page*30) p),'[]'),
 'count',(select count(*) from shop_products where workspace_id=w and archived=p_archived and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||sku||' '||coalesce(barcode,'')||' '||variant))>0)),
 'summary',(select jsonb_build_object('products',count(*),'low',count(*) filter(where not archived and (purpose<>'professional' and greatest(0,retail_qty-reserved_qty-shop_expired_quantity(id,'retail'))<=minimum_retail or purpose<>'retail' and greatest(0,professional_qty-shop_expired_quantity(id,'professional'))<=minimum_professional)),'retail_cost_cents',coalesce(sum(retail_qty*cost_cents),0)) from shop_products where workspace_id=w and not archived),
 'movement_count',(select count(*) from shop_stock_movements where workspace_id=w),'sale_count',(select count(*) from shop_sales where workspace_id=w),
 'movements',coalesce((select jsonb_agg(to_jsonb(m) order by created_at desc,id) from (select m.*,p.name,p.unit from shop_stock_movements m join shop_products p on p.id=m.product_id where m.workspace_id=w order by m.created_at desc,m.id limit 30 offset p_history_page*30) m),'[]'),
 'sales',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc,id) from (select s.*,(select jsonb_agg(to_jsonb(l)||jsonb_build_object('returned',coalesce((select sum(r.quantity) from shop_returns r where r.sale_id=s.id and r.product_id=l.product_id),0))) from shop_sale_lines l where l.sale_id=s.id) as lines,coalesce((select sum(amount_cents) from shop_returns r where r.sale_id=s.id),0) as refunded_cents from shop_sales s where workspace_id=w order by created_at desc,id limit 30 offset p_history_page*30) s),'[]'));
end $$;
