-- Modular owner-created appointments.
-- Every selected service remains an independent appointment; the group only
-- provides a stable relationship between the rows and an atomic create path.

create table if not exists public.appointment_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  title text not null default '',
  source text not null default 'salon' check (source in ('salon', 'frontend')),
  status text not null default 'active' check (status in ('active', 'cancelled', 'completed')),
  total_price numeric(10, 2) not null default 0 check (total_price >= 0),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, idempotency_key)
);

alter table public.appointments
  add column if not exists appointment_group_id uuid
    references public.appointment_groups(id) on delete set null,
  add column if not exists appointment_group_order integer,
  add column if not exists appointment_group_size integer;

alter table public.booking_requests
  add column if not exists appointment_group_id uuid
    references public.appointment_groups(id) on delete set null,
  add column if not exists appointment_group_order integer,
  add column if not exists appointment_group_size integer;

create index if not exists appointments_group_idx
  on public.appointments (workspace_id, appointment_group_id, appointment_group_order);

create index if not exists booking_requests_group_idx
  on public.booking_requests (workspace_id, appointment_group_id, appointment_group_order);

-- Private reusable compositions. They are deliberately salon-only by default;
-- exposing a package to customers must be an explicit future action.
create table if not exists public.service_compositions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  visibility text not null default 'salon_only'
    check (visibility in ('salon_only', 'public')),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, name)
);

