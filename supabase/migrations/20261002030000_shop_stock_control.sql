-- Additive stock control. Existing salons remain opt-in for service consumption.
alter table shop_settings add column consumption_enabled boolean not null default false;
create table shop_service_recipes (
 workspace_id uuid not null references workspaces(id),service_id uuid primary key references services(id) on delete cascade,
 revision integer not null default 1,lines jsonb not null default '[]',updated_at timestamptz not null default now()
);
create table shop_service_consumptions (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),
 appointment_id uuid not null,service_name text not null,appointment_date date not null,
 lines jsonb not null,state text not null default 'pending' check(state in ('pending','applied','dismissed')),
 issue text not null default '',resolution text not null default '',revision integer not null default 1,
 actor_id uuid not null,created_at timestamptz not null default now(),applied_at timestamptz,
 unique(workspace_id,appointment_id)
);
create table shop_stock_lots (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),product_id uuid not null,
 bucket text not null check(bucket in ('retail','professional')),code text not null check(length(trim(code)) between 1 and 80),
 expires_on date not null,quantity numeric(14,3) not null check(quantity>=0),revision integer not null default 1,
 created_at timestamptz not null default now(),unique(workspace_id,product_id,bucket,code),
 foreign key(workspace_id,product_id) references shop_products(workspace_id,id)
);
create index shop_lots_expiry on shop_stock_lots(workspace_id,expires_on) where quantity>0;
create index shop_lots_product on shop_stock_lots(product_id,bucket);
create index shop_consumption_pending on shop_service_consumptions(workspace_id,state,created_at);
create table shop_lot_movements (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),
 lot_id uuid not null references shop_stock_lots(id),operation_id uuid not null,delta numeric(14,3) not null,
 reason text not null,created_at timestamptz not null default now(),
 foreign key(workspace_id,operation_id) references shop_operations(workspace_id,id)
);
do $$ declare t text;begin
 foreach t in array array['shop_service_recipes','shop_service_consumptions','shop_stock_lots','shop_lot_movements'] loop
 execute format('alter table %I enable row level security',t);
 execute format('revoke all on %I from public,anon,authenticated',t);
 execute format('grant select on %I to authenticated',t);
 execute format('grant all on %I to service_role',t);
 execute format('create policy owner_read on %I for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed() and exists(select 1 from workspace_members where workspace_id=current_workspace_id() and user_id=auth.uid() and role=''owner''))',t);
 execute format('create trigger shop_changed after insert or update on %I for each row execute function shop_bump_revision()',t);
 end loop;
end $$;
create function shop_expired_quantity(p_product uuid,p_bucket text) returns numeric language sql stable security definer set search_path=public as $$
 select coalesce(sum(quantity),0) from shop_stock_lots where product_id=p_product and bucket=p_bucket and expires_on<(now() at time zone 'Europe/Rome')::date
$$;
-- Expired merchandise cannot be newly reserved. Existing reservations can be cancelled.
create function shop_lot_reservation_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.reserved_qty>old.reserved_qty and new.reserved_qty>new.retail_qty-shop_expired_quantity(new.id,'retail') then raise exception 'Disponibilita cambiata: alcune confezioni sono scadute';end if;
 return new;
