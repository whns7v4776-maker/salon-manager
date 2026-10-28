-- Supplier orders are commitments, not cash movements. Stock changes only on receipt.
create table shop_suppliers(
 id uuid primary key,workspace_id uuid not null references workspaces(id),name text not null check(length(trim(name)) between 1 and 120),
 email text not null default '' check(length(email)<=254),phone text not null default '' check(length(phone)<=60),notes text not null default '' check(length(notes)<=2000),
 lead_days integer not null default 0 check(lead_days between 0 and 365),archived boolean not null default false,revision integer not null default 1,unique(workspace_id,id)
);
create table shop_reorder_rules(
 product_id uuid primary key,workspace_id uuid not null,supplier_id uuid,retail_target integer not null check(retail_target between 0 and 1000000),professional_target numeric(14,3) not null check(professional_target between 0 and 1000000000),revision integer not null default 1,
 foreign key(workspace_id,product_id) references shop_products(workspace_id,id),foreign key(workspace_id,supplier_id) references shop_suppliers(workspace_id,id)
);
create table shop_purchase_orders(
 id uuid primary key,workspace_id uuid not null references workspaces(id),supplier_id uuid not null,supplier_name text not null,supplier_email text not null,
 status text not null default 'draft' check(status in ('draft','ordered','partial','received','closed','cancelled')),expected_on date,notes text not null default '' check(length(notes)<=2000),
 revision integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),created_by uuid not null,
 foreign key(workspace_id,supplier_id) references shop_suppliers(workspace_id,id),unique(workspace_id,id)
);
create table shop_purchase_lines(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,order_id uuid not null,product_id uuid not null,name text not null,sku text not null,
 bucket text not null check(bucket in ('retail','professional')),unit text not null,pack_size numeric(14,3) not null check(pack_size>0),
 quantity integer not null check(quantity between 1 and 1000000),received integer not null default 0 check(received>=0 and received<=quantity),unit_cost_cents bigint not null check(unit_cost_cents between 0 and 100000000),
 foreign key(workspace_id,order_id) references shop_purchase_orders(workspace_id,id),foreign key(workspace_id,product_id) references shop_products(workspace_id,id),unique(order_id,product_id,bucket),unique(workspace_id,id)
);
create table shop_purchase_receipts(
 id uuid primary key,workspace_id uuid not null,order_id uuid not null,reference text not null check(length(trim(reference)) between 1 and 200),created_at timestamptz not null default now(),created_by uuid not null,
 foreign key(workspace_id,order_id) references shop_purchase_orders(workspace_id,id),unique(workspace_id,id)
);
create table shop_purchase_receipt_lines(
 workspace_id uuid not null,receipt_id uuid not null,line_id uuid not null,quantity integer not null check(quantity>0),
 primary key(receipt_id,line_id),foreign key(workspace_id,receipt_id) references shop_purchase_receipts(workspace_id,id),foreign key(workspace_id,line_id) references shop_purchase_lines(workspace_id,id)
);
create index shop_purchase_open on shop_purchase_orders(workspace_id,status,created_at);
create index shop_purchase_product on shop_purchase_lines(product_id,bucket);
do $$ declare t text;begin
 foreach t in array array['shop_suppliers','shop_reorder_rules','shop_purchase_orders','shop_purchase_lines','shop_purchase_receipts','shop_purchase_receipt_lines'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);execute format('grant select on %I to authenticated',t);execute format('grant all on %I to service_role',t);
 execute format('create policy owner_read on %I for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed() and exists(select 1 from workspace_members m where m.workspace_id=current_workspace_id() and m.user_id=auth.uid() and m.role=''owner''))',t);
 execute format('create trigger shop_changed after insert or update on %I for each row execute function shop_bump_revision()',t);
 end loop;
end $$;

create function shop_supplier_save(p_id uuid,p_revision integer,p_data jsonb) returns shop_suppliers language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();s shop_suppliers;begin
 if p_id is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Scheda fornitore non valida';end if;
 if exists(select 1 from shop_suppliers where id=p_id and workspace_id<>w) then raise exception 'Fornitore non valido';end if;
 select * into s from shop_suppliers where id=p_id and workspace_id=w for update;
 if found then
 if p_revision=0 and s.name=trim(p_data->>'name') and s.email=coalesce(trim(p_data->>'email'),'') and s.phone=coalesce(trim(p_data->>'phone'),'') and s.notes=coalesce(p_data->>'notes','') and s.lead_days=coalesce((p_data->>'lead_days')::integer,0) and s.archived=coalesce((p_data->>'archived')::boolean,false) then return s;end if;
 if s.revision is distinct from p_revision then raise exception 'Fornitore modificato: ricarica la scheda';end if;
 elsif p_revision is distinct from 0 then raise exception 'Fornitore non trovato';end if;
 insert into shop_suppliers(id,workspace_id,name,email,phone,notes,lead_days,archived) values(p_id,w,trim(p_data->>'name'),coalesce(trim(p_data->>'email'),''),coalesce(trim(p_data->>'phone'),''),coalesce(p_data->>'notes',''),coalesce((p_data->>'lead_days')::integer,0),coalesce((p_data->>'archived')::boolean,false))
 on conflict(id) do update set name=excluded.name,email=excluded.email,phone=excluded.phone,notes=excluded.notes,lead_days=excluded.lead_days,archived=excluded.archived,revision=shop_suppliers.revision+1 returning * into s;
 return s;
