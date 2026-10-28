-- Customer-specific prices use the same identity and service scope as timing overrides.
-- Existing appointments keep their saved price snapshot unchanged.

create table if not exists public.customer_service_price_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  price numeric(10, 2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint customer_service_price_override_value_check check (price between 0 and 9999),
  unique (customer_id, service_id)
);

create index if not exists customer_service_price_overrides_workspace_idx
  on public.customer_service_price_overrides (workspace_id, customer_id, service_id);

alter table public.customer_service_price_overrides enable row level security;
grant select, insert, update, delete on public.customer_service_price_overrides to authenticated;

drop policy if exists "workspace data select" on public.customer_service_price_overrides;
create policy "workspace data select"
on public.customer_service_price_overrides for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data insert" on public.customer_service_price_overrides;
create policy "workspace data insert"
on public.customer_service_price_overrides for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data update" on public.customer_service_price_overrides;
create policy "workspace data update"
on public.customer_service_price_overrides for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data delete" on public.customer_service_price_overrides;
create policy "workspace data delete"
on public.customer_service_price_overrides for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

create or replace function public.resolve_customer_service_price_v1(
  p_workspace_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_service_name text,
  p_fallback_price numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_service_id uuid;
  v_override_price numeric;
begin
  select service.id into v_service_id
  from public.services as service
  where service.workspace_id = p_workspace_id
    and lower(trim(service.name)) = lower(trim(coalesce(p_service_name, '')))
  order by service.updated_at desc
  limit 1;

  if v_service_id is null then
    return jsonb_build_object(
      'serviceId', null,
      'price', greatest(coalesce(p_fallback_price, 0), 0),
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
    select price_override.price into v_override_price
    from public.customer_service_price_overrides as price_override
    where price_override.workspace_id = p_workspace_id
      and price_override.customer_id = v_customer_id
      and price_override.service_id = v_service_id
    limit 1;
  end if;

  return jsonb_build_object(
    'serviceId', v_service_id,
    'price', greatest(coalesce(v_override_price, p_fallback_price, 0), 0),
    'customized', v_override_price is not null
  );
end;
$$;

revoke all on function public.resolve_customer_service_price_v1(uuid, text, text, text, numeric)
  from public;
grant execute on function public.resolve_customer_service_price_v1(uuid, text, text, text, numeric)
  to anon, authenticated;

create or replace function public.get_public_customer_service_price_overrides_v1(
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
      price_override.service_id::text,
      jsonb_build_object(
        'serviceId', price_override.service_id,
        'price', price_override.price
      )
    ),
    '{}'::jsonb
  ) into v_result
  from public.customer_service_price_overrides as price_override
  where price_override.workspace_id = v_workspace_id
    and price_override.customer_id = v_customer_id;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.get_public_customer_service_price_overrides_v1(text, text, text)
  from public;
grant execute on function public.get_public_customer_service_price_overrides_v1(text, text, text)
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
  v_price jsonb;
  v_duration integer;
  v_requested_price numeric;
  v_request public.booking_requests%rowtype;
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
  v_price := public.resolve_customer_service_price_v1(
    v_workspace_id, p_customer_email::text, p_customer_phone,
    p_requested_service_name, p_requested_price
  );
  v_duration := greatest(coalesce((v_timing ->> 'durationMinutes')::integer,
    p_requested_duration_minutes, 60), 5);
  v_requested_price := greatest(coalesce((v_price ->> 'price')::numeric,
    p_requested_price, 0), 0);

  v_request := public.create_public_booking_request_ultralight_v3(
    p_salon_code, p_requested_service_name, v_requested_price, v_duration,
    p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
    p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
    p_required_role, p_operator_id, p_operator_name
  );

  return to_jsonb(v_request);
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
  v_price jsonb;
  v_duration integer;
  v_requested_price numeric;
  v_phase jsonb;
  v_request public.booking_requests%rowtype;
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
  v_price := public.resolve_customer_service_price_v1(
    v_workspace_id, p_customer_email::text, p_customer_phone,
    p_requested_service_name, p_requested_price
  );
  v_duration := greatest(coalesce((v_timing ->> 'durationMinutes')::integer,
    p_requested_duration_minutes, 60), 5);
  v_requested_price := greatest(coalesce((v_price ->> 'price')::numeric,
    p_requested_price, 0), 0);
  v_phase := coalesce(v_timing -> 'phaseConfig', p_phase_snapshot);

  v_request := public.create_public_phased_booking_request_v4(
    p_salon_code, p_requested_service_name, v_requested_price, v_duration,
    p_appointment_date, p_appointment_time, p_customer_name, p_customer_surname,
    p_customer_email, p_customer_phone, p_customer_instagram, p_notes,
    p_required_role, p_operator_id, p_operator_name, v_phase
  );

  return to_jsonb(v_request);
end;
$$;

grant execute on function public.create_public_phased_booking_request_v5(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
