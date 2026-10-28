-- Serialize reference/default edits for a workspace and commit them together.
create function public.mutate_cash_reference(p_workspace uuid, p_action text, p_id uuid, p_label text default null, p_circuit text default null, p_last4 text default null, p_default boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 if p_workspace is distinct from public.current_workspace_id() or not public.workspace_access_allowed() then raise exception 'Salone non autorizzato'; end if;
 perform 1 from public.workspaces where id=p_workspace for update;
 if not found then raise exception 'Salone non disponibile'; end if;
 if p_action='create' then
  if nullif(trim(p_label),'') is null or nullif(trim(p_circuit),'') is null or p_last4 !~ '^[0-9]{4}$' or p_last4 is null then raise exception 'Riferimento non valido'; end if;
  if p_default then update public.connected_cards set is_default=false where workspace_id=p_workspace and is_default; end if;
  insert into public.connected_cards(id,workspace_id,label,circuit,last4,is_default) values(p_id,p_workspace,trim(p_label),trim(p_circuit),p_last4,p_default);
 elsif p_action='default' then
  if not exists(select 1 from public.connected_cards where workspace_id=p_workspace and id=p_id) then raise exception 'Riferimento non trovato'; end if;
  update public.connected_cards set is_default=(id=p_id) where workspace_id=p_workspace and is_default is distinct from (id=p_id);
 elsif p_action='delete' then
  delete from public.connected_cards where workspace_id=p_workspace and id=p_id;
  if not exists(select 1 from public.connected_cards where workspace_id=p_workspace and is_default) then
   update public.connected_cards set is_default=true where id=(select id from public.connected_cards where workspace_id=p_workspace order by id limit 1);
  end if;
 else raise exception 'Operazione non valida'; end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.id),'[]'::jsonb) into result from public.connected_cards c where workspace_id=p_workspace;
 return result;
end $$;
revoke all on function public.mutate_cash_reference(uuid,text,uuid,text,text,text,boolean) from public;
grant execute on function public.mutate_cash_reference(uuid,text,uuid,text,text,text,boolean) to authenticated;
