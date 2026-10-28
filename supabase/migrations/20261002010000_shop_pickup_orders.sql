-- Customer shop: pickup only. No public online-charge endpoint.
alter table shop_settings add column storefront_enabled boolean not null default false,add column pickup_enabled boolean not null default false,add column gift_enabled boolean not null default false,add column rewards_enabled boolean not null default false,add column hold_hours integer not null default 48 check(hold_hours between 1 and 168),add column storefront_revision integer not null default 1;
alter table shop_products add column published boolean not null default false,add column reserved_qty integer not null default 0 check(reserved_qty>=0),add constraint shop_available_stock check(retail_qty>=reserved_qty);
alter table shop_products add constraint shop_piece_format check(unit<>'piece' or pack_size=trunc(pack_size));
create table shop_product_rewards(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),name text not null check(length(trim(name)) between 1 and 120),points_cost integer not null check(points_cost between 1 and 1000000),kind text not null check(kind in ('fixed','percent','product')),value integer not null check(value>0),product_id uuid references shop_products(id),expires_on date,archived boolean not null default false,revision integer not null default 1,
 check(kind<>'percent' or value<=100),check(kind<>'product' or product_id is not null)
);
create table shop_orders(
 id uuid primary key,workspace_id uuid not null references workspaces(id),customer_id uuid not null references customers(id),customer_name text not null,
 status text not null default 'pending' check(status in ('pending','ready','collected','cancelled','expired')),
 payload jsonb not null,total_cents bigint not null,discount_cents bigint not null default 0,gift_cents bigint not null default 0,due_cents bigint not null,
 reward_id uuid references shop_product_rewards(id),reward_name text,reward_points integer not null default 0,
 gift_id uuid references customer_gift_cards(id),expires_at timestamptz not null,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 sale_id uuid unique references shop_sales(id),revision integer not null default 1,
 check(total_cents>=0 and discount_cents>=0 and gift_cents>=0 and due_cents>=0 and total_cents=discount_cents+gift_cents+due_cents),unique(workspace_id,id)
);
create table shop_order_lines(
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,order_id uuid not null,product_id uuid not null,
 name text not null,sku text not null,quantity integer not null check(quantity>0),unit_price_cents bigint not null,unit_cost_cents bigint not null,
 foreign key(workspace_id,order_id) references shop_orders(workspace_id,id),foreign key(workspace_id,product_id) references shop_products(workspace_id,id),unique(order_id,product_id)
);
create index shop_orders_pending on shop_orders(workspace_id,status,expires_at);
create index shop_orders_customer on shop_orders(customer_id,created_at desc);
alter table gift_card_uses alter column appointment_id drop not null;
alter table gift_card_uses add column shop_order_id uuid unique references shop_orders(id),add constraint gift_single_destination check(num_nonnulls(appointment_id,shop_order_id)=1);
alter table shop_returns add column gift_refund_cents bigint not null default 0 check(gift_refund_cents>=0);
-- Shop reservations have their own precise notifications rather than 'reward used'.
drop trigger notify_loyalty_event on customer_loyalty_ledger;
create trigger notify_loyalty_event after insert or update on customer_loyalty_ledger for each row when(new.reference_key not like 'shop-order:%') execute function notify_customer_benefit_change();
do $$ declare t text;begin
 foreach t in array array['shop_product_rewards','shop_orders','shop_order_lines'] loop
 execute format('alter table %I enable row level security',t);execute format('revoke all on %I from public,anon,authenticated',t);execute format('grant select on %I to authenticated',t);execute format('grant all on %I to service_role',t);
 execute format('create policy owner_read on %I for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed())',t);
 execute format('create trigger shop_changed after insert or update on %I for each row execute function shop_bump_revision()',t);
 end loop;
end $$;
create function shop_store_settings(p_revision integer,p_visible boolean,p_pickup boolean,p_gift boolean,p_rewards boolean,p_hours integer) returns shop_settings language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);s shop_settings;begin
 insert into shop_settings(workspace_id) values(w) on conflict do nothing;
 if p_visible and not (select enabled from shop_settings where workspace_id=w) then raise exception 'Attiva prima Shop e magazzino';end if;
 update shop_settings set storefront_enabled=p_visible,pickup_enabled=p_pickup,gift_enabled=p_gift,rewards_enabled=p_rewards,hold_hours=p_hours,storefront_revision=storefront_revision+1 where workspace_id=w and storefront_revision=p_revision returning * into s;
 if not found then raise exception 'Impostazioni cambiate: ricarica prima di salvare';end if;return s;
