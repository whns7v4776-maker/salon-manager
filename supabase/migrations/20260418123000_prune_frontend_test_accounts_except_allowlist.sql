create temp table keep_frontend_customer_emails (
  email citext primary key
) on commit drop;

insert into keep_frontend_customer_emails (email)
values
  ('michelle_91_@hotmail.it'),
  ('felicecristiano331@gmail.com'),
  ('mchiaramacri97@gmail.com');

create temp table doomed_frontend_customers on commit drop as
select
  customer.id,
  customer.workspace_id,
  nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext as email,
  nullif(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), '') as phone
from public.customers as customer
where customer.source = 'frontend'
  and (
    nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext is null
    or not exists (
      select 1
      from keep_frontend_customer_emails as keep_email
      where keep_email.email = nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext
    )
  );

create temp table doomed_frontend_booking_requests on commit drop as
select
  booking_request.id,
  booking_request.workspace_id,
  nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext as email,
  nullif(regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g'), '') as phone
from public.booking_requests as booking_request
where booking_request.origin = 'frontend'
  and (
    nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext is null
    or not exists (
      select 1
      from keep_frontend_customer_emails as keep_email
      where keep_email.email = nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext
    )
  );

create temp table doomed_frontend_client_devices on commit drop as
select distinct
  device.id
from public.push_devices as device
left join keep_frontend_customer_emails as keep_email
  on keep_email.email = nullif(lower(trim(coalesce(device.customer_email::text, ''))), '')::citext
where device.recipient_kind = 'client'
  and (
    nullif(lower(trim(coalesce(device.customer_email::text, ''))), '')::citext is null
    or keep_email.email is null
  );

delete from public.push_notifications
where device_id in (
  select doomed_device.id
  from doomed_frontend_client_devices as doomed_device
)
or (
  nullif(lower(trim(coalesce(payload ->> 'customerEmail', ''))), '')::citext is not null
  and not exists (
    select 1
    from keep_frontend_customer_emails as keep_email
    where keep_email.email = nullif(lower(trim(coalesce(payload ->> 'customerEmail', ''))), '')::citext
  )
);

delete from public.push_devices
where id in (
  select doomed_device.id
  from doomed_frontend_client_devices as doomed_device
);

delete from public.cash_movements
where appointment_id in (
  select appointment.id
  from public.appointments as appointment
  where appointment.customer_id in (
      select doomed_customer.id
      from doomed_frontend_customers as doomed_customer
    )
    or appointment.booking_request_id in (
      select doomed_request.id
      from doomed_frontend_booking_requests as doomed_request
    )
);

delete from public.appointments
where customer_id in (
    select doomed_customer.id
    from doomed_frontend_customers as doomed_customer
  )
  or booking_request_id in (
    select doomed_request.id
    from doomed_frontend_booking_requests as doomed_request
  );

delete from public.booking_slot_waitlist
where nullif(lower(trim(coalesce(customer_email::text, ''))), '')::citext is null
   or not exists (
    select 1
    from keep_frontend_customer_emails as keep_email
    where keep_email.email = nullif(lower(trim(coalesce(customer_email::text, ''))), '')::citext
  );

delete from public.booking_requests
where id in (
  select doomed_request.id
  from doomed_frontend_booking_requests as doomed_request
);

delete from public.customers
where id in (
  select doomed_customer.id
  from doomed_frontend_customers as doomed_customer
);

do $$
declare
  workspace_record record;
begin
  for workspace_record in
    select distinct workspace_id
    from (
      select workspace_id from doomed_frontend_customers
      union
      select workspace_id from doomed_frontend_booking_requests
    ) as changed_workspaces
    where workspace_id is not null
  loop
    perform public.sync_client_portal_customers(workspace_record.workspace_id);
    perform public.sync_client_portal_appointments(workspace_record.workspace_id);
    perform public.sync_client_portal_booking_requests(workspace_record.workspace_id);
  end loop;
end
$$;
