-- Salon-wide management is accessible without selecting or creating a customer.
create function public.owner_benefits_console()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id();
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 return jsonb_build_object('settings',coalesce((select to_jsonb(s) from salon_benefit_settings s where workspace_id=w),'{}'),
 'points',0,'packages','[]'::jsonb,'giftCards','[]'::jsonb,
 'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by points_cost) from salon_loyalty_rewards r where workspace_id=w),'[]'),
 'catalog',coalesce((select jsonb_agg(to_jsonb(c) order by name) from service_package_catalog c where workspace_id=w),'[]'));
end $$;
revoke all on function public.owner_benefits_console() from public,anon;
grant execute on function public.owner_benefits_console() to authenticated;
create table public.gift_card_templates (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.workspaces(id),
 name text not null check(length(trim(name)) between 1 and 120),amount_cents bigint not null check(amount_cents between 1 and 100000000),
 months integer check(months between 1 and 60),message text not null default '' check(length(message)<=500),
 archived boolean not null default false,revision integer not null default 1
);
alter table public.gift_card_templates enable row level security;
revoke all on public.gift_card_templates from anon,authenticated;
grant select on public.gift_card_templates to authenticated;
create policy gift_templates_owner_read on public.gift_card_templates for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());
create function public.save_gift_card_template(p_id uuid,p_revision integer,p_name text,p_amount bigint,p_months integer,p_message text,p_archived boolean default false)
returns public.gift_card_templates language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id();r gift_card_templates;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito';end if;
 if p_id is null then insert into gift_card_templates(workspace_id,name,amount_cents,months,message) values(w,trim(p_name),p_amount,p_months,p_message) returning * into r;
 else update gift_card_templates set name=trim(p_name),amount_cents=p_amount,months=p_months,message=p_message,archived=p_archived,revision=revision+1 where id=p_id and workspace_id=w and revision=p_revision returning * into r;
 if not found then raise exception 'Modello modificato: aggiorna prima di salvare';end if;end if;
 return r;
end $$;
revoke all on function public.save_gift_card_template(uuid,integer,text,bigint,integer,text,boolean) from public,anon;
grant execute on function public.save_gift_card_template(uuid,integer,text,bigint,integer,text,boolean) to authenticated;
create function public.find_salon_gift_card(p_code text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare w uuid=current_workspace_id();result jsonb;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito';end if;
 select jsonb_build_object('id',c.id,'full_name',c.full_name,'code',g.code) into result
 from customer_gift_cards g join customers c on c.id=g.customer_id and c.workspace_id=g.workspace_id
 where g.workspace_id=w and g.code=upper(trim(replace(p_code,'salonpro-gift:','')));
 if result is null then raise exception 'Buono non trovato in questo salone';end if;
 return result;
end $$;
revoke all on function public.find_salon_gift_card(text) from public,anon;
grant execute on function public.find_salon_gift_card(text) to authenticated;
-- Transport status is separate from redemption and from fiscal records.
create table public.gift_card_deliveries (
 gift_card_id uuid primary key references public.customer_gift_cards(id),workspace_id uuid not null references public.workspaces(id),
 payload jsonb not null,recipient text not null,provider_id text,status text not null check(status in ('sending','accepted','failed','uncertain')),
 updated_at timestamptz not null default now()
);
alter table public.gift_card_deliveries enable row level security;
revoke all on public.gift_card_deliveries from anon,authenticated;
grant select (gift_card_id,workspace_id,recipient,provider_id,status,updated_at) on public.gift_card_deliveries to authenticated;
create policy gift_deliveries_owner_read on public.gift_card_deliveries for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());