end $$;
alter function shop_save_product(uuid,integer,jsonb) rename to shop_save_product_inventory_v1;
revoke all on function shop_save_product_inventory_v1(uuid,integer,jsonb) from public,anon,authenticated;
create function shop_save_product(p_id uuid,p_revision integer,p_data jsonb) returns shop_products language plpgsql security definer set search_path=public as $$
declare p shop_products;begin
 p=shop_save_product_inventory_v1(p_id,p_revision,p_data);
 update shop_products set published=coalesce((p_data->>'published')::boolean,p.published,false) where id=p.id returning * into p;return p;
end $$;
create function shop_save_reward(p_id uuid,p_revision integer,p_name text,p_points integer,p_kind text,p_value integer,p_product uuid,p_expires date,p_archived boolean default false) returns shop_product_rewards language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace();r shop_product_rewards;begin
 if p_product is not null and not exists(select 1 from shop_products where id=p_product and workspace_id=w and purpose<>'professional') then raise exception 'Prodotto premio non valido';end if;
 if p_id is null or p_revision=0 then
 select * into r from shop_product_rewards where id=p_id and workspace_id=w;
 if found then
 if r.name is distinct from trim(p_name) or r.points_cost is distinct from p_points or r.kind is distinct from p_kind or r.value is distinct from p_value or r.product_id is distinct from p_product or r.expires_on is distinct from p_expires or r.archived is distinct from p_archived then raise exception 'Premio gia creato con altri dati: ricarica';end if;return r;end if;
 insert into shop_product_rewards(id,workspace_id,name,points_cost,kind,value,product_id,expires_on,archived) values(coalesce(p_id,gen_random_uuid()),w,trim(p_name),p_points,p_kind,p_value,p_product,p_expires,p_archived) returning * into r;
 else update shop_product_rewards set name=trim(p_name),points_cost=p_points,kind=p_kind,value=p_value,product_id=p_product,expires_on=p_expires,archived=p_archived,revision=revision+1 where id=p_id and workspace_id=w and revision=p_revision returning * into r;
 if not found then raise exception 'Premio modificato: ricarica';end if;end if;return r;
end $$;
create function shop_order_event(p_order uuid,p_event text) returns void language plpgsql security definer set search_path=public as $$
declare o shop_orders;t text;b text;begin
 select * into o from shop_orders where id=p_order;
 t=case p_event when 'pending' then 'Ordine ricevuto' when 'ready' then 'Il tuo ordine è pronto' when 'collected' then 'Ritiro completato' when 'expired' then 'Prenotazione prodotti scaduta' else 'Ordine annullato' end;
 b=case p_event when 'pending' then 'I prodotti sono riservati. Attendi la conferma del salone prima del ritiro.' when 'ready' then 'Puoi ritirare i prodotti in salone entro il termine indicato nei tuoi ordini.' when 'collected' then 'Grazie! Trovi il riepilogo nei tuoi ordini.' else 'Prodotti, eventuale credito e punti riservati sono stati liberati.' end;
 perform record_benefit_notification(o.workspace_id,o.customer_id,'shop:'||o.id||':'||p_event,t,b);
 if p_event in ('pending','cancelled') then perform queue_workspace_push(o.workspace_id,'custom',case when p_event='pending' then 'Nuovo ordine shop' else 'Ordine shop annullato' end,o.customer_name||' · Ordine '||upper(substr(o.id::text,1,8)),jsonb_build_object('type','shop_order','shopOrderId',o.id,'screen','cassa','_pushTarget','owner','recipientRole','owner','_dedupeKey','shop:'||o.id||':'||p_event));end if;