end $$;
create trigger shop_lot_reservation_guard before update on shop_products for each row execute function shop_lot_reservation_guard();
-- Every existing sale, pickup, transfer, consumption and count uses the same lot ledger.
-- Positive unlabelled receipts/returns remain unassigned until the owner identifies the lot.
create function shop_allocate_lots() returns trigger language plpgsql security definer set search_path=public as $$
declare p shop_products;op shop_operations;l shop_stock_lots;remaining numeric;take numeric;unassigned numeric;allow_expired boolean;destination uuid;begin
 if new.delta>=0 then return new;end if;
 select * into op from shop_operations where workspace_id=new.workspace_id and id=new.operation_id;
 if op.kind='lot-discard' then return new;end if;
 select * into p from shop_products where id=new.product_id;
 remaining=-new.delta;
 unassigned=greatest(0,(case new.bucket when 'retail' then p.retail_qty else p.professional_qty end)-new.delta-(select coalesce(sum(quantity),0) from shop_stock_lots where product_id=p.id and bucket=new.bucket));
 allow_expired=op.kind='stock' and op.payload->>'action' in ('count','consume');
 if not coalesce(allow_expired,false) and remaining>unassigned+(select coalesce(sum(quantity),0) from shop_stock_lots where product_id=p.id and bucket=new.bucket and expires_on>=(now() at time zone 'Europe/Rome')::date) then raise exception 'Scorte utilizzabili insufficienti per %: verifica i lotti scaduti',p.name;end if;
 for l in select * from shop_stock_lots where product_id=p.id and bucket=new.bucket and quantity>0 and (coalesce(allow_expired,false) or expires_on>=(now() at time zone 'Europe/Rome')::date) order by expires_on,created_at,id for update loop
 exit when remaining<=0;take=least(remaining,l.quantity);
 update shop_stock_lots set quantity=quantity-take,revision=revision+1 where id=l.id;
 insert into shop_lot_movements(workspace_id,lot_id,operation_id,delta,reason) values(new.workspace_id,l.id,new.operation_id,-take,new.reason);
 if op.kind='stock' and op.payload->>'action'='transfer' and new.bucket='retail' then
 insert into shop_stock_lots(workspace_id,product_id,bucket,code,expires_on,quantity) values(new.workspace_id,p.id,'professional',l.code,l.expires_on,take*p.pack_size)
 on conflict(workspace_id,product_id,bucket,code) do update set quantity=shop_stock_lots.quantity+excluded.quantity,revision=shop_stock_lots.revision+1 returning id into destination;
 if (select expires_on from shop_stock_lots where id=destination)<>l.expires_on then raise exception 'Lotto interno con scadenza diversa: verifica prima del trasferimento';end if;
 insert into shop_lot_movements(workspace_id,lot_id,operation_id,delta,reason) values(new.workspace_id,destination,new.operation_id,take*p.pack_size,new.reason);
 end if;
 remaining=remaining-take;
 end loop;
 return new;
end $$;
create trigger shop_allocate_lots after insert on shop_stock_movements for each row execute function shop_allocate_lots();
create function shop_register_lot(p_operation uuid,p_product uuid,p_bucket text,p_code text,p_expires date,p_quantity numeric,p_stock_revision bigint) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();p shop_products;op shop_operations;payload jsonb;lid uuid;unassigned numeric;begin
 payload=jsonb_build_object('product',p_product,'bucket',p_bucket,'code',p_code,'expires',p_expires,'quantity',p_quantity,'revision',p_stock_revision);
 select * into op from shop_operations where workspace_id=w and id=p_operation;
 if found then if op.kind<>'lot-register' or op.payload<>payload then raise exception 'Operazione differente';end if;return;end if;
 select * into p from shop_products where workspace_id=w and id=p_product for update;
 if not found or p.archived or p.stock_revision is distinct from p_stock_revision then raise exception 'Scorte cambiate: riapri il prodotto';end if;
 if p_bucket is null or p_bucket not in ('retail','professional') or length(trim(coalesce(p_code,''))) not between 1 and 80 or p_expires is null or p_quantity is null or p_quantity<=0 or p_quantity>1000000 or p_quantity<>round(p_quantity,3) or ((p_bucket='retail' or p.unit='piece') and p_quantity<>trunc(p_quantity)) then raise exception 'Controlla lotto, scadenza e quantita';end if;
 if p_bucket='retail' and p.purpose='professional' or p_bucket='professional' and p.purpose='retail' then raise exception 'Destinazione non consentita';end if;
 unassigned=(case p_bucket when 'retail' then p.retail_qty else p.professional_qty end)-(select coalesce(sum(quantity),0) from shop_stock_lots where product_id=p.id and bucket=p_bucket);
 if p_quantity>unassigned then raise exception 'Quantita superiore alla scorta senza lotto (%)',unassigned;end if;
 -- Identifying expired stock is allowed, even if reservations already exist: pickups are guarded.
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'lot-register',payload);
 insert into shop_stock_lots(workspace_id,product_id,bucket,code,expires_on,quantity) values(w,p.id,p_bucket,trim(p_code),p_expires,p_quantity)
 on conflict(workspace_id,product_id,bucket,code) do update set quantity=shop_stock_lots.quantity+excluded.quantity,revision=shop_stock_lots.revision+1 returning id into lid;
 if (select expires_on from shop_stock_lots where id=lid)<>p_expires then raise exception 'Questo lotto ha una scadenza diversa';end if;
 insert into shop_lot_movements(workspace_id,lot_id,operation_id,delta,reason) values(w,lid,p_operation,p_quantity,'Associazione merce gia presente');
 update shop_products set stock_revision=stock_revision+1 where id=p.id;
