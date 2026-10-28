-- Every owner surface can publish the same appointments from a different
-- in-memory order. Canonicalize only the appointment projection before the
-- client_portals conflict check, so order-only writes become real no-ops.
-- Services and operators keep their user-defined array order untouched.

create or replace function public.overlay_canonical_appointment_timing_v1(
  p_workspace_id uuid,
  p_items jsonb
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with entries as (
    select
      entry.item,
      entry.ordinality,
      nullif(trim(entry.item ->> 'id'), '') as item_id,
      case
        when nullif(trim(entry.item ->> 'id'), '') ~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then (entry.item ->> 'id')::uuid
        else null
      end as persisted_id
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) with ordinality as entry(item, ordinality)
  ),
  projected as (
    select
      case
        when appointment.id is null then
          case
            when nullif(trim(entries.item ->> 'appointmentGroupId'), '') is null
              then (entries.item - 'appointmentGroupOrder' - 'appointmentGroupSize')
                || case
                  when nullif(trim(entries.item ->> 'ora'), '') is null
                    then '{}'::jsonb
                  else jsonb_build_object(
                    'ora', left(trim(entries.item ->> 'ora'), 5)
                  )
                end
            else entries.item || case
              when nullif(trim(entries.item ->> 'ora'), '') is null
                then '{}'::jsonb
              else jsonb_build_object(
                'ora', left(trim(entries.item ->> 'ora'), 5)
              )
            end
          end
        else
          (
            entries.item
            - 'data'
            - 'ora'
            - 'cliente'
            - 'servizio'
            - 'prezzo'
            - 'durataMinuti'
            - 'phaseConfig'
            - 'phaseOperatorAssignments'
            - 'phaseOverlapOverrides'
            - 'mestiereRichiesto'
            - 'operatoreId'
            - 'operatoreNome'
            - 'appointmentGroupId'
            - 'appointmentGroupOrder'
            - 'appointmentGroupSize'
          ) || jsonb_strip_nulls(
            jsonb_build_object(
              'data', appointment.appointment_date::text,
              'ora', to_char(appointment.appointment_time, 'HH24:MI'),
              'cliente', trim(appointment.customer_name),
              'servizio', trim(appointment.service_name),
              'prezzo', appointment.price,
              'durataMinuti', appointment.duration_minutes,
              'phaseConfig', appointment.phase_snapshot,
              'phaseOperatorAssignments', case
                when jsonb_typeof(
                  appointment.phase_operator_assignments -> 'initial'
                ) = 'object'
                and jsonb_typeof(
                  appointment.phase_operator_assignments -> 'final'
                ) = 'object'
                  then appointment.phase_operator_assignments
                else null
              end,
              'phaseOverlapOverrides', case
                when coalesce(
                  (appointment.phase_overlap_overrides ->> 'initial')::boolean,
                  false
                )
                or coalesce(
                  (appointment.phase_overlap_overrides ->> 'final')::boolean,
                  false
                )
                  then jsonb_strip_nulls(
                    jsonb_build_object(
                      'version', 1,
                      'initial', case
                        when coalesce(
                          (appointment.phase_overlap_overrides ->> 'initial')::boolean,
                          false
                        ) then true
                        else null
                      end,
                      'final', case
                        when coalesce(
                          (appointment.phase_overlap_overrides ->> 'final')::boolean,
                          false
                        ) then true
                        else null
                      end
                    )
                  )
                else null
              end,
              'mestiereRichiesto', trim(coalesce(appointment.required_role, '')),
              'operatoreId', nullif(trim(coalesce(appointment.operator_id, '')), ''),
              'operatoreNome', nullif(trim(coalesce(appointment.operator_name, '')), ''),
              'appointmentGroupId', appointment.appointment_group_id,
              'appointmentGroupOrder', case
                when appointment.appointment_group_id is not null
                  then appointment.appointment_group_order
                else null
              end,
              'appointmentGroupSize', case
                when appointment.appointment_group_id is not null
                  then appointment.appointment_group_size
                else null
              end
            )
          )
      end as item,
      entries.ordinality,
      entries.persisted_id,
      case
        when entries.item_id is not null
          and entries.item_id !~ '^appointment-'
          then 'id:' || entries.item_id
        else concat_ws(
          '|',
          'legacy',
          trim(coalesce(entries.item ->> 'data', '')),
          left(trim(coalesce(entries.item ->> 'ora', '')), 5),
          lower(trim(coalesce(entries.item ->> 'cliente', ''))),
          lower(trim(coalesce(entries.item ->> 'servizio', ''))),
          trim(coalesce(entries.item ->> 'operatoreId', ''))
        )
      end as identity_key
    from entries
    left join public.appointments as appointment
      on appointment.workspace_id = p_workspace_id
     and appointment.id = entries.persisted_id
    where entries.persisted_id is null
       or appointment.id is not null
  ),
  deduplicated as (
    select
      projected.item,
      row_number() over (
        partition by projected.identity_key
        order by projected.item::text, projected.ordinality
      ) as identity_rank
    from projected
  )
  select coalesce(
    jsonb_agg(
      deduplicated.item
      order by
        trim(coalesce(deduplicated.item ->> 'data', '')),
        left(trim(coalesce(deduplicated.item ->> 'ora', '')), 5),
        trim(coalesce(deduplicated.item ->> 'appointmentGroupId', '')),
        case
          when trim(coalesce(
            deduplicated.item ->> 'appointmentGroupOrder',
            ''
          )) ~ '^-?[0-9]+([.][0-9]+)?$'
            then (deduplicated.item ->> 'appointmentGroupOrder')::numeric
          else 2147483647::numeric
        end,
        trim(coalesce(deduplicated.item ->> 'operatoreId', '')),
        trim(coalesce(deduplicated.item ->> 'id', '')),
        deduplicated.item::text
    ),
    '[]'::jsonb
  )
  from deduplicated
  where deduplicated.identity_rank = 1;
