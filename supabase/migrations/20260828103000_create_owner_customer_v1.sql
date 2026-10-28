-- Canonical owner-side customer creation. Every +Cliente surface uses this
-- contract so workspace resolution, duplicate detection and insertion happen
-- atomically on the server instead of depending on a possibly stale UI cache.

begin;

create or replace function public.create_owner_customer_v1(
  p_full_name text,
  p_phone text,
  p_email text default null,
  p_instagram text default null,
  p_note text default null,
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

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null then
    raise exception 'owner_workspace_not_found';
  end if;

  if not public.workspace_access_allowed() then
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

  if coalesce(p_max_future_appointments, 4) < 0
     or coalesce(p_max_daily_appointments, 3) < 0
     or coalesce(p_max_future_appointments_mode, 'monthly')
        not in ('monthly', 'total_future') then
    raise exception 'customer_limits_invalid';
  end if;

  -- Serialize every owner-side customer creation in this workspace. This is a
  -- short row lock and closes double-tap and multi-device duplicate races.
  perform 1
  from public.workspaces as workspace
  where workspace.id = v_workspace_id
  for update;

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
      'existing_customer', jsonb_strip_nulls(jsonb_build_object(
        'id', coalesce(v_phone_customer.id, v_email_customer.id),
        'full_name', v_duplicate_name,
        'phone', coalesce(v_phone_customer.phone, v_email_customer.phone),
        'email', coalesce(v_phone_customer.email, v_email_customer.email)
      ))
    );
  end if;

  insert into public.customers (
    workspace_id,
    full_name,
    phone,
    email,
    instagram,
    note,
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
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'full_name', v_customer.full_name,
      'phone', v_customer.phone,
      'email', v_customer.email,
      'instagram', v_customer.instagram,
      'note', v_customer.note,
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
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer
) from public;
revoke all on function public.create_owner_customer_v1(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer
) from anon;
grant execute on function public.create_owner_customer_v1(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer
) to authenticated;

comment on function public.create_owner_customer_v1(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  integer
) is 'Atomically creates one canonical owner customer in the authenticated workspace and returns structured duplicate conflicts.';

notify pgrst, 'reload schema';

commit;
