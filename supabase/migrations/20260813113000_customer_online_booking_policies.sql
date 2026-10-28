-- Per-customer online booking policy.
-- The salon Agenda stays unrestricted: these rules apply only to requests whose
-- origin is the public frontend. Existing appointments keep their snapshots.

create table if not exists public.customer_online_booking_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  acceptance_mode text not null default 'inherit'
    check (acceptance_mode in ('inherit', 'auto', 'manual')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (customer_id)
);

create table if not exists public.customer_online_service_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (customer_id, service_id)
);

create table if not exists public.customer_online_composition_overrides (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  composition_id uuid not null references public.service_compositions(id) on delete cascade,
  is_allowed boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (customer_id, composition_id)
);

create index if not exists customer_online_booking_policies_workspace_idx
  on public.customer_online_booking_policies (workspace_id, customer_id);
create index if not exists customer_online_service_overrides_workspace_idx
  on public.customer_online_service_overrides (workspace_id, customer_id, service_id);
create index if not exists customer_online_composition_overrides_workspace_idx
  on public.customer_online_composition_overrides (workspace_id, customer_id, composition_id);

alter table public.customer_online_booking_policies enable row level security;
alter table public.customer_online_service_overrides enable row level security;
alter table public.customer_online_composition_overrides enable row level security;
grant select on public.customer_online_booking_policies to authenticated;
grant select on public.customer_online_service_overrides to authenticated;
grant select on public.customer_online_composition_overrides to authenticated;
revoke insert, update, delete on public.customer_online_booking_policies from authenticated;
revoke insert, update, delete on public.customer_online_service_overrides from authenticated;
revoke insert, update, delete on public.customer_online_composition_overrides from authenticated;

drop policy if exists "workspace data select" on public.customer_online_booking_policies;
create policy "workspace data select" on public.customer_online_booking_policies for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data insert" on public.customer_online_booking_policies;
create policy "workspace data insert" on public.customer_online_booking_policies for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data update" on public.customer_online_booking_policies;
create policy "workspace data update" on public.customer_online_booking_policies for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data delete" on public.customer_online_booking_policies;
create policy "workspace data delete" on public.customer_online_booking_policies for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data select" on public.customer_online_service_overrides;
create policy "workspace data select" on public.customer_online_service_overrides for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data insert" on public.customer_online_service_overrides;
create policy "workspace data insert" on public.customer_online_service_overrides for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data update" on public.customer_online_service_overrides;
create policy "workspace data update" on public.customer_online_service_overrides for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data delete" on public.customer_online_service_overrides;
create policy "workspace data delete" on public.customer_online_service_overrides for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

drop policy if exists "workspace data select" on public.customer_online_composition_overrides;
create policy "workspace data select" on public.customer_online_composition_overrides for select
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data insert" on public.customer_online_composition_overrides;
create policy "workspace data insert" on public.customer_online_composition_overrides for insert
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data update" on public.customer_online_composition_overrides;
create policy "workspace data update" on public.customer_online_composition_overrides for update
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed())
with check (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());
drop policy if exists "workspace data delete" on public.customer_online_composition_overrides;
create policy "workspace data delete" on public.customer_online_composition_overrides for delete
using (workspace_id = public.current_workspace_id() and public.workspace_access_allowed());