end $$;
create function shop_reorder_save(p_product uuid,p_revision integer,p_supplier uuid,p_retail integer,p_professional numeric) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();r shop_reorder_rules;p shop_products;begin
 select * into p from shop_products where id=p_product and workspace_id=w;
 if not found or p.archived then raise exception 'Prodotto non disponibile';end if;
 if p_supplier is not null and not exists(select 1 from shop_suppliers where id=p_supplier and workspace_id=w and not archived) then raise exception 'Fornitore non disponibile';end if;
 if p_retail is null or p_professional is null or p_retail<p.minimum_retail or p_professional<p.minimum_professional or p_professional<>round(p_professional,3) or (p.unit='piece' and p_professional<>trunc(p_professional)) then raise exception 'La scorta obiettivo deve coprire la soglia minima e rispettare l’unita del prodotto';end if;
 select * into r from shop_reorder_rules where product_id=p_product;
 if (found and r.revision is distinct from p_revision) or (not found and p_revision is distinct from 0) then raise exception 'Regola modificata: ricarica';end if;
 insert into shop_reorder_rules(product_id,workspace_id,supplier_id,retail_target,professional_target) values(p_product,w,p_supplier,p_retail,p_professional)
 on conflict(product_id) do update set supplier_id=excluded.supplier_id,retail_target=excluded.retail_target,professional_target=excluded.professional_target,revision=shop_reorder_rules.revision+1;
end $$;
create function shop_purchase_document(p_order uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);o shop_purchase_orders;begin
 select * into o from shop_purchase_orders where id=p_order and workspace_id=w;if not found then raise exception 'Ordine non trovato';end if;
 return to_jsonb(o)||jsonb_build_object('lines',coalesce((select jsonb_agg(to_jsonb(l) order by l.name,l.bucket) from shop_purchase_lines l where order_id=o.id),'[]'),
 'receipts',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('lines',(select jsonb_agg(jsonb_build_object('name',l.name,'bucket',l.bucket,'quantity',rl.quantity,'unit',l.unit,'pack_size',l.pack_size)) from shop_purchase_receipt_lines rl join shop_purchase_lines l on l.id=rl.line_id where receipt_id=r.id)) order by created_at desc,id) from shop_purchase_receipts r where order_id=o.id),'[]'));