end $$;
create function shop_release_order(p_order uuid,p_status text) returns void language plpgsql security definer set search_path=public as $$
declare o shop_orders;l shop_order_lines;begin
 if p_status not in ('cancelled','expired') then raise exception 'Stato non valido';end if;
 select * into o from shop_orders where id=p_order for update;
 if not found or o.status not in ('pending','ready') then return;end if;
 perform 1 from customers where id=o.customer_id for update;
 if o.gift_id is not null then perform 1 from customer_gift_cards where id=o.gift_id for update;end if;
 for l in select * from shop_order_lines where order_id=o.id loop update shop_products set reserved_qty=reserved_qty-l.quantity,stock_revision=stock_revision+1 where id=l.product_id;end loop;
 update gift_card_uses set state='released' where shop_order_id=o.id;
 update customer_loyalty_ledger set delta=0 where workspace_id=o.workspace_id and reference_key='shop-order:'||o.id;
 update shop_orders set status=p_status,updated_at=now(),revision=revision+1 where id=o.id;
 perform shop_order_event(o.id,p_status);
end $$;
create function shop_expire_orders(p_workspace uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare o record;n integer=0;begin
 for o in select id,workspace_id from shop_orders where status in ('pending','ready') and expires_at<=now() and (p_workspace is null or workspace_id=p_workspace) order by workspace_id,id limit 200 loop
 perform pg_advisory_xact_lock(hashtextextended('shop:'||o.workspace_id::text,0));
 if exists(select 1 from shop_orders where id=o.id and status in ('pending','ready') and expires_at<=now()) then perform shop_release_order(o.id,'expired');n=n+1;end if;
 end loop;return n;
end $$;
create function shop_public_order(p_order uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('id',o.id,'status',o.status,'total_cents',o.total_cents,'discount_cents',o.discount_cents,'gift_cents',o.gift_cents,'due_cents',o.due_cents,'reward_name',o.reward_name,'reward_points',o.reward_points,'expires_at',o.expires_at,'created_at',o.created_at,'revision',o.revision,'customer_name',o.customer_name,'refunded_cents',(select coalesce(sum(amount_cents),0) from shop_returns where sale_id=o.sale_id),'gift_refund_cents',(select coalesce(sum(gift_refund_cents),0) from shop_returns where sale_id=o.sale_id),'lines',coalesce((select jsonb_agg(jsonb_build_object('product_id',l.product_id,'name',l.name,'quantity',l.quantity,'unit_price_cents',l.unit_price_cents) order by l.name) from shop_order_lines l where order_id=o.id),'[]')) from shop_orders o where id=p_order;
$$;
create function public_shop_catalog(p_salon_code text,p_search text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid;s shop_settings;begin
 select id into w from workspaces where slug=lower(trim(p_salon_code)) and (is_internal_tester or subscription_status in ('demo','active'));
 select * into s from shop_settings where workspace_id=w;
 if w is null or not coalesce(s.enabled and s.storefront_enabled,false) then return '{"visible":false,"products":[],"count":0}';end if;
 if p_page<0 or p_page>100000 or length(p_search)>120 then raise exception 'Ricerca non valida';end if;
 return jsonb_build_object('visible',true,'pickup_enabled',s.pickup_enabled,'hold_hours',s.hold_hours,'gift_enabled',s.gift_enabled,'rewards_enabled',s.rewards_enabled,'count',(select count(*) from shop_products where workspace_id=w and published and not archived and purpose<>'professional' and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||category||' '||variant))>0)),
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by name,id) from (select id,name,brand,category,variant,image_url,price_cents,retail_qty-reserved_qty available,revision from shop_products where workspace_id=w and published and not archived and purpose<>'professional' and (p_search='' or position(lower(p_search) in lower(name||' '||brand||' '||category||' '||variant))>0) order by name,id limit 24 offset p_page*24) p),'[]'));
end $$;
create function customer_shop_state(p_salon_code text,p_email text,p_phone text,p_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb;w uuid;c uuid;begin
 ctx=verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);if ctx is null then raise exception 'Verifica la password per accedere agli ordini';end if;
 w=(ctx->>'workspaceId')::uuid;c=(ctx->>'customerId')::uuid;
 perform shop_expire_orders(w);
 return jsonb_build_object('orders',coalesce((select jsonb_agg(shop_public_order(o.id) order by created_at desc) from (select id,created_at from shop_orders where workspace_id=w and customer_id=c order by created_at desc limit 100) o),'[]'),
 'points',(select coalesce(sum(delta),0) from customer_loyalty_ledger where workspace_id=w and customer_id=c),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r)-'workspace_id') from shop_product_rewards r where workspace_id=w and not archived and (expires_on is null or expires_on>=(now() at time zone 'Europe/Rome')::date) and coalesce((select rewards_enabled from shop_settings where workspace_id=w),false)),'[]'),
 'gifts',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'expires_on',g.expires_on,'available_cents',g.amount_cents-(select coalesce(sum(amount_cents),0) from gift_card_uses where gift_card_id=g.id and state<>'released'))) from customer_gift_cards g where workspace_id=w and customer_id=c and (expires_on is null or expires_on>=(now() at time zone 'Europe/Rome')::date) and coalesce((select gift_enabled from shop_settings where workspace_id=w),false)),'[]'));
