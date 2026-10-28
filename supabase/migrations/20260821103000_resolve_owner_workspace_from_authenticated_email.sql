-- Keep owner access stable when the authentication identity is recreated but
-- the canonical workspace still belongs to the same authenticated email.

create or replace function public.current_workspace_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select workspace.id
  from public.workspaces as workspace
  left join public.workspace_members as member
    on member.workspace_id = workspace.id
   and member.user_id = auth.uid()
  where member.user_id is not null
     or lower(btrim(workspace.owner_email::text)) =
        lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  order by
    case when member.user_id is not null then 0 else 1 end,
    workspace.updated_at desc,
    workspace.id
  limit 1
$$;

create or replace function public.workspace_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.workspaces as workspace
    left join public.workspace_members as member
      on member.workspace_id = workspace.id
     and member.user_id = auth.uid()
    where (
        member.user_id is not null
        or lower(btrim(workspace.owner_email::text)) =
           lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
      )
      and (
        workspace.is_internal_tester = true
        or (
          workspace.subscription_status = 'active'
          and (
            workspace.subscription_ends_at is null
            or workspace.subscription_ends_at > timezone('utc', now())
          )
        )
      )
  )
$$;

do $$
declare
  v_signature regprocedure;
  v_definition text;
  v_next text;
begin
  foreach v_signature in array array[
    'public.create_owner_appointment_group_v1(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean)'::regprocedure,
    'public.create_owner_appointment_group_flexible_v1(text,text,text,citext,text,text,text,text,jsonb,text,boolean,boolean,boolean,boolean,boolean,boolean,boolean)'::regprocedure
  ]
  loop
    select pg_get_functiondef(v_signature) into v_definition;
    v_next := replace(
      v_definition,
      'join public.workspace_members as member on member.workspace_id = workspace.id',
      'left join public.workspace_members as member on member.workspace_id = workspace.id'
    );
    v_next := replace(
      v_next,
      'where member.user_id = auth.uid()',
      $predicate$where (
      member.user_id = auth.uid()
      or lower(btrim(workspace.owner_email::text)) =
         lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
    )$predicate$
    );

    if v_next = v_definition
      or position(
        'left join public.workspace_members as member on member.workspace_id = workspace.id'
        in v_next
      ) = 0
      or position('lower(btrim(workspace.owner_email::text))' in v_next) = 0
    then
      raise exception 'owner_workspace_email_lookup_patch_missing:%',
        v_signature::text;
    end if;

    execute v_next;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
