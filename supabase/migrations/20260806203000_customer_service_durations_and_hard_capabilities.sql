-- Customer-specific service timing and universal operator capabilities.
-- Existing appointments keep their duration/phase snapshots unchanged.

create table if not exists public.customer_service_duration_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  duration_minutes integer,
  phase_config jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_service_duration_override_value_check check (
    (duration_minutes is not null and duration_minutes between 5 and 480 and duration_minutes % 5 = 0)
    or phase_config is not null
  ),
  unique (customer_id, service_id)
);

create index if not exists customer_service_duration_overrides_workspace_idx
  on public.customer_service_duration_overrides (workspace_id, customer_id, service_id);

alter table public.customer_service_duration_overrides enable row level security;
grant select, insert, update, delete on public.customer_service_duration_overrides to authenticated;

drop policy if exists "workspace data select" on public.customer_service_duration_overrides;
create policy "workspace data select"
on public.customer_service_duration_overrides for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data insert" on public.customer_service_duration_overrides;
create policy "workspace data insert"
on public.customer_service_duration_overrides for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data update" on public.customer_service_duration_overrides;
create policy "workspace data update"
on public.customer_service_duration_overrides for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data delete" on public.customer_service_duration_overrides;
create policy "workspace data delete"
on public.customer_service_duration_overrides for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

create or replace function public.resolve_customer_service_timing_v1(
  p_workspace_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_service_name text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_service public.services%rowtype;
  v_override public.customer_service_duration_overrides%rowtype;
  v_phase jsonb;
  v_duration integer;
begin
  select service.* into v_service
  from public.services as service
  where service.workspace_id = p_workspace_id
    and lower(trim(service.name)) = lower(trim(coalesce(p_service_name, '')))
  order by service.updated_at desc
  limit 1;

  if v_service.id is null then
    return jsonb_build_object(
      'serviceId', null,
      'durationMinutes', 60,
      'phaseConfig', null,
      'customized', false
    );
  end if;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = p_workspace_id
    and customer.is_active is not false
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is not null
    and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
      regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is not null then
    select duration_override.* into v_override
    from public.customer_service_duration_overrides as duration_override
    where duration_override.workspace_id = p_workspace_id
      and duration_override.customer_id = v_customer_id
      and duration_override.service_id = v_service.id
    limit 1;
  end if;

  v_phase := coalesce(v_override.phase_config, v_service.phase_config);
  if v_phase is not null and coalesce(v_phase ->> 'mode', '') = 'phased' then
    v_duration := greatest(coalesce((v_phase ->> 'initialDurationMinutes')::integer, 0), 5)
      + greatest(coalesce((v_phase ->> 'processingDurationMinutes')::integer, 0), 5)
      + case
          when coalesce((v_phase ->> 'finalPhaseEnabled')::boolean, true)
            then greatest(coalesce((v_phase ->> 'finalDurationMinutes')::integer, 0), 5)
          else 0
        end;
  else
    v_phase := null;
    v_duration := greatest(coalesce(v_override.duration_minutes, v_service.duration_minutes, 60), 5);
  end if;

  return jsonb_build_object(
    'serviceId', v_service.id,
    'durationMinutes', v_duration,
    'phaseConfig', v_phase,
    'customized', v_override.id is not null
  );
end;
$$;

revoke all on function public.resolve_customer_service_timing_v1(uuid, text, text, text) from public;
grant execute on function public.resolve_customer_service_timing_v1(uuid, text, text, text)
  to anon, authenticated;

create or replace function public.get_public_customer_service_duration_overrides_v1(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_result jsonb;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then return '{}'::jsonb; end if;
  if nullif(lower(trim(coalesce(p_customer_email, ''))), '') is null
    or nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is null
  then
    return '{}'::jsonb;
  end if;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.is_active is not false
    and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
      regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is null then return '{}'::jsonb; end if;

  select coalesce(
    jsonb_object_agg(
      duration_override.service_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'serviceId', duration_override.service_id,
        'durationMinutes', duration_override.duration_minutes,
        'phaseConfig', duration_override.phase_config
      ))
    ),
    '{}'::jsonb
  ) into v_result
  from public.customer_service_duration_overrides as duration_override
  where duration_override.workspace_id = v_workspace_id
    and duration_override.customer_id = v_customer_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_public_customer_service_duration_overrides_v1(text, text, text)
  from public;
grant execute on function public.get_public_customer_service_duration_overrides_v1(text, text, text)
  to anon, authenticated;

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
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  v_timing := public.resolve_customer_service_timing_v1(
    v_workspace_id, p_customer_email::text, p_customer_phone, p_requested_service_name
  );
  v_duration := greatest(coalesce((v_timing ->> 'durationMinutes')::integer,
    p_requested_duration_minutes, 60), 5);

  return public.create_public_booking_request_ultralight_v3(
    p_salon_code, p_requested_service_name, p_requested_price, v_duration,
    p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
    p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
    p_required_role, p_operator_id, p_operator_name
  );
