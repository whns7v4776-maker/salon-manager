-- Harden owner customer creation around the exact open workspace and make the
-- birthday collected by every owner form canonical instead of cache-only.

begin;

alter table public.customers
  add column if not exists birthday date;

create or replace function public.sync_client_portal_customers(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals as portal
  set clienti = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', customer.id,
          'nome', customer.full_name,
          'telefono', coalesce(customer.phone, ''),
          'email', coalesce(customer.email::text, ''),
          'instagram', coalesce(customer.instagram, ''),
          'birthday', coalesce(
            to_char(customer.birthday, 'YYYY-MM-DD'),
            matched.item ->> 'birthday',
            ''
          ),
          'nota', coalesce(customer.note, ''),
          'fonte',
            case when customer.source = 'frontend' then 'frontend' else 'salone' end,
          'viewedBySalon', customer.viewed_by_salon,
          'annullamentiCount',
            case
              when coalesce(matched.item ->> 'annullamentiCount', '') ~ '^\d+$'
                then (matched.item ->> 'annullamentiCount')::integer
              else 0
            end,
          'inibito', not coalesce(customer.is_active, true),
          'maxFutureAppointments', customer.max_future_appointments,
          'maxFutureAppointmentsMode', customer.max_future_appointments_mode,
          'maxDailyAppointments', customer.max_daily_appointments
        )
        order by customer.updated_at desc, customer.created_at desc
      )
      from public.customers as customer
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
        where
          nullif(trim(coalesce(existing_item ->> 'id', '')), '') = customer.id::text
          or (
            regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') <> ''
            and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') <> ''
            and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') =
              regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g')
          )
          or (
            lower(trim(coalesce(existing_item ->> 'email', ''))) <> ''
            and lower(trim(coalesce(customer.email::text, ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'email', ''))) =
              lower(trim(coalesce(customer.email::text, '')))
          )
          or (
            lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
            and lower(trim(coalesce(customer.full_name, ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'nome', ''))) =
              lower(trim(coalesce(customer.full_name, '')))
          )
        order by
          case
            when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = customer.id::text then 0
            when regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') =
              regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') then 1
            when lower(trim(coalesce(existing_item ->> 'email', ''))) =
              lower(trim(coalesce(customer.email::text, ''))) then 2
            else 3
          end
        limit 1
      ) as matched on true
      where customer.workspace_id = portal.workspace_id
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

