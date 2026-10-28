create or replace function public.handle_client_portal_customer_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid := coalesce(new.workspace_id, old.workspace_id);
  v_customer_id uuid := coalesce(new.id, old.id);
  v_full_name text := trim(coalesce(new.full_name, old.full_name, ''));
  v_phone text := coalesce(new.phone, old.phone, '');
  v_normalized_phone text := regexp_replace(coalesce(new.phone, old.phone, ''), '\D+', '', 'g');
  v_email_text text := lower(trim(coalesce(new.email::text, old.email::text, '')));
  v_instagram text := coalesce(new.instagram, old.instagram, '');
  v_note text := coalesce(new.note, old.note, '');
  v_source text := coalesce(new.source, old.source, 'salon');
  v_viewed_by_salon boolean := coalesce(new.viewed_by_salon, old.viewed_by_salon, true);
  v_max_future_appointments integer := coalesce(new.max_future_appointments, old.max_future_appointments);
  v_max_future_appointments_mode text := coalesce(new.max_future_appointments_mode, old.max_future_appointments_mode);
  v_max_daily_appointments integer := coalesce(new.max_daily_appointments, old.max_daily_appointments);
  v_preserved_item jsonb;
  v_customer_payload jsonb;
begin
  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    update public.client_portals as portal
    set
      clienti = coalesce(
        (
          select jsonb_agg(existing_item)
          from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
          where not (
            (nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text)
            or (
              v_normalized_phone <> ''
              and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
            )
            or (
              v_email_text <> ''
              and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
            )
            or (
              v_full_name <> ''
              and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(v_full_name)
            )
          )
        ),
        '[]'::jsonb
      ),
      updated_at = timezone('utc', now())
    where portal.workspace_id = v_workspace_id;

    return old;
  end if;

  select existing_item
  into v_preserved_item
  from public.client_portals as portal
  cross join lateral jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
  where portal.workspace_id = v_workspace_id
    and (
      (nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text)
      or (
        v_normalized_phone <> ''
        and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
      )
      or (
        v_email_text <> ''
        and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
      )
      or (
        v_full_name <> ''
        and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(v_full_name)
      )
    )
  order by
    case
      when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text then 0
      when (
        v_normalized_phone <> ''
        and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
      ) then 1
      when (
        v_email_text <> ''
        and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
      ) then 2
      else 3
    end
  limit 1;

  v_customer_payload := jsonb_build_object(
    'id', v_customer_id,
    'nome', v_full_name,
    'telefono', v_phone,
    'email', coalesce(new.email::text, old.email::text, ''),
    'instagram', v_instagram,
    'birthday', coalesce(v_preserved_item ->> 'birthday', ''),
    'nota', v_note,
    'fonte',
      case
        when v_source = 'frontend' then 'frontend'
        else 'salone'
      end,
    'viewedBySalon', v_viewed_by_salon,
    'annullamentiCount',
      case
        when coalesce(v_preserved_item ->> 'annullamentiCount', '') ~ '^\d+$'
          then (v_preserved_item ->> 'annullamentiCount')::integer
        else 0
      end,
    'inibito',
      case
        when lower(trim(coalesce(v_preserved_item ->> 'inibito', ''))) in ('true', 'false')
          then (v_preserved_item ->> 'inibito')::boolean
        else false
      end,
    'maxFutureAppointments',
      coalesce(
        to_jsonb(v_max_future_appointments),
        case
          when coalesce(v_preserved_item ->> 'maxFutureAppointments', '') ~ '^\d+$'
            then to_jsonb((v_preserved_item ->> 'maxFutureAppointments')::integer)
          else 'null'::jsonb
        end
      ),
    'maxFutureAppointmentsMode',
      coalesce(
        to_jsonb(v_max_future_appointments_mode),
        case
          when v_preserved_item ->> 'maxFutureAppointmentsMode' in ('monthly', 'total_future')
            then to_jsonb(v_preserved_item ->> 'maxFutureAppointmentsMode')
          else 'null'::jsonb
        end
      ),
    'maxDailyAppointments',
      coalesce(
        to_jsonb(v_max_daily_appointments),
        case
          when coalesce(v_preserved_item ->> 'maxDailyAppointments', '') ~ '^\d+$'
            then to_jsonb((v_preserved_item ->> 'maxDailyAppointments')::integer)
          else 'null'::jsonb
        end
      )
  );

  update public.client_portals as portal
  set
    clienti = coalesce(
      (
        select jsonb_agg(item)
        from (
          select v_customer_payload as item, 0 as sort_order
          union all
          select existing_item as item, 1 as sort_order
          from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
          where not (
            (nullif(trim(coalesce(existing_item ->> 'id', '')), '') = v_customer_id::text)
            or (
              v_normalized_phone <> ''
              and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') = v_normalized_phone
            )
            or (
              v_email_text <> ''
              and lower(trim(coalesce(existing_item ->> 'email', ''))) = v_email_text
            )
            or (
              v_full_name <> ''
              and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(v_full_name)
            )
          )
        ) as reordered_items
        order by sort_order
      ),
      '[]'::jsonb
    ),
    updated_at = timezone('utc', now())
  where portal.workspace_id = v_workspace_id;

  return coalesce(new, old);
end;
$$;
