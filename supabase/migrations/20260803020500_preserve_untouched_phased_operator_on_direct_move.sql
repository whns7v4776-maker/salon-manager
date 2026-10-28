create or replace function public.move_owner_appointment_direct_v2(
  p_appointment_id uuid,
  p_next_appointment_date date,
  p_next_appointment_time time,
  p_next_initial_operator_id text default null,
  p_next_initial_operator_name text default null,
  p_next_final_operator_id text default null,
  p_next_final_operator_name text default null,
  p_scope text default 'whole',
  p_allow_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment public.appointments%rowtype;
  v_preserved_initial_id text;
  v_preserved_initial_name text;
  v_preserved_final_id text;
  v_preserved_final_name text;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if p_scope not in ('whole', 'initial', 'final') then
    raise exception 'invalid_scope';
  end if;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_appointment_id
  for update;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  if p_scope <> 'whole'
    and coalesce(v_appointment.phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'appointment_not_phased';
  end if;

  v_preserved_initial_id := coalesce(
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'id'), ''),
    nullif(trim(v_appointment.operator_id), '')
  );
  v_preserved_initial_name := coalesce(
    nullif(trim(v_appointment.phase_operator_assignments -> 'initial' ->> 'name'), ''),
    nullif(trim(v_appointment.operator_name), '')
  );
  v_preserved_final_id := coalesce(
    nullif(trim(v_appointment.phase_operator_assignments -> 'final' ->> 'id'), ''),
    nullif(trim(v_appointment.operator_id), '')
  );
  v_preserved_final_name := coalesce(
    nullif(trim(v_appointment.phase_operator_assignments -> 'final' ->> 'name'), ''),
    nullif(trim(v_appointment.operator_name), '')
  );

  -- Uno spostamento di fase e' phase-authoritative: il client non puo' mai
  -- riscrivere l'altra fase con uno snapshot locale vecchio o con un ID legacy.
  if p_scope = 'initial' then
    p_next_final_operator_id := v_preserved_final_id;
    p_next_final_operator_name := v_preserved_final_name;
  elsif p_scope = 'final' then
    p_next_initial_operator_id := v_preserved_initial_id;
    p_next_initial_operator_name := v_preserved_initial_name;
  end if;

  return public.move_owner_appointment_direct_v1(
    p_appointment_id,
    p_next_appointment_date,
    p_next_appointment_time,
    p_next_initial_operator_id,
    p_next_initial_operator_name,
    p_next_final_operator_id,
    p_next_final_operator_name,
    p_scope,
    p_allow_overlap
  );
end;
$$;

revoke all on function public.move_owner_appointment_direct_v2(
  uuid, date, time, text, text, text, text, text, boolean
) from public;

grant execute on function public.move_owner_appointment_direct_v2(
  uuid, date, time, text, text, text, text, text, boolean
) to authenticated;

notify pgrst, 'reload schema';