end $$;
create function customer_shop_order(p_salon_code text,p_email text,p_phone text,p_token text,p_operation uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb;w uuid;c uuid;o shop_orders;s shop_settings;l jsonb;p shop_products;r shop_product_rewards;g customer_gift_cards;q integer;total bigint=0;discount bigint=0;gift bigint=0;balance bigint;reward_points integer=0;expiration timestamptz;begin
 ctx=verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);if ctx is null then raise exception 'Verifica la password per ordinare';end if;
 w=(ctx->>'workspaceId')::uuid;c=(ctx->>'customerId')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('shop:'||w::text,0));perform shop_expire_orders(w);
 select * into o from shop_orders where id=p_operation;
 if found then if o.workspace_id<>w or o.customer_id<>c or o.payload is distinct from p_payload then raise exception 'Identificativo ordine gia utilizzato';end if;return shop_public_order(o.id);end if;
 if exists(select 1 from shop_operations where id=p_operation) or exists(select 1 from shop_sales where id=p_operation) then raise exception 'Identificativo ordine gia utilizzato';end if;
 select * into s from shop_settings where workspace_id=w;
 if not coalesce(s.enabled and s.storefront_enabled and s.pickup_enabled,false) then raise exception 'Ordini con ritiro non disponibili';end if;
 if (select cash_section_disabled from workspaces where id=w) then raise exception 'Il salone deve riattivare la Cassa prima di accettare ordini';end if;
 perform 1 from customers where id=c for update;
 if (select count(*) from shop_orders where customer_id=c and status in ('pending','ready'))>=5 then raise exception 'Hai gia cinque ordini aperti. Completa o annulla un ritiro';end if;
 if p_payload is null or jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') not between 1 and 40 then raise exception 'Carrello non valido';end if;
 if exists(select 1 from jsonb_array_elements(p_payload->'lines') x group by x->>'id' having count(*)>1) then raise exception 'Prodotto duplicato';end if;
 for l in select * from jsonb_array_elements(p_payload->'lines') loop
 q=(l->>'quantity')::integer;select * into p from shop_products where workspace_id=w and id=(l->>'id')::uuid for update;
 if not found or not p.published or p.archived or p.purpose='professional' or p.revision is distinct from (l->>'revision')::integer then raise exception 'Prodotto o prezzo cambiato: aggiorna il carrello';end if;
 if q is null or q not between 1 and 100 or q::numeric<>(l->>'quantity')::numeric or q>p.retail_qty-p.reserved_qty then raise exception 'Disponibilita insufficiente per %',p.name;end if;
 total=total+p.price_cents*q;
 end loop;
 if total>100000000 then raise exception 'Importo oltre il limite';end if;
 if nullif(p_payload->>'reward_id','') is not null then
 if not s.rewards_enabled then raise exception 'Premi prodotti non attivi';end if;
 select * into r from shop_product_rewards where workspace_id=w and id=(p_payload->>'reward_id')::uuid;
 if not found or r.archived or r.revision is distinct from (p_payload->>'reward_revision')::integer or (r.expires_on is not null and r.expires_on<(now() at time zone 'Europe/Rome')::date) then raise exception 'Premio non disponibile: aggiorna';end if;
 select coalesce(sum(delta),0) into balance from customer_loyalty_ledger where workspace_id=w and customer_id=c;
 if balance<r.points_cost then raise exception 'Punti insufficienti';end if;
 if r.kind='percent' then discount=floor(total*r.value/100.0);elsif r.kind='fixed' then discount=least(total,r.value);else select price_cents into discount from shop_products where id=r.product_id and workspace_id=w and exists(select 1 from jsonb_array_elements(p_payload->'lines') x where (x->>'id')::uuid=r.product_id);end if;
 if coalesce(discount,0)<=0 then raise exception 'Premio non applicabile a questo carrello';end if;reward_points=r.points_cost;
 end if;
 expiration=now()+make_interval(hours=>s.hold_hours);
 if nullif(p_payload->>'gift_id','') is not null then
 if not s.gift_enabled then raise exception 'Gift card non abilitate per i prodotti';end if;
 select * into g from customer_gift_cards where id=(p_payload->>'gift_id')::uuid and workspace_id=w and customer_id=c for update;
 if not found or (g.expires_on is not null and g.expires_on<(now() at time zone 'Europe/Rome')::date) then raise exception 'Gift card non disponibile';end if;
 select g.amount_cents-coalesce(sum(amount_cents) filter(where state<>'released'),0) into balance from gift_card_uses where gift_card_id=g.id;
 gift=least(greatest(balance,0),total-discount);if gift<=0 then raise exception 'Credito non applicabile';end if;
 if g.expires_on is not null then expiration=least(expiration,(g.expires_on+1)::timestamp at time zone 'Europe/Rome');end if;
 end if;
 if (p_payload->>'expected_due')::bigint is distinct from total-discount-gift then raise exception 'Saldo cambiato: aggiorna il riepilogo prima di confermare';end if;
 insert into shop_orders(id,workspace_id,customer_id,customer_name,payload,total_cents,discount_cents,gift_cents,due_cents,reward_id,reward_name,reward_points,gift_id,expires_at)
 values(p_operation,w,c,(select full_name from customers where id=c),p_payload,total,discount,gift,total-discount-gift,r.id,r.name,reward_points,g.id,expiration);
 for l in select * from jsonb_array_elements(p_payload->'lines') loop
 q=(l->>'quantity')::integer;select * into p from shop_products where id=(l->>'id')::uuid;
 insert into shop_order_lines(workspace_id,order_id,product_id,name,sku,quantity,unit_price_cents,unit_cost_cents) values(w,p_operation,p.id,p.name||case when p.variant<>'' then ' · '||p.variant else '' end,p.sku,q,p.price_cents,p.cost_cents);
 update shop_products set reserved_qty=reserved_qty+q,stock_revision=stock_revision+1 where id=p.id;
 end loop;
 if gift>0 then insert into gift_card_uses(workspace_id,gift_card_id,shop_order_id,amount_cents,original_price) values(w,g.id,p_operation,gift,total/100.0);end if;
 if reward_points>0 then insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description) values(w,c,-reward_points,'reward','shop-order:'||p_operation,'Punti riservati per ordine shop: '||r.name);end if;
 perform shop_order_event(p_operation,'pending');return shop_public_order(p_operation);