$$;

-- The existing BEFORE INSERT/UPDATE trigger calls the helper above. During an
-- INSERT .. ON CONFLICT publish it canonicalizes EXCLUDED.appuntamenti before
-- the function's `is distinct from` guard, preventing order-only updates even
-- from an older app or web tab.

create or replace function public.skip_unchanged_owner_snapshot_payload_v1()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Trigger names are executed alphabetically for the same timing/event. The
  -- `zz_` trigger therefore runs after guard/protect/set_updated_at: compare
  -- the fully canonical payload and cancel the physical UPDATE when unchanged.
  if new.payload is not distinct from old.payload then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists zz_skip_unchanged_owner_snapshot_payload_v1
  on public.owner_app_snapshots;
create trigger zz_skip_unchanged_owner_snapshot_payload_v1
before update of payload on public.owner_app_snapshots
for each row
execute function public.skip_unchanged_owner_snapshot_payload_v1();

update public.client_portals as portal
set appuntamenti = public.overlay_canonical_appointment_timing_v1(
  portal.workspace_id,
  portal.appuntamenti
)
where portal.appuntamenti is distinct from
  public.overlay_canonical_appointment_timing_v1(
    portal.workspace_id,
    portal.appuntamenti
  );

update public.owner_app_snapshots as snapshot
set payload = jsonb_set(
  coalesce(snapshot.payload, '{}'::jsonb),
  '{appuntamenti}',
  public.overlay_canonical_appointment_timing_v1(
    snapshot.workspace_id,
    coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb)
  ),
  true
)
where coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb) is distinct from
  public.overlay_canonical_appointment_timing_v1(
    snapshot.workspace_id,
    coalesce(snapshot.payload -> 'appuntamenti', '[]'::jsonb)
  );

revoke all on function public.overlay_canonical_appointment_timing_v1(uuid, jsonb)
  from public;
revoke all on function public.skip_unchanged_owner_snapshot_payload_v1()
  from public;

notify pgrst, 'reload schema';