end $$;
create function shop_discard_lot(p_operation uuid,p_lot uuid,p_revision integer,p_quantity numeric,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();l shop_stock_lots;p shop_products;op shop_operations;payload jsonb;begin
 payload=jsonb_build_object('lot',p_lot,'revision',p_revision,'quantity',p_quantity,'reason',p_reason);
 select * into op from shop_operations where workspace_id=w and id=p_operation;
 if found then if op.kind<>'lot-discard' or op.payload<>payload then raise exception 'Operazione differente';end if;return;end if;
 select * into l from shop_stock_lots where id=p_lot and workspace_id=w for update;
 if not found or l.revision is distinct from p_revision then raise exception 'Lotto aggiornato: riaprilo';end if;
 select * into p from shop_products where id=l.product_id;
 if p_quantity is null or p_quantity<=0 or p_quantity>l.quantity or p_quantity<>round(p_quantity,3) or ((l.bucket='retail' or p.unit='piece') and p_quantity<>trunc(p_quantity)) or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Controlla quantita e motivo';end if;
 if l.bucket='retail' and p.retail_qty-p_quantity<p.reserved_qty then raise exception 'Annulla o completa prima gli ordini che riservano queste confezioni';end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'lot-discard',payload);
 update shop_stock_lots set quantity=quantity-p_quantity,revision=revision+1 where id=l.id;
 update shop_products set retail_qty=retail_qty-case when l.bucket='retail' then p_quantity else 0 end,professional_qty=professional_qty-case when l.bucket='professional' then p_quantity else 0 end,stock_revision=stock_revision+1 where id=p.id;
 insert into shop_lot_movements(workspace_id,lot_id,operation_id,delta,reason) values(w,l.id,p_operation,-p_quantity,p_reason);
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p.id,p_operation,l.bucket,-p_quantity,'Scarto lotto '||l.code||': '||p_reason,auth.uid());
end $$;
create function shop_inventory_count(p_operation uuid,p_lines jsonb,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();op shop_operations;payload jsonb;l jsonb;begin
 payload=jsonb_build_object('lines',p_lines,'reason',p_reason);
 select * into op from shop_operations where workspace_id=w and id=p_operation;
 if found then if op.kind<>'inventory-count' or op.payload<>payload then raise exception 'Operazione differente';end if;return;end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Controlla conteggio e causale';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'product_id' having count(*)>1) then raise exception 'Conta entrambe le destinazioni nella stessa riga del prodotto';end if;
 for l in select * from jsonb_array_elements(p_lines) loop
 perform shop_adjust_stock(gen_random_uuid(),(l->>'product_id')::uuid,l->>'bucket','count',(l->>'quantity')::numeric,p_reason,(l->>'stock_revision')::bigint);
 end loop;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'inventory-count',payload);
