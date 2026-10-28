create or replace function public.register_public_customer(
  p_salon_code text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text default null,
  p_customer_instagram text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_phone text := regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g');
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_instagram text := nullif(trim(coalesce(p_customer_instagram, '')), '');
  v_workspace_id uuid;
  v_workspace record;
  v_existing_customer record;
  v_customer_id uuid;
  v_duplicate_phone boolean := false;
  v_duplicate_email boolean := false;
  v_email_verified boolean := false;
begin
  if v_salon_code = '' then
    raise exception 'salon_not_found';
  end if;

  if v_customer_name = '' then
    raise exception 'customer_name_required';
  end if;

  if v_customer_phone = '' then
    raise exception 'customer_phone_required';
  end if;

  if v_customer_email is null then
    raise exception 'customer_email_required';
  end if;

  select exists (
    select 1
    from public.email_otp_verifications as otp
    where otp.email = v_customer_email
      and otp.purpose = 'client_registration'
      and coalesce(otp.salon_code, '') = v_salon_code
      and otp.consumed_at is not null
      and otp.consumed_at >= timezone('utc', now()) - interval '15 minutes'
  )
  into v_email_verified;

  if not v_email_verified then
    raise exception 'customer_email_not_verified';
  end if;

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);

  if v_workspace_id is null then
    raise exception 'salon_not_found';
  end if;

  select
    workspace.id as workspace_id,
    workspace.owner_email,
    workspace.salon_name
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = v_workspace_id
  limit 1;

  select
    customer.id,
    customer.phone,
    customer.email
  into v_existing_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') = v_customer_phone
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if v_existing_customer.id is not null then
    v_duplicate_phone :=
      regexp_replace(coalesce(v_existing_customer.phone, ''), '\D+', '', 'g') = v_customer_phone;
    v_duplicate_email :=
      lower(trim(coalesce(v_existing_customer.email::text, ''))) = v_customer_email::text;

    if v_duplicate_phone and v_duplicate_email then
      raise exception 'duplicate_email_phone';
    elsif v_duplicate_email then
      raise exception 'duplicate_email';
    elsif v_duplicate_phone then
      raise exception 'duplicate_phone';
    end if;
  end if;

  insert into public.customers (
    workspace_id,
    full_name,
    phone,
    email,
    instagram,
    note,
    source,
    viewed_by_salon,
    max_future_appointments,
    max_future_appointments_mode,
    max_daily_appointments
  )
  values (
    v_workspace_id,
    v_customer_name,
    v_customer_phone,
    v_customer_email,
    v_customer_instagram,
    '',
    'frontend',
    false,
    4,
    'monthly',
    3
  )
  returning id into v_customer_id;

  perform public.sync_client_portal_customers(v_workspace_id);

  return jsonb_build_object(
    'customerId', v_customer_id,
    'workspaceId', v_workspace_id
  );
end;
$$;

grant execute on function public.register_public_customer(text, text, text, text, text) to anon, authenticated;