end $$;
create function customer_shop_cancel(p_salon_code text,p_email text,p_phone text,p_token text,p_order uuid) returns void language plpgsql security definer set search_path=public as $$
declare ctx jsonb;w uuid;c uuid;o shop_orders;begin
 ctx=verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);if ctx is null then raise exception 'Verifica la password';end if;
 w=(ctx->>'workspaceId')::uuid;c=(ctx->>'customerId')::uuid;perform pg_advisory_xact_lock(hashtextextended('shop:'||w::text,0));
 select * into o from shop_orders where id=p_order and workspace_id=w and customer_id=c;
 if not found then raise exception 'Ordine non trovato';end if;
 if o.status='collected' then raise exception 'Ordine ritirato: contatta il salone per un reso';end if;
 perform shop_release_order(o.id,'cancelled');
end $$;
create function shop_manage_order(p_order uuid,p_revision integer,p_action text,p_method payment_method default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);o shop_orders;l shop_order_lines;cash_id uuid;begin
 perform shop_expire_orders(w);select * into o from shop_orders where id=p_order and workspace_id=w for update;
 if not found then raise exception 'Ordine non trovato';end if;
 if o.status=p_action then return shop_public_order(o.id);end if;
 if o.revision is distinct from p_revision or o.status not in ('pending','ready') then raise exception 'Ordine aggiornato o non piu modificabile';end if;
 if p_action='cancelled' then perform shop_release_order(o.id,'cancelled');
 elsif p_action='ready' and o.status='pending' then update shop_orders set status='ready',revision=revision+1,updated_at=now() where id=o.id;perform shop_order_event(o.id,'ready');
 elsif p_action='collected' then
 if o.status<>'ready' then raise exception 'Segna prima l’ordine come pronto';end if;
 if o.due_cents>0 and p_method is null then raise exception 'Indica il pagamento ricevuto';end if;
 if (select cash_section_disabled from workspaces where id=w) then raise exception 'Riattiva la Cassa per completare il ritiro';end if;
 perform 1 from customers where id=o.customer_id for update;
 if o.gift_id is not null then perform 1 from customer_gift_cards where id=o.gift_id for update;end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,o.id,'pickup',jsonb_build_object('order',o.id));
 if o.due_cents>0 then insert into cash_movements(workspace_id,description,amount,payment_method) values(w,'Ritiro shop · '||upper(substr(o.id::text,1,8)),o.due_cents/100.0,p_method) returning id into cash_id;end if;
 insert into shop_sales(id,workspace_id,customer_id,customer_name,total_cents,payment_method,cash_movement_id,created_by) values(o.id,w,o.customer_id,o.customer_name,o.due_cents,coalesce(p_method,'cash'),cash_id,auth.uid());
 for l in select * from shop_order_lines where order_id=o.id loop
 update shop_products set retail_qty=retail_qty-l.quantity,reserved_qty=reserved_qty-l.quantity,stock_revision=stock_revision+1 where id=l.product_id;
 insert into shop_sale_lines(workspace_id,sale_id,product_id,name,sku,quantity,unit_price_cents,unit_cost_cents) values(w,o.id,l.product_id,l.name,l.sku,l.quantity,l.unit_price_cents,l.unit_cost_cents);
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,l.product_id,o.id,'retail',-l.quantity,'Ritiro ordine shop',auth.uid());end loop;
 update gift_card_uses set state='consumed' where shop_order_id=o.id;
 update shop_orders set status='collected',sale_id=o.id,revision=revision+1,updated_at=now() where id=o.id;perform shop_order_event(o.id,'collected');
 else raise exception 'Azione non valida';end if;
 return shop_public_order(o.id);
