begin;
-- Aliases only: existing slugs, links and customer associations stay unchanged.
create table public.salon_short_codes (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  code text not null unique check (code ~ '^[1-9][0-9]{5}$')
);
alter table public.salon_short_codes enable row level security;
revoke all on public.salon_short_codes from anon, authenticated;

create function public.get_owner_salon_short_code(p_salon_code text)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_code text;
begin
  select w.id into v_id from public.workspaces w
  join public.workspace_members m on m.workspace_id = w.id
  where w.slug = p_salon_code and m.user_id = auth.uid() and m.role = 'owner';
  if v_id is null then return null; end if;
  perform pg_advisory_xact_lock(1950512000);
  select code into v_code from public.salon_short_codes where workspace_id = v_id;
  if v_code is not null then return v_code; end if;
  for attempt in 1..1000 loop
    v_code := (100000 + floor(random() * 900000))::integer::text;
    if not exists(select 1 from public.workspaces where slug = v_code) then
      insert into public.salon_short_codes(workspace_id, code) values(v_id, v_code)
      on conflict do nothing;
      if found then return v_code; end if;
    end if;
  end loop;
  raise exception 'Short code allocation unavailable';
end $$;

create function public.resolve_salon_short_code(p_code text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select w.slug from public.salon_short_codes c
  join public.workspaces w on w.id = c.workspace_id
  where c.code = p_code and p_code ~ '^[1-9][0-9]{5}$';
$$;

create function public.protect_salon_short_code_namespace()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.slug ~ '^[1-9][0-9]{5}$' then
    perform pg_advisory_xact_lock(1950512000);
    if exists(select 1 from public.salon_short_codes where code = new.slug and workspace_id <> new.id) then
      raise exception 'Salon code already in use' using errcode = '23505';
    end if;
  end if;
  return new;
end $$;
create trigger protect_salon_short_code_namespace before insert or update of slug
on public.workspaces for each row execute function public.protect_salon_short_code_namespace();

revoke all on function public.get_owner_salon_short_code(text) from public;
grant execute on function public.get_owner_salon_short_code(text) to authenticated;
revoke all on function public.resolve_salon_short_code(text) from public;
grant execute on function public.resolve_salon_short_code(text) to anon, authenticated;
revoke all on function public.protect_salon_short_code_namespace() from public;
-- Existing salons receive aliases too; identities and slugs are not updated.
do $$
declare v_id uuid; v_code text;
begin
  perform pg_advisory_xact_lock(1950512000);
  for v_id in select id from public.workspaces where id not in (select workspace_id from public.salon_short_codes) loop
    loop
      v_code := (100000 + floor(random() * 900000))::integer::text;
      exit when not exists(select 1 from public.salon_short_codes where code = v_code)
        and not exists(select 1 from public.workspaces where slug = v_code);
    end loop;
    insert into public.salon_short_codes values (v_id, v_code);
  end loop;
end $$;
notify pgrst, 'reload schema';
commit;