create or replace function public.update_customer_online_booking_policy_v1(
  p_customer_id uuid,
  p_acceptance_mode text,
  p_service_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := public.current_workspace_id();
  v_mode text := lower(trim(coalesce(p_acceptance_mode, 'inherit')));
  v_pair record;
  v_service_id uuid;
  v_composition_id uuid;
  v_allowed boolean;
begin
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;
  if v_mode not in ('inherit', 'auto', 'manual') then
    raise exception 'invalid_customer_acceptance_mode';
  end if;
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and workspace_id = v_workspace_id
  ) then
    raise exception 'customer_not_found';
  end if;
  if jsonb_typeof(coalesce(p_service_overrides, '{}'::jsonb)) <> 'object' then
    raise exception 'invalid_customer_service_overrides';
  end if;

  insert into public.customer_online_booking_policies (
    workspace_id, customer_id, acceptance_mode, updated_at
  ) values (
    v_workspace_id, p_customer_id, v_mode, timezone('utc', now())
  )
  on conflict (customer_id) do update set
    acceptance_mode = excluded.acceptance_mode,
    updated_at = excluded.updated_at;

  -- Replace the small exception set atomically. Missing services are allowed by default,
  -- so services added in the future automatically remain bookable.
  delete from public.customer_online_service_overrides
  where workspace_id = v_workspace_id and customer_id = p_customer_id;
  delete from public.customer_online_composition_overrides
  where workspace_id = v_workspace_id and customer_id = p_customer_id;

  for v_pair in select key, value from jsonb_each(coalesce(p_service_overrides, '{}'::jsonb))
  loop
    begin
      v_allowed := (v_pair.value #>> '{}')::boolean;
      if left(v_pair.key, 12) = 'composition:' then
        v_composition_id := substring(v_pair.key from 13)::uuid;
        v_service_id := null;
      else
        v_service_id := v_pair.key::uuid;
        v_composition_id := null;
      end if;
    exception when others then
      raise exception 'invalid_customer_service_override';
    end;

    if v_allowed is false and v_composition_id is not null and exists (
      select 1 from public.service_compositions
      where id = v_composition_id and workspace_id = v_workspace_id
    ) then
      insert into public.customer_online_composition_overrides (
        workspace_id, customer_id, composition_id, is_allowed, updated_at
      ) values (
        v_workspace_id, p_customer_id, v_composition_id, false, timezone('utc', now())
      );
    elsif v_allowed is false and v_service_id is not null and exists (
      select 1 from public.services
      where id = v_service_id and workspace_id = v_workspace_id
    ) then
      insert into public.customer_online_service_overrides (
        workspace_id, customer_id, service_id, is_allowed, updated_at
      ) values (
        v_workspace_id, p_customer_id, v_service_id, false, timezone('utc', now())
      );
    end if;
  end loop;

  return jsonb_build_object(
    'customerId', p_customer_id,
    'acceptanceMode', v_mode,
    'serviceOverrides', coalesce((
      select jsonb_object_agg(service_id::text, is_allowed)
      from public.customer_online_service_overrides
      where workspace_id = v_workspace_id and customer_id = p_customer_id
    ), '{}'::jsonb) || coalesce((
      select jsonb_object_agg('composition:' || composition_id::text, is_allowed)
      from public.customer_online_composition_overrides
      where workspace_id = v_workspace_id and customer_id = p_customer_id
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.update_customer_online_booking_policy_v1(uuid, text, jsonb) from public;
grant execute on function public.update_customer_online_booking_policy_v1(uuid, text, jsonb)
  to authenticated;

create or replace function public.resolve_customer_online_auto_accept_v1(
  p_workspace_id uuid,
  p_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(policy.acceptance_mode, 'inherit')
    when 'auto' then true
    when 'manual' then false
    else coalesce(workspace.auto_accept_booking_requests, false)
  end
  from public.workspaces as workspace
  left join public.customer_online_booking_policies as policy
    on policy.workspace_id = workspace.id and policy.customer_id = p_customer_id
  where workspace.id = p_workspace_id
  limit 1;
$$;

revoke all on function public.resolve_customer_online_auto_accept_v1(uuid, uuid) from public;
grant execute on function public.resolve_customer_online_auto_accept_v1(uuid, uuid)
  to authenticated, service_role;

create or replace function public.get_public_customer_online_booking_policy_v1(
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
  v_global_auto boolean := false;
  v_mode text := 'inherit';
  v_overrides jsonb := '{}'::jsonb;
  v_blocked_services jsonb := '[]'::jsonb;
  v_blocked_compositions jsonb := '[]'::jsonb;
begin
  select workspace.id, coalesce(workspace.auto_accept_booking_requests, false)
  into v_workspace_id, v_global_auto
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    return jsonb_build_object('customerFound', false, 'effectiveAutoAccept', false);
  end if;

  if nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g'), '') is not null
  then
    select customer.id into v_customer_id
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.is_active is not false
      and lower(trim(coalesce(customer.email::text, ''))) = lower(trim(p_customer_email))
      and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
        regexp_replace(coalesce(p_customer_phone, ''), '\D', '', 'g')
    order by customer.updated_at desc
    limit 1;
  end if;

  if v_customer_id is not null then
    select coalesce(policy.acceptance_mode, 'inherit') into v_mode
    from (select 1) as singleton
    left join public.customer_online_booking_policies as policy
      on policy.workspace_id = v_workspace_id and policy.customer_id = v_customer_id;

    select
      coalesce(jsonb_object_agg(override.service_id::text, override.is_allowed), '{}'::jsonb),
      coalesce(jsonb_agg(override.service_id), '[]'::jsonb)
    into v_overrides, v_blocked_services
    from public.customer_online_service_overrides as override
    where override.workspace_id = v_workspace_id
      and override.customer_id = v_customer_id
      and override.is_allowed is false;

    select coalesce(jsonb_agg(distinct blocked.composition_id), '[]'::jsonb)
    into v_blocked_compositions
    from (
      select direct.composition_id
      from public.customer_online_composition_overrides as direct
      where direct.workspace_id = v_workspace_id
        and direct.customer_id = v_customer_id
        and direct.is_allowed is false
      union
      select item.composition_id
      from public.service_composition_items as item
      join public.customer_online_service_overrides as override
        on override.workspace_id = item.workspace_id
        and override.customer_id = v_customer_id
        and override.service_id = item.service_id
        and override.is_allowed is false
      where item.workspace_id = v_workspace_id
    ) as blocked;
  end if;

  return jsonb_build_object(
    'customerFound', v_customer_id is not null,
    'acceptanceMode', v_mode,
    'effectiveAutoAccept', case v_mode
      when 'auto' then true
      when 'manual' then false
      else v_global_auto
    end,
    'serviceOverrides', coalesce(v_overrides, '{}'::jsonb),
    'blockedServiceIds', coalesce(v_blocked_services, '[]'::jsonb),
    'blockedCompositionIds', coalesce(v_blocked_compositions, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_public_customer_online_booking_policy_v1(text, text, text)
  from public;
grant execute on function public.get_public_customer_online_booking_policy_v1(text, text, text)
  to anon, authenticated;

create or replace function public.enforce_customer_online_booking_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if new.origin <> 'frontend' then return new; end if;

  -- Non ostacolare cancellazioni o normali aggiornamenti di richieste già
  -- attive. Un upsert che riattiva una richiesta conclusa, invece, viene
  -- ricontrollato esattamente come un nuovo inserimento.
  if tg_op = 'UPDATE' then
    if new.status::text not in ('pending', 'accepted') then return new; end if;
    if old.status::text in ('pending', 'accepted')
      and new.requested_service_name is not distinct from old.requested_service_name
      and new.customer_id is not distinct from old.customer_id
      and new.customer_email is not distinct from old.customer_email
      and new.customer_phone is not distinct from old.customer_phone
      and new.workspace_id is not distinct from old.workspace_id
    then
      return new;
    end if;
  end if;

  -- Per le richieste pubbliche l'identità autorevole è sempre la coppia
  -- email + telefono salvata nella rubrica del salone. Non fidarsi di un
  -- customer_id ricevuto dal client impedisce di aggirare le eccezioni.
  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = new.workspace_id
    and customer.is_active is not false
    and lower(trim(coalesce(customer.email::text, ''))) =
      lower(trim(coalesce(new.customer_email::text, '')))
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
      regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g')
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is null then
    -- Un client storico può inviare un ID arbitrario: se la coppia email +
    -- telefono non identifica la rubrica, non conservarlo come attendibile.
    new.customer_id := null;
    if new.status::text = 'accepted'
      and public.resolve_customer_online_auto_accept_v1(
        new.workspace_id,
        null
      ) is not true
    then
      new.status := 'pending'::public.request_status;
    end if;
    return new;
  end if;

  new.customer_id := v_customer_id;

  -- Anche una vecchia build che prova a creare subito una richiesta accettata
  -- non può aggirare l'eccezione manuale del cliente.
  if new.status::text = 'accepted'
    and public.resolve_customer_online_auto_accept_v1(
      new.workspace_id,
      v_customer_id
    ) is not true
  then
    new.status := 'pending'::public.request_status;
  end if;

  -- Il payload pubblico storico contiene il nome del servizio. Se esistono
  -- omonimi, basta che uno degli ID corrispondenti sia escluso per bloccare
  -- la richiesta: fail-closed, senza scegliere arbitrariamente il più recente.
  if exists (
    select 1
    from public.services as service
    join public.customer_online_service_overrides as override
      on override.workspace_id = service.workspace_id
      and override.service_id = service.id
    where service.workspace_id = new.workspace_id
      and lower(trim(service.name)) = lower(trim(new.requested_service_name))
      and override.customer_id = v_customer_id
      and override.is_allowed is false
  ) then
    raise exception 'customer_service_not_bookable_online';
  end if;

  -- Difesa aggiuntiva per RPC o versioni client che inviano il nome della
  -- composizione anziché i nomi delle singole fasi. Bloccare una sola fase
  -- rende non prenotabile l'intera composizione per quel cliente.
  if exists (
    select 1
    from public.service_compositions as composition
    where composition.workspace_id = new.workspace_id
      and composition.is_active is true
      and lower(trim(composition.name)) = lower(trim(new.requested_service_name))
      and (
        exists (
          select 1
          from public.customer_online_composition_overrides as direct
          where direct.workspace_id = new.workspace_id
            and direct.customer_id = v_customer_id
            and direct.composition_id = composition.id
            and direct.is_allowed is false
        )
        or exists (
          select 1
          from public.service_composition_items as item
          join public.customer_online_service_overrides as override
            on override.workspace_id = item.workspace_id
            and override.customer_id = v_customer_id
            and override.service_id = item.service_id
            and override.is_allowed is false
          where item.workspace_id = new.workspace_id
            and item.composition_id = composition.id
        )
      )
  ) then
    raise exception 'customer_service_not_bookable_online';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_customer_online_booking_policy_before_insert
  on public.booking_requests;
drop trigger if exists enforce_customer_online_booking_policy_before_write
  on public.booking_requests;
create trigger enforce_customer_online_booking_policy_before_write
before insert or update on public.booking_requests
for each row execute function public.enforce_customer_online_booking_policy_v1();

-- La RPC delle composizioni crea prima le singole richieste e collega il
-- gruppo in un secondo momento. Questo secondo presidio vede il compositionId
-- nello snapshot del gruppo e rende autorevole anche l'esclusione diretta di
-- una composizione, facendo fallire e quindi annullare l'intera transazione.
create or replace function public.enforce_customer_online_composition_group_policy_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_composition_id uuid;
  v_composition_id_text text;
begin
  if new.origin <> 'frontend'
    or new.appointment_group_id is null
    or new.appointment_group_id is not distinct from old.appointment_group_id
  then
    return new;
  end if;

  select nullif(trim(coalesce(appointment_group.metadata ->> 'compositionId', '')), '')
  into v_composition_id_text
  from public.appointment_groups as appointment_group
  where appointment_group.id = new.appointment_group_id
    and appointment_group.workspace_id = new.workspace_id
  limit 1;

  if v_composition_id_text is null
    or v_composition_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return new;
  end if;
  v_composition_id := v_composition_id_text::uuid;

  select customer.id into v_customer_id
  from public.customers as customer
  where customer.workspace_id = new.workspace_id
    and customer.is_active is not false
    and lower(trim(coalesce(customer.email::text, ''))) =
      lower(trim(coalesce(new.customer_email::text, '')))
    and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
      regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g')
  order by customer.updated_at desc
  limit 1;

  if v_customer_id is not null and exists (
    select 1
    from public.customer_online_composition_overrides as override
    where override.workspace_id = new.workspace_id
      and override.customer_id = v_customer_id
      and override.composition_id = v_composition_id
      and override.is_allowed is false
  ) then
    raise exception 'customer_service_not_bookable_online';
  end if;

  if v_customer_id is not null then
    new.customer_id := v_customer_id;
  end if;

  -- Le fasi collegate richiedono sempre l'OK del salone. Questo protegge
  -- anche le build precedenti che tentavano l'accettazione immediata.
  new.status := 'pending'::public.request_status;
  return new;
end;
$$;

drop trigger if exists enforce_customer_online_composition_group_before_link
  on public.booking_requests;
create trigger enforce_customer_online_composition_group_before_link
before update of appointment_group_id on public.booking_requests
for each row execute function public.enforce_customer_online_composition_group_policy_v1();

-- Keep ordinary requests eligible according to the per-customer override.
-- Grouped compositions deliberately remain pending for explicit salon approval.
create or replace function public.process_due_auto_accept_booking_requests(p_limit integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_processed integer := 0;
  v_row record;
begin
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;
  perform set_config('salonpro.auto_accept_processor_running', 'on', true);
  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

  for v_row in
    select booking_request.id, booking_request.workspace_id
    from public.booking_requests as booking_request
    where booking_request.origin = 'frontend'
      and booking_request.status = 'pending'
      and booking_request.appointment_group_id is null
      and public.resolve_customer_online_auto_accept_v1(
        booking_request.workspace_id,
        booking_request.customer_id
      ) is true
      and booking_request.created_at <= v_now - interval '15 seconds'
    order by booking_request.created_at asc, booking_request.id asc
    limit greatest(coalesce(p_limit, 50), 1)
    for update of booking_request skip locked
  loop
    begin
      perform public.update_owner_booking_request_status_core(
        v_row.workspace_id, v_row.id, 'accepted'::public.request_status
      );
      perform public.queue_owner_badge_refresh_after_auto_accept(v_row.workspace_id, v_row.id);
      v_processed := v_processed + 1;
    exception when others then
      if position('booking_request_conflict' in SQLERRM) > 0
        or position('booking_request_not_found' in SQLERRM) > 0 then
        null;
      else
        raise notice 'process_due_auto_accept_booking_requests failed for %: %', v_row.id, SQLERRM;
      end if;
    end;
  end loop;

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception when others then
  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
