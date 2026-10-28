-- Per-service public booking eligibility for operators.
-- This policy is intentionally limited to public/customer booking RPCs:
-- owner-side manual assignment remains governed only by the operator role.

create table if not exists public.operator_public_booking_policies (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  operator_id uuid not null,
  mode text not null default 'all_role' check (mode in ('all_role', 'selected')),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, operator_id)
);

create table if not exists public.operator_public_service_links (
  workspace_id uuid not null,
  operator_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, operator_id, service_id),
  foreign key (workspace_id, operator_id)
    references public.operator_public_booking_policies(workspace_id, operator_id)
    on delete cascade
);

create index if not exists operator_public_service_links_service_idx
  on public.operator_public_service_links (workspace_id, service_id, operator_id);

alter table public.operator_public_booking_policies enable row level security;
alter table public.operator_public_service_links enable row level security;

grant select, insert, update, delete
  on public.operator_public_booking_policies to authenticated;
grant select, insert, update, delete
  on public.operator_public_service_links to authenticated;

drop policy if exists "workspace data select" on public.operator_public_booking_policies;
create policy "workspace data select"
on public.operator_public_booking_policies for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data insert" on public.operator_public_booking_policies;
create policy "workspace data insert"
on public.operator_public_booking_policies for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data update" on public.operator_public_booking_policies;
create policy "workspace data update"
on public.operator_public_booking_policies for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data delete" on public.operator_public_booking_policies;
create policy "workspace data delete"
on public.operator_public_booking_policies for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data select" on public.operator_public_service_links;
create policy "workspace data select"
on public.operator_public_service_links for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data insert" on public.operator_public_service_links;
create policy "workspace data insert"
on public.operator_public_service_links for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data update" on public.operator_public_service_links;
create policy "workspace data update"
on public.operator_public_service_links for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data delete" on public.operator_public_service_links;
create policy "workspace data delete"
on public.operator_public_service_links for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