end $$;
-- Owner panel is separate to avoid exposing internal costs in the public catalogue.
create function shop_orders_console(p_page integer default 0) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);begin
 if p_page<0 or p_page>100000 then raise exception 'Pagina non valida';end if;perform shop_expire_orders(w);
 return jsonb_build_object('settings',coalesce((select to_jsonb(s) from shop_settings s where workspace_id=w),'{"enabled":false,"storefront_enabled":false,"pickup_enabled":false,"gift_enabled":false,"rewards_enabled":false,"hold_hours":48,"storefront_revision":1}'),
 'orders',coalesce((select jsonb_agg(shop_public_order(o.id) order by o.created_at desc) from (select id,created_at from shop_orders where workspace_id=w order by created_at desc limit 30 offset p_page*30) o),'[]'),
 'count',(select count(*) from shop_orders where workspace_id=w),'pending',(select count(*) from shop_orders where workspace_id=w and status='pending'),
 'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by name) from shop_product_rewards r where workspace_id=w),'[]'));
end $$;
-- Refund cash and gift in proportion to returned gross value; final return absorbs rounding.
alter function shop_return(uuid,uuid,uuid,integer,boolean,text) rename to shop_return_inventory_v1;
revoke all on function shop_return_inventory_v1(uuid,uuid,uuid,integer,boolean,text) from public,anon,authenticated;
create function shop_return(p_operation uuid,p_sale uuid,p_product uuid,p_quantity integer,p_restock boolean,p_reason text,p_quote jsonb default null) returns void language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);o shop_orders;l shop_sale_lines;prior shop_operations;payload jsonb;returned integer;gross bigint;cash_before bigint;gift_before bigint;cash_part bigint;gift_part bigint;begin
 select * into o from shop_orders where sale_id=p_sale and workspace_id=w;
 if not found then
 if p_quote is not null and (p_quote->>'cash_cents')::bigint is distinct from (select unit_price_cents*p_quantity from shop_sale_lines where sale_id=p_sale and product_id=p_product) then raise exception 'Rimborso aggiornato: verifica il riepilogo';end if;
 perform shop_return_inventory_v1(p_operation,p_sale,p_product,p_quantity,p_restock,p_reason);return;end if;
 payload=jsonb_build_object('sale',p_sale,'product',p_product,'quantity',p_quantity,'restock',p_restock,'reason',p_reason);
 select * into prior from shop_operations where workspace_id=w and id=p_operation;
 if found then if prior.kind<>'return' or prior.payload<>payload then raise exception 'Operazione differente';end if;return;end if;
 select * into l from shop_sale_lines where sale_id=p_sale and product_id=p_product;
 if not found or p_quantity is null or p_quantity<=0 or p_restock is null or length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'Reso non valido';end if;
 select coalesce(sum(quantity),0) into returned from shop_returns where sale_id=p_sale and product_id=p_product;
 if p_quantity>l.quantity-returned then raise exception 'Quantita gia restituita o eccessiva';end if;
 perform 1 from customers where id=o.customer_id for update;
 if o.gift_id is not null then perform 1 from customer_gift_cards where id=o.gift_id for update;end if;
 select coalesce(sum(r.quantity*x.unit_price_cents),0),coalesce(sum(r.amount_cents),0),coalesce(sum(r.gift_refund_cents),0) into gross,cash_before,gift_before from shop_returns r join shop_sale_lines x on x.sale_id=r.sale_id and x.product_id=r.product_id where r.sale_id=p_sale;
 gross=gross+p_quantity*l.unit_price_cents;
 cash_part=case when o.total_cents=0 then 0 else floor(gross::numeric*o.due_cents/o.total_cents)::bigint-cash_before end;
 gift_part=case when o.total_cents=0 then 0 else floor(gross::numeric*o.gift_cents/o.total_cents)::bigint-gift_before end;
 if p_quote is not null and ((p_quote->>'cash_cents')::bigint is distinct from cash_part or (p_quote->>'gift_cents')::bigint is distinct from gift_part) then raise exception 'Rimborso aggiornato: verifica il riepilogo';end if;
 insert into shop_operations(workspace_id,id,kind,payload) values(w,p_operation,'return',payload);
 insert into shop_returns(id,workspace_id,sale_id,product_id,quantity,amount_cents,gift_refund_cents,restock,reason,created_by) values(p_operation,w,p_sale,p_product,p_quantity,cash_part,gift_part,p_restock,p_reason,auth.uid());
 if p_restock then update shop_products set retail_qty=retail_qty+p_quantity,stock_revision=stock_revision+1 where id=p_product;
 insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(w,p_product,p_operation,'retail',p_quantity,'Reso shop: '||p_reason,auth.uid());end if;
 if cash_part>0 then insert into cash_movements(workspace_id,description,amount,payment_method,shop_return_id) values(w,'Rimborso shop · '||upper(substr(p_sale::text,1,8)),-cash_part/100.0,(select payment_method from shop_sales where id=p_sale),p_operation);end if;
 if gift_part>0 then
 if gift_before+gift_part=o.gift_cents then update gift_card_uses set state='released' where shop_order_id=o.id;
 else update gift_card_uses set amount_cents=o.gift_cents-gift_before-gift_part where shop_order_id=o.id;end if;
 end if;
 if not exists(select 1 from shop_sale_lines x where sale_id=p_sale and x.quantity>(select coalesce(sum(quantity),0) from shop_returns r where r.sale_id=p_sale and r.product_id=x.product_id)) then update customer_loyalty_ledger set delta=0 where workspace_id=w and reference_key='shop-order:'||o.id;end if;
 perform record_benefit_notification(w,o.customer_id,'shop-return:'||p_operation,'Reso shop registrato','Trovi il rimborso e l’eventuale credito ripristinato nei tuoi ordini. I punti del premio vengono restituiti al reso completo.');