end;
$$;

grant execute on function public.create_public_booking_request_ultralight_v4(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text
) to anon, authenticated;

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
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  v_timing := public.resolve_customer_service_timing_v1(
    v_workspace_id, p_customer_email::text, p_customer_phone, p_requested_service_name
  );
  v_duration := greatest(coalesce((v_timing ->> 'durationMinutes')::integer,
    p_requested_duration_minutes, 60), 5);
  v_phase := coalesce(v_timing -> 'phaseConfig', p_phase_snapshot);

  return public.create_public_phased_booking_request_v4(
    p_salon_code, p_requested_service_name, p_requested_price, v_duration,
    p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
    p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
    p_required_role, p_operator_id, p_operator_name, v_phase
  );
end;
$$;

grant execute on function public.create_public_phased_booking_request_v5(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, jsonb
) to anon, authenticated;

create or replace function public.create_owner_appointment_ultralight_v3(
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_create_booking_request boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_salon_code text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_required_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null then raise exception 'workspace_access_denied'; end if;

  if nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null
  then
    if not public.public_operator_can_book_service_v1(
      v_workspace_id, p_operator_id, p_operator_name, p_service_name, p_required_role
    ) then
      raise exception 'operator_service_not_enabled:%', coalesce(p_service_name, '');
    end if;
  end if;

  return public.create_owner_appointment_ultralight_v2(
    p_customer_name, p_customer_phone, p_customer_email, p_customer_instagram,
    p_customer_note, p_customer_source, p_create_customer_record,
    p_create_booking_request, p_service_name, p_price, p_duration_minutes,
    p_appointment_date, p_appointment_time, p_salon_code, p_operator_id,
    p_operator_name, p_required_role
  );
end;
$$;

grant execute on function public.create_owner_appointment_ultralight_v3(
  text, text, citext, text, text, text, boolean, boolean, text, numeric,
  integer, date, time, text, text, text, text
) to authenticated;

create or replace function public.create_owner_phased_appointment_v2(
  p_customer_name text,
  p_customer_phone text default null,
  p_customer_email citext default null,
  p_customer_instagram text default null,
  p_customer_note text default null,
  p_customer_source text default 'salon',
  p_create_customer_record boolean default false,
  p_create_booking_request boolean default false,
  p_service_name text default null,
  p_price numeric default 0,
  p_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_salon_code text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_required_role text default null,
  p_phase_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null then raise exception 'workspace_access_denied'; end if;

  if nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null
  then
    if not public.public_operator_can_book_service_v1(
      v_workspace_id, p_operator_id, p_operator_name, p_service_name, p_required_role
    ) then
      raise exception 'operator_service_not_enabled:%', coalesce(p_service_name, '');
    end if;
  end if;

  return public.create_owner_phased_appointment_v1(
    p_customer_name, p_customer_phone, p_customer_email, p_customer_instagram,
    p_customer_note, p_customer_source, p_create_customer_record,
    p_create_booking_request, p_service_name, p_price, p_duration_minutes,
    p_appointment_date, p_appointment_time, p_salon_code, p_operator_id,
    p_operator_name, p_required_role, p_phase_snapshot
  );
end;
$$;

grant execute on function public.create_owner_phased_appointment_v2(
  text, text, citext, text, text, text, boolean, boolean, text, numeric,
  integer, date, time, text, text, text, text, jsonb
) to authenticated;

create or replace function public.create_owner_appointment_group_v2(
  p_salon_code text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email citext,
  p_customer_instagram text,
  p_customer_note text,
  p_customer_source text,
  p_group_title text,
  p_items jsonb,
  p_idempotency_key text,
  p_create_customer_record boolean,
  p_create_booking_requests boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_item jsonb;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null then raise exception 'workspace_access_denied'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'invalid_group_items'; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if nullif(trim(coalesce(v_item ->> 'operatorId', '')), '') is not null
      or nullif(trim(coalesce(v_item ->> 'operatorName', '')), '') is not null
    then
      if not public.public_operator_can_book_service_v1(
        v_workspace_id,
        v_item ->> 'operatorId',
        v_item ->> 'operatorName',
        v_item ->> 'serviceName',
        v_item ->> 'requiredRole'
      ) then
        raise exception 'operator_service_not_enabled:%', coalesce(v_item ->> 'serviceName', '');
      end if;
    end if;
  end loop;

  return public.create_owner_appointment_group_v1(
    p_salon_code, p_customer_name, p_customer_phone, p_customer_email,
    p_customer_instagram, p_customer_note, p_customer_source, p_group_title,
    p_items, p_idempotency_key, p_create_customer_record, p_create_booking_requests
  );
end;
$$;

revoke all on function public.create_owner_appointment_group_v2(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean, boolean
) from public;
grant execute on function public.create_owner_appointment_group_v2(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
