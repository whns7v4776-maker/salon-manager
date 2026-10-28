-- Stock and retail are owner-only. No public shop or online charging is enabled.
create table public.shop_settings (
 workspace_id uuid primary key references workspaces(id), enabled boolean not null default false,
 revision integer not null default 1, updated_at timestamptz not null default now()
);
create table public.shop_products (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),
 name text not null check(length(trim(name)) between 1 and 120),brand text not null default '',category text not null default '',variant text not null default '',
 sku text not null,barcode text,image_url text not null default '',supplier text not null default '',
 purpose text not null check(purpose in ('retail','professional','both')),
 unit text not null check(unit in ('piece','ml','g')),pack_size numeric(14,3) not null default 1 check(pack_size>0 and pack_size<=1000000),
 price_cents bigint not null check(price_cents between 0 and 100000000),cost_cents bigint not null check(cost_cents between 0 and 100000000),
 minimum_retail integer not null default 0 check(minimum_retail>=0),minimum_professional numeric(14,3) not null default 0 check(minimum_professional>=0),
 retail_qty integer not null default 0 check(retail_qty>=0),professional_qty numeric(14,3) not null default 0 check(professional_qty>=0),
 archived boolean not null default false,revision integer not null default 1,stock_revision bigint not null default 1,
 created_at timestamptz not null default now(),unique(workspace_id,sku),unique(workspace_id,barcode),unique(workspace_id,id)
);
create table public.shop_operations (
 workspace_id uuid not null references workspaces(id),id uuid not null,kind text not null,payload jsonb not null,
 created_at timestamptz not null default now(),primary key(workspace_id,id)
);
create table public.shop_stock_movements (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references workspaces(id),product_id uuid not null,
 operation_id uuid not null,bucket text not null check(bucket in ('retail','professional')),delta numeric(14,3) not null,
 reason text not null,actor_id uuid not null,created_at timestamptz not null default now(),
 foreign key(workspace_id,product_id) references shop_products(workspace_id,id),
 foreign key(workspace_id,operation_id) references shop_operations(workspace_id,id)
);
create table public.shop_sales (
 id uuid primary key,workspace_id uuid not null references workspaces(id),customer_id uuid references customers(id),
 customer_name text not null default '',total_cents bigint not null check(total_cents>=0),
 payment_method public.payment_method not null,cash_movement_id uuid unique references cash_movements(id),
 created_by uuid not null,created_at timestamptz not null default now(),unique(workspace_id,id)
);
create table public.shop_sale_lines (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,sale_id uuid not null,product_id uuid not null,
 name text not null,sku text not null,quantity integer not null check(quantity>0),
 unit_price_cents bigint not null,unit_cost_cents bigint not null,
 foreign key(workspace_id,sale_id) references shop_sales(workspace_id,id),
 foreign key(workspace_id,product_id) references shop_products(workspace_id,id),unique(sale_id,product_id)
);
create table public.shop_returns (
 id uuid primary key,workspace_id uuid not null,sale_id uuid not null,product_id uuid not null,
 quantity integer not null check(quantity>0),amount_cents bigint not null check(amount_cents>=0),restock boolean not null,
 reason text not null check(length(trim(reason)) between 3 and 500),created_by uuid not null,created_at timestamptz not null default now(),
 foreign key(workspace_id,sale_id) references shop_sales(workspace_id,id),foreign key(workspace_id,product_id) references shop_products(workspace_id,id)
);
-- Refunds are dated cash outflows: never rewrite the day of the original receipt.
alter table public.cash_movements add column shop_return_id uuid unique references public.shop_returns(id);
alter table public.cash_movements drop constraint cash_movements_amount_check;
alter table public.cash_movements add constraint cash_movements_amount_check check(amount>=0 or shop_return_id is not null);
create table public.shop_sync_revisions(workspace_id uuid primary key references workspaces(id),revision bigint not null default 1);

