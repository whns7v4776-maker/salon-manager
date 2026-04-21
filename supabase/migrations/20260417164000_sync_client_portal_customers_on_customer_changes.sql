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
            case
              when customer.source = 'frontend' then 'frontend'
              else 'salone'
            end,
          'viewedBySalon', customer.viewed_by_salon,
          'annullamentiCount',
            case
              when coalesce(matched.item ->> 'annullamentiCount', '') ~ '^\d+$'
                then (matched.item ->> 'annullamentiCount')::integer
              else 0
            end,
          'inibito',
            case
              when lower(trim(coalesce(matched.item ->> 'inibito', ''))) in ('true', 'false')
                then (matched.item ->> 'inibito')::boolean
              else false
            end,
          'maxFutureAppointments',
            case
              when coalesce(matched.item ->> 'maxFutureAppointments', '') ~ '^\d+$'
                then (matched.item ->> 'maxFutureAppointments')::integer
              else null
            end,
          'maxFutureAppointmentsMode',
            case
              when matched.item ->> 'maxFutureAppointmentsMode' in ('monthly', 'total_future')
                then matched.item ->> 'maxFutureAppointmentsMode'
              else null
            end
        )
        order by customer.updated_at desc, customer.created_at desc
      )
      from public.customers as customer
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.clienti, '[]'::jsonb)) as existing_item
        where (
          nullif(trim(coalesce(existing_item ->> 'id', '')), '') = customer.id::text
        ) or (
          regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') <> ''
          and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') <> ''
          and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') =
            regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g')
        ) or (
          lower(trim(coalesce(existing_item ->> 'email', ''))) <> ''
          and lower(trim(coalesce(customer.email::text, ''))) <> ''
          and lower(trim(coalesce(existing_item ->> 'email', ''))) =
            lower(trim(coalesce(customer.email::text, '')))
        ) or (
          lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
          and lower(trim(coalesce(customer.full_name, ''))) <> ''
          and lower(trim(coalesce(existing_item ->> 'nome', ''))) =
            lower(trim(coalesce(customer.full_name, '')))
        )
        order by
          case
            when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = customer.id::text then 0
            when (
              regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') <> ''
              and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') <> ''
              and regexp_replace(coalesce(existing_item ->> 'telefono', ''), '\D+', '', 'g') =
                regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g')
            ) then 1
            when (
              lower(trim(coalesce(existing_item ->> 'email', ''))) <> ''
              and lower(trim(coalesce(customer.email::text, ''))) <> ''
              and lower(trim(coalesce(existing_item ->> 'email', ''))) =
                lower(trim(coalesce(customer.email::text, '')))
            ) then 2
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

create or replace function public.handle_client_portal_customer_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  v_workspace_id := coalesce(new.workspace_id, old.workspace_id);

  if v_workspace_id is null then
    return coalesce(new, old);
  end if;

  perform public.sync_client_portal_customers(v_workspace_id);

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_client_portal_after_customers_change on public.customers;
create trigger sync_client_portal_after_customers_change
after insert or update or delete on public.customers
for each row execute procedure public.handle_client_portal_customer_sync();

do $$
declare
  workspace_record record;
begin
  for workspace_record in
    select portal.workspace_id
    from public.client_portals as portal
  loop
    perform public.sync_client_portal_customers(workspace_record.workspace_id);
  end loop;
end;
$$;