end $$;
create function shop_consumption_settings(p_enabled boolean,p_revision integer) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);begin
 if p_enabled is null then raise exception 'Impostazione non valida';end if;
 insert into shop_settings(workspace_id) values(w) on conflict do nothing;
 update shop_settings set consumption_enabled=p_enabled,revision=revision+1,updated_at=now() where workspace_id=w and revision=p_revision;
 if not found then raise exception 'Impostazioni aggiornate: ricarica e riprova';end if;
end $$;
create function shop_recipe_save(p_service uuid,p_revision integer,p_lines jsonb) returns void language plpgsql security definer set search_path=public as $$
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
 snapshot=snapshot||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'quantity',q,'unit',p.unit,'pack_size',p.pack_size));
 end loop;
 insert into shop_service_recipes(workspace_id,service_id,lines) values(w,p_service,snapshot) on conflict(service_id) do update set lines=excluded.lines,revision=shop_service_recipes.revision+1,updated_at=now();
end $$;
-- Internal worker uses a saved recipe snapshot, never today's changed recipe.
create function shop_apply_consumption(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare c shop_service_consumptions;p shop_products;l jsonb;snapshot jsonb='[]';q numeric;begin
 select * into c from shop_service_consumptions where id=p_id for update;
 if c.state<>'pending' then return;end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(c.workspace_id,c.id,'service-consumption',jsonb_build_object('appointment',c.appointment_id));
 for l in select * from jsonb_array_elements(c.lines) loop
 select * into p from shop_products where id=(l->>'product_id')::uuid and workspace_id=c.workspace_id for update;
 q=(l->>'quantity')::numeric;
 if not found or p.archived or p.purpose='retail' or p.unit<>l->>'unit' or p.pack_size<>(l->>'pack_size')::numeric then raise exception 'Prodotto modificato o archiviato: %',l->>'name';end if;
 if p.professional_qty<q then raise exception 'Scorta insufficiente: % (servono % %)',p.name,q,p.unit;end if;
 update shop_products set professional_qty=professional_qty-q,stock_revision=stock_revision+1 where id=p.id;
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(c.workspace_id,p.id,c.id,'professional',-q,'Consumo servizio: '||c.service_name,c.actor_id);
 snapshot=snapshot||jsonb_build_array(l||jsonb_build_object('cost_cents',round(q*p.cost_cents/p.pack_size)));
 end loop;
 update shop_service_consumptions set state='applied',issue='',lines=snapshot,applied_at=now(),revision=revision+1 where id=c.id;
end $$;
create function shop_on_service_completed() returns trigger language plpgsql security definer set search_path=public as $$
declare r shop_service_recipes;cid uuid;owner_id uuid;service_key uuid=new.service_id;begin
 if not new.completed or new.no_show then return new;end if;
 if tg_op='UPDATE' and old.completed then return new;end if;
 if not coalesce((select enabled and consumption_enabled from shop_settings where workspace_id=new.workspace_id),false) then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('shop:'||new.workspace_id::text,0));
 if service_key is null then select id into service_key from services where workspace_id=new.workspace_id and name=new.service_name;end if;
 select * into r from shop_service_recipes where service_id=service_key and workspace_id=new.workspace_id;
 if not found or jsonb_array_length(r.lines)=0 then return new;end if;
 select user_id into owner_id from workspace_members where workspace_id=new.workspace_id and role='owner' order by user_id limit 1;
 insert into shop_service_consumptions(workspace_id,appointment_id,service_name,appointment_date,lines,actor_id) values(new.workspace_id,new.id,new.service_name,new.appointment_date,r.lines,coalesce(auth.uid(),owner_id)) on conflict(workspace_id,appointment_id) do nothing returning id into cid;
 if cid is null then return new;end if;
 begin perform shop_apply_consumption(cid);
 exception when others then update shop_service_consumptions set issue=left(sqlerrm,500) where id=cid;end;
 return new;
