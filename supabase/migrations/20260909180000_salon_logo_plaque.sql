begin;

-- Private drafts are never included in public portal/profile projections.
create table public.salon_logo_plaques (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  job_id uuid,
  state text not null default 'idle' check (state in ('idle','generating','ready','error')),
  error_message text,
  started_at timestamptz,
  usage_day date,
  usage_count integer not null default 0,
  draft_path text,
  approved_path text,
  finish text not null default 'satin' check (finish in ('satin','glass','metal')),
  updated_at timestamptz not null default now()
);
alter table public.salon_logo_plaques enable row level security;
revoke all on public.salon_logo_plaques from anon, authenticated;
grant all on public.salon_logo_plaques to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('salon-logo-drafts','salon-logo-drafts',false,10485760,array['image/png']),
       ('salon-logo-approved','salon-logo-approved',true,10485760,array['image/png']);

-- The edge function authenticates the owner before using this service-only lock.
create function public.start_salon_logo_job_v1(p_workspace_id uuid, p_job_id uuid)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.salon_logo_plaques%rowtype;
begin
  insert into public.salon_logo_plaques(workspace_id) values(p_workspace_id) on conflict do nothing;
  select * into r from public.salon_logo_plaques where workspace_id=p_workspace_id for update;
  if r.state='generating' and r.started_at > now()-interval '4 minutes' then
    raise exception 'generation_in_progress';
  end if;
  if r.usage_day=current_date and r.usage_count >= 3 then raise exception 'daily_limit'; end if;
  update public.salon_logo_plaques set job_id=p_job_id, state='generating', error_message=null,
    started_at=now(), usage_day=current_date,
    usage_count=case when r.usage_day=current_date then r.usage_count+1 else 1 end,
    updated_at=now() where workspace_id=p_workspace_id;
  return true;
end $$;
revoke all on function public.start_salon_logo_job_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_salon_logo_job_v1(uuid,uuid) to service_role;

-- Only the approved object key and finish can be read without an owner session.
create function public.get_salon_logo_plaque_v1(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('path',approved_path,'finish',finish,'updatedAt',updated_at)
  from public.salon_logo_plaques where workspace_id=p_workspace_id and approved_path is not null;
$$;
revoke all on function public.get_salon_logo_plaque_v1(uuid) from public;
grant execute on function public.get_salon_logo_plaque_v1(uuid) to anon,authenticated;
commit;
