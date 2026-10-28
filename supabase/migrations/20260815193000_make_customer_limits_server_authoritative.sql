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
          'birthday', coalesce(matched.item ->> 'birthday', ''),
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

grant execute on function public.sync_client_portal_customers(uuid) to authenticated;
grant execute on function public.sync_client_portal_customers(uuid) to service_role;

do $$
declare
  workspace_record record;
begin
  for workspace_record in
    select portal.workspace_id from public.client_portals as portal
  loop
    perform public.sync_client_portal_customers(workspace_record.workspace_id);
  end loop;
end;
$$;

-- Owner snapshots are only a loading cache. Repair their customer fields from
-- the canonical table so an older app build cannot resurrect stale limits.
update public.owner_app_snapshots as snapshot
set
  payload = jsonb_set(
    coalesce(snapshot.payload, '{}'::jsonb),
    '{clienti}',
    coalesce(
      (
        select jsonb_agg(
          case
            when matched_customer.id is null then entry.item
            else entry.item || jsonb_build_object(
              'id', matched_customer.id,
              'nome', matched_customer.full_name,
              'telefono', coalesce(matched_customer.phone, ''),
              'email', coalesce(matched_customer.email::text, ''),
              'instagram', coalesce(matched_customer.instagram, ''),
              'nota', coalesce(matched_customer.note, ''),
              'fonte', case when matched_customer.source = 'frontend' then 'frontend' else 'salone' end,
              'viewedBySalon', matched_customer.viewed_by_salon,
              'inibito', not coalesce(matched_customer.is_active, true),
              'maxFutureAppointments', matched_customer.max_future_appointments,
              'maxFutureAppointmentsMode', matched_customer.max_future_appointments_mode,
              'maxDailyAppointments', matched_customer.max_daily_appointments
            )
          end
          order by entry.ordinality
        )
        from jsonb_array_elements(coalesce(snapshot.payload -> 'clienti', '[]'::jsonb))
          with ordinality as entry(item, ordinality)
        left join lateral (
          select customer.*
          from public.customers as customer
          where customer.workspace_id = snapshot.workspace_id
            and (
              nullif(trim(coalesce(entry.item ->> 'id', '')), '') = customer.id::text
              or (
                regexp_replace(coalesce(entry.item ->> 'telefono', ''), '\D+', '', 'g') <> ''
                and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
                  regexp_replace(coalesce(entry.item ->> 'telefono', ''), '\D+', '', 'g')
              )
              or (
                lower(trim(coalesce(entry.item ->> 'email', ''))) <> ''
                and lower(trim(coalesce(customer.email::text, ''))) =
                  lower(trim(coalesce(entry.item ->> 'email', '')))
              )
            )
          order by
            case
              when nullif(trim(coalesce(entry.item ->> 'id', '')), '') = customer.id::text then 0
              when regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
                regexp_replace(coalesce(entry.item ->> 'telefono', ''), '\D+', '', 'g') then 1
              else 2
            end,
            customer.updated_at desc
          limit 1
        ) as matched_customer on true
      ),
      '[]'::jsonb
    ),
    true
  ),
  updated_at = timezone('utc', now())
where jsonb_typeof(snapshot.payload -> 'clienti') = 'array';
