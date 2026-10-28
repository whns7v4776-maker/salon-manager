-- Public appointment readers must receive the canonical request/group identity
-- together with the timing already protected by the owner snapshot overlay.
-- Keep the existing overlay as the single authority so old app/web publishers,
-- direct client_portals writes and public reads all converge on the same shape.

begin;

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
      end as persisted_id,
      coalesce(
        nullif(trim(entry.item ->> 'bookingRequestId'), ''),
        nullif(trim(entry.item ->> 'booking_request_id'), '')
      ) as snapshot_booking_request_id,
      coalesce(
        nullif(trim(entry.item ->> 'appointmentGroupId'), ''),
        nullif(trim(entry.item ->> 'appointment_group_id'), '')
      ) as snapshot_appointment_group_id,
      coalesce(
        nullif(trim(entry.item ->> 'appointmentGroupOrder'), ''),
        nullif(trim(entry.item ->> 'appointment_group_order'), '')
      ) as snapshot_appointment_group_order
    from jsonb_array_elements(
      case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end
    ) with ordinality as entry(item, ordinality)
  ),
  projected as (
    select
      case
        when appointment.id is null then
          case
            when entries.snapshot_appointment_group_id is null
              then (
                entries.item
                - 'appointmentGroupOrder'
                - 'appointmentGroupSize'
                - 'appointment_group_order'
                - 'appointment_group_size'
              ) || case
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
            - 'bookingRequestId'
            - 'booking_request_id'
            - 'bookingOrigin'
            - 'booking_origin'
            - 'appointmentGroupId'
            - 'appointmentGroupOrder'
            - 'appointmentGroupSize'
            - 'appointment_group_id'
            - 'appointment_group_order'
            - 'appointment_group_size'
            - 'compositionId'
            - 'composition_id'
            - 'dependencyServiceId'
            - 'dependency_service_id'
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
              'bookingRequestId', appointment.booking_request_id,
              'bookingOrigin', case
                when lower(trim(coalesce(
                  booking_request.origin::text,
                  appointment.created_by,
                  'backoffice'
                ))) = 'frontend'
                  then 'frontend'
                else 'backoffice'
              end,
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
              end,
              'compositionId', coalesce(
                nullif(trim(appointment_group.metadata ->> 'compositionId'), ''),
                nullif(trim(entries.item ->> 'compositionId'), ''),
                nullif(trim(entries.item ->> 'composition_id'), '')
              ),
              'dependencyServiceId', coalesce(
                nullif(trim(appointment_group.metadata ->> 'dependencyServiceId'), ''),
                nullif(trim(entries.item ->> 'dependencyServiceId'), ''),
                nullif(trim(entries.item ->> 'dependency_service_id'), '')
              )
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
          case
            when entries.snapshot_booking_request_id is not null
              then 'request:' || entries.snapshot_booking_request_id
            when entries.snapshot_appointment_group_id is null
              then 'ungrouped'
            else 'group:' || entries.snapshot_appointment_group_id
          end,
          case
            when entries.snapshot_booking_request_id is not null
              then ''
            when entries.snapshot_appointment_group_id is null
              then ''
            else coalesce(entries.snapshot_appointment_group_order, '')
          end,
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
    left join public.booking_requests as booking_request
      on booking_request.workspace_id = p_workspace_id
     and booking_request.id = appointment.booking_request_id
    left join public.appointment_groups as appointment_group
      on appointment_group.workspace_id = p_workspace_id
     and appointment_group.id = appointment.appointment_group_id
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

comment on function public.overlay_canonical_appointment_timing_v1(uuid, jsonb) is
  'Canonicalizes appointment timing and public request/group/composition identity while preserving local-only snapshot rows.';

-- Public snapshot reads must not wait for the next owner publish before the
-- canonical identity becomes visible. Patch only the full snapshot RPC: the
-- shared owner-payload helper also sits on hot availability paths that do not
-- consume appointments and must not pay for this projection on every slot.
do $migration$
declare
  v_signature regprocedure :=
    'public.get_client_portal_snapshot(text)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text :=
    $anchor$'appuntamenti', coalesce(v_owner_payload -> 'appuntamenti', '[]'::jsonb),$anchor$;
  v_replacement text :=
    $replacement$'appuntamenti',
      public.overlay_canonical_appointment_timing_v1(
        v_workspace.id,
        coalesce(v_owner_payload -> 'appuntamenti', '[]'::jsonb)
      ),$replacement$;
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(
    'overlay_canonical_appointment_timing_v1' in v_definition
  ) = 0 then
    v_next := replace(v_definition, v_anchor, v_replacement);

    if v_next = v_definition then
      raise exception 'public_appointment_projection_anchor_missing';
    end if;

    execute v_next;
  end if;
end;
$migration$;

revoke all on function public.overlay_canonical_appointment_timing_v1(uuid, jsonb)
  from public, anon, authenticated;

-- Replacing internal helpers must not alter the intended public entrypoints.
grant execute on function public.get_client_portal_snapshot(text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
