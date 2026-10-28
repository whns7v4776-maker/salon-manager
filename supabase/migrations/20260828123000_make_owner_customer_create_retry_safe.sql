begin;

-- Transport retries are expected on mobile connections. If the first RPC
-- committed but its response was lost, the retry must return that exact row
-- instead of reporting a duplicate. A contact collision with different data
-- (for example a different person reusing the same phone/email) remains an
-- explicit conflict and is never adopted silently.
create or replace function public.create_owner_customer_v3(
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
  v_result jsonb;
  v_workspace_id uuid;
  v_normalized_name text := lower(
    regexp_replace(btrim(coalesce(p_full_name, '')), '\s+', ' ', 'g')
  );
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D+', '', 'g');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_instagram text := btrim(coalesce(p_instagram, ''));
  v_note text := btrim(coalesce(p_note, ''));
  v_candidate_ids uuid[];
  v_customer public.customers%rowtype;
begin
  v_result := public.create_owner_customer_v2(
    p_workspace_id,
    p_full_name,
    p_phone,
    p_email,
    p_instagram,
    p_note,
    p_birthday,
    p_max_future_appointments,
    p_max_future_appointments_mode,
    p_max_daily_appointments
  );

  if coalesce((v_result ->> 'ok')::boolean, false) then
    return v_result || jsonb_build_object('replayed', false);
  end if;

  if coalesce(v_result ->> 'code', '') not in (
    'duplicate_phone',
    'duplicate_email',
    'duplicate_email_phone'
  ) then
    return v_result;
  end if;

  v_workspace_id := nullif(v_result ->> 'workspace_id', '')::uuid;
  if v_workspace_id is null or v_workspace_id <> p_workspace_id then
    return v_result;
  end if;

  -- Count every row matching either supplied identity. Two different rows
  -- matching phone/email are ambiguous and must stay a conflict.
  select array_agg(customer.id order by customer.id)
  into v_candidate_ids
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_phone
      or (
        v_email <> ''
        and lower(btrim(coalesce(customer.email::text, ''))) = v_email
      )
    );

  if coalesce(cardinality(v_candidate_ids), 0) <> 1 then
    return v_result;
  end if;

  select customer.*
  into v_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.id = v_candidate_ids[1];

  if v_customer.id is null
     or lower(regexp_replace(btrim(coalesce(v_customer.full_name, '')), '\s+', ' ', 'g'))
          <> v_normalized_name
     or regexp_replace(coalesce(v_customer.phone, ''), '\D+', '', 'g') <> v_phone
     or lower(btrim(coalesce(v_customer.email::text, ''))) <> v_email
     or btrim(coalesce(v_customer.instagram, '')) <> v_instagram
     or btrim(coalesce(v_customer.note, '')) <> v_note
     or v_customer.birthday is distinct from p_birthday
     or coalesce(v_customer.max_future_appointments, 4)
          <> coalesce(p_max_future_appointments, 4)
     or coalesce(v_customer.max_future_appointments_mode, 'monthly')
          <> coalesce(p_max_future_appointments_mode, 'monthly')
     or coalesce(v_customer.max_daily_appointments, 3)
          <> coalesce(p_max_daily_appointments, 3)
     or coalesce(v_customer.source, '') <> 'salon'
     or v_customer.is_active is distinct from true then
    return v_result;
  end if;

  return jsonb_build_object(
    'ok', true,
    'replayed', true,
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

revoke all on function public.create_owner_customer_v3(
  uuid, text, text, text, text, text, date, integer, text, integer
) from public, anon;
grant execute on function public.create_owner_customer_v3(
  uuid, text, text, text, text, text, date, integer, text, integer
) to authenticated;

comment on function public.create_owner_customer_v3(
  uuid, text, text, text, text, text, date, integer, text, integer
) is 'Creates one canonical owner customer and safely replays an exact committed request after a lost response; identity conflicts remain explicit.';

notify pgrst, 'reload schema';

commit;
