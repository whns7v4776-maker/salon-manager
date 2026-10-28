-- Public payment RPCs are STABLE and PostgREST runs them in a read-only
-- transaction. Admission checks in that path must never acquire row locks.
-- Booking mutations retain the original locking gate in a dedicated helper.
create or replace function public.assert_customer_registration_approved_v1(
  p_workspace_id uuid, p_customer_email text, p_customer_phone text
) returns void language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_customer public.customers%rowtype; v_required boolean;
begin
  -- Match the same salon-scoped identity used by existing public login.
  select customer.* into v_customer from public.customers customer
  where customer.workspace_id=p_workspace_id and customer.registration_status='pending'
    and nullif(trim(coalesce(p_customer_email,'')),'') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
    and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
    and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
      right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
  order by customer.updated_at desc,customer.id limit 1;
  if v_customer.registration_status='pending' then
    raise exception 'customer_registration_pending';
  end if;
  -- Pending lookup uses the partial index. Automatic salons avoid another
  -- full customer lookup or loading the large owner recovery JSON.
  select coalesce(availability_settings->'customerRegistrationApprovalRequired'='true'::jsonb,false)
    into v_required from public.client_portals where workspace_id=p_workspace_id;
  if v_required is true then
    select customer.* into v_customer from public.customers customer
    where customer.workspace_id=p_workspace_id and customer.registration_status='approved'
      and nullif(trim(coalesce(p_customer_email,'')),'') is not null
      and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
      and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
      and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
        right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
    order by customer.updated_at desc,customer.id limit 1;
    if v_customer.id is null then raise exception 'customer_registration_required'; end if;
  end if;
end $$;
revoke all on function public.assert_customer_registration_approved_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.assert_customer_registration_approved_v1(uuid,text,text) to service_role;


-- This volatile gate is reserved for mutations; preserve the existing customer
-- key locks so rejection cannot race a booking insertion.
create or replace function public.assert_customer_registration_approved_for_write_v1(
  p_workspace_id uuid, p_customer_email text, p_customer_phone text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_customer public.customers%rowtype; v_required boolean;
begin
  -- Match the same salon-scoped identity used by existing public login.
  select customer.* into v_customer from public.customers customer
  where customer.workspace_id=p_workspace_id and customer.registration_status='pending'
    and nullif(trim(coalesce(p_customer_email,'')),'') is not null
    and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
    and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
    and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
      right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
  order by customer.updated_at desc,customer.id limit 1
  for key share;
  if v_customer.registration_status='pending' then
    raise exception 'customer_registration_pending';
  end if;
  -- Pending lookup uses the partial index. Automatic salons avoid another
  -- full customer lookup or loading the large owner recovery JSON.
  select coalesce(availability_settings->'customerRegistrationApprovalRequired'='true'::jsonb,false)
    into v_required from public.client_portals where workspace_id=p_workspace_id;
  if v_required is true then
    select customer.* into v_customer from public.customers customer
    where customer.workspace_id=p_workspace_id and customer.registration_status='approved'
      and nullif(trim(coalesce(p_customer_email,'')),'') is not null
      and nullif(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),'') is not null
      and lower(trim(coalesce(customer.email::text,'')))=lower(trim(p_customer_email))
      and right(regexp_replace(coalesce(customer.phone,''),'\D+','','g'),10)=
        right(regexp_replace(coalesce(p_customer_phone,''),'\D+','','g'),10)
    order by customer.updated_at desc,customer.id limit 1 for key share;
    if v_customer.id is null then raise exception 'customer_registration_required'; end if;
  end if;
end $$;
revoke all on function public.assert_customer_registration_approved_for_write_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.assert_customer_registration_approved_for_write_v1(uuid,text,text) to service_role;


create or replace function public.enforce_customer_registration_booking_v1()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.origin::text <> 'frontend' or new.status::text not in ('pending','accepted') then return new; end if;
  -- Read-marker updates and cancellation workflows remain independent. Reopen,
  -- identity replacement or rescheduling still runs the admission check.
  if tg_op='UPDATE' and old.origin::text='frontend' and old.status::text in ('pending','accepted')
    and new.workspace_id is not distinct from old.workspace_id
    and new.customer_id is not distinct from old.customer_id
    and new.customer_email is not distinct from old.customer_email
    and new.customer_phone is not distinct from old.customer_phone
    and new.requested_service_name is not distinct from old.requested_service_name
    and new.appointment_date is not distinct from old.appointment_date
    and new.appointment_time is not distinct from old.appointment_time then return new; end if;
  -- Some historical RPCs resolve customer_id using one contact field or name.
  -- A pending canonical row remains blocked even if the submitted contacts
  -- differ from the stored pair, or the setting was turned off meanwhile.
  if exists(select 1 from public.customers where workspace_id=new.workspace_id
    and id=new.customer_id and registration_status='pending') then
    raise exception 'customer_registration_pending';
  end if;
  perform public.assert_customer_registration_approved_for_write_v1(new.workspace_id,new.customer_email::text,new.customer_phone);
  return new;
end $$;
revoke all on function public.enforce_customer_registration_booking_v1() from public, anon, authenticated;
