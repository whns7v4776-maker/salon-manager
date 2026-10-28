alter table public.email_otp_verifications
  drop constraint if exists email_otp_verifications_purpose_check;

alter table public.email_otp_verifications
  add constraint email_otp_verifications_purpose_check
  check (
    purpose in (
      'owner_registration',
      'client_registration',
      'client_email_completion',
      'client_password_activation',
      'client_password_reset'
    )
  );

create or replace function public.verify_email_otp(
  p_email citext,
  p_purpose text,
  p_code text,
  p_salon_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email citext := nullif(lower(trim(coalesce(p_email::text, ''))), '')::citext;
  v_purpose text := trim(coalesce(p_purpose, ''));
  v_code text := regexp_replace(coalesce(p_code, ''), '\D+', '', 'g');
  v_salon_code text := nullif(lower(trim(coalesce(p_salon_code, ''))), '');
  v_row public.email_otp_verifications%rowtype;
  v_hash text;
begin
  if v_email is null or v_purpose not in (
    'owner_registration',
    'client_registration',
    'client_email_completion',
    'client_password_activation',
    'client_password_reset'
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_request');
  end if;

  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  select *
  into v_row
  from public.email_otp_verifications as otp
  where otp.email = v_email
    and otp.purpose = v_purpose
    and coalesce(otp.salon_code, '') = coalesce(v_salon_code, '')
    and otp.consumed_at is null
  order by otp.created_at desc
  limit 1
  for update;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'error', 'code_not_found');
  end if;

  if v_row.expires_at <= timezone('utc', now()) then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;

  if v_row.attempts >= 5 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;

  v_hash := encode(extensions.digest(v_code || ':' || v_row.code_salt, 'sha256'), 'hex');

  if v_hash <> v_row.code_hash then
    update public.email_otp_verifications
    set attempts = attempts + 1
    where id = v_row.id;

    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;

  update public.email_otp_verifications
  set consumed_at = timezone('utc', now()),
      attempts = attempts + 1
  where id = v_row.id;

  return jsonb_build_object('ok', true, 'token', v_row.id::text);
end;
$$;

grant execute on function public.verify_email_otp(citext, text, text, text)
to anon, authenticated;

create or replace function public.can_request_public_customer_email_completion_otp(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(
    right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
    ''
  );
  v_workspace_id uuid;
  v_matching_customers integer := 0;
  v_phone_customers integer := 0;
  v_email_taken boolean := false;
begin
  if v_salon_code = ''
     or v_customer_email is null
     or v_customer_phone is null
     or length(v_customer_phone) < 9 then
    return jsonb_build_object('ok', false);
  end if;

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);
  if v_workspace_id is null then
    return jsonb_build_object('ok', false);
  end if;

  select count(*)
  into v_matching_customers
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.source = 'salon'
    and customer.is_active is true
    and nullif(lower(trim(coalesce(customer.email::text, ''))), '') is null
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone;

  if v_matching_customers <> 1 then
    return jsonb_build_object('ok', false);
  end if;

  select count(*)
  into v_phone_customers
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.is_active is true
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone;

  if v_phone_customers <> 1 then
    return jsonb_build_object('ok', false);
  end if;

  select exists (
    select 1
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
  )
  into v_email_taken;

  if v_email_taken then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.can_request_public_customer_email_completion_otp(text, text, text)
from public, anon, authenticated;
grant execute on function public.can_request_public_customer_email_completion_otp(text, text, text)
to service_role;

create or replace function public.complete_public_customer_email(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text,
  p_otp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(
    right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10),
    ''
  );
  v_workspace_id uuid;
  v_matching_customers integer := 0;
  v_phone_customers integer := 0;
  v_customer public.customers%rowtype;
  v_otp_id uuid;
  v_otp public.email_otp_verifications%rowtype;
begin
  if v_salon_code = ''
     or v_customer_email is null
     or v_customer_phone is null
     or length(v_customer_phone) < 9 then
    raise exception 'invalid_customer_credentials';
  end if;

  begin
    v_otp_id := nullif(trim(coalesce(p_otp_token, '')), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'customer_email_completion_otp_invalid';
  end;

  v_workspace_id := public.ensure_client_portal_workspace(v_salon_code);
  if v_workspace_id is null then
    raise exception 'salon_not_found';
  end if;

  select count(*)
  into v_matching_customers
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.source = 'salon'
    and customer.is_active is true
    and nullif(lower(trim(coalesce(customer.email::text, ''))), '') is null
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone;

  if v_matching_customers <> 1 then
    raise exception 'customer_email_completion_not_available';
  end if;

  select count(*)
  into v_phone_customers
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.is_active is true
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone;

  if v_phone_customers <> 1 then
    raise exception 'customer_email_completion_not_available';
  end if;

  select customer.*
  into v_customer
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and customer.source = 'salon'
    and customer.is_active is true
    and nullif(lower(trim(coalesce(customer.email::text, ''))), '') is null
    and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
      v_customer_phone
  limit 1
  for update;

  if exists (
    select 1
    from public.customers as customer
    where customer.workspace_id = v_workspace_id
      and customer.id <> v_customer.id
      and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
  ) then
    raise exception 'duplicate_email';
  end if;

  select *
  into v_otp
  from public.email_otp_verifications as otp
  where otp.id = v_otp_id
    and otp.email = v_customer_email
    and otp.purpose = 'client_email_completion'
    and coalesce(otp.salon_code, '') = v_salon_code
    and otp.consumed_at is not null
    and otp.consumed_at >= timezone('utc', now()) - interval '15 minutes'
    and coalesce(otp.metadata ->> 'customer_phone', '') = v_customer_phone
    and coalesce(otp.metadata ->> 'customer_email_completion_completed_at', '') = ''
  limit 1
  for update;

  if v_otp.id is null then
    raise exception 'customer_email_completion_otp_invalid';
  end if;

  update public.customers
  set email = v_customer_email,
      updated_at = timezone('utc', now())
  where id = v_customer.id
    and nullif(lower(trim(coalesce(email::text, ''))), '') is null;

  if not found then
    raise exception 'customer_email_completion_not_available';
  end if;

  update public.email_otp_verifications
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_email_completion_completed_at',
    timezone('utc', now())::text,
    'customer_id',
    v_customer.id::text
  )
  where id = v_otp.id;

  perform public.sync_client_portal_customers(v_workspace_id);

  return jsonb_build_object(
    'ok', true,
    'customerId', v_customer.id,
    'workspaceId', v_workspace_id,
    'email', v_customer_email::text
  );
end;
$$;

revoke all on function public.complete_public_customer_email(text, text, text, text)
from public, anon, authenticated;
grant execute on function public.complete_public_customer_email(text, text, text, text)
to anon, authenticated;

comment on function public.complete_public_customer_email(text, text, text, text) is
  'Completes the email of one active salon-created customer after a verified one-time email OTP.';
