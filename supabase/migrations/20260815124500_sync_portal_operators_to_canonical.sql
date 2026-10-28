-- Keep the canonical operator table aligned with the public portal snapshot.
-- Public availability functions read public.operators; a missing mirror row
-- must never make a real, active operator disappear from client booking.

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
  v_source_id uuid;
  v_operator_id uuid;
  v_name text;
  v_role text;
  v_mode text;
begin
  if p_workspace_id is null or jsonb_typeof(coalesce(p_operators, '[]'::jsonb)) <> 'array' then
    return;
  end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_operators, '[]'::jsonb))
  loop
    v_name := trim(coalesce(v_item ->> 'nome', v_item ->> 'name', ''));
    if v_name = '' then
      continue;
    end if;

    v_role := nullif(
      trim(coalesce(v_item ->> 'mestiere', v_item ->> 'required_role', '')),
      ''
    );
    v_source_id := case
      when trim(coalesce(v_item ->> 'id', '')) ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then trim(v_item ->> 'id')::uuid
      else null
    end;

    select operator.id
    into v_operator_id
    from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and (
        (v_source_id is not null and operator.id = v_source_id)
        or lower(trim(operator.name)) = lower(v_name)
      )
    order by case when operator.id = v_source_id then 0 else 1 end
    limit 1;

    if v_operator_id is null then
      if v_source_id is null or exists (
        select 1 from public.operators as existing where existing.id = v_source_id
      ) then
        v_source_id := gen_random_uuid();
      end if;

      insert into public.operators (
        id,
        workspace_id,
        name,
        required_role,
        photo_uri,
        availability
      ) values (
        v_source_id,
        p_workspace_id,
        v_name,
        v_role,
        nullif(trim(coalesce(v_item ->> 'fotoUri', v_item ->> 'photo_uri', '')), ''),
        coalesce(v_item -> 'availability', '{}'::jsonb)
      );
      v_operator_id := v_source_id;
    else
      update public.operators
      set
        name = v_name,
        required_role = v_role,
        photo_uri = nullif(
          trim(coalesce(v_item ->> 'fotoUri', v_item ->> 'photo_uri', '')),
          ''
        ),
        availability = coalesce(v_item -> 'availability', public.operators.availability),
        updated_at = timezone('utc', now())
      where workspace_id = p_workspace_id
        and id = v_operator_id;
    end if;

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
      on conflict (workspace_id, operator_id)
      do update set
        mode = excluded.mode,
        updated_at = excluded.updated_at;

      delete from public.operator_public_service_links
      where workspace_id = p_workspace_id
        and operator_id = v_operator_id;

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

create or replace function public.sync_portal_operators_to_canonical_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_workspace_operators_from_portal_v1(new.workspace_id, new.operatori);
  return new;
end;
$$;

drop trigger if exists sync_portal_operators_to_canonical_v1 on public.client_portals;
create trigger sync_portal_operators_to_canonical_v1
after insert or update of operatori on public.client_portals
for each row execute function public.sync_portal_operators_to_canonical_v1();

do $$
declare
  v_portal record;
begin
  for v_portal in
    select workspace_id, operatori from public.client_portals
  loop
    perform public.sync_workspace_operators_from_portal_v1(
      v_portal.workspace_id,
      v_portal.operatori
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
