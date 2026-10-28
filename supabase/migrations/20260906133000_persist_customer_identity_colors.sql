begin;

-- Separate presentation metadata: no customer or booking payload is rewritten.
create table public.customer_identity_colors (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  color text not null check (color ~ '^#[0-9A-F]{6}$'),
  unique (workspace_id, color)
);
alter table public.customer_identity_colors enable row level security;
revoke all on public.customer_identity_colors from anon, authenticated;

-- Exact legacy FNV-1a mapping for canonical UUID identities. Used only once,
-- to preserve existing colors before resolving collisions.
create function public.legacy_customer_identity_color(p_id uuid)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  h bigint := 2166136261;
  s text := 'customer:id:' || p_id::text;
  primary_colors text[] := array['#D81B60','#2563EB','#D5A021','#F97316','#A67C52','#8B5CF6','#0891B2','#C026D3','#4F46E5','#DC2626','#B45309','#0E7490','#A21CAF','#E11D48','#1D4ED8','#7C2D12'];
  reserves text[] := array['#16A34A','#0F766E','#059669','#64748B','#475569'];
begin
  for i in 1..length(s) loop
    h := ((h # ascii(substr(s,i,1))::bigint) * 16777619) % 4294967296;
  end loop;
  if h % 257 = 0 then return reserves[((h / 257) % 5)::integer + 1]; end if;
  return primary_colors[(h % 16)::integer + 1];
end $$;
revoke all on function public.legacy_customer_identity_color(uuid) from public;

-- One-time preservation for customers that exist at deployment. New customers
-- (including those in a new salon) always start with the priority palette.
insert into public.customer_identity_colors(customer_id, workspace_id, color)
select id, workspace_id, legacy_color from (
  select c.id, c.workspace_id, public.legacy_customer_identity_color(c.id) legacy_color,
    row_number() over(partition by c.workspace_id, public.legacy_customer_identity_color(c.id)
      order by c.created_at, c.id) position
  from public.customers c where c.workspace_id is not null
) candidates where position=1;

create function public.get_owner_customer_identity_colors(p_workspace_id uuid)
returns table(customer_id uuid, color text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row_customer record;
  chosen text;
  attempt integer;
  palette text[] := array[
    '#EAB308','#F97316','#EF4444','#2563EB','#8B5CF6','#EC4899',
    '#F59E0B','#EA580C','#DC2626','#1D4ED8','#7C3AED','#DB2777',
    '#06B6D4','#6366F1','#D946EF','#F43F5E','#D5A021','#A67C52',
    '#0891B2','#C026D3','#4F46E5','#B45309','#0E7490','#A21CAF',
    '#E11D48','#7C2D12','#D81B60',
    '#16A34A','#0F766E','#059669','#64748B','#475569'
  ];
begin
  if not exists(select 1 from public.workspace_members m
    where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.role='owner') then
    raise exception 'Workspace access denied' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer-colors:' || p_workspace_id::text, 0));
  for row_customer in
    select c.id from public.customers c where c.workspace_id=p_workspace_id
      and not exists(select 1 from public.customer_identity_colors assigned where assigned.customer_id=c.id)
    order by c.created_at, c.id
  loop
    chosen := null;
    select candidate into chosen from unnest(palette) with ordinality as colors(candidate, ordinal)
      where not exists(select 1 from public.customer_identity_colors c where c.workspace_id=p_workspace_id and c.color=candidate)
      order by ordinal limit 1;
    -- Large directories need more than a finite named palette. Persist each
    -- extra vivid tone once, and enforce uniqueness in the database too.
    attempt := 0;
    while chosen is null loop
      chosen := '#' || upper(substr(md5(row_customer.id::text || ':' || attempt),1,6));
      if exists(select 1 from public.customer_identity_colors c where c.workspace_id=p_workspace_id and c.color=chosen)
        or get_byte(decode(substr(chosen,2),'hex'),1) > greatest(get_byte(decode(substr(chosen,2),'hex'),0),get_byte(decode(substr(chosen,2),'hex'),2))
        or greatest(get_byte(decode(substr(chosen,2),'hex'),0),get_byte(decode(substr(chosen,2),'hex'),2)) < 150
        or abs(get_byte(decode(substr(chosen,2),'hex'),0)-get_byte(decode(substr(chosen,2),'hex'),2)) < 45 then
        chosen := null;
      end if;
      attempt := attempt+1;
      if attempt > 10000 then raise exception 'Customer color allocation exhausted'; end if;
    end loop;
    insert into public.customer_identity_colors values(row_customer.id,p_workspace_id,chosen);
  end loop;
  return query select c.customer_id,c.color from public.customer_identity_colors c where c.workspace_id=p_workspace_id;
end $$;
revoke all on function public.get_owner_customer_identity_colors(uuid) from public;
grant execute on function public.get_owner_customer_identity_colors(uuid) to authenticated;
-- Complete the one-time collision repair without touching canonical records.
do $$
declare w record; previous_uid text := current_setting('request.jwt.claim.sub',true);
begin
  for w in select distinct on (workspace_id) workspace_id,user_id
    from public.workspace_members where role='owner' order by workspace_id,user_id loop
    perform set_config('request.jwt.claim.sub',w.user_id::text,true);
    perform public.get_owner_customer_identity_colors(w.workspace_id);
  end loop;
  perform set_config('request.jwt.claim.sub',coalesce(previous_uid,''),true);
end $$;
notify pgrst, 'reload schema';
commit;