end $$;
do $$ declare f record;begin
 for f in select oid::regprocedure sig,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('shop_store_settings','shop_save_product','shop_save_reward','shop_order_event','shop_release_order','shop_expire_orders','shop_public_order','public_shop_catalog','customer_shop_state','customer_shop_order','customer_shop_cancel','shop_manage_order','shop_orders_console','shop_return') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.proname in ('shop_store_settings','shop_save_product','shop_save_reward','shop_manage_order','shop_orders_console','shop_return') then execute format('grant execute on function %s to authenticated',f.sig);end if;
 if f.proname in ('public_shop_catalog','customer_shop_state','customer_shop_order','customer_shop_cancel') then execute format('grant execute on function %s to anon,authenticated',f.sig);end if;
 end loop;
end $$;
grant execute on function shop_expire_orders(uuid) to service_role;

create function shop_return_quote(p_sale uuid,p_product uuid,p_quantity integer) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid=shop_workspace(false);o shop_orders;l shop_sale_lines;gross bigint;cash_before bigint;gift_before bigint;begin
 select * into l from shop_sale_lines where sale_id=p_sale and product_id=p_product and workspace_id=w;
 if not found or p_quantity is null or p_quantity<=0 or p_quantity>l.quantity-(select coalesce(sum(quantity),0) from shop_returns where sale_id=p_sale and product_id=p_product) then raise exception 'Quantita del reso non valida';end if;
 select * into o from shop_orders where sale_id=p_sale and workspace_id=w;
 if not found then return jsonb_build_object('cash_cents',l.unit_price_cents*p_quantity,'gift_cents',0);end if;
 select coalesce(sum(r.quantity*x.unit_price_cents),0)+p_quantity*l.unit_price_cents,coalesce(sum(r.amount_cents),0),coalesce(sum(r.gift_refund_cents),0) into gross,cash_before,gift_before from shop_returns r join shop_sale_lines x on x.sale_id=r.sale_id and x.product_id=r.product_id where r.sale_id=p_sale;
 return jsonb_build_object('cash_cents',case when o.total_cents=0 then 0 else floor(gross::numeric*o.due_cents/o.total_cents)::bigint-cash_before end,'gift_cents',case when o.total_cents=0 then 0 else floor(gross::numeric*o.gift_cents/o.total_cents)::bigint-gift_before end);
