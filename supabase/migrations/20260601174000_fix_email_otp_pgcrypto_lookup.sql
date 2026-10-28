create extension if not exists pgcrypto with schema extensions;

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
  if v_email is null or v_purpose not in ('owner_registration', 'client_registration') then
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

grant execute on function public.verify_email_otp(citext, text, text, text) to anon, authenticated;