end $$;
create trigger shop_service_completed after insert or update of completed,no_show on appointments for each row execute function shop_on_service_completed();
create function shop_resolve_consumption(p_id uuid,p_revision integer,p_action text,p_reason text default '') returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);c shop_service_consumptions;begin
 select * into c from shop_service_consumptions where workspace_id=w and id=p_id for update;
 if not found or c.state<>'pending' or c.revision is distinct from p_revision then raise exception 'Consumo gia gestito o aggiornato';end if;
 if p_action='retry' then
 if not exists(select 1 from appointments where id=c.appointment_id and workspace_id=w and completed and not no_show) then raise exception 'Appuntamento riaperto o rimosso: verifica e archivia il consumo';end if;
 perform shop_apply_consumption(c.id);
 elsif p_action='dismiss' and length(trim(coalesce(p_reason,''))) between 3 and 500 then update shop_service_consumptions set state='dismissed',resolution=p_reason,revision=revision+1 where id=c.id;
 else raise exception 'Indica azione e motivazione';end if;
end $$;
create function shop_control_console(p_search text default '',p_page integer default 0,p_days integer default 30,p_history boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);since timestamptz;result jsonb;begin
 if p_search is null or length(p_search)>120 or p_page is null or p_page<0 or p_page>100000 or p_days not in (7,30,90) or p_days is null or p_history is null then raise exception 'Filtro non valido';end if;
 since=(((now() at time zone 'Europe/Rome')::date-(p_days-1))::timestamp at time zone 'Europe/Rome');
 with sales as (
 select s.id,s.total_cents+coalesce(o.gift_cents,0)-coalesce((select sum(r.amount_cents+r.gift_refund_cents) from shop_returns r where r.sale_id=s.id),0) revenue,
 coalesce((select sum((l.quantity-coalesce((select sum(r.quantity) from shop_returns r where r.sale_id=s.id and r.product_id=l.product_id and r.restock),0))*l.unit_cost_cents) from shop_sale_lines l where l.sale_id=s.id),0) cost
 from shop_sales s left join shop_orders o on o.sale_id=s.id where s.workspace_id=w and s.created_at>=since
 ) select jsonb_build_object('revenue_cents',coalesce(sum(revenue),0),'cost_cents',coalesce(sum(cost),0),'margin_cents',coalesce(sum(revenue-cost),0),'sales',count(*)) into result from sales;
 return jsonb_build_object(
 'settings',coalesce((select jsonb_build_object('enabled',enabled,'consumption_enabled',consumption_enabled,'revision',revision) from shop_settings where workspace_id=w),'{"enabled":false,"consumption_enabled":false,"revision":1}'),
 'products',coalesce((select jsonb_agg(to_jsonb(x) order by name,id) from(select p.*,(select coalesce(sum(quantity),0) from shop_stock_lots where product_id=p.id and bucket='retail') retail_assigned,(select coalesce(sum(quantity),0) from shop_stock_lots where product_id=p.id and bucket='professional') professional_assigned from shop_products p where workspace_id=w and not archived and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||sku||' '||coalesce(barcode,'')))>0) order by name,id limit 20 offset p_page*20)x),'[]'),
 'product_count',(select count(*) from shop_products where workspace_id=w and not archived and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||sku||' '||coalesce(barcode,'')))>0)),
 'lots',coalesce((select jsonb_agg(to_jsonb(x) order by expires_on,id) from(select l.*,p.name,p.unit from shop_stock_lots l join shop_products p on p.id=l.product_id where l.workspace_id=w and (p_history or l.quantity>0) and (p_search='' or position(lower(p_search) in lower(p.name||' '||p.sku||' '||l.code||' '||coalesce(p.barcode,'')))>0) order by l.expires_on,l.id limit 20 offset p_page*20)x),'[]'),
 'lot_count',(select count(*) from shop_stock_lots l join shop_products p on p.id=l.product_id where l.workspace_id=w and (p_history or l.quantity>0) and (p_search='' or position(lower(p_search) in lower(p.name||' '||p.sku||' '||l.code||' '||coalesce(p.barcode,'')))>0)),
 'expiring',(select count(*) from shop_stock_lots where workspace_id=w and quantity>0 and expires_on<=(now() at time zone 'Europe/Rome')::date+30),
 'pending',(select count(*) from shop_service_consumptions where workspace_id=w and state='pending'),
 'consumptions',coalesce((select jsonb_agg(to_jsonb(x) order by created_at desc,id) from(select * from shop_service_consumptions where workspace_id=w and (p_history or state='pending') and (p_search='' or position(lower(p_search) in lower(service_name))>0) order by created_at desc,id limit 20 offset p_page*20)x),'[]'),
 'consumption_count',(select count(*) from shop_service_consumptions where workspace_id=w and (p_history or state='pending') and (p_search='' or position(lower(p_search) in lower(service_name))>0)),
 'services',coalesce((select jsonb_agg(to_jsonb(x) order by name,id) from(select s.id,s.name,coalesce(r.revision,0) revision,coalesce(r.lines,'[]') lines from services s left join shop_service_recipes r on r.service_id=s.id where s.workspace_id=w and (p_search='' or position(lower(p_search) in lower(s.name))>0) order by s.name,s.id limit 20 offset p_page*20)x),'[]'),
 'service_count',(select count(*) from services where workspace_id=w and (p_search='' or position(lower(p_search) in lower(name))>0)),
 'report',result||jsonb_build_object('days',p_days,'consumption_cents',(select coalesce(sum((x->>'cost_cents')::numeric),0) from shop_service_consumptions c cross join lateral jsonb_array_elements(c.lines)x where workspace_id=w and state='applied' and applied_at>=since),
 'retail_value_cents',(select coalesce(sum(retail_qty*cost_cents),0) from shop_products where workspace_id=w),
 'professional_value_cents',(select coalesce(sum(round(professional_qty*cost_cents/pack_size)),0) from shop_products where workspace_id=w),
 'top',coalesce((select jsonb_agg(to_jsonb(x) order by quantity desc,name) from(select l.product_id,max(l.name) name,sum(l.quantity-coalesce((select sum(quantity) from shop_returns r where r.sale_id=l.sale_id and r.product_id=l.product_id),0)) quantity from shop_sale_lines l join shop_sales s on s.id=l.sale_id where s.workspace_id=w and s.created_at>=since group by l.product_id order by quantity desc,name limit 10)x),'[]')));
