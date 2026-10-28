-- Prepaid packages: editable catalogue, immutable purchased terms, atomic reservations.
-- No backfill: existing bookings are unchanged.
create table public.salon_benefit_settings (
 workspace_id uuid primary key references public.workspaces(id),
 packages_enabled boolean not null default false, loyalty_enabled boolean not null default false,
 gift_cards_enabled boolean not null default false, points_per_service integer not null default 1 check(points_per_service between 1 and 10000),
 revision integer not null default 1
);
alter table public.salon_benefit_settings enable row level security;
revoke all on public.salon_benefit_settings from public,anon,authenticated;
grant select on public.salon_benefit_settings to authenticated;
grant all on public.salon_benefit_settings to service_role;
create policy benefit_settings_owner on public.salon_benefit_settings for select to authenticated using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed());
create function public.save_salon_benefit_settings(p_packages boolean,p_loyalty boolean,p_gifts boolean,p_points integer,p_revision integer)
returns public.salon_benefit_settings language plpgsql security definer set search_path=public as $$
declare w uuid=public.current_workspace_id(); result salon_benefit_settings;
begin
 if w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 insert into salon_benefit_settings(workspace_id) values(w) on conflict do nothing;
 update salon_benefit_settings set packages_enabled=p_packages,loyalty_enabled=p_loyalty,gift_cards_enabled=p_gifts,points_per_service=p_points,revision=revision+1
 where workspace_id=w and revision=p_revision returning * into result;
 if not found then raise exception 'Impostazioni cambiate: ricarica'; end if;
 return result;
end $$;
revoke all on function public.save_salon_benefit_settings(boolean,boolean,boolean,integer,integer) from public,anon;
grant execute on function public.save_salon_benefit_settings(boolean,boolean,boolean,integer,integer) to authenticated;
create table public.service_package_catalog (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(trim(name)) between 1 and 100),
 entitlements jsonb not null check(jsonb_typeof(entitlements)='array' and jsonb_array_length(entitlements)>0),
 uses integer not null check(uses between 1 and 1000), months integer not null check(months between 1 and 60),
 price_cents bigint not null check(price_cents between 1 and 100000000),
 product_discount integer not null default 0 check(product_discount between 0 and 100),
 archived boolean not null default false, revision integer not null default 1,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.customer_service_packages (
 id uuid primary key, workspace_id uuid not null references public.workspaces(id),
 customer_id uuid not null references public.customers(id), catalog_id uuid references public.service_package_catalog(id),
 name text not null, entitlements jsonb not null, uses integer not null check(uses>0),
 starts_on date not null, expires_on date not null check(expires_on>=starts_on),
 price_cents bigint not null check(price_cents>0), product_discount integer not null default 0,
 purchase_movement_id uuid not null unique references public.cash_movements(id),
 source text not null default 'salon' check(source in ('salon','online')),
 created_at timestamptz not null default now()
);
create table public.service_package_redemptions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 package_id uuid not null references public.customer_service_packages(id),
 service_key text not null, state text not null default 'reserved' check(state in ('reserved','consumed','released')),
 idempotency_key text not null, response jsonb,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(package_id,idempotency_key)
);
create table public.service_package_booking_lines (
 id uuid primary key default gen_random_uuid(),
 -- Retain the historical identifier when legacy cancellation deletes a request.
 request_id uuid unique,
 appointment_id uuid unique,
 redemption_id uuid not null references public.service_package_redemptions(id),
 workspace_id uuid not null references public.workspaces(id), original_price numeric not null check(original_price>=0),
 check(request_id is not null or appointment_id is not null)
);
-- Orders are server-only. A future payment webhook can activate a paid order using
-- its unique id as the purchase id. No public purchase/activation endpoint yet.
create table public.service_package_orders (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 customer_id uuid not null references public.customers(id), catalog_id uuid not null references public.service_package_catalog(id),
 terms jsonb not null, amount_cents bigint not null check(amount_cents>0), currency text not null default 'eur' check(currency='eur'),
 status text not null default 'pending' check(status in ('pending','paid','expired','refunded')),
 provider_session_id text unique, package_id uuid unique references public.customer_service_packages(id),
 created_at timestamptz not null default now()
);
-- Future checkout webhook boundary. Only the backend service role can invoke it
-- after validating the provider signature and paid event. Never a public RPC.
create function public.prepare_service_package_order(p_order uuid,p_workspace uuid,p_customer uuid,p_catalog uuid,p_revision integer)
returns public.service_package_orders language plpgsql security definer set search_path=public as $$
declare result service_package_orders; c service_package_catalog;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_order::text,2));
 select * into result from service_package_orders where id=p_order;
 if found then
  if (result.workspace_id,result.customer_id,result.catalog_id) is distinct from (p_workspace,p_customer,p_catalog) then raise exception 'Ordine già utilizzato'; end if;
  return result;
 end if;
 if not exists(select 1 from salon_benefit_settings where workspace_id=p_workspace and packages_enabled) then raise exception 'Vendita pacchetti disattivata'; end if;
 if not exists(select 1 from customers where id=p_customer and workspace_id=p_workspace and is_active) then raise exception 'Cliente non disponibile'; end if;
 select * into c from service_package_catalog where id=p_catalog and workspace_id=p_workspace for share;
 if not found or c.archived or c.revision<>p_revision then raise exception 'Catalogo cambiato'; end if;
 insert into service_package_orders(id,workspace_id,customer_id,catalog_id,terms,amount_cents)
 values(p_order,p_workspace,p_customer,p_catalog,to_jsonb(c),c.price_cents) returning * into result;
 return result;