end $$;
-- Operation IDs cover drafts and retries. Ordered lines are immutable snapshots.
create function shop_purchase_save(p_operation uuid,p_id uuid,p_revision integer,p_supplier uuid,p_expected date,p_notes text,p_lines jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();o shop_purchase_orders;s shop_suppliers;p shop_products;item jsonb;q integer;cost bigint;op shop_operations;payload jsonb;begin
 payload=jsonb_build_object('id',p_id,'revision',p_revision,'supplier',p_supplier,'expected',p_expected,'notes',p_notes,'lines',p_lines);
 select * into op from shop_operations where workspace_id=w and id=p_operation;
 if found then if op.kind<>'purchase-save' or op.payload is distinct from payload then raise exception 'Operazione gia utilizzata con altri dati';end if;return shop_purchase_document(p_id);end if;
 if p_id is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 or p_notes is null or length(p_notes)>2000 then raise exception 'Controlla ordine e prodotti';end if;
 select * into s from shop_suppliers where id=p_supplier and workspace_id=w and not archived;if not found then raise exception 'Seleziona un fornitore attivo';end if;
 if exists(select 1 from shop_purchase_orders where id=p_id and workspace_id<>w) then raise exception 'Ordine non valido';end if;
 select * into o from shop_purchase_orders where id=p_id and workspace_id=w for update;
 if found then if o.status<>'draft' or o.revision is distinct from p_revision then raise exception 'Ordine gia confermato o modificato: ricarica';end if;
 elsif p_revision is distinct from 0 then raise exception 'Ordine non trovato';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'product_id',x->>'bucket' having count(*)>1) then raise exception 'Prodotto e destinazione duplicati';end if;
 for item in select * from jsonb_array_elements(p_lines) loop
 select * into p from shop_products where id=(item->>'product_id')::uuid and workspace_id=w;
 q=(item->>'quantity')::integer;cost=(item->>'unit_cost_cents')::bigint;
 if not found or p.archived or p.revision is distinct from (item->>'product_revision')::integer then raise exception 'Prodotto cambiato: aggiorna le righe prima di salvare';end if;
 if item->>'bucket' is null or item->>'bucket' not in ('retail','professional') or (item->>'bucket'='retail' and p.purpose='professional') or (item->>'bucket'='professional' and p.purpose='retail') then raise exception 'Destinazione non valida';end if;
 if q is null or q not between 1 and 1000000 or q::numeric<>(item->>'quantity')::numeric or cost is null or cost not between 0 and 100000000 or cost::numeric<>(item->>'unit_cost_cents')::numeric then raise exception 'Quantita o costo non valido';end if;
 end loop;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'purchase-save',payload);
 insert into shop_purchase_orders(id,workspace_id,supplier_id,supplier_name,supplier_email,expected_on,notes,created_by) values(p_id,w,s.id,s.name,s.email,p_expected,p_notes,auth.uid())
 on conflict(id) do update set supplier_id=excluded.supplier_id,supplier_name=excluded.supplier_name,supplier_email=excluded.supplier_email,expected_on=excluded.expected_on,notes=excluded.notes,revision=shop_purchase_orders.revision+1,updated_at=now();
 delete from shop_purchase_lines where order_id=p_id;
 for item in select * from jsonb_array_elements(p_lines) loop
 select * into p from shop_products where id=(item->>'product_id')::uuid and workspace_id=w;
 insert into shop_purchase_lines(workspace_id,order_id,product_id,name,sku,bucket,unit,pack_size,quantity,unit_cost_cents) values(w,p_id,p.id,p.name||case when p.variant<>'' then ' · '||p.variant else '' end,p.sku,item->>'bucket',p.unit,p.pack_size,(item->>'quantity')::integer,(item->>'unit_cost_cents')::bigint);
 end loop;return shop_purchase_document(p_id);
end $$;
create function shop_purchase_transition(p_order uuid,p_revision integer,p_status text) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);o shop_purchase_orders;begin
 select * into o from shop_purchase_orders where id=p_order and workspace_id=w for update;if not found then raise exception 'Ordine non trovato';end if;
 if p_status=o.status then return shop_purchase_document(o.id);end if;
 if o.revision is distinct from p_revision then raise exception 'Ordine modificato: ricarica';end if;
 if p_status='ordered' and o.status='draft' then
 perform shop_workspace();
 if not exists(select 1 from shop_suppliers where id=o.supplier_id and not archived) then raise exception 'Fornitore archiviato: modifica la bozza';end if;
 if exists(select 1 from shop_purchase_lines l join shop_products p on p.id=l.product_id where l.order_id=o.id and (p.archived or p.unit<>l.unit or p.pack_size<>l.pack_size or (l.bucket='retail' and p.purpose='professional') or (l.bucket='professional' and p.purpose='retail'))) then raise exception 'Prodotti modificati: aggiorna la bozza';end if;
 elsif p_status='cancelled' and o.status in ('draft','ordered') then null;
 elsif p_status='closed' and o.status='partial' then null;
 else raise exception 'Passaggio di stato non consentito';end if;
 update shop_purchase_orders set status=p_status,revision=revision+1,updated_at=now() where id=o.id;return shop_purchase_document(o.id);