end $$;
-- Keep existing public responses and reorder maths consistent with blocked expiry stock.

-- Preserve access to issued orders when the storefront is switched off.
create or replace function public_shop_catalog(p_salon_code text,p_search text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid;s shop_settings;begin
 select id into w from workspaces where slug=lower(trim(p_salon_code)) and (is_internal_tester or subscription_status in ('demo','active'));
 select * into s from shop_settings where workspace_id=w;
 if w is null or not coalesce(s.enabled and s.storefront_enabled,false) then return jsonb_build_object('visible',false,'products','[]'::jsonb,'count',0,'orders_supported',exists(select 1 from shop_orders where workspace_id=w));end if;
 if p_page<0 or p_page>100000 or length(p_search)>120 then raise exception 'Ricerca non valida';end if;
 return jsonb_build_object('visible',true,'pickup_enabled',s.pickup_enabled,'hold_hours',s.hold_hours,'gift_enabled',s.gift_enabled,'rewards_enabled',s.rewards_enabled,'count',(select count(*) from shop_products where workspace_id=w and published and not archived and purpose<>'professional' and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||category||' '||variant))>0)),
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from (select id,name,brand,category,variant,image_url,price_cents,greatest(0,retail_qty-reserved_qty-shop_expired_quantity(id,'retail')) available,revision from shop_products where workspace_id=w and published and not archived and purpose<>'professional' and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||category||' '||variant))>0) order by name,id limit 24 offset p_page*24) p),'[]'));
end $$;


