begin;
create table public.salon_brand_placements (
 workspace_id uuid primary key references public.workspaces(id) on delete cascade,
 owner_enabled boolean not null default false,
 frontend_enabled boolean not null default false,
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.salon_brand_placements enable row level security;
revoke all on public.salon_brand_placements from public,anon,authenticated;
grant select on public.salon_brand_placements to authenticated;
create policy salon_brand_placements_owner_read on public.salon_brand_placements for select to authenticated using(exists(
 select 1 from public.workspace_members m where m.workspace_id=salon_brand_placements.workspace_id and m.user_id=auth.uid() and m.role='owner'
));

-- Returns only public branding, never owner/contact/account information.
create function public.get_salon_brand_placements(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('workspaceId',w.id,
  'eligible',coalesce(l.approved_source='ai' and l.display_mode='logo' and nullif(l.approved_path,'') is not null,false),
  'ownerEnabled',coalesce(b.owner_enabled,false),
  'frontendEnabled',coalesce(b.frontend_enabled,false),
  'path',case when l.approved_source='ai' and l.display_mode='logo' then nullif(l.approved_path,'') else null end,
  'updatedAt',b.updated_at)
 from public.workspaces w
 left join public.salon_logo_plaques l on l.workspace_id=w.id
 left join public.salon_brand_placements b on b.workspace_id=w.id
 where w.id=p_workspace_id;
$$;
revoke all on function public.get_salon_brand_placements(uuid) from public;
grant execute on function public.get_salon_brand_placements(uuid) to anon,authenticated;

create function public.set_owner_salon_brand_placements(p_workspace_id uuid,p_owner_enabled boolean,p_frontend_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not exists(select 1 from public.workspace_members m where m.workspace_id=p_workspace_id and m.user_id=auth.uid() and m.role='owner') then raise exception 'owner_required' using errcode='42501';end if;
 if p_owner_enabled is null or p_frontend_enabled is null then raise exception 'invalid_brand_placements' using errcode='22023';end if;
 if (p_owner_enabled or p_frontend_enabled) and not exists(
  select 1 from public.salon_logo_plaques l where l.workspace_id=p_workspace_id and l.approved_source='ai' and l.display_mode='logo' and nullif(l.approved_path,'') is not null
 ) then raise exception 'approved_ai_plaque_required' using errcode='22023';end if;
 insert into public.salon_brand_placements(workspace_id,owner_enabled,frontend_enabled) values(p_workspace_id,p_owner_enabled,p_frontend_enabled)
 on conflict(workspace_id) do update set owner_enabled=excluded.owner_enabled,frontend_enabled=excluded.frontend_enabled,updated_at=clock_timestamp();
 return public.get_salon_brand_placements(p_workspace_id);
end;
$$;
revoke all on function public.set_owner_salon_brand_placements(uuid,boolean,boolean) from public,anon;
grant execute on function public.set_owner_salon_brand_placements(uuid,boolean,boolean) to authenticated;
commit;
