alter table public.services
  add column if not exists original_price numeric(10,2),
  add column if not exists discount_enabled boolean not null default false,
  add column if not exists discount_valid_from date,
  add column if not exists discount_valid_to date,
  add column if not exists discount_start_time time without time zone,
  add column if not exists discount_end_time time without time zone;

update public.services as service
set
  original_price = source.original_price,
  discount_enabled = coalesce(source.discount_enabled, source.original_price > service.price, false),
  discount_valid_from = source.discount_valid_from,
  discount_valid_to = source.discount_valid_to,
  discount_start_time = source.discount_start_time,
  discount_end_time = source.discount_end_time
from (
  select
    snapshot.workspace_id,
    nullif(trim(coalesce(service_item ->> 'id', '')), '') as service_id,
    nullif(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', '')), '') as service_name,
    case
      when trim(coalesce(service_item ->> 'prezzoOriginale', service_item ->> 'original_price', ''))
        ~ '^[0-9]+([.][0-9]{1,2})?$'
      then trim(coalesce(service_item ->> 'prezzoOriginale', service_item ->> 'original_price'))::numeric
      else null
    end as original_price,
    case lower(trim(coalesce(service_item ->> 'scontoAttivo', service_item ->> 'discount_enabled', '')))
      when 'true' then true
      when 'false' then false
      else null
    end as discount_enabled,
    case
      when trim(coalesce(service_item ->> 'scontoValidoDal', service_item ->> 'discount_valid_from', ''))
        ~ '^\d{4}-\d{2}-\d{2}$'
      then trim(coalesce(service_item ->> 'scontoValidoDal', service_item ->> 'discount_valid_from'))::date
      else null
    end as discount_valid_from,
    case
      when trim(coalesce(service_item ->> 'scontoValidoAl', service_item ->> 'discount_valid_to', ''))
        ~ '^\d{4}-\d{2}-\d{2}$'
      then trim(coalesce(service_item ->> 'scontoValidoAl', service_item ->> 'discount_valid_to'))::date
      else null
    end as discount_valid_to,
    case
      when trim(coalesce(service_item ->> 'scontoOraDalle', service_item ->> 'discount_start_time', ''))
        ~ '^([01]\d|2[0-3]):[0-5]\d$'
      then trim(coalesce(service_item ->> 'scontoOraDalle', service_item ->> 'discount_start_time'))::time
      else null
    end as discount_start_time,
    case
      when trim(coalesce(service_item ->> 'scontoOraAlle', service_item ->> 'discount_end_time', ''))
        ~ '^([01]\d|2[0-3]):[0-5]\d$'
      then trim(coalesce(service_item ->> 'scontoOraAlle', service_item ->> 'discount_end_time'))::time
      else null
    end as discount_end_time
  from public.owner_app_snapshots as snapshot
  cross join lateral jsonb_array_elements(
    coalesce(snapshot.payload -> 'servizi', '[]'::jsonb)
  ) as service_item
) as source
where service.workspace_id = source.workspace_id
  and source.original_price is not null
  and source.original_price > service.price
  and (
    service.id::text = source.service_id
    or (
      source.service_id is null
      and lower(trim(service.name)) = lower(source.service_name)
    )
  );

alter table public.services
  drop constraint if exists services_original_price_check,
  add constraint services_original_price_check
    check (original_price is null or original_price > price),
  drop constraint if exists services_discount_date_range_check,
  add constraint services_discount_date_range_check
    check (
      (discount_valid_from is null and discount_valid_to is null)
      or (
        discount_valid_from is not null
        and discount_valid_to is not null
        and discount_valid_to >= discount_valid_from
      )
    ),
  drop constraint if exists services_discount_time_range_check,
  add constraint services_discount_time_range_check
    check (
      (discount_start_time is null and discount_end_time is null)
      or (
        discount_start_time is not null
        and discount_end_time is not null
        and discount_end_time > discount_start_time
      )
    );

create or replace function public.sync_client_portal_services(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.client_portals as portal
  set servizi = coalesce(
    (
      select jsonb_agg(
        coalesce(matched.item, '{}'::jsonb) ||
        jsonb_build_object(
          'id', service.id,
          'nome', service.name,
          'descrizione', coalesce(service.description, ''),
          'prezzo', service.price,
          'prezzoOriginale', service.original_price,
          'scontoAttivo', service.discount_enabled,
          'scontoValidoDal', service.discount_valid_from,
          'scontoValidoAl', service.discount_valid_to,
          'scontoOraDalle',
            case
              when service.discount_start_time is null then null
              else to_char(service.discount_start_time, 'HH24:MI')
            end,
          'scontoOraAlle',
            case
              when service.discount_end_time is null then null
              else to_char(service.discount_end_time, 'HH24:MI')
            end,
          'durataMinuti', service.duration_minutes,
          'mestiereRichiesto', coalesce(service.required_role, '')
        )
        order by coalesce(matched.position, 2147483647), service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select
          existing_item as item,
          existing_position as position
        from jsonb_array_elements(
          coalesce(portal.servizi, '[]'::jsonb)
        ) with ordinality as existing(existing_item, existing_position)
        where (
          nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
        ) or (
          lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
          and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
        )
        order by
          case
            when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0
            else 1
          end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

create or replace function public.apply_scheduled_service_price_to_booking_request()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_promotion_active boolean := false;
begin
  if lower(trim(coalesce(new.origin::text, ''))) <> 'frontend' then
    return new;
  end if;

  select service.*
  into v_service
  from public.services as service
  where service.workspace_id = new.workspace_id
    and lower(trim(service.name)) = lower(trim(new.requested_service_name))
  order by service.updated_at desc, service.created_at desc
  limit 1;

  if v_service.id is null then
    return new;
  end if;

  v_promotion_active :=
    v_service.discount_enabled
    and v_service.original_price is not null
    and v_service.original_price > v_service.price
    and (
      v_service.discount_valid_from is null
      or new.appointment_date >= v_service.discount_valid_from
    )
    and (
      v_service.discount_valid_to is null
      or new.appointment_date <= v_service.discount_valid_to
    )
    and (
      v_service.discount_start_time is null
      or new.appointment_time >= v_service.discount_start_time
    )
    and (
      v_service.discount_end_time is null
      or new.appointment_time < v_service.discount_end_time
    );

  new.requested_price :=
    case
      when v_promotion_active then v_service.price
      else coalesce(v_service.original_price, v_service.price)
    end;

  return new;
end;
$$;

drop trigger if exists booking_requests_apply_scheduled_service_price
  on public.booking_requests;

create trigger booking_requests_apply_scheduled_service_price
before insert or update of
  workspace_id,
  requested_service_name,
  requested_price,
  appointment_date,
  appointment_time,
  origin
on public.booking_requests
for each row
execute function public.apply_scheduled_service_price_to_booking_request();