-- Only authenticated workspace owners read. Writes go through transactional RPCs.
do $$ declare t text;begin
 foreach t in array array['shop_settings','shop_products','shop_operations','shop_stock_movements','shop_sales','shop_sale_lines','shop_returns','shop_sync_revisions'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 execute format('create policy owner_read on public.%I for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed())',t);
 end loop;
end $$;
create function public.shop_workspace(p_require_enabled boolean default true) returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id();begin
 if w is null or not workspace_access_allowed() or not exists(select 1 from workspace_members where workspace_id=w and user_id=auth.uid() and role='owner') then raise exception 'Accesso non consentito';end if;
 -- All mutations serialize per workspace, including retries and refunds.
 perform pg_advisory_xact_lock(hashtextextended('shop:'||w::text,0));
 if p_require_enabled and not coalesce((select enabled from shop_settings where workspace_id=w),false) then raise exception 'Attiva Shop e magazzino prima di procedere';end if;
 return w;
end $$;
create function public.shop_bump_revision() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into shop_sync_revisions(workspace_id) values(new.workspace_id) on conflict(workspace_id) do update set revision=shop_sync_revisions.revision+1;
 return new;
end $$;
do $$ declare t text;begin
 foreach t in array array['shop_settings','shop_products','shop_sales','shop_returns'] loop
 execute format('create trigger shop_changed after insert or update on public.%I for each row execute function shop_bump_revision()',t);
 end loop;
end $$;
alter publication supabase_realtime add table public.shop_sync_revisions;

create function public.shop_set_enabled(p_enabled boolean,p_revision integer) returns shop_settings language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);s shop_settings;begin
 insert into shop_settings(workspace_id) values(w) on conflict do nothing;
 update shop_settings set enabled=p_enabled,revision=revision+1,updated_at=now() where workspace_id=w and revision=p_revision returning * into s;
 if not found then raise exception 'Impostazioni modificate su un altro dispositivo. Aggiorna e riprova';end if;return s;
end $$;
create function public.shop_save_product(p_id uuid,p_revision integer,p_data jsonb) returns shop_products language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();p shop_products;item_id uuid=coalesce(p_id,gen_random_uuid());begin
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Scheda prodotto non valida';end if;
 if p_id is not null then
 select * into p from shop_products where workspace_id=w and id=p_id for update;
 if not found or p.revision is distinct from p_revision then raise exception 'Prodotto modificato: riapri la scheda prima di salvare';end if;
 if (p.retail_qty>0 and p_data->>'purpose'='professional') or (p.professional_qty>0 and p_data->>'purpose'='retail') then raise exception 'Sposta o rettifica le scorte prima di cambiare destinazione';end if;
 if (p.unit<>p_data->>'unit' or p.pack_size<>(p_data->>'pack_size')::numeric) and (p.retail_qty<>0 or p.professional_qty<>0 or exists(select 1 from shop_stock_movements where product_id=p.id)) then raise exception 'Unita e formato non modificabili dopo movimenti: crea una nuova variante';end if;
 end if;
 insert into shop_products(id,workspace_id,name,brand,category,variant,sku,barcode,image_url,supplier,purpose,unit,pack_size,price_cents,cost_cents,minimum_retail,minimum_professional,archived)
 values(item_id,w,trim(p_data->>'name'),coalesce(p_data->>'brand',''),coalesce(p_data->>'category',''),coalesce(p_data->>'variant',''),coalesce(nullif(trim(p_data->>'sku'),''),'SP-'||upper(substr(item_id::text,1,8))),nullif(trim(p_data->>'barcode'),''),coalesce(p_data->>'image_url',''),coalesce(p_data->>'supplier',''),p_data->>'purpose',p_data->>'unit',(p_data->>'pack_size')::numeric,(p_data->>'price_cents')::bigint,(p_data->>'cost_cents')::bigint,(p_data->>'minimum_retail')::integer,(p_data->>'minimum_professional')::numeric,coalesce((p_data->>'archived')::boolean,false))
 on conflict(id) do update set name=excluded.name,brand=excluded.brand,category=excluded.category,variant=excluded.variant,sku=excluded.sku,barcode=excluded.barcode,image_url=excluded.image_url,supplier=excluded.supplier,purpose=excluded.purpose,unit=excluded.unit,pack_size=excluded.pack_size,price_cents=excluded.price_cents,cost_cents=excluded.cost_cents,minimum_retail=excluded.minimum_retail,minimum_professional=excluded.minimum_professional,archived=excluded.archived,revision=shop_products.revision+1
 returning * into p;return p;
