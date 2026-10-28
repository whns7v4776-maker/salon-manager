-- A customer may repeat the same atomic service on the same day after an
-- explicit frontend confirmation. Salons can disable that permission per
-- customer. Compositions and linked-service bookings remain outside this rule.

alter table public.customer_online_booking_policies
  add column if not exists allow_same_day_same_service boolean not null default true;

create or replace function public.update_customer_online_booking_policy_v2(
  p_customer_id uuid,
  p_acceptance_mode text,
  p_service_overrides jsonb default '{}'::jsonb,
  p_allow_same_day_same_service boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_workspace_id uuid := public.current_workspace_id();
begin
  v_result := public.update_customer_online_booking_policy_v1(
    p_customer_id,
    p_acceptance_mode,
    p_service_overrides
  );

  update public.customer_online_booking_policies
  set allow_same_day_same_service = coalesce(p_allow_same_day_same_service, true),
      updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and customer_id = p_customer_id;

  return v_result || jsonb_build_object(
    'allowSameDaySameService', coalesce(p_allow_same_day_same_service, true)
  );
end;
$$;

revoke all on function public.update_customer_online_booking_policy_v2(
  uuid, text, jsonb, boolean
) from public;
grant execute on function public.update_customer_online_booking_policy_v2(
  uuid, text, jsonb, boolean
) to authenticated;

create or replace function public.get_public_customer_online_booking_policy_v2(
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
  v_result jsonb;
  v_workspace_id uuid;
  v_customer_id uuid;
  v_allowed boolean := true;
begin
  v_result := public.get_public_customer_online_booking_policy_v1(
    p_salon_code,
    p_customer_email,
    p_customer_phone
  );

  select workspace.id into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and workspace.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is not null
    and nullif(lower(trim(coalesce(p_customer_email, ''))), '') is not null
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
    select coalesce(policy.allow_same_day_same_service, true)
    into v_allowed
    from (select 1) as singleton
    left join public.customer_online_booking_policies as policy
      on policy.workspace_id = v_workspace_id
      and policy.customer_id = v_customer_id;
  end if;

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'allowSameDaySameService', coalesce(v_allowed, true)
  );
end;
$$;

revoke all on function public.get_public_customer_online_booking_policy_v2(
  text, text, text
) from public;
grant execute on function public.get_public_customer_online_booking_policy_v2(
  text, text, text
) to anon, authenticated;

create or replace function public.customer_allows_same_day_same_service_v1(
  p_workspace_id uuid,
  p_customer_id uuid,
  p_service_name text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Public compositions are always outside the repeated-atomic-service rule.
    exists (
      select 1
      from public.service_compositions as composition
      where composition.workspace_id = p_workspace_id
        and composition.is_active is true
        and composition.visibility = 'public'
        and lower(trim(composition.name)) = lower(trim(coalesce(p_service_name, '')))
    )
    or coalesce((
      select policy.allow_same_day_same_service
      from public.customer_online_booking_policies as policy
      where policy.workspace_id = p_workspace_id
        and policy.customer_id = p_customer_id
      limit 1
    ), true);
$$;

revoke all on function public.customer_allows_same_day_same_service_v1(
  uuid, uuid, text
) from public;
grant execute on function public.customer_allows_same_day_same_service_v1(
  uuid, uuid, text
) to anon, authenticated, service_role;

-- Patch only the three legacy same-day raises in the canonical atomic writer.
-- Exact-slot idempotency, customer time overlap, capacity and daily limits stay
-- untouched. Linked booking RPCs set a transaction-local bypass below.
do $$
declare
  v_signature regprocedure :=
    'public.create_public_booking_request_ultralight_v2(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_raise text := 'raise exception ''same_day_same_service_conflict'';';
  v_guarded_raise text :=
    'if not public.customer_allows_same_day_same_service_v1(v_workspace.id, v_customer_id, v_service_name) '
    || 'and coalesce(current_setting(''salonpro.public_linked_booking'', true), '''') <> ''on'' then '
    || 'raise exception ''same_day_same_service_conflict''; end if;';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('customer_allows_same_day_same_service_v1' in v_definition) = 0 then
    v_next := replace(v_definition, v_raise, v_guarded_raise);
    if v_next = v_definition then
      raise exception 'same_day_service_guard_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$$;

-- A dependency is a linked booking even though its two atomic requests are
-- persisted one at a time inside the transaction.
do $$
declare
  v_signature regprocedure :=
    'public.create_public_booking_dependency_v1(text,text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text := 'select workspace.id into v_workspace_id';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('salonpro.public_linked_booking' in v_definition) = 0 then
    v_next := replace(
      v_definition,
      v_anchor,
      'perform set_config(''salonpro.public_linked_booking'', ''on'', true);' || chr(10) || chr(10) || '  ' || v_anchor
    );
    if v_next = v_definition then
      raise exception 'dependency_linked_booking_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$$;

-- The composition RPC uses the same local bypass for every component.
do $$
declare
  v_signature regprocedure :=
    'public.create_public_booking_composition_v1(text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_next text;
  v_anchor text := 'select workspace.id into v_workspace_id';
begin
  select pg_get_functiondef(v_signature) into v_definition;
  if position('salonpro.public_linked_booking' in v_definition) = 0 then
    v_next := replace(
      v_definition,
      v_anchor,
      'perform set_config(''salonpro.public_linked_booking'', ''on'', true);' || chr(10) || chr(10) || '  ' || v_anchor
    );
    if v_next = v_definition then
      raise exception 'composition_linked_booking_anchor_missing';
    end if;
    execute v_next;
  end if;
end;
$$;

notify pgrst, 'reload schema';
