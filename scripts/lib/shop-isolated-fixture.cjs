// Memory-only fixture. No secrets, scheduler or network APIs are loaded.
const fs=require('node:fs');
const path=process.env.PGLITE_MODULE||'@electric-sql/pglite';
const {PGlite}=require(path);const {citext}=require(path+'/dist/contrib/citext.cjs');const {pgcrypto}=require(path+'/dist/contrib/pgcrypto.cjs');
const root=require('node:path').resolve(__dirname,'../..')+'/';
const migrations=['20261001190000_customer_service_packages.sql','20261001191000_customer_loyalty_and_gifts.sql','20261001200000_benefits_console.sql','20261001201000_gift_card_display_identity.sql','20261001210000_loyalty_checkout_rewards.sql','20261001220000_benefit_notifications.sql','20261001230000_benefits_audit_fixes.sql','20261002000000_shop_inventory.sql','20261002010000_shop_pickup_orders.sql','20261002011000_shop_closed_order_access.sql','20261002020000_shop_purchasing.sql','20261002030000_shop_stock_control.sql','20261002031000_shop_stock_control_consistency.sql','20261002040000_shop_consumption_service_identity.sql','20261002093000_custom_loyalty_earning_rules.sql','20261004120000_package_storefront.sql','20261004121000_package_payment_identity.sql','20261004130000_shop_order_attention.sql'];
module.exports=async()=>{
const db=new PGlite({extensions:{citext,pgcrypto}});
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema extensions;create extension citext;create extension pgcrypto with schema extensions;
create type payment_method as enum('cash','card','bank_transfer','other');create type push_event_type as enum('custom','booking_new','booking_accepted');
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'authenticated')$$;
create table workspaces(id uuid primary key,salon_name text,slug text,owner_email citext,is_internal_tester boolean default false,subscription_status text,subscription_ends_at timestamptz,auto_accept_booking_requests boolean default false);
create table workspace_members(workspace_id uuid references workspaces(id),user_id uuid references auth.users(id),email citext,role text default 'owner');
create function current_workspace_id() returns uuid language sql stable as $$select workspace_id from workspace_members where user_id=auth.uid() and role='owner' limit 1$$;
create function workspace_access_allowed() returns boolean language sql stable as $$select current_workspace_id() is not null$$;
create table customers(id uuid primary key,workspace_id uuid references workspaces(id),full_name text,email citext,phone text,is_active boolean default true,registration_status text default 'approved',source text default 'salon',updated_at timestamptz default now(),created_at timestamptz default now());
create table services(id uuid primary key,workspace_id uuid,name text,price numeric,duration_minutes integer,superseded_by_composition_id uuid,processing_minutes integer default 0,role text,is_active boolean default true);
create table service_compositions(id uuid primary key,workspace_id uuid,name text,is_active boolean default true);
create table service_composition_items(id uuid primary key,workspace_id uuid,composition_id uuid,service_id uuid,position integer);
create table appointment_groups(id uuid primary key,workspace_id uuid,customer_id uuid,metadata jsonb,total_price numeric);
create table appointments(id uuid primary key default gen_random_uuid(),workspace_id uuid,customer_id uuid references customers(id),service_id uuid,appointment_group_id uuid,booking_request_id uuid,appointment_date date,appointment_time time,customer_name text,service_name text,price numeric,duration_minutes integer,completed boolean default false,no_show boolean default false,cashed_in boolean default false,role text,operator_id text,operator_name text);
create table booking_requests(id uuid primary key default gen_random_uuid(),workspace_id uuid,customer_id uuid,appointment_date date,appointment_time time,status text default 'pending',origin text default 'frontend',customer_name text,customer_surname text,customer_email citext,customer_phone text,requested_service_name text,requested_price numeric,requested_duration_minutes integer,requested_operator_id text,requested_operator_name text,service_id uuid,group_id uuid);
create table cash_movements(id uuid primary key default gen_random_uuid(),workspace_id uuid,appointment_id uuid,description text,amount numeric check(amount>=0),payment_method payment_method,card_label text,booking_voided boolean default false,created_at timestamptz default now());
create table cash_stripe_payments(id uuid primary key default gen_random_uuid(),workspace_id uuid not null references workspaces(id),movement_id uuid not null references cash_movements(id),account_id text not null,amount_cents bigint not null check(amount_cents>0),currency text not null default 'eur' check(currency='eur'),status text not null default 'creating' check(status in ('creating','open','paid','expired')),session_id text unique,checkout_url text,payment_intent text,refunded_cents bigint not null default 0 check(refunded_cents>=0),created_at timestamptz not null default now());
create unique index cash_stripe_one_active on cash_stripe_payments(movement_id) where status<>'expired';
create table booking_payment_orders(id uuid primary key,workspace_id uuid,request_id uuid,appointment_id uuid,status text,paid_cents bigint default 0);
create table booking_payment_terms(request_id uuid,mode text,total_cents bigint,due_cents bigint);
create table appointment_payment_revisions(appointment_id uuid,workspace_id uuid);
create function appointment_revision_payment_state(uuid) returns jsonb language sql stable as $$select '{"paidCents":0}'::jsonb$$;
create function booking_payment_paid_cents(uuid) returns bigint language sql stable as $$select coalesce((select paid_cents from booking_payment_orders where request_id=$1),0)$$;
create function resolve_booking_payment_policy(uuid,uuid) returns jsonb language sql stable as $$select '{"mode":"salon"}'::jsonb$$;
create table customer_login_credentials(customer_id uuid primary key references customers(id) on delete cascade,password_hash text);
create table client_portals(workspace_id uuid,availability_settings jsonb default '{}',clienti jsonb default '[]');
create table isolated_dispatch_calls(id serial,kind text,workspace_id uuid,payload jsonb);
create function queue_public_customer_push(uuid,push_event_type,text,text,jsonb,citext,text) returns void language sql as $$insert into isolated_dispatch_calls(kind,workspace_id,payload) values('customer',$1,$5)$$;
create function queue_workspace_push(uuid,push_event_type,text,text,jsonb) returns void language sql as $$insert into isolated_dispatch_calls(kind,workspace_id,payload) values('owner',$1,$5)$$;
create function set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end$$;
create function booking_payment_customer_context(text,text,text) returns jsonb language sql stable as $$select jsonb_build_object('workspaceId',w.id,'customerId',c.id,'policy',resolve_booking_payment_policy(w.id,c.id)) from workspaces w join customers c on c.workspace_id=w.id where w.slug=lower(trim($1)) and lower(trim(c.email::text))=lower(trim($2)) and regexp_replace(c.phone,'\\D','','g')=regexp_replace($3,'\\D','','g') and c.is_active$$;
`);
await db.exec(`alter table workspaces add column cash_section_disabled boolean default false;
alter table services add column required_role text,add column composition_only boolean default false;
alter table appointment_groups add column title text,add column source text;
alter table appointments add column required_role text,add column appointment_group_order integer;
alter table booking_requests add column appointment_group_id uuid;
alter table booking_payment_orders add column upfront_movement_id uuid,add column balance_movement_id uuid;
create table appointment_revision_receipts(appointment_id uuid,workspace_id uuid,movement_id uuid);`);
await db.exec(fs.readFileSync(root+'supabase/migrations/20260930223000_customer_payment_sessions.sql','utf8'));
for(const file of migrations){
 const sql=fs.readFileSync(root+'supabase/migrations/'+file,'utf8').replace(/^alter publication supabase_realtime[^;]*;\s*$/gm,'').replace(/^select cron\.schedule[^\n]*;\s*$/gm,'');
 try{await db.exec(sql);}catch(error){error.message='Fixture setup in '+file+': '+error.message;await db.close();throw error;}
}
return db;
};
if(require.main===module)module.exports().then(async db=>{console.log('Loaded '+migrations.length+' real benefit/shop migrations into disposable memory database; publication and cron infrastructure omitted.');await db.close();}).catch(error=>{console.error(error.message);process.exitCode=1;});
