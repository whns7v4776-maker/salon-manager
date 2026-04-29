alter table public.booking_requests
  add column if not exists viewed_by_salon boolean;

update public.booking_requests
set viewed_by_salon = case
  when status in ('pending', 'cancelled') then false
  else true
end
where viewed_by_salon is null;

alter table public.booking_requests
  alter column viewed_by_salon set default false;

alter table public.booking_requests
  alter column viewed_by_salon set not null;
