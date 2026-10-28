-- Synthetic challenge only; no email is sent and all data is rolled back.
begin;
do $$
declare
 v_email citext:=(gen_random_uuid()::text||'@example.invalid')::citext;
 v_id uuid; v_reply jsonb; v_consumed timestamptz; i integer;
begin
 insert into public.email_otp_verifications(email,purpose,salon_code,code_hash,code_salt,expires_at)
 values(v_email,'client_registration','otp-regression-test',encode(extensions.digest('123456:test-salt','sha256'),'hex'),'test-salt',now()+interval '15 minutes') returning id into v_id;
 v_reply:=public.verify_email_otp(v_email,'client_registration','000000','otp-regression-test');
 if v_reply->>'error'<>'invalid_code' then raise exception 'wrong code accepted'; end if;
 v_reply:=public.verify_email_otp(v_email,'client_registration','123456','different-salon');
 if v_reply->>'error'<>'code_not_found' then raise exception 'salon isolation failed'; end if;
 v_reply:=public.verify_email_otp(v_email,'client_registration','123456','otp-regression-test');
 if v_reply->>'token' is distinct from v_id::text then raise exception 'verification failed'; end if;
 select consumed_at into v_consumed from public.email_otp_verifications where id=v_id;
 v_reply:=public.verify_email_otp(v_email,'client_registration','123456','otp-regression-test');
 if v_reply->>'token' is distinct from v_id::text then raise exception 'lost response recovery failed'; end if;
 if (select consumed_at from public.email_otp_verifications where id=v_id) is distinct from v_consumed then raise exception 'retry extended verification'; end if;
 update public.email_otp_verifications set consumed_at=now()-interval '16 minutes' where id=v_id;
 v_reply:=public.verify_email_otp(v_email,'client_registration','123456','otp-regression-test');
 if v_reply->>'error'<>'code_expired' then raise exception 'expired replay accepted'; end if;
 update public.email_otp_verifications set consumed_at=null,attempts=0 where id=v_id;
 for i in 1..5 loop perform public.verify_email_otp(v_email,'client_registration','000000','otp-regression-test'); end loop;
 v_reply:=public.verify_email_otp(v_email,'client_registration','123456','otp-regression-test');
 if v_reply->>'error'<>'too_many_attempts' then raise exception 'attempt limit failed'; end if;
end; $$;
rollback;
select 'PASS: wrong code, salon isolation, verification, same-token retry, fixed expiry, attempt limit; rolled back' as result;
