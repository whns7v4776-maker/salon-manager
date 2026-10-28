-- Allow a promotion to run only on selected ISO weekdays (1 = Monday, 7 = Sunday).
-- NULL deliberately means every day so all existing promotions keep their behaviour.

alter table public.services
  add column if not exists discount_weekdays smallint[];

alter table public.services
  drop constraint if exists services_discount_weekdays_check,
  add constraint services_discount_weekdays_check
    check (
      discount_weekdays is null
      or (
        cardinality(discount_weekdays) > 0
        and discount_weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]
      )
    );

create or replace function public.normalize_service_discount_weekdays_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_weekdays smallint[];
begin
  if new.discount_weekdays is null then
    return new;
  end if;

  select coalesce(array_agg(distinct weekday order by weekday), '{}'::smallint[])
  into v_weekdays
  from unnest(new.discount_weekdays) as weekday
  where weekday between 1 and 7;

  -- Empty and all-seven selections both mean every day.
  new.discount_weekdays :=
    case
      when cardinality(v_weekdays) in (0, 7) then null
      else v_weekdays
    end;

  return new;
end;
$$;

drop trigger if exists normalize_service_discount_weekdays_v1 on public.services;
create trigger normalize_service_discount_weekdays_v1
before insert or update of discount_weekdays on public.services
for each row
execute function public.normalize_service_discount_weekdays_v1();

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
          'scontoOraDalle', case when service.discount_start_time is null then null else to_char(service.discount_start_time, 'HH24:MI') end,
          'scontoOraAlle', case when service.discount_end_time is null then null else to_char(service.discount_end_time, 'HH24:MI') end,
          'scontoGiorniSettimana', service.discount_weekdays,
          'durataMinuti', service.duration_minutes,
          'phaseConfig', service.phase_config,
          'mestiereRichiesto', coalesce(service.required_role, ''),
          'badgeCliente', coalesce(service.client_badge, ''),
          'ordineMestiereCliente', service.client_role_display_order,
          'ordineCliente', service.client_display_order,
          'disponibileOnline', true
        )
        order by service.client_role_display_order, service.required_role,
          service.client_display_order, service.updated_at desc, service.created_at desc
      )
      from public.services as service
      left join lateral (
        select existing_item as item
        from jsonb_array_elements(coalesce(portal.servizi, '[]'::jsonb))
          with ordinality as existing(existing_item, existing_position)
        where nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text
          or (
            lower(trim(coalesce(existing_item ->> 'nome', ''))) <> ''
            and lower(trim(coalesce(existing_item ->> 'nome', ''))) = lower(trim(service.name))
          )
        order by case when nullif(trim(coalesce(existing_item ->> 'id', '')), '') = service.id::text then 0 else 1 end,
          existing_position
        limit 1
      ) as matched on true
      where service.workspace_id = portal.workspace_id
        and service.is_online = true
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
end;
$$;

grant execute on function public.sync_client_portal_services(uuid) to authenticated;

-- The customer-specific price is authoritative. A scheduled promotion must never
-- discount it again or replace it with the catalogue price.
create or replace function public.apply_scheduled_service_price_to_booking_request()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_service public.services%rowtype;
  v_customer_id uuid;
  v_override_price numeric;
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

  v_customer_id := new.customer_id;

  if v_customer_id is null
    and nullif(lower(trim(coalesce(new.customer_email::text, ''))), '') is not null
    and nullif(regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g'), '') is not null
  then
    select customer.id
    into v_customer_id
    from public.customers as customer
    where customer.workspace_id = new.workspace_id
      and customer.is_active is not false
      and lower(trim(coalesce(customer.email::text, ''))) =
        lower(trim(new.customer_email::text))
      and regexp_replace(coalesce(customer.phone, ''), '\D', '', 'g') =
        regexp_replace(coalesce(new.customer_phone, ''), '\D', '', 'g')
    order by customer.updated_at desc
    limit 1;
  end if;

  if v_customer_id is not null then
    select price_override.price
    into v_override_price
    from public.customer_service_price_overrides as price_override
    where price_override.workspace_id = new.workspace_id
      and price_override.customer_id = v_customer_id
      and price_override.service_id = v_service.id
    limit 1;
  end if;

  if v_override_price is not null then
    new.requested_price := greatest(v_override_price, 0);
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
      v_service.discount_weekdays is null
      or extract(isodow from new.appointment_date)::smallint = any(v_service.discount_weekdays)
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

-- Price is a booking snapshot: rescheduling or accepting an existing request
-- must not silently recalculate its amount.
create trigger booking_requests_apply_scheduled_service_price
before insert on public.booking_requests
for each row
execute function public.apply_scheduled_service_price_to_booking_request();

notify pgrst, 'reload schema';