end $$;
create function public.shop_adjust_stock(p_operation uuid,p_product uuid,p_bucket text,p_action text,p_quantity numeric,p_reason text,p_stock_revision bigint) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();p shop_products;payload jsonb;oldop shop_operations;delta numeric;begin
 payload=jsonb_build_object('product',p_product,'bucket',p_bucket,'action',p_action,'quantity',p_quantity,'reason',p_reason,'revision',p_stock_revision);
 select * into oldop from shop_operations where workspace_id=w and id=p_operation;
 if found then if oldop.kind<>'stock' or oldop.payload<>payload then raise exception 'Identificativo gia usato per una diversa operazione';end if;return;end if;
 if p_bucket is null or p_action is null or p_reason is null or p_bucket not in ('retail','professional') or p_action not in ('receive','consume','count','transfer') or p_quantity is null or p_quantity<0 or p_quantity>1000000 or p_quantity<>round(p_quantity,3) or length(trim(p_reason)) not between 3 and 500 then raise exception 'Controlla quantita e causale';end if;
 select * into p from shop_products where workspace_id=w and id=p_product for update;
 if not found or p.archived then raise exception 'Prodotto non disponibile';end if;
 if p_action='count' and p.stock_revision is distinct from p_stock_revision then raise exception 'Scorte cambiate durante il conteggio: riconta il prodotto';end if;
 if (p_bucket='retail' or p_action='transfer' or p.unit='piece') and p_quantity<>trunc(p_quantity) then raise exception 'Inserisci un numero intero di pezzi';end if;
 if p_bucket='retail' and p.purpose='professional' or p_bucket='professional' and p.purpose='retail' then raise exception 'Destinazione non abilitata per questo prodotto';end if;
 if p_action='transfer' and (p_bucket<>'retail' or p.purpose<>'both') then raise exception 'Il trasferimento richiede un prodotto per vendita e uso interno';end if;
 delta=case p_action when 'consume' then -p_quantity when 'count' then p_quantity-case p_bucket when 'retail' then p.retail_qty else p.professional_qty end else p_quantity end;
 if p_action='transfer' then delta=-p_quantity;end if;
 if (case p_bucket when 'retail' then p.retail_qty else p.professional_qty end)+delta<0 then raise exception 'Giacenza insufficiente';end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'stock',payload);
 update shop_products set retail_qty=retail_qty+case when p_bucket='retail' then delta else 0 end,professional_qty=professional_qty+case when p_action='transfer' then p_quantity*p.pack_size when p_bucket='professional' then delta else 0 end,stock_revision=stock_revision+1 where id=p.id;
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p.id,p_operation,p_bucket,delta,p_reason,auth.uid());
 if p_action='transfer' then insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p.id,p_operation,'professional',p_quantity*p.pack_size,p_reason,auth.uid());end if;
end $$;
create function public.shop_checkout(p_operation uuid,p_customer uuid,p_method public.payment_method,p_lines jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();oldop shop_operations;payload jsonb;line jsonb;p shop_products;total bigint=0;q integer;customer_label text='';movement uuid;begin
 payload=jsonb_build_object('customer',p_customer,'method',p_method,'lines',p_lines);
 select * into oldop from shop_operations where workspace_id=w and id=p_operation;
 if found then if oldop.kind<>'sale' or oldop.payload<>payload then raise exception 'Identificativo gia usato per una diversa vendita';end if;return p_operation;end if;
 if (select cash_section_disabled from workspaces where id=w) then raise exception 'Attiva la Cassa per registrare una vendita';end if;
 if p_method is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 100 then raise exception 'Carrello non valido';end if;
 if p_customer is not null then select full_name into customer_label from customers where id=p_customer and workspace_id=w;if not found then raise exception 'Cliente non valido';end if;end if;
 if exists(select 1 from jsonb_array_elements(p_lines) x group by x->>'id' having count(*)>1) then raise exception 'Prodotto duplicato nel carrello';end if;
 for line in select * from jsonb_array_elements(p_lines) loop
 q=(line->>'quantity')::integer;
 select * into p from shop_products where id=(line->>'id')::uuid and workspace_id=w for update;
 if not found or p.archived or p.purpose='professional' or q is null or q<=0 or q>10000 or q::numeric<>(line->>'quantity')::numeric then raise exception 'Prodotto o quantita non validi';end if;
 if p.revision is distinct from (line->>'revision')::integer then raise exception 'Prezzo o prodotto modificato: aggiorna il carrello';end if;
 if p.retail_qty<q then raise exception 'Scorta insufficiente per %',p.name;end if;
 total=total+p.price_cents*q;
 end loop;
 if total>100000000 then raise exception 'Importo oltre il limite consentito';end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'sale',payload);
 insert into cash_movements(workspace_id,description,amount,payment_method) values(w,'Vendita prodotti · '||substr(p_operation::text,1,8),total/100.0,p_method) returning id into movement;
 insert into shop_sales(id,workspace_id,customer_id,customer_name,total_cents,payment_method,cash_movement_id,created_by) values(p_operation,w,p_customer,customer_label,total,p_method,movement,auth.uid());
 for line in select * from jsonb_array_elements(p_lines) loop
 q=(line->>'quantity')::integer;select * into p from shop_products where id=(line->>'id')::uuid;
 insert into shop_sale_lines(workspace_id,sale_id,product_id,name,sku,quantity,unit_price_cents,unit_cost_cents) values(w,p_operation,p.id,p.name||case when p.variant<>'' then ' · '||p.variant else '' end,p.sku,q,p.price_cents,p.cost_cents);
 update shop_products set retail_qty=retail_qty-q,stock_revision=stock_revision+1 where id=p.id;
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p.id,p_operation,'retail',-q,'Vendita',auth.uid());
 end loop;return p_operation;
