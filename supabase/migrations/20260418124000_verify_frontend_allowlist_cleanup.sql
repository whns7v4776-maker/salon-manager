do $$
declare
  v_customers_remaining integer;
  v_booking_requests_remaining integer;
  v_waitlist_remaining integer;
  v_push_devices_remaining integer;
begin
  select count(*)
  into v_customers_remaining
  from public.customers as customer
  where customer.source = 'frontend'
    and (
      nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext is null
      or nullif(lower(trim(coalesce(customer.email::text, ''))), '')::citext not in (
        'michelle_91_@hotmail.it'::citext,
        'felicecristiano331@gmail.com'::citext,
        'mchiaramacri97@gmail.com'::citext
      )
    );

  select count(*)
  into v_booking_requests_remaining
  from public.booking_requests as booking_request
  where booking_request.origin = 'frontend'
    and (
      nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext is null
      or nullif(lower(trim(coalesce(booking_request.customer_email::text, ''))), '')::citext not in (
        'michelle_91_@hotmail.it'::citext,
        'felicecristiano331@gmail.com'::citext,
        'mchiaramacri97@gmail.com'::citext
      )
    );

  select count(*)
  into v_waitlist_remaining
  from public.booking_slot_waitlist as waitlist
  where
    nullif(lower(trim(coalesce(waitlist.customer_email::text, ''))), '')::citext is null
    or nullif(lower(trim(coalesce(waitlist.customer_email::text, ''))), '')::citext not in (
      'michelle_91_@hotmail.it'::citext,
      'felicecristiano331@gmail.com'::citext,
      'mchiaramacri97@gmail.com'::citext
    );

  select count(*)
  into v_push_devices_remaining
  from public.push_devices as device
  where device.recipient_kind = 'client'
    and (
      nullif(lower(trim(coalesce(device.customer_email::text, ''))), '')::citext is null
      or nullif(lower(trim(coalesce(device.customer_email::text, ''))), '')::citext not in (
        'michelle_91_@hotmail.it'::citext,
        'felicecristiano331@gmail.com'::citext,
        'mchiaramacri97@gmail.com'::citext
      )
    );

  if v_customers_remaining > 0 then
    raise exception 'frontend_customers_cleanup_failed:%', v_customers_remaining;
  end if;

  if v_booking_requests_remaining > 0 then
    raise exception 'frontend_booking_requests_cleanup_failed:%', v_booking_requests_remaining;
  end if;

  if v_waitlist_remaining > 0 then
    raise exception 'frontend_waitlist_cleanup_failed:%', v_waitlist_remaining;
  end if;

  if v_push_devices_remaining > 0 then
    raise exception 'frontend_push_devices_cleanup_failed:%', v_push_devices_remaining;
  end if;

  raise notice 'frontend_cleanup_verified: only allowlist accounts remain';
end
$$;
