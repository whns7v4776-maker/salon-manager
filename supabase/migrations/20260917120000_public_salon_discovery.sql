-- Explicit owner publication; never expose owner contact or customer records.
create table public.salon_directory_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  address_confirmed boolean not null default false,
  display_name text not null check (length(trim(display_name)) between 2 and 100),
  address text not null check (length(trim(address)) between 3 and 180),
  city text not null check (length(trim(city)) between 2 and 100),
  image_kind text not null default 'photo' check (image_kind in ('photo', 'logo')),
  location_accuracy double precision check (location_accuracy between 0 and 100),
  photo_url text check (photo_url is null or (length(photo_url) <= 2048 and photo_url like 'https://%')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  check ((latitude is null) = (longitude is null)),
  check (not enabled or address_confirmed)
);
alter table public.salon_directory_profiles enable row level security;
create policy owner_directory_profile on public.salon_directory_profiles
for all to authenticated using (workspace_id = public.current_workspace_id())
with check (workspace_id = public.current_workspace_id());
grant select, insert, update, delete on public.salon_directory_profiles to authenticated;
revoke all on public.salon_directory_profiles from anon;

create function public.search_public_salons(p_query text default '', p_latitude double precision default null, p_longitude double precision default null)
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
  select w.slug::text, d.display_name, d.address, d.city, d.photo_url, d.image_kind,
    case when nearby and d.latitude is not null then
      6371.0 * acos(least(1.0, greatest(-1.0,
        sin(radians(p_latitude)) * sin(radians(d.latitude)) +
        cos(radians(p_latitude)) * cos(radians(d.latitude)) * cos(radians(d.longitude - p_longitude)))))
    else null end as distance
  from public.salon_directory_profiles d join public.workspaces w on w.id = d.workspace_id
  where d.enabled and d.address_confirmed
    and (w.is_internal_tester = true or w.subscription_status in ('demo', 'active'))
    and (not nearby or d.latitude is not null)
    and (length(q) < 2 or position(lower(q) in lower(d.display_name)) > 0 or position(lower(q) in lower(d.city)) > 0)
  order by distance asc nulls last, d.display_name, w.slug
  limit 30;
end;
$$;
revoke all on function public.search_public_salons(text, double precision, double precision) from public;
grant execute on function public.search_public_salons(text, double precision, double precision) to anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('salon-directory', 'salon-directory', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);
create policy owner_directory_image_insert on storage.objects for insert to authenticated
with check (bucket_id = 'salon-directory' and (storage.foldername(name))[1] = public.current_workspace_id()::text);
create policy owner_directory_image_select on storage.objects for select to authenticated
using (bucket_id = 'salon-directory' and (storage.foldername(name))[1] = public.current_workspace_id()::text);
create policy owner_directory_image_update on storage.objects for update to authenticated
using (bucket_id = 'salon-directory' and (storage.foldername(name))[1] = public.current_workspace_id()::text)
with check (bucket_id = 'salon-directory' and (storage.foldername(name))[1] = public.current_workspace_id()::text);
create policy owner_directory_image_delete on storage.objects for delete to authenticated
using (bucket_id = 'salon-directory' and (storage.foldername(name))[1] = public.current_workspace_id()::text);