end $$;
create function public.shop_return(p_operation uuid,p_sale uuid,p_product uuid,p_quantity integer,p_restock boolean,p_reason text) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);sale shop_sales;l shop_sale_lines;oldop shop_operations;payload jsonb;returned integer;amount bigint;begin
 payload=jsonb_build_object('sale',p_sale,'product',p_product,'quantity',p_quantity,'restock',p_restock,'reason',p_reason);
 select * into oldop from shop_operations where workspace_id=w and id=p_operation;
 if found then if oldop.kind<>'return' or oldop.payload<>payload then raise exception 'Identificativo gia usato per un diverso reso';end if;return;end if;
 select * into sale from shop_sales where workspace_id=w and id=p_sale for update;if not found then raise exception 'Vendita non trovata';end if;
 select * into l from shop_sale_lines where sale_id=p_sale and product_id=p_product;
 if not found or p_quantity is null or p_quantity<=0 or p_restock is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'Reso non valido';end if;
 select coalesce(sum(quantity),0) into returned from shop_returns where sale_id=p_sale and product_id=p_product;
 if p_quantity>l.quantity-returned then raise exception 'Quantita superiore ai prodotti ancora restituibili';end if;
 amount=p_quantity*l.unit_price_cents;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'return',payload);
 insert into shop_returns(id,workspace_id,sale_id,product_id,quantity,amount_cents,restock,reason,created_by) values(p_operation,w,p_sale,p_product,p_quantity,amount,p_restock,trim(p_reason),auth.uid());
 if p_restock then
 update shop_products set retail_qty=retail_qty+p_quantity,stock_revision=stock_revision+1 where id=p_product and workspace_id=w;
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p_product,p_operation,'retail',p_quantity,'Reso: '||p_reason,auth.uid());end if;
 insert into cash_movements(workspace_id,description,amount,payment_method,shop_return_id) values(w,'Rimborso prodotti · '||substr(p_sale::text,1,8),-amount/100.0,sale.payment_method,p_operation);
end $$;
create function public.shop_guard_receipt() returns trigger language plpgsql security definer set search_path=public as $$
declare sale shop_sales;r shop_returns;begin
 if tg_op<>'INSERT' then
  if old.shop_return_id is not null then raise exception 'Rimborso registrato: movimento non modificabile';end if;
  select * into sale from shop_sales where cash_movement_id=old.id;
  if found then
   if tg_op='DELETE' then raise exception 'Gestisci questa vendita da Shop e magazzino';end if;
   if new.amount*100<>sale.total_cents or new.payment_method is distinct from sale.payment_method or new.workspace_id<>sale.workspace_id or new.appointment_id is not null or new.id<>old.id or new.created_at<>old.created_at or new.shop_return_id is not null then raise exception 'Vendita protetta: usa il reso da Shop e magazzino';end if;
  end if;
 end if;
 if tg_op<>'DELETE' and new.shop_return_id is not null then
  select * into r from shop_returns where id=new.shop_return_id;
  select * into sale from shop_sales where id=r.sale_id;
  if r.id is null or r.workspace_id<>new.workspace_id or new.amount*100<>-r.amount_cents or new.appointment_id is not null or new.payment_method is distinct from sale.payment_method then raise exception 'Movimento rimborso non valido';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger shop_receipt_guard before insert or update or delete on cash_movements for each row execute function shop_guard_receipt();
