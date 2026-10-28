-- Completion is an authenticated service outcome, independent of collection.
create or replace function public.complete_owner_appointment_v1(p_appointment uuid,p_workspace uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; result jsonb;
begin
 if auth.uid() is null or not workspace_access_allowed() or p_workspace is distinct from current_workspace_id() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=p_workspace;
 if not found then raise exception 'Appuntamento non disponibile'; end if;
 perform 1 from appointments where workspace_id=p_workspace and (id=a.id or (a.appointment_group_id is not null and appointment_group_id=a.appointment_group_id)) order by id for update;
 if exists(select 1 from appointments where workspace_id=p_workspace and (id=a.id or (a.appointment_group_id is not null and appointment_group_id=a.appointment_group_id)) and (no_show or appointment_date > (now() at time zone 'Europe/Rome')::date)) then raise exception 'Non puoi completare un appuntamento futuro o non effettuato'; end if;
 update appointments set completed=true,updated_at=clock_timestamp() where workspace_id=p_workspace and (id=a.id or (a.appointment_group_id is not null and appointment_group_id=a.appointment_group_id)) and not completed;
 select jsonb_agg(to_jsonb(x)) into result from appointments x where workspace_id=p_workspace and (id=a.id or (a.appointment_group_id is not null and appointment_group_id=a.appointment_group_id));
 return result;
end $$;
revoke all on function public.complete_owner_appointment_v1(uuid,uuid) from public,anon;
grant execute on function public.complete_owner_appointment_v1(uuid,uuid) to authenticated;