end $$;
create function shop_purchase_receive(p_operation uuid,p_order uuid,p_revision integer,p_reference text,p_lines jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);o shop_purchase_orders;l shop_purchase_lines;p shop_products;item jsonb;q integer;delta numeric;op shop_operations;payload jsonb;begin
 payload=jsonb_build_object('order',p_order,'revision',p_revision,'reference',p_reference,'lines',p_lines);
 select * into op from shop_operations where workspace_id=w and id=p_operation;
 if found then if op.kind<>'purchase-receipt' or op.payload is distinct from payload then raise exception 'Ricezione gia utilizzata con altri dati';end if;return shop_purchase_document(p_order);end if;
 select * into o from shop_purchase_orders where id=p_order and workspace_id=w for update;
 if not found or o.status not in ('ordered','partial') or o.revision is distinct from p_revision then raise exception 'Ordine aggiornato o non ricevibile: ricarica';end if;
 if p_reference is null or length(trim(p_reference)) not between 1 and 200 or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Indica riferimento consegna e quantita ricevute';end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'line_id' having count(*)>1) then raise exception 'Riga duplicata';end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'purchase-receipt',payload);
 insert into shop_purchase_receipts(id,workspace_id,order_id,reference,created_by) values(p_operation,w,o.id,trim(p_reference),auth.uid());
 for item in select * from jsonb_array_elements(p_lines) loop
 select * into l from shop_purchase_lines where id=(item->>'line_id')::uuid and order_id=o.id;
 q=(item->>'quantity')::integer;
 if not found or q is null or q<=0 or q::numeric<>(item->>'quantity')::numeric or q>l.quantity-l.received then raise exception 'Quantita eccedente, gia ricevuta o riga non valida';end if;
 select * into p from shop_products where id=l.product_id and workspace_id=w for update;
 if p.archived or p.unit<>l.unit or p.pack_size<>l.pack_size or (l.bucket='retail' and p.purpose='professional') or (l.bucket='professional' and p.purpose='retail') then raise exception 'Prodotto non compatibile: ripristina formato e destinazione prima del carico';end if;
 delta=q*case when l.bucket='retail' then 1 else l.pack_size end;
 update shop_products set retail_qty=retail_qty+case when l.bucket='retail' then q else 0 end,professional_qty=professional_qty+case when l.bucket='professional' then delta else 0 end,stock_revision=stock_revision+1 where id=p.id;
 update shop_purchase_lines set received=received+q where id=l.id;
 insert into shop_purchase_receipt_lines(workspace_id,receipt_id,line_id,quantity) values(w,p_operation,l.id,q);
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p.id,p_operation,l.bucket,delta,'Ricezione fornitore · '||upper(substr(o.id::text,1,8))||' · '||trim(p_reference),auth.uid());
 end loop;
 update shop_purchase_orders set status=case when exists(select 1 from shop_purchase_lines where order_id=o.id and received<quantity) then 'partial' else 'received' end,revision=revision+1,updated_at=now() where id=o.id;
 return shop_purchase_document(o.id);
end $$;

create function shop_supply_console(p_search text default '',p_page integer default 0,p_status text default 'open') returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);begin
 if p_page is null or p_page<0 or p_page>100000 or p_search is null or length(p_search)>120 or p_status is null or p_status not in ('open','all') then raise exception 'Filtro non valido';end if;
 return jsonb_build_object(
 'suppliers',coalesce((select jsonb_agg(to_jsonb(s) order by archived,name,id) from (select * from shop_suppliers where workspace_id=w and (p_search='' or position(lower(p_search) in lower(name||' '||email||' '||phone))>0) order by archived,name,id limit 30 offset p_page*30) s),'[]'),
 'supplier_count',(select count(*) from shop_suppliers where workspace_id=w and (p_search='' or position(lower(p_search) in lower(name||' '||email||' '||phone))>0)),
 'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('total_cents',(select sum(quantity*unit_cost_cents) from shop_purchase_lines where order_id=o.id),'received_packs',(select sum(received) from shop_purchase_lines where order_id=o.id),'ordered_packs',(select sum(quantity) from shop_purchase_lines where order_id=o.id)) order by created_at desc,id) from (select * from shop_purchase_orders where workspace_id=w and (p_status='all' or status in ('draft','ordered','partial')) and (p_search='' or position(lower(p_search) in lower(supplier_name||' '||id::text))>0) order by created_at desc,id limit 30 offset p_page*30) o),'[]'),
 'order_count',(select count(*) from shop_purchase_orders where workspace_id=w and (p_status='all' or status in ('draft','ordered','partial')) and (p_search='' or position(lower(p_search) in lower(supplier_name||' '||id::text))>0)),
 'overdue',(select count(*) from shop_purchase_orders where workspace_id=w and status in ('ordered','partial') and expected_on<(now() at time zone 'Europe/Rome')::date));
end $$;
create function shop_reorder_suggestions(p_search text default '',p_page integer default 0,p_only_low boolean default true) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);result jsonb;begin
 if p_page is null or p_page<0 or p_page>100000 or p_search is null or length(p_search)>120 or p_only_low is null then raise exception 'Filtro non valido';end if;
 with buckets as (
 select p.*,b.bucket,coalesce(r.revision,0) rule_revision,r.supplier_id,s.name supplier_name,coalesce(s.archived,false) supplier_archived,
 coalesce(r.retail_target,p.minimum_retail+1) retail_target,coalesce(r.professional_target,p.minimum_professional+p.pack_size) professional_target,
 case when b.bucket='retail' then p.retail_qty-p.reserved_qty else p.professional_qty end available,
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
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('shop_supplier_save','shop_reorder_save','shop_purchase_document','shop_purchase_save','shop_purchase_transition','shop_purchase_receive','shop_supply_console','shop_reorder_suggestions') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
