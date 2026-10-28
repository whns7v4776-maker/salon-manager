-- Keep the public booking wrappers JSON-based without relying on PostgreSQL's
-- textual representation of a composite booking_requests row. A composite is
-- formatted as "(...)"; assigning it directly to jsonb raises 22P02.

create or replace function public.create_public_booking_request_ultralight_v4(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default '',
  p_customer_surname text default '',
  p_customer_email citext default '',
  p_customer_phone text default '',
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_timing jsonb;
  v_duration integer;
  v_request public.booking_requests%rowtype;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  v_timing := public.resolve_customer_service_timing_v1(
    v_workspace_id,
    p_customer_email::text,
    p_customer_phone,
    p_requested_service_name
  );
  v_duration := greatest(
    coalesce(
      (v_timing ->> 'durationMinutes')::integer,
      p_requested_duration_minutes,
      60
    ),
    5
  );

  v_request := public.create_public_booking_request_ultralight_v3(
    p_salon_code,
    p_requested_service_name,
    p_requested_price,
    v_duration,
    p_appointment_date,
    p_appointment_time,
    p_customer_name,
    p_customer_surname,
    p_customer_email,
    p_customer_phone,
    p_customer_instagram,
    p_notes,
    p_required_role,
    p_operator_id,
    p_operator_name
  );

  return to_jsonb(v_request);
end;
$$;

create or replace function public.create_public_phased_booking_request_v5(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default '',
  p_customer_surname text default '',
  p_customer_email citext default '',
  p_customer_phone text default '',
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_phase_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_timing jsonb;
  v_duration integer;
  v_phase jsonb;
  v_request public.booking_requests%rowtype;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  v_timing := public.resolve_customer_service_timing_v1(
    v_workspace_id,
    p_customer_email::text,
    p_customer_phone,
    p_requested_service_name
  );
  v_duration := greatest(
    coalesce(
      (v_timing ->> 'durationMinutes')::integer,
      p_requested_duration_minutes,
      60
    ),
    5
  );
  v_phase := coalesce(v_timing -> 'phaseConfig', p_phase_snapshot);

  v_request := public.create_public_phased_booking_request_v4(
    p_salon_code,
    p_requested_service_name,
    p_requested_price,
    v_duration,
    p_appointment_date,
    p_appointment_time,
    p_customer_name,
    p_customer_surname,
    p_customer_email,
    p_customer_phone,
    p_customer_instagram,
    p_notes,
    p_required_role,
    p_operator_id,
    p_operator_name,
    v_phase
  );

  return to_jsonb(v_request);
end;
$$;

grant execute on function public.create_public_booking_request_ultralight_v4(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text
) to anon, authenticated;

grant execute on function public.create_public_phased_booking_request_v5(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
