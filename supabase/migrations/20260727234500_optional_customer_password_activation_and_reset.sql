create extension if not exists pgcrypto with schema extensions;

alter table public.email_otp_verifications
  drop constraint if exists email_otp_verifications_purpose_check;

alter table public.email_otp_verifications
  add constraint email_otp_verifications_purpose_check
  check (
    purpose in (
      'owner_registration',
      'client_registration',
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

create or replace function public.can_request_public_customer_password_otp(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text,
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_purpose text := trim(coalesce(p_purpose, ''));
  v_result jsonb;
  v_customer_id uuid;
  v_password_enabled boolean;
begin
  if v_salon_code = ''
     or v_customer_email is null
     or v_customer_phone is null
     or v_purpose not in ('client_password_activation', 'client_password_reset') then
    return jsonb_build_object('ok', false);
  end if;

  v_result := public.find_public_customer_by_credentials_legacy_impl(
    v_salon_code,
    v_customer_email::text,
    v_customer_phone
  );

  if v_result is null
     or coalesce((v_result ->> 'sameEmail')::boolean, false) is not true
     or coalesce((v_result ->> 'samePhone')::boolean, false) is not true
     or coalesce((v_result ->> 'sameScoreCount')::integer, 0) <> 1 then
    return jsonb_build_object('ok', false);
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  if v_customer_id is null then
    return jsonb_build_object('ok', false);
  end if;

  select exists (
    select 1
    from public.customer_login_credentials as credential
    where credential.customer_id = v_customer_id
  )
  into v_password_enabled;

  if (v_purpose = 'client_password_reset' and not v_password_enabled)
     or (v_purpose = 'client_password_activation' and v_password_enabled) then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.can_request_public_customer_password_otp(text, text, text, text)
from public, anon, authenticated;
grant execute on function public.can_request_public_customer_password_otp(text, text, text, text)
to service_role;

create or replace function public.activate_public_customer_password(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_password text,
  p_otp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_otp_id uuid;
  v_otp public.email_otp_verifications%rowtype;
  v_result jsonb;
  v_customer_id uuid;
begin
  if v_salon_code = '' or v_customer_email is null or v_customer_phone is null then
    raise exception 'invalid_customer_credentials';
  end if;

  if length(coalesce(p_customer_password, '')) < 8
     or p_customer_password !~ '[a-z]'
     or p_customer_password !~ '[A-Z]'
     or p_customer_password !~ '[0-9]'
     or p_customer_password !~ '[^A-Za-z0-9]' then
    raise exception 'customer_password_weak';
  end if;

  begin
    v_otp_id := nullif(trim(coalesce(p_otp_token, '')), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'customer_password_otp_invalid';
  end;

  select *
  into v_otp
  from public.email_otp_verifications as otp
  where otp.id = v_otp_id
    and otp.email = v_customer_email
    and otp.purpose = 'client_password_activation'
    and coalesce(otp.salon_code, '') = v_salon_code
    and otp.consumed_at is not null
    and otp.consumed_at >= timezone('utc', now()) - interval '15 minutes'
  limit 1
  for update;

  if v_otp.id is null
     or coalesce(v_otp.metadata ->> 'customer_password_action_completed_at', '') <> '' then
    raise exception 'customer_password_otp_invalid';
  end if;

  v_result := public.find_public_customer_by_credentials_legacy_impl(
    v_salon_code,
    v_customer_email::text,
    v_customer_phone
  );

  if v_result is null
     or coalesce((v_result ->> 'sameEmail')::boolean, false) is not true
     or coalesce((v_result ->> 'samePhone')::boolean, false) is not true
     or coalesce((v_result ->> 'sameScoreCount')::integer, 0) <> 1 then
    raise exception 'invalid_customer_credentials';
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  if v_customer_id is null then
    raise exception 'invalid_customer_credentials';
  end if;

  if exists (
    select 1
    from public.customer_login_credentials as credential
    where credential.customer_id = v_customer_id
  ) then
    raise exception 'customer_password_already_enabled';
  end if;

  insert into public.customer_login_credentials (customer_id, password_hash)
  values (
    v_customer_id,
    extensions.crypt(p_customer_password, extensions.gen_salt('bf', 12))
  );

  update public.email_otp_verifications
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_password_action_completed_at',
    timezone('utc', now()),
    'customer_password_action',
    'activation'
  )
  where id = v_otp.id;

  return jsonb_build_object(
    'ok', true,
    'customerId', v_customer_id,
    'passwordRequired', true
  );
end;
$$;

create or replace function public.reset_public_customer_password(
  p_salon_code text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_password text,
  p_otp_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_salon_code text := lower(trim(coalesce(p_salon_code, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_otp_id uuid;
  v_otp public.email_otp_verifications%rowtype;
  v_result jsonb;
  v_customer_id uuid;
begin
  if v_salon_code = '' or v_customer_email is null or v_customer_phone is null then
    raise exception 'invalid_customer_credentials';
  end if;

  if length(coalesce(p_customer_password, '')) < 8
     or p_customer_password !~ '[a-z]'
     or p_customer_password !~ '[A-Z]'
     or p_customer_password !~ '[0-9]'
     or p_customer_password !~ '[^A-Za-z0-9]' then
    raise exception 'customer_password_weak';
  end if;

  begin
    v_otp_id := nullif(trim(coalesce(p_otp_token, '')), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'customer_password_otp_invalid';
  end;

  select *
  into v_otp
  from public.email_otp_verifications as otp
  where otp.id = v_otp_id
    and otp.email = v_customer_email
    and otp.purpose = 'client_password_reset'
    and coalesce(otp.salon_code, '') = v_salon_code
    and otp.consumed_at is not null
    and otp.consumed_at >= timezone('utc', now()) - interval '15 minutes'
  limit 1
  for update;

  if v_otp.id is null
     or coalesce(v_otp.metadata ->> 'customer_password_action_completed_at', '') <> '' then
    raise exception 'customer_password_otp_invalid';
  end if;

  v_result := public.find_public_customer_by_credentials_legacy_impl(
    v_salon_code,
    v_customer_email::text,
    v_customer_phone
  );

  if v_result is null
     or coalesce((v_result ->> 'sameEmail')::boolean, false) is not true
     or coalesce((v_result ->> 'samePhone')::boolean, false) is not true
     or coalesce((v_result ->> 'sameScoreCount')::integer, 0) <> 1 then
    raise exception 'invalid_customer_credentials';
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  if v_customer_id is null then
    raise exception 'invalid_customer_credentials';
  end if;

  update public.customer_login_credentials
  set password_hash = extensions.crypt(p_customer_password, extensions.gen_salt('bf', 12)),
      updated_at = timezone('utc', now())
  where customer_id = v_customer_id;

  if not found then
    raise exception 'customer_password_not_enabled';
  end if;

  update public.email_otp_verifications
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'customer_password_action_completed_at',
    timezone('utc', now()),
    'customer_password_action',
    'reset'
  )
  where id = v_otp.id;

  return jsonb_build_object(
    'ok', true,
    'customerId', v_customer_id,
    'passwordRequired', true
  );
end;
$$;

revoke all on function public.activate_public_customer_password(text, text, text, text, text)
from public;
revoke all on function public.reset_public_customer_password(text, text, text, text, text)
from public;

grant execute on function public.activate_public_customer_password(text, text, text, text, text)
to anon, authenticated;
grant execute on function public.reset_public_customer_password(text, text, text, text, text)
to anon, authenticated;

comment on function public.activate_public_customer_password(text, text, text, text, text) is
  'Lets an existing passwordless customer opt into password login after a scoped email OTP.';
comment on function public.reset_public_customer_password(text, text, text, text, text) is
  'Resets an existing customer password after a scoped email OTP.';
comment on function public.can_request_public_customer_password_otp(text, text, text, text) is
  'Allows the OTP sender to issue customer password codes only for an exact eligible customer identity.';