end $$;
revoke all on function public.prepare_service_package_order(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.prepare_service_package_order(uuid,uuid,uuid,uuid,integer) to service_role;
create function public.activate_paid_service_package_order(p_order uuid,p_session text,p_paid_cents bigint,p_currency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare o service_package_orders; m uuid; label text; start_date date=(now() at time zone 'Europe/Rome')::date;
begin
 select * into o from service_package_orders where id=p_order for update;
 if not found then raise exception 'Ordine non trovato'; end if;
 if o.provider_session_id is null or o.provider_session_id<>p_session or o.amount_cents<>p_paid_cents or o.currency<>p_currency then raise exception 'Pagamento non corrispondente all’ordine'; end if;
 if o.package_id is not null then return o.package_id; end if;
 if o.status not in ('pending','paid') then raise exception 'Ordine non attivabile'; end if;
 if (o.terms->>'price_cents')::bigint<>o.amount_cents or (o.terms->>'uses')::integer not between 1 and 1000
  or (o.terms->>'months')::integer not between 1 and 60 or jsonb_array_length(o.terms->'entitlements')<1 then raise exception 'Condizioni ordine incomplete'; end if;
 select full_name into label from customers where id=o.customer_id and workspace_id=o.workspace_id;
 if not found then raise exception 'Intestatario ordine non valido'; end if;
 insert into cash_movements(workspace_id,description,amount,payment_method,card_label)
 values(o.workspace_id,'Pacchetto '||(o.terms->>'name')||' · '||label,o.amount_cents/100.0,'card','Acquisto pacchetto online') returning id into m;
 insert into customer_service_packages(id,workspace_id,customer_id,catalog_id,name,entitlements,uses,starts_on,expires_on,price_cents,product_discount,purchase_movement_id,source)
 values(o.id,o.workspace_id,o.customer_id,o.catalog_id,o.terms->>'name',o.terms->'entitlements',(o.terms->>'uses')::integer,start_date,
 (start_date+make_interval(months=>(o.terms->>'months')::integer))::date-1,o.amount_cents,coalesce((o.terms->>'product_discount')::integer,0),m,'online');
 update service_package_orders set status='paid',package_id=o.id where id=o.id;
 return o.id;
end $$;
revoke all on function public.activate_paid_service_package_order(uuid,text,bigint,text) from public,anon,authenticated;
grant execute on function public.activate_paid_service_package_order(uuid,text,bigint,text) to service_role;
create index service_packages_customer on public.customer_service_packages(workspace_id,customer_id);
create index package_redemptions_balance on public.service_package_redemptions(package_id,state);
do $$ declare t text; begin
 foreach t in array array['service_package_catalog','customer_service_packages','service_package_redemptions','service_package_booking_lines','service_package_orders'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  if t<>'service_package_orders' then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy package_owner_read on public.%I for select to authenticated using(workspace_id=public.current_workspace_id() and public.workspace_access_allowed())',t);
  end if;
 end loop;
end $$;

create function public.save_service_package(p_id uuid,p_revision integer,p_name text,p_services jsonb,p_uses integer,p_months integer,p_price_cents bigint,p_product_discount integer,p_archived boolean default false)
returns public.service_package_catalog language plpgsql security definer set search_path=public as $$
declare w uuid=public.current_workspace_id(); terms jsonb='[]'; item jsonb; entry jsonb; result service_package_catalog;
begin
 if w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services) not between 1 and 50 then raise exception 'Seleziona i servizi inclusi'; end if;
 for item in select value from jsonb_array_elements(p_services) loop
  entry=null;
  if item->>'kind'='service' then
   select jsonb_build_object('kind','service','id',id,'name',name,'componentIds',jsonb_build_array(id)) into entry from services
   where id=(item->>'id')::uuid and workspace_id=w and superseded_by_composition_id is null;
  elsif item->>'kind'='composition' then
   select jsonb_build_object('kind','composition','id',c.id,'name',c.name,'componentIds',
    (select jsonb_agg(i.service_id order by i.position) from service_composition_items i where i.composition_id=c.id and i.workspace_id=w))
    into entry from service_compositions c where c.id=(item->>'id')::uuid and c.workspace_id=w and c.is_active;
  end if;
  if entry is null or entry->'componentIds'='null'::jsonb then raise exception 'Servizio non disponibile'; end if;
  if not terms @> jsonb_build_array(entry) then terms=terms||jsonb_build_array(entry); end if;
 end loop;
 if p_id is null then
  insert into service_package_catalog(workspace_id,name,entitlements,uses,months,price_cents,product_discount)
  values(w,trim(p_name),terms,p_uses,p_months,p_price_cents,p_product_discount) returning * into result;
 else
  update service_package_catalog set name=trim(p_name),entitlements=terms,uses=p_uses,months=p_months,price_cents=p_price_cents,
   product_discount=p_product_discount,archived=p_archived,revision=revision+1,updated_at=now()
   where id=p_id and workspace_id=w and revision=p_revision returning * into result;
  if not found then raise exception 'Pacchetto aggiornato altrove: ricarica prima di salvare'; end if;
 end if;
 return result;
end $$;

create function public.assign_service_package(p_purchase_id uuid,p_customer_id uuid,p_catalog_id uuid,p_revision integer,p_starts_on date,p_payment_method public.payment_method)
returns public.customer_service_packages language plpgsql security definer set search_path=public as $$
declare w uuid=public.current_workspace_id(); c service_package_catalog; result customer_service_packages; m uuid; label text;
begin
 if w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_purchase_id::text,0));
 select * into result from customer_service_packages where id=p_purchase_id;
 if found then
  if result.workspace_id<>w or result.customer_id<>p_customer_id or result.catalog_id<>p_catalog_id then raise exception 'Identificativo acquisto già utilizzato'; end if;
  return result;
 end if;
 select full_name into label from customers where id=p_customer_id and workspace_id=w;
 if not found then raise exception 'Cliente non trovato'; end if;
 select * into c from service_package_catalog where id=p_catalog_id and workspace_id=w for share;
 if not exists(select 1 from salon_benefit_settings where workspace_id=w and packages_enabled) then raise exception 'Attiva gli abbonamenti prima di assegnarli'; end if;
 if not found or c.archived or c.revision<>p_revision then raise exception 'Catalogo cambiato: aggiorna il pacchetto prima di confermare'; end if;
 if p_payment_method is null or p_starts_on is null then raise exception 'Indica data di inizio e pagamento ricevuto'; end if;
 insert into cash_movements(workspace_id,description,amount,payment_method)
 values(w,'Pacchetto '||c.name||' · '||label,c.price_cents/100.0,p_payment_method) returning id into m;
 insert into customer_service_packages(id,workspace_id,customer_id,catalog_id,name,entitlements,uses,starts_on,expires_on,price_cents,product_discount,purchase_movement_id)
 values(p_purchase_id,w,p_customer_id,c.id,c.name,c.entitlements,c.uses,p_starts_on,
 (p_starts_on+make_interval(months=>c.months))::date-1,c.price_cents,c.product_discount,m) returning * into result;
 return result;
