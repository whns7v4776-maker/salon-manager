-- Distinguish two customer-facing dependency contracts:
-- 1. automatic: one exact required service is added without another choice;
-- 2. choice: the customer must select one service from the configured list.
-- Both paths keep using the existing atomic, consecutive two-slot write.

comment on column public.services.linked_service_config is
  'Service dependency contract. requiredServiceIds contains one automatic add-on; clientChoiceRequired with suggestedServiceIds requires one customer choice.';

create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'descrizione', coalesce(service.description, ''),
          'prezzo', service.price,
          'prezzoOriginale', service.original_price,
          'scontoAttivo', service.discount_enabled,
          'scontoValidoDal', service.discount_valid_from,
          'scontoValidoAl', service.discount_valid_to,
          'scontoOraDalle', case when service.discount_start_time is null then null else to_char(service.discount_start_time, 'HH24:MI') end,
          'scontoOraAlle', case when service.discount_end_time is null then null else to_char(service.discount_end_time, 'HH24:MI') end,
          'scontoGiorniSettimana', service.discount_weekdays,
          'durataMinuti', service.duration_minutes,
          'phaseConfig', service.phase_config,
          'linkedServiceConfig', case
            when (
              lower(trim(coalesce(service.linked_service_config ->> 'clientChoiceRequired', 'false'))) = 'true'
              and jsonb_typeof(service.linked_service_config -> 'suggestedServiceIds') = 'array'
              and jsonb_array_length(service.linked_service_config -> 'suggestedServiceIds') > 0
            ) or (
              jsonb_typeof(service.linked_service_config -> 'requiredServiceIds') = 'array'
              and jsonb_array_length(service.linked_service_config -> 'requiredServiceIds') > 0
            )
              then service.linked_service_config
            else '{}'::jsonb
          end,
          'mestiereRichiesto', coalesce(service.required_role, ''),
          'badgeCliente', coalesce(service.client_badge, ''),
          'ordineMestiereCliente', service.client_role_display_order,
          'ordineCliente', service.client_display_order,
          'disponibileOnline', true
        )
        order by service.client_role_display_order, service.required_role,
          service.client_display_order, service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.servizi, '[]'::jsonb))
          with ordinality as existing(existing_item, existing_position)
        where nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
          or (
            lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
          )
        order by case when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0 else 1 end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
        and service.is_online = true
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

-- Keep the proven atomic writer and replace only its dependency authorization
-- guard. This avoids copying or diverging from its pricing, timing, identity,
-- notification and rollback contract.
do $migration$
declare
  v_definition text;
  v_guard_start_anchor text := $anchor$if lower(trim(coalesce(v_parent.linked_service_config ->> 'clientChoiceRequired', 'false'))) <> 'true'$anchor$;
  v_guard_end_anchor text := $anchor$raise exception 'dependency_configuration_changed';
  end if;$anchor$;
  v_guard_start integer;
  v_guard_end integer;
  v_new_guard text := $new$
if not (
    (
      lower(trim(coalesce(v_parent.linked_service_config ->> 'dependencyMode', ''))) = 'automatic'
      or (
        nullif(trim(coalesce(v_parent.linked_service_config ->> 'dependencyMode', '')), '') is null
        and lower(trim(coalesce(v_parent.linked_service_config ->> 'clientChoiceRequired', 'false'))) <> 'true'
      )
    )
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_parent.linked_service_config -> 'requiredServiceIds') = 'array'
            then v_parent.linked_service_config -> 'requiredServiceIds'
          else '[]'::jsonb
        end
      ) as configured(service_id)
      where configured.service_id = v_dependency.id::text
    )
  ) and not (
    lower(trim(coalesce(v_parent.linked_service_config ->> 'clientChoiceRequired', 'false'))) = 'true'
    and exists (
      select 1
      from jsonb_array_elements_text(
        case
          when jsonb_typeof(v_parent.linked_service_config -> 'suggestedServiceIds') = 'array'
            then v_parent.linked_service_config -> 'suggestedServiceIds'
          else '[]'::jsonb
        end
      ) as configured(service_id)
      where configured.service_id = v_dependency.id::text
    )
  )
  then
    raise exception 'dependency_configuration_changed';
  end if;$new$;
begin
  select pg_get_functiondef(
    'public.create_public_booking_dependency_v1(text,text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure
  ) into v_definition;

  if position(v_new_guard in v_definition) = 0 then
    v_guard_start := position(v_guard_start_anchor in v_definition);
    if v_guard_start = 0 then
      raise exception 'dependency_writer_guard_anchor_missing';
    end if;

    v_guard_end := position(
      v_guard_end_anchor in substring(v_definition from v_guard_start)
    );
    if v_guard_end = 0 then
      raise exception 'dependency_writer_guard_end_anchor_missing';
    end if;

    v_guard_end := v_guard_start + v_guard_end + length(v_guard_end_anchor) - 2;
    v_definition := overlay(
      v_definition
      placing v_new_guard
      from v_guard_start
      for v_guard_end - v_guard_start + 1
    );
    execute v_definition;
  end if;
end;
$migration$;

do $$
declare
  v_workspace_id uuid;
begin
  for v_workspace_id in select workspace_id from public.client_portals loop
    perform public.sync_client_portal_services(v_workspace_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