end $$;
revoke all on function shop_return_quote(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function shop_return_quote(uuid,uuid,integer) to authenticated;
-- Run independently of app visits; reservations never need an operator to expire.
select cron.schedule('shop-expire-pickup-orders','* * * * *','select public.shop_expire_orders();');

create function shop_reserved_stock_guard() returns trigger language plpgsql set search_path=public as $$ begin
 if new.retail_qty<new.reserved_qty then raise exception 'Scorta riservata agli ordini: completa o annulla i ritiri prima di scaricarla';end if;return new;end $$;
revoke all on function shop_reserved_stock_guard() from public,anon,authenticated;
create trigger shop_reserved_stock_guard before update on shop_products for each row execute function shop_reserved_stock_guard();
create function public_shop_cart(p_salon_code text,p_ids uuid[]) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid;begin
 if coalesce(cardinality(p_ids),0) not between 1 and 40 then raise exception 'Carrello non valido';end if;
 select w1.id into w from workspaces w1 join shop_settings s on s.workspace_id=w1.id where w1.slug=lower(trim(p_salon_code)) and (w1.is_internal_tester or w1.subscription_status in ('demo','active')) and s.enabled and s.storefront_enabled;
 return coalesce((select jsonb_agg(to_jsonb(p)) from (select id,name,brand,category,variant,image_url,price_cents,retail_qty-reserved_qty available,revision from shop_products where workspace_id=w and id=any(p_ids) and published and not archived and purpose<>'professional') p),'[]');
end $$;
revoke all on function public_shop_cart(text,uuid[]) from public,anon,authenticated;
grant execute on function public_shop_cart(text,uuid[]) to anon,authenticated;