end $$;

create function public.guard_package_receipt() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from customer_service_packages where purchase_movement_id=old.id) then
  if tg_op='DELETE' then raise exception 'Conserva l’incasso del pacchetto acquistato'; end if;
  if (new.amount,new.payment_method,new.workspace_id,new.appointment_id,new.booking_voided) is distinct from (old.amount,old.payment_method,old.workspace_id,old.appointment_id,old.booking_voided) then
   raise exception 'L’incasso di un pacchetto acquistato non può essere alterato';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger package_receipt_guard before update or delete on public.cash_movements for each row execute function public.guard_package_receipt();

create function public.customer_package_wallet(p_salon_code text,p_email text,p_phone text,p_token text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare ctx jsonb;
begin
 ctx=public.verified_booking_payment_context(p_salon_code,p_email,p_phone,p_token);
 if ctx is null then raise exception 'Verifica la password per accedere ai pacchetti'; end if;
 return coalesce((select jsonb_agg(to_jsonb(p)-'purchase_movement_id'||jsonb_build_object(
  'reserved',(select count(*) from service_package_redemptions r where r.package_id=p.id and r.state='reserved'),
  'consumed',(select count(*) from service_package_redemptions r where r.package_id=p.id and r.state='consumed'),
  'available',p.uses-(select count(*) from service_package_redemptions r where r.package_id=p.id and r.state<>'released'),
  'bookings',coalesce((select jsonb_agg(jsonb_build_object('requestId',l.request_id,'state',r.state)) from service_package_redemptions r join service_package_booking_lines l on l.redemption_id=r.id where r.package_id=p.id),'[]'::jsonb)) order by p.expires_on)
  from customer_service_packages p where p.customer_id=(ctx->>'customerId')::uuid and p.workspace_id=(ctx->>'workspaceId')::uuid),'[]'::jsonb);
end $$;

-- Called only inside create_package_booking. The original booking engine still
-- owns availability, duration, operators and customer eligibility.
create function public.apply_package_booking_price() returns trigger language plpgsql security definer set search_path=public as $$
declare rid uuid; r service_package_redemptions; p customer_service_packages; ent jsonb; sid uuid;
begin
 rid=nullif(current_setting('salonpro.package_redemption',true),'')::uuid;
 if rid is null then return new; end if;
 select * into r from service_package_redemptions where id=rid;
 select * into p from customer_service_packages where id=r.package_id;
 if new.workspace_id<>p.workspace_id then raise exception 'Salone del pacchetto non valido'; end if;
 select value into ent from jsonb_array_elements(p.entitlements) where value->>'kind'||':'||(value->>'id')=r.service_key;
 select id into sid from services where workspace_id=p.workspace_id and lower(trim(name))=lower(trim(new.requested_service_name));
 if not coalesce(ent->'componentIds' @> jsonb_build_array(sid),false) then return new; end if;
 if new.appointment_date not between p.starts_on and p.expires_on then raise exception 'Pacchetto non valido alla data dell’appuntamento'; end if;
 new.customer_id=p.customer_id;
 insert into service_package_booking_lines(request_id,redemption_id,workspace_id,original_price) values(new.id,rid,p.workspace_id,new.requested_price);
 new.requested_price=0;
 return new;
end $$;
create trigger zz_package_booking_price before insert on public.booking_requests for each row execute function public.apply_package_booking_price();

create function public.bind_package_appointment() returns trigger language plpgsql security definer set search_path=public as $$
declare line service_package_booking_lines; r service_package_redemptions; p customer_service_packages;
begin
 select * into line from service_package_booking_lines where request_id=new.booking_request_id;
 if not found then return new; end if;
 select * into r from service_package_redemptions where id=line.redemption_id;
 select * into p from customer_service_packages where id=r.package_id;
 if r.state<>'reserved' or new.workspace_id<>p.workspace_id or new.appointment_date not between p.starts_on and p.expires_on then raise exception 'Copertura pacchetto non valida'; end if;
 new.price=0;new.customer_id=p.customer_id;
 update service_package_booking_lines set appointment_id=new.id where id=line.id;
 return new;
end $$;
revoke all on function public.bind_package_appointment() from public,anon,authenticated;
create trigger zz_bind_package_appointment before insert on public.appointments for each row execute function public.bind_package_appointment();

create function public.create_package_booking(p_package_id uuid,p_token text,p_key text,p_rpc text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb; p customer_service_packages; r service_package_redemptions; ent jsonb; result jsonb; proc record; args text; service_id uuid; service_kind text; n integer;
begin
 if p_rpc not in ('create_public_booking_request_ultralight_v4','create_public_phased_booking_request_v5','create_public_booking_composition_v1','create_public_booking_dependency_v1') then raise exception 'Prenotazione pacchetto non supportata'; end if;
 if length(coalesce(p_key,'')) not between 1 and 200 then raise exception 'Identificativo prenotazione mancante'; end if;
 ctx=public.verified_booking_payment_context(p_payload->>'p_salon_code',p_payload->>'p_customer_email',p_payload->>'p_customer_phone',p_token);
 if ctx is null then raise exception 'Verifica la password per usare il pacchetto'; end if;
 select * into p from customer_service_packages where id=p_package_id and customer_id=(ctx->>'customerId')::uuid and workspace_id=(ctx->>'workspaceId')::uuid for update;
 if not found then raise exception 'Pacchetto non disponibile'; end if;
 select * into r from service_package_redemptions where package_id=p.id and idempotency_key=p_key;
 if found then
  if r.response is null then raise exception 'Prenotazione in elaborazione'; end if;
  return r.response;
 end if;
 if (p_payload->>'p_appointment_date')::date not between p.starts_on and p.expires_on then raise exception 'Pacchetto scaduto o non ancora valido'; end if;
 if (select count(*) from service_package_redemptions where package_id=p.id and state<>'released')>=p.uses then raise exception 'Utilizzi del pacchetto esauriti'; end if;
 if p_rpc='create_public_booking_composition_v1' then service_kind='composition'; service_id=(p_payload->>'p_composition_id')::uuid;
 else
  service_kind='service';
  select id into service_id from services where workspace_id=p.workspace_id and lower(trim(name))=lower(trim(coalesce(p_payload->>'p_requested_service_name',p_payload->>'p_parent_service_name')));
 end if;
 select value into ent from jsonb_array_elements(p.entitlements) where value->>'kind'=service_kind and value->>'id'=service_id::text;
 if ent is null then raise exception 'Servizio non incluso nel pacchetto'; end if;
 -- A changed composition cannot silently change an already purchased agreement.
 if service_kind='composition' and ent->'componentIds' is distinct from (select jsonb_agg(i.service_id order by i.position) from service_composition_items i where i.composition_id=(ent->>'id')::uuid and i.workspace_id=p.workspace_id) then
  raise exception 'Composizione modificata: contatta il salone per usare il pacchetto acquistato';
 end if;
 insert into service_package_redemptions(workspace_id,package_id,service_key,idempotency_key)
 values(p.workspace_id,p.id,service_kind||':'||service_id,p_key) returning * into r;
 perform set_config('salonpro.package_redemption',r.id::text,true);
 -- Bind only known named arguments from a strictly allowlisted function.
 select x.oid,x.proargnames,x.proargtypes into strict proc from pg_proc x join pg_namespace ns on ns.oid=x.pronamespace where ns.nspname='public' and x.proname=p_rpc;
 select string_agg(format('%I => %s',proc.proargnames[i+1],case when proc.proargtypes[i] in ('jsonb'::regtype,'json'::regtype)
  then format('($1->%L)::%s',proc.proargnames[i+1],format_type(proc.proargtypes[i],null))
  else format('($1->>%L)::%s',proc.proargnames[i+1],format_type(proc.proargtypes[i],null)) end),',') into args
  from generate_series(0,array_length(proc.proargnames,1)-1) i where p_payload ? proc.proargnames[i+1];
 execute format('select public.%I(%s)',p_rpc,args) into result using p_payload;
 perform set_config('salonpro.package_redemption','',true);
 select count(*) into n from service_package_booking_lines where redemption_id=r.id;
 if n<>jsonb_array_length(ent->'componentIds') then raise exception 'Prenotazione già presente o copertura incompleta: nessun utilizzo addebitato'; end if;
 -- Group totals must also reflect the covered components, including extra paid services.
 update appointment_groups g set total_price=(select sum(b.requested_price) from booking_requests b where b.appointment_group_id=g.id)
 where g.id in (select b.appointment_group_id from booking_requests b join service_package_booking_lines l on l.request_id=b.id where l.redemption_id=r.id);
 result=result||jsonb_build_object('packageId',p.id,'packageName',p.name);
 update service_package_redemptions set response=result where id=r.id;
 return result;
end $$;

create function public.guard_package_booking() returns trigger language plpgsql security definer set search_path=public as $$
declare p customer_service_packages; r service_package_redemptions; request uuid; aid uuid;
begin
 if tg_table_name='appointments' then request=old.booking_request_id;aid=old.id; else request=old.id; end if;
 select x.* into r from service_package_redemptions x join service_package_booking_lines l on l.redemption_id=x.id where l.request_id=request or l.appointment_id=aid;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 select * into p from customer_service_packages where id=r.package_id;
 if tg_op='DELETE' then
  if r.state='consumed' then raise exception 'Prestazione del pacchetto già effettuata: conserva lo storico'; end if;
  return old;
 end if;
 if new.workspace_id<>p.workspace_id or new.customer_id is distinct from p.customer_id then raise exception 'Il pacchetto è nominativo'; end if;
 if new.appointment_date not between p.starts_on and p.expires_on then raise exception 'La nuova data è fuori dalla validità del pacchetto'; end if;
 if tg_table_name='appointments' then
  if r.state='released' and (new.completed or not new.no_show) then raise exception 'Utilizzo rilasciato: crea una nuova prenotazione'; end if;
  if new.price<>0 or new.service_name is distinct from old.service_name then raise exception 'Servizio coperto da pacchetto: non modificarne il prezzo o servizio'; end if;
  if r.state='consumed' and (not new.completed or new.no_show) then raise exception 'Utilizzo già consumato: conserva la prestazione effettuata'; end if;
 else
  if r.state='released' and new.status::text in ('pending','accepted') then raise exception 'Utilizzo rilasciato: crea una nuova prenotazione'; end if;
  if new.requested_price<>0 or new.requested_service_name is distinct from old.requested_service_name then raise exception 'Servizio coperto da pacchetto'; end if;
  if r.state='consumed' and new.status::text not in ('pending','accepted') then raise exception 'Utilizzo già consumato: conserva la prestazione effettuata'; end if;
 end if;
 return new;
end $$;
create trigger zz_package_request_guard before update or delete on public.booking_requests for each row execute function public.guard_package_booking();
create trigger zz_package_appointment_guard before update or delete on public.appointments for each row execute function public.guard_package_booking();

create function public.sync_package_redemption() returns trigger language plpgsql security definer set search_path=public as $$
declare request uuid; rid uuid; pid uuid; aid uuid;
begin
 if tg_table_name='appointments' then request=case when tg_op='DELETE' then old.booking_request_id else new.booking_request_id end;aid=case when tg_op='DELETE' then old.id else new.id end;
 else request=case when tg_op='DELETE' then old.id else new.id end; end if;
 select l.redemption_id,r.package_id into rid,pid from service_package_booking_lines l join service_package_redemptions r on r.id=l.redemption_id where l.request_id=request or l.appointment_id=aid;
 if rid is null then return null; end if;
 perform 1 from customer_service_packages where id=pid for update;
 -- A multi-component service consumes one use only when every component is performed.
 if not exists(select 1 from service_package_booking_lines l left join appointments a on a.booking_request_id=l.request_id or a.id=l.appointment_id where l.redemption_id=rid and (a.id is null or not a.completed or a.no_show)) then
  update service_package_redemptions set state='consumed',updated_at=now() where id=rid and state='reserved';
 elsif not exists(select 1 from service_package_booking_lines l left join booking_requests b on b.id=l.request_id
  left join appointments a on a.booking_request_id=l.request_id or a.id=l.appointment_id where l.redemption_id=rid and
  ((a.id is not null and not a.no_show and not a.completed and (b.id is null or b.status::text in ('pending','accepted'))) or (b.status::text='pending' and a.id is null))) then
  update service_package_redemptions set state=case when exists(select 1 from service_package_booking_lines l join appointments a on a.booking_request_id=l.request_id or a.id=l.appointment_id where l.redemption_id=rid and a.completed and not a.no_show) then 'consumed' else 'released' end,updated_at=now() where id=rid and state='reserved';
 end if;
 return null;
end $$;
create constraint trigger package_request_lifecycle after update or delete on public.booking_requests deferrable initially deferred for each row execute function public.sync_package_redemption();
create constraint trigger package_appointment_lifecycle after insert or update or delete on public.appointments deferrable initially deferred for each row execute function public.sync_package_redemption();

-- Fail closed if a legacy UI tries to collect a covered appointment.
create function public.guard_package_appointment_cash() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.appointment_id is not null and exists(select 1 from appointments a join service_package_booking_lines l on l.request_id=a.booking_request_id or l.appointment_id=a.id where a.id=new.appointment_id) then
  raise exception 'Appuntamento incluso nel pacchetto: nessun nuovo incasso';
 end if;
 return new;
end $$;
create trigger package_no_double_charge before insert or update on public.cash_movements for each row execute function public.guard_package_appointment_cash();

create function public.apply_owner_service_package(p_package_id uuid,p_appointment_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=public.current_workspace_id(); p customer_service_packages; a appointments; item appointments;
 ent jsonb; sid uuid; rid uuid; ids uuid[]; names text[]; n integer;
begin
 if w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into p from customer_service_packages where id=p_package_id and workspace_id=w for update;
 if not found then raise exception 'Pacchetto non disponibile'; end if;
 select * into a from appointments where id=p_appointment_id and workspace_id=w for update;
 if not found or a.customer_id is distinct from p.customer_id then raise exception 'Il pacchetto appartiene a un altro cliente'; end if;
 select r.id into rid from service_package_redemptions r where r.package_id=p.id and r.idempotency_key='owner:'||a.id;
 if found then return rid; end if;
 if a.completed or a.no_show or a.cashed_in then raise exception 'Usa il pacchetto prima di effettuare o incassare il servizio'; end if;
 if (select count(*) from service_package_redemptions where package_id=p.id and state<>'released')>=p.uses then raise exception 'Utilizzi esauriti'; end if;
 select id into sid from services where workspace_id=w and lower(trim(name))=lower(trim(a.service_name));
 -- Prefer a whole combination when the group contains exactly its purchased components.
 if a.appointment_group_id is not null then
  select value into ent from jsonb_array_elements(p.entitlements) e(value) where value->>'kind'='composition'
   and (select array_agg(s.id order by s.id) from appointments x join services s on s.workspace_id=w and lower(trim(s.name))=lower(trim(x.service_name)) where x.appointment_group_id=a.appointment_group_id and x.workspace_id=w)
    =(select array_agg(v::uuid order by v::uuid) from jsonb_array_elements_text(value->'componentIds') v) limit 1;
 end if;
 if ent is null then select value into ent from jsonb_array_elements(p.entitlements) where value->>'kind'='service' and value->>'id'=sid::text limit 1; end if;
 if ent is null then raise exception 'Servizio non incluso nel pacchetto'; end if;
 select array_agg(x.id) into ids from appointments x where x.workspace_id=w and (x.id=a.id or (ent->>'kind'='composition' and x.appointment_group_id=a.appointment_group_id));
 for item in select * from appointments where id=any(ids) order by id for update loop
  if item.customer_id is distinct from p.customer_id or item.completed or item.no_show or item.cashed_in or item.appointment_date not between p.starts_on and p.expires_on then raise exception 'Appuntamento non copribile: verifica cliente, data e stato'; end if;
  if exists(select 1 from service_package_booking_lines l where l.appointment_id=item.id or l.request_id=item.booking_request_id) then raise exception 'Appuntamento già associato a un pacchetto'; end if;
  if exists(select 1 from cash_movements m where m.appointment_id=item.id and (m.payment_method is not null or exists(select 1 from cash_stripe_payments s where s.movement_id=m.id and s.status<>'expired')))
   or exists(select 1 from booking_payment_orders where request_id=item.booking_request_id)
   or exists(select 1 from appointment_payment_revisions where appointment_id=item.id) then raise exception 'Pagamento già presente: gestiscilo prima di applicare il pacchetto'; end if;
 end loop;
 insert into service_package_redemptions(workspace_id,package_id,service_key,idempotency_key)
 values(w,p.id,ent->>'kind'||':'||(ent->>'id'),'owner:'||a.id) returning id into rid;
 for item in select * from appointments where id=any(ids) loop
  delete from cash_movements where appointment_id=item.id;
  delete from booking_payment_terms where request_id=item.booking_request_id;
  insert into service_package_booking_lines(request_id,appointment_id,redemption_id,workspace_id,original_price) values(item.booking_request_id,item.id,rid,w,item.price);
  update booking_requests set requested_price=0,customer_id=p.customer_id where id=item.booking_request_id;
  update appointments set price=0 where id=item.id;
 end loop;
 update appointment_groups g set total_price=(select sum(x.price) from appointments x where x.appointment_group_id=g.id) where g.id=a.appointment_group_id;
 return rid;
end $$;
revoke all on function public.apply_owner_service_package(uuid,uuid) from public,anon;
grant execute on function public.apply_owner_service_package(uuid,uuid) to authenticated;

revoke all on function public.save_service_package(uuid,integer,text,jsonb,integer,integer,bigint,integer,boolean),public.assign_service_package(uuid,uuid,uuid,integer,date,public.payment_method),public.customer_package_wallet(text,text,text,text),public.create_package_booking(uuid,text,text,text,jsonb),public.guard_package_receipt(),public.apply_package_booking_price(),public.guard_package_booking(),public.sync_package_redemption(),public.guard_package_appointment_cash() from public,anon,authenticated;
grant execute on function public.save_service_package(uuid,integer,text,jsonb,integer,integer,bigint,integer,boolean),public.assign_service_package(uuid,uuid,uuid,integer,date,public.payment_method) to authenticated;
grant execute on function public.customer_package_wallet(text,text,text,text),public.create_package_booking(uuid,text,text,text,jsonb) to anon,authenticated;
