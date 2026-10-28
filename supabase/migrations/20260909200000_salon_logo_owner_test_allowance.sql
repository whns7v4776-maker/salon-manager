begin;
-- Service-only overload: the edge passes the authenticated user, never a client field.
create function public.start_salon_logo_job_v1(p_workspace_id uuid,p_job_id uuid,p_requester uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.salon_logo_plaques%rowtype;
begin
  if p_requester is distinct from '1e5fcbbc-65c9-476e-b4a3-997ebfe7ec58'::uuid then
    return public.start_salon_logo_job_v1(p_workspace_id,p_job_id);
  end if;
  if not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_requester and role='owner') then
    raise exception 'owner_required';
  end if;
  insert into public.salon_logo_plaques(workspace_id) values(p_workspace_id) on conflict do nothing;
  select * into r from public.salon_logo_plaques where workspace_id=p_workspace_id for update;
  if r.state='generating' and r.started_at>now()-interval '4 minutes' then
    raise exception 'generation_in_progress';
  end if;
  update public.salon_logo_plaques set job_id=p_job_id,state='generating',error_message=null,
    started_at=now(),usage_day=current_date,
    usage_count=case when r.usage_day=current_date then r.usage_count+1 else 1 end,updated_at=now()
    where workspace_id=p_workspace_id;
  return true;
end $$;
revoke all on function public.start_salon_logo_job_v1(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.start_salon_logo_job_v1(uuid,uuid,uuid) to service_role;
commit;
