-- Public business details are discoverable by default; explicit owner opt-outs win.
-- Nearby results still require owner-confirmed coordinates.
alter table public.salon_directory_profiles alter column enabled set default true;
do $$
declare item record;
begin
  for item in select conname from pg_constraint
    where conrelid = 'public.salon_directory_profiles'::regclass
      and contype = 'c' and pg_get_constraintdef(oid) like '%enabled%address_confirmed%'
  loop
    execute format('alter table public.salon_directory_profiles drop constraint %I', item.conname);
  end loop;
end $$;

create or replace function public.search_public_salons(p_query text default '', p_latitude double precision default null, p_longitude double precision default null)
returns table (salon_code text, salon_name text, address text, city text, photo_url text, image_kind text, distance_km double precision)
language plpgsql stable security definer set search_path = public as $$
declare
  q text := left(trim(coalesce(p_query, '')), 100);
  nearby boolean := p_latitude is not null and p_longitude is not null;
begin
  if (p_latitude is null) <> (p_longitude is null) or
    (nearby and not (p_latitude between -90 and 90 and p_longitude between -180 and 180)) then
    raise exception 'invalid_location';
  end if;
  if length(q) < 2 and not nearby then return; end if;
  return query
  select w.slug::text, coalesce(d.display_name, w.salon_name)::text, coalesce(d.address, w.street_line, '')::text, coalesce(d.city, w.city, '')::text, d.photo_url, coalesce(d.image_kind, 'photo')::text,
    case when nearby and d.latitude is not null then
      6371.0 * acos(least(1.0, greatest(-1.0,
        sin(radians(p_latitude)) * sin(radians(d.latitude)) +
        cos(radians(p_latitude)) * cos(radians(d.latitude)) * cos(radians(d.longitude - p_longitude)))))
    else null end as distance
  from public.workspaces w left join public.salon_directory_profiles d on w.id = d.workspace_id
  where coalesce(d.enabled, true)
    and (w.is_internal_tester = true or w.subscription_status in ('demo', 'active'))
    and (not nearby or (d.latitude is not null and d.address_confirmed))
    and (length(q) < 2 or position(lower(q) in lower(coalesce(d.display_name, w.salon_name))) > 0 or position(lower(q) in lower(coalesce(d.city, w.city, ''))) > 0)
  order by distance asc nulls last, coalesce(d.display_name, w.salon_name), w.slug
  limit 30;
end;
$$;

notify pgrst, 'reload schema';
