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
  v_lookup_phone text;
  v_result jsonb;
  v_customer_id uuid;
  v_password_enabled boolean;
begin
  if v_salon_code = ''
     or v_customer_email is null
     or v_purpose not in ('client_password_activation', 'client_password_reset') then
    return jsonb_build_object('ok', false);
  end if;

  if v_purpose = 'client_password_activation' and v_customer_phone is null then
    return jsonb_build_object('ok', false);
  end if;

  -- Il codice ricevuto sull'email associata e la prova di possesso per il
  -- recupero. Il cellulare resta richiesto solo durante l'attivazione.
  v_lookup_phone := case
    when v_purpose = 'client_password_reset' then null
    else v_customer_phone
  end;

  v_result := public.find_public_customer_by_credentials_legacy_impl(
    v_salon_code,
    v_customer_email::text,
    v_lookup_phone
  );

  if v_result is null
     or coalesce((v_result ->> 'sameEmail')::boolean, false) is not true
     or coalesce((v_result ->> 'sameScoreCount')::integer, 0) <> 1
     or (
       v_purpose = 'client_password_activation'
       and coalesce((v_result ->> 'samePhone')::boolean, false) is not true
     ) then
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
  v_otp_id uuid;
  v_otp public.email_otp_verifications%rowtype;
  v_result jsonb;
  v_customer_id uuid;
begin
  if v_salon_code = '' or v_customer_email is null then
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
    null
  );

  if v_result is null
     or coalesce((v_result ->> 'sameEmail')::boolean, false) is not true
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
    'telefono', coalesce(v_result ->> 'telefono', ''),
    'passwordRequired', true
  );
end;
$$;

revoke all on function public.reset_public_customer_password(text, text, text, text, text)
from public;
grant execute on function public.reset_public_customer_password(text, text, text, text, text)
to anon, authenticated;

comment on function public.can_request_public_customer_password_otp(text, text, text, text) is
  'Issues password reset OTPs from the unique salon-scoped customer email; activation still requires the exact phone.';
comment on function public.reset_public_customer_password(text, text, text, text, text) is
  'Resets an existing customer password after a salon-scoped email OTP without requiring the phone to match.';

notify pgrst, 'reload schema';