create or replace function public_shop_cart(p_salon_code text,p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid;begin
 if coalesce(cardinality(p_ids),0) not between 1 and 40 then raise exception 'Carrello non valido';end if;
 select w1.id into w from workspaces w1 join shop_settings s on s.workspace_id=w1.id where w1.slug=lower(trim(p_salon_code)) and (w1.is_internal_tester or w1.subscription_status in ('demo','active')) and s.enabled and s.storefront_enabled;
 return coalesce((select jsonb_agg(to_jsonb(p)) from (select id,name,brand,category,variant,image_url,price_cents,greatest(0,retail_qty-reserved_qty-shop_expired_quantity(id,'retail')) available,revision from shop_products where workspace_id=w and id=any(p_ids) and published and not archived and purpose<>'professional') p),'[]');
end $$;

create or replace function shop_reorder_suggestions(p_search text default '',p_page integer default 0,p_only_low boolean default true) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);result jsonb;begin
 if p_page is null or p_page<0 or p_page>100000 or p_search is null or length(p_search)>120 or p_only_low is null then raise exception 'Filtro non valido';end if;
 with buckets as (
 select p.*,b.bucket,coalesce(r.revision,0) rule_revision,r.supplier_id,s.name supplier_name,coalesce(s.archived,false) supplier_archived,
 coalesce(r.retail_target,p.minimum_retail+1) retail_target,coalesce(r.professional_target,p.minimum_professional+p.pack_size) professional_target,
 greatest(0,case when b.bucket='retail' then p.retail_qty-p.reserved_qty else p.professional_qty end-shop_expired_quantity(p.id,b.bucket)) available,
 case when b.bucket='retail' then p.minimum_retail else p.minimum_professional end minimum,
 case when b.bucket='retail' then greatest(coalesce(r.retail_target,p.minimum_retail+1),p.minimum_retail+1) else greatest(coalesce(r.professional_target,p.minimum_professional+p.pack_size),p.minimum_professional+p.pack_size) end target,
 case when b.bucket='retail' then 1 else p.pack_size end factor,
 coalesce((select sum((l.quantity-l.received)*case when b.bucket='retail' then 1 else l.pack_size end) from shop_purchase_lines l join shop_purchase_orders o on o.id=l.order_id where l.product_id=p.id and l.bucket=b.bucket and o.status in ('ordered','partial')),0) incoming
 from shop_products p cross join (values('retail'),('professional')) b(bucket) left join shop_reorder_rules r on r.product_id=p.id left join shop_suppliers s on s.id=r.supplier_id
 where p.workspace_id=w and not p.archived and not (p.purpose='retail' and b.bucket='professional') and not (p.purpose='professional' and b.bucket='retail') and (p_search='' or position(lower(p_search) in lower(p.name||' '||p.sku||' '||p.brand))>0)
 ), needs as (select *,case when available+incoming<=minimum then greatest(ceil((target-available-incoming)/factor),0)::integer else 0 end suggested_packs from buckets),filtered as(select * from needs where not p_only_low or suggested_packs>0)
 select jsonb_build_object('count',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(x) order by suggested_packs desc,name,id,bucket) from (select * from filtered order by suggested_packs desc,name,id,bucket limit 30 offset p_page*30) x),'[]')) into result;
 return result;
end $$;
do $$ declare f record;begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('shop_expired_quantity','shop_lot_reservation_guard','shop_allocate_lots','shop_register_lot','shop_discard_lot','shop_inventory_count','shop_consumption_settings','shop_recipe_save','shop_apply_consumption','shop_on_service_completed','shop_resolve_consumption','shop_control_console') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('shop_register_lot','shop_discard_lot','shop_inventory_count','shop_consumption_settings','shop_recipe_save','shop_resolve_consumption','shop_control_console') then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;

create function shop_control_alerts() returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);begin
 return jsonb_build_object('pending',(select count(*) from shop_service_consumptions where workspace_id=w and state='pending'),'expiring',(select count(*) from shop_stock_lots where workspace_id=w and quantity>0 and expires_on<=(now() at time zone 'Europe/Rome')::date+30));
end $$;
revoke all on function shop_control_alerts() from public,anon;
grant execute on function shop_control_alerts() to authenticated;
