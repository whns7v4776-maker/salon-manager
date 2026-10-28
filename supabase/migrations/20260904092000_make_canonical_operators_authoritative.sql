-- Canonical operators are the only authority for existing operator identities.
-- Device snapshots can be stale (for example after HMR or a delayed offline
-- publish), so they may seed a brand-new legacy operator but must never rename,
-- reconfigure, restore, or remove an existing canonical row.

create or replace function public.get_workspace_operator_snapshot_v1(
  p_workspace_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', operator.id,
        'nome', operator.name,
        'mestiere', coalesce(operator.required_role, ''),
        'fotoUri', nullif(trim(coalesce(operator.photo_uri, '')), ''),
        'availability', coalesce(operator.availability, '{}'::jsonb),
        'publicServiceMode', coalesce(policy.mode, 'all_role'),
        'publicServiceIds', coalesce(
          (
            select jsonb_agg(link.service_id order by link.service_id)
            from public.operator_public_service_links as link
            where link.workspace_id = operator.workspace_id
              and link.operator_id = operator.id
          ),
          '[]'::jsonb
        ),
        'publicServiceKeys', '[]'::jsonb
      )
      order by operator.created_at, operator.name, operator.id
    ),
    '[]'::jsonb
  )
  from public.operators as operator
  left join public.operator_public_booking_policies as policy
    on policy.workspace_id = operator.workspace_id
    and policy.operator_id = operator.id
  where operator.workspace_id = p_workspace_id;
$$;

revoke all on function public.get_workspace_operator_snapshot_v1(uuid)
  from public;

create or replace function public.sync_workspace_operators_from_portal_v1(
  p_workspace_id uuid,
  p_operators jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_operator_id uuid;
  v_name text;
  v_role text;
  v_mode text;
begin
  if p_workspace_id is null
    or jsonb_typeof(coalesce(p_operators, '[]'::jsonb)) <> 'array'
  then
    return;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_operators, '[]'::jsonb))
  loop
    v_name := trim(coalesce(v_item ->> 'nome', v_item ->> 'name', ''));
    if v_name = '' then
      continue;
    end if;

    -- A UUID in a snapshot represents an already-known identity. If that row
    -- is absent it may have been archived, so a stale snapshot cannot restore
    -- it. Current clients persist creates/restores directly to public.operators.
    if trim(coalesce(v_item ->> 'id', '')) ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      continue;
    end if;

    if exists (
      select 1
      from public.operators as existing
      where existing.workspace_id = p_workspace_id
        and lower(trim(existing.name)) = lower(v_name)
    ) then
      continue;
    end if;

    -- Compatibility only for legacy clients that publish a provisional,
    -- non-UUID id before the canonical insert exists.
    v_operator_id := gen_random_uuid();
    v_role := nullif(
      trim(coalesce(v_item ->> 'mestiere', v_item ->> 'required_role', '')),
      ''
    );

    insert into public.operators (
      id,
      workspace_id,
      name,
      required_role,
      photo_uri,
      availability
    ) values (
      v_operator_id,
      p_workspace_id,
      v_name,
      v_role,
      nullif(trim(coalesce(v_item ->> 'fotoUri', v_item ->> 'photo_uri', '')), ''),
      coalesce(v_item -> 'availability', '{}'::jsonb)
    );

    if v_item ? 'publicServiceMode'
      or v_item ? 'public_service_mode'
      or v_item ? 'publicServiceIds'
      or v_item ? 'public_service_ids'
    then
      v_mode := case
        when lower(trim(coalesce(
          v_item ->> 'publicServiceMode',
          v_item ->> 'public_service_mode',
          'all_role'
        ))) = 'selected' then 'selected'
        else 'all_role'
      end;

      insert into public.operator_public_booking_policies (
        workspace_id,
        operator_id,
        mode,
        updated_at
      ) values (
        p_workspace_id,
        v_operator_id,
        v_mode,
        timezone('utc', now())
      )
      on conflict (workspace_id, operator_id) do nothing;

      if v_mode = 'selected' then
        insert into public.operator_public_service_links (
          workspace_id,
          operator_id,
          service_id
        )
        select distinct
          p_workspace_id,
          v_operator_id,
          service.id
        from jsonb_array_elements_text(
          coalesce(
            v_item -> 'publicServiceIds',
            v_item -> 'public_service_ids',
            '[]'::jsonb
          )
        ) as selected_service(value)
        join public.services as service
          on service.workspace_id = p_workspace_id
          and service.id::text = trim(selected_service.value)
        on conflict do nothing;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.sync_workspace_operators_from_portal_v1(uuid, jsonb)
  from public;

create or replace function public.protect_client_portal_operator_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_workspace_operators_from_portal_v1(
    new.workspace_id,
    new.operatori
  );
  new.operatori := public.get_workspace_operator_snapshot_v1(new.workspace_id);
  return new;
end;
$$;

drop trigger if exists protect_client_portal_operator_projection_v1
  on public.client_portals;
create trigger protect_client_portal_operator_projection_v1
before insert or update of operatori on public.client_portals
for each row
execute function public.protect_client_portal_operator_projection_v1();

create or replace function public.protect_owner_snapshot_operator_projection_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incoming_operators jsonb;
begin
  v_incoming_operators := coalesce(new.payload -> 'operatori', '[]'::jsonb);
  perform public.sync_workspace_operators_from_portal_v1(
    new.workspace_id,
    v_incoming_operators
  );
  new.payload := jsonb_set(
    coalesce(new.payload, '{}'::jsonb),
    '{operatori}',
    public.get_workspace_operator_snapshot_v1(new.workspace_id),
    true
  );
  return new;
end;
$$;

drop trigger if exists protect_owner_snapshot_operator_projection_v1
  on public.owner_app_snapshots;
create trigger protect_owner_snapshot_operator_projection_v1
before insert or update of payload on public.owner_app_snapshots
for each row
execute function public.protect_owner_snapshot_operator_projection_v1();

revoke all on function public.protect_client_portal_operator_projection_v1()
  from public;
revoke all on function public.protect_owner_snapshot_operator_projection_v1()
  from public;

notify pgrst, 'reload schema';
