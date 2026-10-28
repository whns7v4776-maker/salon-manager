begin;

-- The caller chooses the canonical customer UUID once for a single create
-- operation. A transport retry reuses that UUID and can therefore replay only
-- the row committed by that operation. A later create attempt gets a new UUID,
-- so matching phone/email remains an explicit duplicate instead of being
-- silently adopted as a replay.
create or replace function public.create_owner_customer_v4(
  p_workspace_id uuid,
  p_customer_id uuid,
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
  v_existing_customer public.customers%rowtype;
  v_customer public.customers%rowtype;
  v_duplicate_code text;
  v_duplicate_name text;
begin
  if auth.uid() is null or coalesce(auth.role(), '') <> 'authenticated' then
    raise exception 'owner_session_required';
  end if;

  -- Keep the same exact-workspace authorization and serialization boundary as
  -- v2/v3. Membership in a different salon never authorizes this write.
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

  if p_customer_id is null then
    raise exception 'customer_id_invalid';
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
  into v_existing_customer
  from public.customers as customer
  where customer.id = p_customer_id;

  if v_existing_customer.id is not null then
    if v_existing_customer.workspace_id = v_workspace_id
       and lower(
         regexp_replace(
           btrim(coalesce(v_existing_customer.full_name, '')),
           '\s+',
           ' ',
           'g'
         )
       ) = v_normalized_name
       and regexp_replace(coalesce(v_existing_customer.phone, ''), '\D+', '', 'g') =
         v_phone
       and lower(btrim(coalesce(v_existing_customer.email::text, ''))) =
         coalesce(v_email::text, '')
       and btrim(coalesce(v_existing_customer.instagram, '')) =
         coalesce(v_instagram, '')
       and btrim(coalesce(v_existing_customer.note, '')) = v_note
       and v_existing_customer.birthday is not distinct from p_birthday
       and coalesce(v_existing_customer.max_future_appointments, 4) =
         coalesce(p_max_future_appointments, 4)
       and coalesce(v_existing_customer.max_future_appointments_mode, 'monthly') =
         coalesce(p_max_future_appointments_mode, 'monthly')
       and coalesce(v_existing_customer.max_daily_appointments, 3) =
         coalesce(p_max_daily_appointments, 3)
       and coalesce(v_existing_customer.source, '') = 'salon'
       and v_existing_customer.is_active is true then
      delete from public.customer_deletion_tombstones as tombstone
      where tombstone.workspace_id = v_workspace_id
        and tombstone.normalized_name = v_normalized_name;

      return jsonb_build_object(
        'ok', true,
        'replayed', true,
        'workspace_id', v_workspace_id,
        'customer', jsonb_build_object(
          'id', v_existing_customer.id,
          'workspace_id', v_existing_customer.workspace_id,
          'full_name', v_existing_customer.full_name,
          'phone', v_existing_customer.phone,
          'email', v_existing_customer.email,
          'instagram', v_existing_customer.instagram,
          'note', v_existing_customer.note,
          'birthday', to_char(v_existing_customer.birthday, 'YYYY-MM-DD'),
          'source', v_existing_customer.source,
          'is_active', v_existing_customer.is_active,
          'viewed_by_salon', v_existing_customer.viewed_by_salon,
          'max_future_appointments',
            v_existing_customer.max_future_appointments,
          'max_future_appointments_mode',
            v_existing_customer.max_future_appointments_mode,
          'max_daily_appointments', v_existing_customer.max_daily_appointments
        )
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'code', 'customer_id_conflict',
      'message', 'Identita cliente gia usata da un salvataggio diverso.',
      'workspace_id', v_workspace_id
    );
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
            'Esiste gia un cliente con questo telefono e questa email: ' ||
              v_duplicate_name || '.'
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

  -- Explicit recreation is authoritative and clears the historical name
  -- tombstone in the same transaction as the canonical insert.
  delete from public.customer_deletion_tombstones as tombstone
  where tombstone.workspace_id = v_workspace_id
    and tombstone.normalized_name = v_normalized_name;

  insert into public.customers (
    id,
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
    p_customer_id,
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
    'replayed', false,
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

revoke all on function public.create_owner_customer_v4(
  uuid, uuid, text, text, text, text, text, date, integer, text, integer
) from public, anon;
grant execute on function public.create_owner_customer_v4(
  uuid, uuid, text, text, text, text, text, date, integer, text, integer
) to authenticated;

comment on function public.create_owner_customer_v4(
  uuid, uuid, text, text, text, text, text, date, integer, text, integer
) is 'Creates one canonical owner customer with a caller-generated UUID; only retries carrying that exact UUID can replay, while later identical attempts remain duplicate conflicts.';

notify pgrst, 'reload schema';

commit;