create or replace function public.create_owner_customer_v2(
  p_workspace_id uuid,
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_instagram text default null,
  p_note text default null,
  p_birthday date default null,
  p_max_future_appointments integer default 4,
  p_max_future_appointments_mode text default 'monthly',
  p_max_daily_appointments integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_normalized_name text := lower(
    regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')
  );
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D+', '', 'g');
  v_email citext := nullif(lower(btrim(coalesce(p_email, ''))), '')::citext;
  v_instagram text := nullif(btrim(coalesce(p_instagram, '')), '');
  v_note text := btrim(coalesce(p_note, ''));
  v_phone_customer public.customers%rowtype;
  v_email_customer public.customers%rowtype;
  v_customer public.customers%rowtype;
  v_duplicate_code text;
  v_duplicate_name text;
begin
  if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'owner_session_required';
  end if;

  -- Resolve and lock exactly the workspace currently open in the client. A
  -- membership in another salon must never authorize this write.
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
    and (
      lower(btrim(workspace.owner_email::text)) =
        lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
      or exists (
        select 1
        from public.workspace_members as member
        where member.workspace_id = workspace.id
          and member.user_id = auth.uid()
      )
    )
    and (
      workspace.is_internal_tester = true
      or (
        workspace.subscription_status = 'active'
        and workspace.subscription_ends_at is not null
        and workspace.subscription_ends_at > timezone('utc', now())
      )
    )
  for update;

  if v_workspace_id is null then
    raise exception 'workspace_access_denied';
  end if;

  if v_full_name = '' then
    raise exception 'customer_name_required';
  end if;

  if length(v_phone) not between 9 and 10 then
    raise exception 'customer_phone_invalid';
  end if;

  if v_email is not null
     and v_email::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'customer_email_invalid';
  end if;

  if p_birthday is not null and p_birthday > current_date then
    raise exception 'customer_birthday_invalid';
  end if;

  if coalesce(p_max_future_appointments, 4) < 0
     or coalesce(p_max_daily_appointments, 3) < 0
     or coalesce(p_max_future_appointments_mode, 'monthly')
        not in ('monthly', 'total_future') then
    raise exception 'customer_limits_invalid';
  end if;

  select customer.*
  into v_phone_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_phone
  order by customer.updated_at desc, customer.created_at desc, customer.id
  limit 1;

  if v_email is not null then
    select customer.*
    into v_email_customer
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and lower(btrim(coalesce(customer.email::text, ''))) = v_email::text
    order by customer.updated_at desc, customer.created_at desc, customer.id
    limit 1;
  end if;

  if v_phone_customer.id is not null or v_email_customer.id is not null then
    v_duplicate_code :=
      case
        when v_phone_customer.id is not null and v_email_customer.id is not null
          then 'duplicate_email_phone'
        when v_phone_customer.id is not null then 'duplicate_phone'
        else 'duplicate_email'
      end;
    v_duplicate_name := coalesce(
      nullif(v_phone_customer.full_name, ''),
      nullif(v_email_customer.full_name, ''),
      'cliente esistente'
    );

    return jsonb_build_object(
      'ok', false,
      'code', v_duplicate_code,
      'message',
        case v_duplicate_code
          when 'duplicate_email_phone' then
            'Esiste gia un cliente con questo telefono e questa email: ' || v_duplicate_name || '.'
          when 'duplicate_phone' then
            'Esiste gia un cliente con questo numero: ' || v_duplicate_name || '.'
          else
            'Esiste gia un cliente con questa email: ' || v_duplicate_name || '.'
        end,
      'workspace_id', v_workspace_id,
      'existing_customer', jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(v_phone_customer.id, v_email_customer.id),
        'full_name', v_duplicate_name,
        'phone', coalesce(v_phone_customer.phone, v_email_customer.phone),
        'email', coalesce(v_phone_customer.email, v_email_customer.email)
      ))
    );
  end if;

  -- An explicit re-creation is authoritative and must remove the historical
  -- name tombstone before the portal-sync trigger materializes the new row.
  delete from public.customer_deletion_tombstones as tombstone
  where tombstone.workspace_id = v_workspace_id
    and tombstone.normalized_name = v_normalized_name;

  insert into public.customers (
    workspace_id,
    full_name,
    phone,
    email,
    instagram,
    note,
    birthday,
    source,
    is_active,
    viewed_by_salon,
    max_future_appointments,
    max_future_appointments_mode,
    max_daily_appointments
  )
  values (
    v_workspace_id,
    v_full_name,
    v_phone,
    v_email,
    v_instagram,
    v_note,
    p_birthday,
    'salon',
    true,
    true,
    coalesce(p_max_future_appointments, 4),
    coalesce(p_max_future_appointments_mode, 'monthly'),
    coalesce(p_max_daily_appointments, 3)
  )
  returning * into v_customer;

  return jsonb_build_object(
    'ok', true,
    'workspace_id', v_workspace_id,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'workspace_id', v_customer.workspace_id,
      'full_name', v_customer.full_name,
      'phone', v_customer.phone,
      'email', v_customer.email,
      'instagram', v_customer.instagram,
      'note', v_customer.note,
      'birthday', to_char(v_customer.birthday, 'YYYY-MM-DD'),
      'source', v_customer.source,
      'is_active', v_customer.is_active,
      'viewed_by_salon', v_customer.viewed_by_salon,
      'max_future_appointments', v_customer.max_future_appointments,
      'max_future_appointments_mode', v_customer.max_future_appointments_mode,
      'max_daily_appointments', v_customer.max_daily_appointments
    )
  );
end;
$$;

revoke all on function public.create_owner_customer_v1(
  text, text, text, text, text, integer, text, integer
) from authenticated;
revoke all on function public.create_owner_customer_v2(
  uuid, text, text, text, text, text, date, integer, text, integer
) from public, anon;
grant execute on function public.create_owner_customer_v2(
  uuid, text, text, text, text, text, date, integer, text, integer
) to authenticated;

comment on function public.create_owner_customer_v2(
  uuid, text, text, text, text, text, date, integer, text, integer
) is 'Creates one canonical owner customer in the exact authorized workspace, clears an explicit recreation tombstone, and persists birthday.';

notify pgrst, 'reload schema';

commit;
