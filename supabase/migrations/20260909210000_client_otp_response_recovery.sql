-- Retry of an already verified customer code is allowed only for the same
-- latest challenge, same secret, and original 15-minute verification window.
create or replace function public.verify_email_otp(
  p_email citext, p_purpose text, p_code text, p_salon_code text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_email citext:=nullif(lower(trim(coalesce(p_email::text,''))), '')::citext;
  v_purpose text:=trim(coalesce(p_purpose,''));
  v_code text:=regexp_replace(coalesce(p_code,''),'\D+','','g');
  v_salon_code text:=nullif(lower(trim(coalesce(p_salon_code,''))), '');
  v_row public.email_otp_verifications%rowtype;
  v_hash text;
begin
  if v_email is null or v_purpose not in ('owner_registration','client_registration','client_email_completion','client_password_activation','client_password_reset') then
    return jsonb_build_object('ok',false,'error','invalid_request');
  end if;
  if length(v_code)<>6 then return jsonb_build_object('ok',false,'error','invalid_code'); end if;
  select * into v_row from public.email_otp_verifications otp
  where otp.email=v_email and otp.purpose=v_purpose
    and coalesce(otp.salon_code,'')=coalesce(v_salon_code,'')
    and (otp.consumed_at is null or v_purpose in ('client_registration','client_email_completion'))
  order by otp.created_at desc limit 1 for update;
  if v_row.id is null then return jsonb_build_object('ok',false,'error','code_not_found'); end if;
  if coalesce(v_row.metadata->>'delivery_status','')='failed' then
    return jsonb_build_object('ok',false,'error','code_not_found');
  end if;
  if (v_row.consumed_at is null and v_row.expires_at<=timezone('utc',now()))
    or (v_row.consumed_at is not null and v_row.consumed_at<timezone('utc',now())-interval '15 minutes') then
    return jsonb_build_object('ok',false,'error','code_expired');
  end if;
  if v_row.attempts>=5 then return jsonb_build_object('ok',false,'error','too_many_attempts'); end if;
  v_hash:=encode(extensions.digest(v_code||':'||v_row.code_salt,'sha256'),'hex');
  if v_hash<>v_row.code_hash then
    update public.email_otp_verifications set attempts=attempts+1 where id=v_row.id;
    return jsonb_build_object('ok',false,'error','invalid_code');
  end if;
  if v_row.consumed_at is null then
    update public.email_otp_verifications set consumed_at=timezone('utc',now()),
      attempts=attempts+case when v_purpose in ('client_registration','client_email_completion') then 0 else 1 end where id=v_row.id;
  end if;
  return jsonb_build_object('ok',true,'token',v_row.id::text);
end; $$;

-- A lost completion response can be read back only using its verified token
-- and all the original identity fields. Never use a duplicate match as auth.
create or replace function public.complete_public_customer_email_resumable(
 p_salon_code text,p_customer_email text,p_customer_phone text,p_otp_token text
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_result jsonb; v_customer_id uuid;
begin
  select c.id into v_customer_id
  from public.email_otp_verifications otp
  join public.customers c on c.id::text=otp.metadata->>'customer_id'
  where otp.id::text=trim(p_otp_token)
    and otp.purpose='client_email_completion'
    and otp.email=lower(trim(p_customer_email))::citext
    and otp.salon_code=lower(trim(p_salon_code))
    and otp.metadata->>'customer_phone'=right(regexp_replace(p_customer_phone,'\D+','','g'),10)
    and otp.consumed_at>=timezone('utc',now())-interval '15 minutes'
    and coalesce(otp.metadata->>'customer_email_completion_completed_at','')<>''
    and c.is_active is true and lower(c.email::text)=lower(trim(p_customer_email))
    and right(regexp_replace(c.phone,'\D+','','g'),10)=right(regexp_replace(p_customer_phone,'\D+','','g'),10);
  if v_customer_id is not null then return jsonb_build_object('ok',true,'customerId',v_customer_id); end if;
  return public.complete_public_customer_email(p_salon_code,p_customer_email,p_customer_phone,p_otp_token);
end; $$;
revoke all on function public.complete_public_customer_email_resumable(text,text,text,text) from public;
grant execute on function public.complete_public_customer_email_resumable(text,text,text,text) to anon,authenticated;