-- Atomic CSV import; updates require explicit product revisions, no silent matches.
create function public.shop_import_products(p_operation uuid,p_rows jsonb) returns integer language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();r jsonb;n integer=0;oldop shop_operations;begin
 select * into oldop from shop_operations where workspace_id=w and id=p_operation;
 if found then if oldop.kind<>'import' or oldop.payload<>p_rows then raise exception 'Importazione differente con lo stesso identificativo';end if;return jsonb_array_length(p_rows);end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Importa da 1 a 200 prodotti alla volta';end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'import',p_rows);
 for r in select * from jsonb_array_elements(p_rows) loop perform shop_save_product(null,0,r);n=n+1;end loop;return n;
end $$;
do $$ declare f record;begin
 for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'shop_%' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname in ('shop_set_enabled','shop_save_product','shop_adjust_stock','shop_checkout','shop_return','shop_import_products') then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $$;
create function public.shop_console(p_search text default '',p_page integer default 0,p_archived boolean default false,p_history_page integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id();begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito';end if;
 if p_history_page<0 or p_history_page>100000 or p_page<0 or p_page>100000 or length(p_search)>120 then raise exception 'Ricerca non valida';end if;
 return jsonb_build_object(
 'settings',coalesce((select to_jsonb(s) from shop_settings s where workspace_id=w),'{"enabled":false,"revision":1}'::jsonb),
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from (select * from shop_products where workspace_id=w and archived=p_archived and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||sku||' '||coalesce(barcode,'')||' '||variant))>0) order by name,id limit 30 offset p_page*30) p),'[]'),
 'count',(select count(*) from shop_products where workspace_id=w and archived=p_archived and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||sku||' '||coalesce(barcode,'')||' '||variant))>0)),
 'summary',(select jsonb_build_object('products',count(*),'low',count(*) filter(where not archived and (purpose<>'professional' and retail_qty<=minimum_retail or purpose<>'retail' and professional_qty<=minimum_professional)),'retail_cost_cents',coalesce(sum(retail_qty*cost_cents),0)) from shop_products where workspace_id=w and not archived),
 'movement_count',(select count(*) from shop_stock_movements where workspace_id=w),'sale_count',(select count(*) from shop_sales where workspace_id=w),
 'movements',coalesce((select jsonb_agg(to_jsonb(m) order by created_at desc,id) from (select m.*,p.name,p.unit from shop_stock_movements m join shop_products p on p.id=m.product_id where m.workspace_id=w order by m.created_at desc,m.id limit 30 offset p_history_page*30) m),'[]'),
 'sales',coalesce((select jsonb_agg(to_jsonb(s) order by created_at desc,id) from (select s.*,(select jsonb_agg(to_jsonb(l)||jsonb_build_object('returned',coalesce((select sum(r.quantity) from shop_returns r where r.sale_id=s.id and r.product_id=l.product_id),0))) from shop_sale_lines l where l.sale_id=s.id) as lines,coalesce((select sum(amount_cents) from shop_returns r where r.sale_id=s.id),0) as refunded_cents from shop_sales s where workspace_id=w order by created_at desc,id limit 30 offset p_history_page*30) s),'[]'));
end $$;
revoke all on function public.shop_console(text,integer,boolean,integer) from public,anon;
grant execute on function public.shop_console(text,integer,boolean,integer) to authenticated;
alter table shop_operations add column result_id uuid;
create function public.shop_create_product(p_operation uuid,p_data jsonb) returns shop_products language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();op shop_operations;p shop_products;begin
 select * into op from shop_operations where workspace_id=w and id=p_operation;
 if found then if op.kind<>'product' or op.payload<>p_data then raise exception 'Identificativo usato per un altro prodotto';end if;select * into p from shop_products where id=op.result_id and workspace_id=w;return p;end if;
 p=shop_save_product(null,0,p_data);
 insert into shop_operations(workspace_id,id,kind,payload,result_id) values(w,p_operation,'product',p_data,p.id);return p;
end $$;
revoke all on function public.shop_create_product(uuid,jsonb) from public,anon;
grant execute on function public.shop_create_product(uuid,jsonb) to authenticated;
create index shop_stock_history on shop_stock_movements(workspace_id,created_at desc);
create index shop_sale_history on shop_sales(workspace_id,created_at desc);
create index shop_returns_sale on shop_returns(sale_id,product_id);
