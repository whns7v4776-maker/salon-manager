create temp table keep_customer_allowlist (
  email citext,
  full_name_normalized text
) on commit drop;

insert into keep_customer_allowlist (email, full_name_normalized)
values
  ('felicecristiano331@gmail.com'::citext, 'felice cristiano'),
  ('michelle_91_@hotmail.it'::citext, 'michelle pecoraro'),
  ('mchiaramacri97@gmail.com'::citext, 'chiara macri');

create temp table doomed_customers on commit drop as
select
  customer.id,
  customer.workspace_id,
  nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext as email,
  lower(trim(regexp_replace(coalesce(customer.full_name, ''), '\s+', ' ', 'g'))) as full_name_normalized
from public.customers as customer
where not exists (
  select 1
  from keep_customer_allowlist as keep_customer
  where (
    keep_customer.email is not null
    and keep_customer.email = nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext
  )
  or keep_customer.full_name_normalized =
    lower(trim(regexp_replace(coalesce(customer.full_name, ''), '\s+', ' ', 'g')))
);

create temp table doomed_booking_requests on commit drop as
select
  booking_request.id,
  booking_request.workspace_id,
  nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext as email,
  lower(
    trim(
      regexp_replace(
        concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')),
        '\s+',
        ' ',
        'g'
      )
    )
  ) as full_name_normalized
from public.booking_requests as booking_request
where not exists (
  select 1
  from keep_customer_allowlist as keep_customer
  where (
    keep_customer.email is not null
    and keep_customer.email = nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext
  )
  or keep_customer.full_name_normalized =
    lower(
      trim(
        regexp_replace(
          concat_ws(' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '')),
          '\s+',
          ' ',
          'g'
        )
      )
    )
);

create temp table doomed_client_devices on commit drop as
select distinct
  device.id
from public.push_devices as device
where device.recipient_kind = 'client'
  and not exists (
    select 1
    from keep_customer_allowlist as keep_customer
    where keep_customer.email is not null
      and keep_customer.email = nullif(lower(trim(coalesce(device.customer_email::text, ''))), '')::citext
  );

delete from public.push_notifications
where device_id in (
  select doomed_device.id
  from doomed_client_devices as doomed_device
)
or (
  nullif(lower(trim(coalesce(payload ->> 'customerEmail', ''))), '')::citext is not null
  and not exists (
    select 1
    from keep_customer_allowlist as keep_customer
    where keep_customer.email =
      nullif(lower(trim(coalesce(payload ->> 'customerEmail', ''))), '')::citext
  )
);

delete from public.push_devices
where id in (
  select doomed_device.id
  from doomed_client_devices as doomed_device
);

delete from public.cash_movements
where appointment_id in (
  select appointment.id
  from public.appointments as appointment
  where appointment.customer_id in (
      select doomed_customer.id
      from doomed_customers as doomed_customer
    )
    or appointment.booking_request_id in (
      select doomed_request.id
      from doomed_booking_requests as doomed_request
    )
);

delete from public.appointments
where customer_id in (
    select doomed_customer.id
    from doomed_customers as doomed_customer
  )
  or booking_request_id in (
    select doomed_request.id
    from doomed_booking_requests as doomed_request
  );

delete from public.booking_slot_waitlist
where not exists (
  select 1
  from keep_customer_allowlist as keep_customer
  where keep_customer.email is not null
    and keep_customer.email =
      nullif(lower(trim(coalesce(booking_slot_waitlist.customer_email::text, ''))), '')::citext
);

delete from public.booking_requests
where id in (
  select doomed_request.id
  from doomed_booking_requests as doomed_request
);

delete from public.customers
where id in (
  select doomed_customer.id
  from doomed_customers as doomed_customer
);

do $$
declare
  workspace_record record;
begin
  for workspace_record in
    select distinct workspace_id
    from (
      select workspace_id from doomed_customers
      union
      select workspace_id from doomed_booking_requests
    ) as changed_workspaces
    where workspace_id is not null
  loop
    perform public.sync_client_portal_customers(workspace_record.workspace_id);
    perform public.sync_client_portal_appointments(workspace_record.workspace_id);
    perform public.sync_client_portal_booking_requests(workspace_record.workspace_id);
  end loop;
end
$$;