create table if not exists public.service_composition_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  composition_id uuid not null references public.service_compositions(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  position integer not null check (position >= 0),
  link_type text not null default 'required'
    check (link_type in ('required', 'suggested')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (composition_id, service_id),
  unique (composition_id, position)
);

create index if not exists service_compositions_workspace_idx
  on public.service_compositions (workspace_id, is_active, name);

create index if not exists service_composition_items_workspace_idx
  on public.service_composition_items (workspace_id, composition_id, position);

alter table public.appointment_groups enable row level security;
alter table public.service_compositions enable row level security;
alter table public.service_composition_items enable row level security;

grant select, insert, update, delete on public.appointment_groups to authenticated;
grant select, insert, update, delete on public.service_compositions to authenticated;
grant select, insert, update, delete on public.service_composition_items to authenticated;

drop policy if exists "workspace data select" on public.appointment_groups;
create policy "workspace data select" on public.appointment_groups for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data insert" on public.appointment_groups;
create policy "workspace data insert" on public.appointment_groups for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data update" on public.appointment_groups;
create policy "workspace data update" on public.appointment_groups for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data delete" on public.appointment_groups;
create policy "workspace data delete" on public.appointment_groups for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data select" on public.service_compositions;
create policy "workspace data select" on public.service_compositions for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data insert" on public.service_compositions;
create policy "workspace data insert" on public.service_compositions for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data update" on public.service_compositions;
create policy "workspace data update" on public.service_compositions for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data delete" on public.service_compositions;
create policy "workspace data delete" on public.service_compositions for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data select" on public.service_composition_items;
create policy "workspace data select" on public.service_composition_items for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data insert" on public.service_composition_items;
create policy "workspace data insert" on public.service_composition_items for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data update" on public.service_composition_items;
create policy "workspace data update" on public.service_composition_items for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data delete" on public.service_composition_items;
create policy "workspace data delete" on public.service_composition_items for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

create or replace function public.create_owner_appointment_group_v1(
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
  v_group_id uuid;
  v_customer_id uuid;
  v_item jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_appointment_ids jsonb := '[]'::jsonb;
  v_booking_request_ids jsonb := '[]'::jsonb;
  v_appointment_id uuid;
  v_booking_request_id uuid;
  v_index integer := 0;
  v_size integer;
  v_total_price numeric(10, 2) := 0;
  v_phase_snapshot jsonb;
  v_date date;
  v_time time;
  v_duration integer;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_group_items';
  end if;

  v_size := jsonb_array_length(p_items);
  if v_size < 2 or v_size > 20 then
    raise exception 'invalid_group_size';
  end if;

  if nullif(lower(trim(coalesce(p_salon_code, ''))), '') is not null then
    select workspace.id
    into v_workspace_id
    from public.workspaces as workspace
    join public.workspace_members as member on member.workspace_id = workspace.id
    where member.user_id = auth.uid()
      and workspace.slug = lower(trim(p_salon_code))
      and workspace.subscription_status in ('demo', 'active')
    limit 1;
  else
    v_workspace_id := public.current_workspace_id();
  end if;

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  if nullif(trim(coalesce(p_idempotency_key, '')), '') is not null then
    select appointment_group.id
    into v_group_id
    from public.appointment_groups as appointment_group
    where appointment_group.workspace_id = v_workspace_id
      and appointment_group.idempotency_key = trim(p_idempotency_key)
    limit 1;

    if v_group_id is not null then
      select coalesce(jsonb_agg(appointment.id order by appointment.appointment_group_order), '[]'::jsonb)
      into v_appointment_ids
      from public.appointments as appointment
      where appointment.appointment_group_id = v_group_id;

      select coalesce(jsonb_agg(request.id order by request.appointment_group_order), '[]'::jsonb)
      into v_booking_request_ids
      from public.booking_requests as request
      where request.appointment_group_id = v_group_id;

      return jsonb_build_object(
        'groupId', v_group_id,
        'appointmentIds', v_appointment_ids,
        'bookingRequestIds', v_booking_request_ids,
        'idempotent', true
      );
    end if;
  end if;

  insert into public.appointment_groups (
    workspace_id,
    title,
    source,
    idempotency_key,
    metadata
  ) values (
    v_workspace_id,
    trim(coalesce(p_group_title, '')),
    case when lower(trim(coalesce(p_customer_source, ''))) = 'frontend' then 'frontend' else 'salon' end,
    nullif(trim(coalesce(p_idempotency_key, '')), ''),
    jsonb_build_object('itemCount', v_size)
  )
  returning id into v_group_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;

    if nullif(trim(coalesce(v_item ->> 'serviceName', '')), '') is null then
      raise exception 'service_name_required';
    end if;
    if coalesce(v_item ->> 'appointmentDate', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or coalesce(v_item ->> 'appointmentTime', '') !~ '^[0-9]{2}:[0-9]{2}(:[0-9]{2})?$'
    then
      raise exception 'appointment_datetime_required';
    end if;

    v_date := (v_item ->> 'appointmentDate')::date;
    v_time := (v_item ->> 'appointmentTime')::time;
    v_duration := greatest(coalesce(nullif(v_item ->> 'durationMinutes', '')::integer, 60), 1);
    v_phase_snapshot := case
      when jsonb_typeof(v_item -> 'phaseSnapshot') = 'object'
        and coalesce(v_item -> 'phaseSnapshot', '{}'::jsonb) <> '{}'::jsonb
      then v_item -> 'phaseSnapshot'
      else null
    end;

    if v_phase_snapshot is not null then
      v_result := public.create_owner_phased_appointment_v1(
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_customer_instagram,
        p_customer_note,
        p_customer_source,
        p_create_customer_record and v_index = 1,
        p_create_booking_requests,
        trim(v_item ->> 'serviceName'),
        greatest(coalesce(nullif(v_item ->> 'price', '')::numeric, 0), 0),
        v_duration,
        v_date,
        v_time,
        p_salon_code,
        nullif(trim(coalesce(v_item ->> 'operatorId', '')), ''),
        nullif(trim(coalesce(v_item ->> 'operatorName', '')), ''),
        nullif(trim(coalesce(v_item ->> 'requiredRole', '')), ''),
        v_phase_snapshot
      );
    else
      v_result := public.create_owner_appointment_ultralight_v2(
        p_customer_name,
        p_customer_phone,
        p_customer_email,
        p_customer_instagram,
        p_customer_note,
        p_customer_source,
        p_create_customer_record and v_index = 1,
        p_create_booking_requests,
        trim(v_item ->> 'serviceName'),
        greatest(coalesce(nullif(v_item ->> 'price', '')::numeric, 0), 0),
        v_duration,
        v_date,
        v_time,
        p_salon_code,
        nullif(trim(coalesce(v_item ->> 'operatorId', '')), ''),
        nullif(trim(coalesce(v_item ->> 'operatorName', '')), ''),
        nullif(trim(coalesce(v_item ->> 'requiredRole', '')), '')
      );
    end if;

    v_appointment_id := nullif(v_result ->> 'appointmentId', '')::uuid;
    v_booking_request_id := nullif(v_result ->> 'bookingRequestId', '')::uuid;
    v_customer_id := coalesce(v_customer_id, nullif(v_result ->> 'customerId', '')::uuid);
    v_total_price := v_total_price + greatest(coalesce(nullif(v_item ->> 'price', '')::numeric, 0), 0);

    if v_appointment_id is null then
      raise exception 'appointment_group_item_not_created';
    end if;

    update public.appointments
    set appointment_group_id = v_group_id,
        appointment_group_order = v_index,
        appointment_group_size = v_size
    where id = v_appointment_id
      and workspace_id = v_workspace_id;

    if v_booking_request_id is not null then
      update public.booking_requests
      set appointment_group_id = v_group_id,
          appointment_group_order = v_index,
          appointment_group_size = v_size,
          updated_at = timezone('utc', now())
      where id = v_booking_request_id
        and workspace_id = v_workspace_id;
    end if;

    v_appointment_ids := v_appointment_ids || jsonb_build_array(v_appointment_id);
    if v_booking_request_id is not null then
      v_booking_request_ids := v_booking_request_ids || jsonb_build_array(v_booking_request_id);
    end if;
    v_results := v_results || jsonb_build_array(
      v_result || jsonb_build_object('position', v_index)
    );
  end loop;

  update public.appointment_groups
  set customer_id = v_customer_id,
      total_price = v_total_price,
      updated_at = timezone('utc', now())
  where id = v_group_id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);

  return jsonb_build_object(
    'groupId', v_group_id,
    'workspaceId', v_workspace_id,
    'customerId', v_customer_id,
    'appointmentIds', v_appointment_ids,
    'bookingRequestIds', v_booking_request_ids,
    'items', v_results,
    'idempotent', false
  );
end;
$$;

revoke all on function public.create_owner_appointment_group_v1(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean, boolean
) from public;

grant execute on function public.create_owner_appointment_group_v1(
  text, text, text, citext, text, text, text, text, jsonb, text, boolean, boolean
) to authenticated;