create or replace function public.public_operator_can_book_service_v1(
  p_workspace_id uuid,
  p_operator_id text,
  p_operator_name text,
  p_requested_service_name text,
  p_required_role text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_operator_id uuid;
  v_service_id uuid;
  v_mode text;
begin
  select operator.id
  into v_operator_id
  from public.operators as operator
  where operator.workspace_id = p_workspace_id
    and (
      (
        trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and operator.id = case
          when trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then trim(p_operator_id)::uuid
          else null
        end
      )
      or lower(trim(operator.name)) = lower(trim(coalesce(p_operator_name, '')))
    )
    and (
      nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
      or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
    )
  order by case when operator.id::text = trim(coalesce(p_operator_id, '')) then 0 else 1 end
  limit 1;

  if v_operator_id is null then
    return false;
  end if;

  select service.id
  into v_service_id
  from public.services as service
  where service.workspace_id = p_workspace_id
    and lower(trim(service.name)) = lower(trim(coalesce(p_requested_service_name, '')))
    and coalesce(service.is_online, true)
    and (
      nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
      or nullif(lower(trim(coalesce(service.required_role, ''))), '') is null
      or lower(trim(coalesce(service.required_role, ''))) = lower(trim(p_required_role))
    )
  order by case
    when lower(trim(coalesce(service.required_role, ''))) = lower(trim(coalesce(p_required_role, '')))
      then 0
    else 1
  end
  limit 1;

  -- Legacy workspaces and services stay open until the salon saves a policy.
  if v_service_id is null then
    return true;
  end if;

  select policy.mode
  into v_mode
  from public.operator_public_booking_policies as policy
  where policy.workspace_id = p_workspace_id
    and policy.operator_id = v_operator_id;

  if coalesce(v_mode, 'all_role') = 'all_role' then
    return true;
  end if;

  return exists (
    select 1
    from public.operator_public_service_links as link
    where link.workspace_id = p_workspace_id
      and link.operator_id = v_operator_id
      and link.service_id = v_service_id
  );
end;
$$;

revoke all on function public.public_operator_can_book_service_v1(uuid, text, text, text, text)
  from public;

create or replace function public.get_public_booking_slot_availability_batch_v2(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_interval jsonb;
  v_slot_time text;
  v_interval_time text;
  v_interval_duration integer;
  v_available boolean;
  v_operator public.operators%rowtype;
  v_has_role_operators boolean;
  v_explicit boolean :=
    nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null;
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or jsonb_typeof(p_slot_requests) <> 'array'
  then
    return v_result;
  end if;

  if v_explicit and not public.public_operator_can_book_service_v1(
    p_workspace_id, p_requested_operator_id, p_requested_operator_name,
    p_requested_service_name, p_required_role
  ) then
    for v_slot in select value from jsonb_array_elements(p_slot_requests)
    loop
      v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
      if v_slot_time <> '' then
        v_result := v_result || jsonb_build_object(v_slot_time, false);
      end if;
    end loop;
    return v_result;
  end if;

  if v_explicit then
    return public.get_public_booking_slot_availability_batch(
      p_workspace_id, p_appointment_date, p_slot_requests, p_requested_service_name,
      p_requested_operator_id, p_requested_operator_name
    );
  end if;

  select exists (
    select 1 from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
  ) into v_has_role_operators;

  if not v_has_role_operators then
    return public.get_public_booking_slot_availability_batch(
      p_workspace_id, p_appointment_date, p_slot_requests, p_requested_service_name, null, null
    );
  end if;

  for v_slot in select value from jsonb_array_elements(p_slot_requests)
  loop
    v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
    v_available := false;

    if v_slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      and jsonb_typeof(v_slot -> 'intervals') = 'array'
      and jsonb_array_length(v_slot -> 'intervals') > 0
    then
      for v_operator in
        select operator.* from public.operators as operator
        where operator.workspace_id = p_workspace_id
          and (
            nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
            or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
          )
          and public.public_operator_can_book_service_v1(
            p_workspace_id, operator.id::text, operator.name,
            p_requested_service_name, p_required_role
          )
        order by operator.created_at, operator.name
      loop
        v_available := true;
        for v_interval in select value from jsonb_array_elements(v_slot -> 'intervals')
        loop
          v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
          v_interval_duration := case
            when coalesce(v_interval ->> 'durationMinutes', '') ~ '^[0-9]+$'
              then (v_interval ->> 'durationMinutes')::integer
            else 0
          end;
          if v_interval_time !~ '^[0-2][0-9]:[0-5][0-9]$'
            or v_interval_duration <= 0
            or not public.is_public_booking_slot_available(
              p_workspace_id, p_appointment_date, v_interval_time::time,
              v_interval_duration, p_requested_service_name,
              v_operator.id::text, v_operator.name
            )
          then
            v_available := false;
            exit;
          end if;
        end loop;
        exit when v_available;
      end loop;
    end if;

    if v_slot_time <> '' then
      v_result := v_result || jsonb_build_object(v_slot_time, v_available);
    end if;
  end loop;

  return v_result;
end;
$$;

grant execute on function public.get_public_booking_slot_availability_batch_v2(
  uuid, date, jsonb, text, text, text, text
) to anon, authenticated;

create or replace function public.get_public_phased_booking_slot_availability_batch_v3(
  p_workspace_id uuid,
  p_appointment_date date,
  p_slot_requests jsonb,
  p_requested_service_name text default null,
  p_required_role text default null,
  p_requested_operator_id text default null,
  p_requested_operator_name text default null,
  p_allow_split_operators boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_slot jsonb;
  v_interval jsonb;
  v_slot_time text;
  v_interval_time text;
  v_interval_duration integer;
  v_available boolean;
  v_operator public.operators%rowtype;
  v_has_role_operators boolean;
  v_explicit boolean :=
    nullif(trim(coalesce(p_requested_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_requested_operator_name, '')), '') is not null;
begin
  if p_workspace_id is null
    or p_appointment_date is null
    or jsonb_typeof(p_slot_requests) <> 'array'
  then
    return v_result;
  end if;

  if v_explicit then
    if not public.public_operator_can_book_service_v1(
      p_workspace_id, p_requested_operator_id, p_requested_operator_name,
      p_requested_service_name, p_required_role
    ) then
      for v_slot in select value from jsonb_array_elements(p_slot_requests)
      loop
        v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
        if v_slot_time <> '' then
          v_result := v_result || jsonb_build_object(v_slot_time, false);
        end if;
      end loop;
      return v_result;
    end if;

    return public.get_public_phased_booking_slot_availability_batch_v2(
      p_workspace_id, p_appointment_date, p_slot_requests, p_requested_service_name,
      p_required_role, p_requested_operator_id, p_requested_operator_name,
      p_allow_split_operators
    );
  end if;

  select exists (
    select 1 from public.operators as operator
    where operator.workspace_id = p_workspace_id
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
  ) into v_has_role_operators;

  if not v_has_role_operators then
    return public.get_public_phased_booking_slot_availability_batch_v2(
      p_workspace_id, p_appointment_date, p_slot_requests, p_requested_service_name,
      p_required_role, null, null, p_allow_split_operators
    );
  end if;

  for v_slot in select value from jsonb_array_elements(p_slot_requests)
  loop
    v_slot_time := trim(coalesce(v_slot ->> 'slotTime', ''));
    v_available := false;

    if v_slot_time ~ '^[0-2][0-9]:[0-5][0-9]$'
      and jsonb_typeof(v_slot -> 'intervals') = 'array'
      and jsonb_array_length(v_slot -> 'intervals') > 0
    then
      if coalesce(p_allow_split_operators, true) then
        v_available := true;
        for v_interval in select value from jsonb_array_elements(v_slot -> 'intervals')
        loop
          v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
          v_interval_duration := case
            when coalesce(v_interval ->> 'durationMinutes', '') ~ '^[0-9]+$'
              then (v_interval ->> 'durationMinutes')::integer
            else 0
          end;
          if v_interval_time !~ '^[0-2][0-9]:[0-5][0-9]$'
            or v_interval_duration <= 0
            or not exists (
              select 1 from public.operators as operator
              where operator.workspace_id = p_workspace_id
                and (
                  nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
                  or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
                )
                and public.public_operator_can_book_service_v1(
                  p_workspace_id, operator.id::text, operator.name,
                  p_requested_service_name, p_required_role
                )
                and public.is_public_booking_slot_available(
                  p_workspace_id, p_appointment_date, v_interval_time::time,
                  v_interval_duration, p_requested_service_name,
                  operator.id::text, operator.name
                )
            )
          then
            v_available := false;
            exit;
          end if;
        end loop;
      else
        for v_operator in
          select operator.* from public.operators as operator
          where operator.workspace_id = p_workspace_id
            and (
              nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
              or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
            )
            and public.public_operator_can_book_service_v1(
              p_workspace_id, operator.id::text, operator.name,
              p_requested_service_name, p_required_role
            )
          order by operator.created_at, operator.name
        loop
          v_available := true;
          for v_interval in select value from jsonb_array_elements(v_slot -> 'intervals')
          loop
            v_interval_time := trim(coalesce(v_interval ->> 'time', ''));
            v_interval_duration := case
              when coalesce(v_interval ->> 'durationMinutes', '') ~ '^[0-9]+$'
                then (v_interval ->> 'durationMinutes')::integer
              else 0
            end;
            if v_interval_time !~ '^[0-2][0-9]:[0-5][0-9]$'
              or v_interval_duration <= 0
              or not public.is_public_booking_slot_available(
                p_workspace_id, p_appointment_date, v_interval_time::time,
                v_interval_duration, p_requested_service_name,
                v_operator.id::text, v_operator.name
              )
            then
              v_available := false;
              exit;
            end if;
          end loop;
          exit when v_available;
        end loop;
      end if;
    end if;

    if v_slot_time <> '' then
      v_result := v_result || jsonb_build_object(v_slot_time, v_available);
    end if;
  end loop;

  return v_result;
end;
$$;

grant execute on function public.get_public_phased_booking_slot_availability_batch_v3(
  uuid, date, jsonb, text, text, text, text, boolean
) to anon, authenticated;

create or replace function public.create_public_booking_request_ultralight_v3(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_operator public.operators%rowtype;
  v_has_role_operators boolean;
  v_explicit boolean :=
    nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null;
begin
  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  if v_explicit then
    if not public.public_operator_can_book_service_v1(
      v_workspace_id, p_operator_id, p_operator_name,
      p_requested_service_name, p_required_role
    ) then
      raise exception 'operator_service_not_enabled';
    end if;

    return public.create_public_booking_request_ultralight_v2(
      p_salon_code, p_requested_service_name, p_requested_price,
      p_requested_duration_minutes, p_appointment_date, p_appointment_time,
      p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
      p_customer_instagram, p_notes, p_required_role, p_operator_id, p_operator_name
    );
  end if;

  select exists (
    select 1 from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
  ) into v_has_role_operators;

  if not v_has_role_operators then
    return public.create_public_booking_request_ultralight_v2(
      p_salon_code, p_requested_service_name, p_requested_price,
      p_requested_duration_minutes, p_appointment_date, p_appointment_time,
      p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
      p_customer_instagram, p_notes, p_required_role, null, null
    );
  end if;

  select operator.* into v_operator
  from public.operators as operator
  where operator.workspace_id = v_workspace_id
    and (
      nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
      or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
    )
    and public.public_operator_can_book_service_v1(
      v_workspace_id, operator.id::text, operator.name,
      p_requested_service_name, p_required_role
    )
    and public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, p_appointment_time,
      greatest(coalesce(p_requested_duration_minutes, 60), 1),
      p_requested_service_name, operator.id::text, operator.name
    )
  order by operator.created_at, operator.name
  limit 1;

  if v_operator.id is null then raise exception 'slot_unavailable'; end if;

  return public.create_public_booking_request_ultralight_v2(
    p_salon_code, p_requested_service_name, p_requested_price,
    p_requested_duration_minutes, p_appointment_date, p_appointment_time,
    p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
    p_customer_instagram, p_notes, p_required_role,
    v_operator.id::text, v_operator.name
  );
end;
$$;

grant execute on function public.create_public_booking_request_ultralight_v3(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text
) to anon, authenticated;

create or replace function public.create_public_phased_booking_request_v4(
  p_salon_code text,
  p_requested_service_name text,
  p_requested_price numeric,
  p_requested_duration_minutes integer default 60,
  p_appointment_date date default null,
  p_appointment_time time default null,
  p_customer_name text default null,
  p_customer_surname text default '',
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_customer_instagram text default null,
  p_notes text default null,
  p_required_role text default null,
  p_operator_id text default null,
  p_operator_name text default null,
  p_phase_snapshot jsonb default null
)
returns public.booking_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_initial integer;
  v_processing integer;
  v_final integer;
  v_final_time time;
  v_initial_operator public.operators%rowtype;
  v_final_operator public.operators%rowtype;
  v_candidate public.operators%rowtype;
  v_assignments jsonb;
  v_has_role_operators boolean;
  v_allow_split boolean := coalesce((p_phase_snapshot ->> 'allowFrontendSplitOperators')::boolean, true);
  v_explicit boolean :=
    nullif(trim(coalesce(p_operator_id, '')), '') is not null
    or nullif(trim(coalesce(p_operator_name, '')), '') is not null;
begin
  if coalesce(p_phase_snapshot ->> 'mode', '') <> 'phased' then
    raise exception 'invalid_phase_snapshot';
  end if;

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;
  if v_workspace_id is null then raise exception 'workspace_not_found'; end if;

  v_initial := greatest(coalesce((p_phase_snapshot ->> 'initialDurationMinutes')::integer, 0), 1);
  v_processing := greatest(coalesce((p_phase_snapshot ->> 'processingDurationMinutes')::integer, 0), 1);
  v_final := greatest(coalesce((p_phase_snapshot ->> 'finalDurationMinutes')::integer, 0), 1);
  v_final_time := (p_appointment_time + make_interval(mins => v_initial + v_processing))::time;

  if v_explicit then
    if not public.public_operator_can_book_service_v1(
      v_workspace_id, p_operator_id, p_operator_name,
      p_requested_service_name, p_required_role
    ) then
      raise exception 'operator_service_not_enabled';
    end if;

    select operator.*
    into v_initial_operator
    from public.operators as operator
    where operator.workspace_id = v_workspace_id
      and (
        (
          trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and operator.id = case
            when trim(coalesce(p_operator_id, '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              then trim(p_operator_id)::uuid
            else null
          end
        )
        or lower(trim(operator.name)) = lower(trim(coalesce(p_operator_name, '')))
      )
      and (
        nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
        or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
      )
    order by case when operator.id::text = trim(coalesce(p_operator_id, '')) then 0 else 1 end
    limit 1;

    v_final_operator := v_initial_operator;
    if v_initial_operator.id is null then
      raise exception 'operator_service_not_enabled';
    end if;

    if not public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
      p_requested_service_name, v_initial_operator.id::text, v_initial_operator.name
    ) or not public.is_public_booking_slot_available(
      v_workspace_id, p_appointment_date, v_final_time, v_final,
      p_requested_service_name, v_final_operator.id::text, v_final_operator.name
    ) then
      raise exception 'slot_unavailable';
    end if;
  else
    select exists (
      select 1 from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
    ) into v_has_role_operators;

    if not v_has_role_operators then
      return public.create_public_phased_booking_request_v3(
        p_salon_code, p_requested_service_name, p_requested_price,
        p_requested_duration_minutes, p_appointment_date, p_appointment_time,
        p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
        p_customer_instagram, p_notes, p_required_role, null, null, p_phase_snapshot
      );
    end if;

    for v_candidate in
      select operator.* from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
        and public.public_operator_can_book_service_v1(
          v_workspace_id, operator.id::text, operator.name,
          p_requested_service_name, p_required_role
        )
      order by operator.created_at, operator.name
    loop
      if public.is_public_booking_slot_available(
        v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
        p_requested_service_name, v_candidate.id::text, v_candidate.name
      ) and public.is_public_booking_slot_available(
        v_workspace_id, p_appointment_date, v_final_time, v_final,
        p_requested_service_name, v_candidate.id::text, v_candidate.name
      ) then
        v_initial_operator := v_candidate;
        v_final_operator := v_candidate;
        exit;
      end if;
    end loop;

    if v_initial_operator.id is null and v_allow_split then
      select operator.* into v_initial_operator
      from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
        and public.public_operator_can_book_service_v1(
          v_workspace_id, operator.id::text, operator.name,
          p_requested_service_name, p_required_role
        )
        and public.is_public_booking_slot_available(
          v_workspace_id, p_appointment_date, p_appointment_time, v_initial,
          p_requested_service_name, operator.id::text, operator.name
        )
      order by operator.created_at, operator.name
      limit 1;

      select operator.* into v_final_operator
      from public.operators as operator
      where operator.workspace_id = v_workspace_id
        and (
          nullif(lower(trim(coalesce(p_required_role, ''))), '') is null
          or lower(trim(coalesce(operator.required_role, ''))) = lower(trim(p_required_role))
        )
        and public.public_operator_can_book_service_v1(
          v_workspace_id, operator.id::text, operator.name,
          p_requested_service_name, p_required_role
        )
        and public.is_public_booking_slot_available(
          v_workspace_id, p_appointment_date, v_final_time, v_final,
          p_requested_service_name, operator.id::text, operator.name
        )
      order by case when operator.id = v_initial_operator.id then 1 else 0 end,
        operator.created_at, operator.name
      limit 1;
    end if;
  end if;

  if v_initial_operator.id is null or v_final_operator.id is null then
    raise exception 'slot_unavailable';
  end if;

  v_request := public.create_public_phased_booking_request_with_assignments_v1(
    p_salon_code, p_requested_service_name, p_requested_price,
    p_requested_duration_minutes, p_appointment_date, p_appointment_time,
    p_customer_name, p_customer_surname, p_customer_email, p_customer_phone,
    p_customer_instagram, p_notes, p_required_role,
    v_initial_operator.id::text, v_initial_operator.name,
    v_final_operator.id::text, v_final_operator.name,
    p_phase_snapshot
  );

  v_assignments := jsonb_build_object(
    'version', 1,
    'initial', jsonb_build_object('id', v_initial_operator.id::text, 'name', v_initial_operator.name),
    'final', jsonb_build_object('id', v_final_operator.id::text, 'name', v_final_operator.name)
  );
  update public.booking_requests
  set phase_operator_assignments = v_assignments,
      requested_operator_id = v_initial_operator.id::text,
      requested_operator_name = v_initial_operator.name,
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;
  update public.appointments
  set phase_operator_assignments = v_assignments,
      operator_id = v_initial_operator.id::text,
      operator_name = v_initial_operator.name
  where booking_request_id = v_request.id;

  perform public.refresh_workspace_agenda_state(v_workspace_id);
  return v_request;
end;
$$;

grant execute on function public.create_public_phased_booking_request_v4(
  text, text, numeric, integer, date, time, text, text, citext, text, text, text,
  text, text, text, jsonb
) to anon, authenticated;

notify pgrst, 'reload schema';
