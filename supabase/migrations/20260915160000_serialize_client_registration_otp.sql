-- Serialize the check and insert, including callers from older deployed workers.
create or replace function public.guard_client_registration_otp_send()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_last_sent timestamptz;
  v_now timestamptz;
begin
  if new.purpose <> 'client_registration' then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(lower(trim(new.email::text)), new.purpose,
      coalesce(nullif(lower(trim(new.salon_code)), ''), ''))::text, 0));
  v_now := clock_timestamp();
  select max(last_sent_at) into v_last_sent
  from public.email_otp_verifications
  where email = new.email and purpose = new.purpose
    and coalesce(nullif(lower(trim(salon_code)), ''), '') =
      coalesce(nullif(lower(trim(new.salon_code)), ''), '');
  if v_last_sent > v_now - interval '45 seconds' then
    raise exception using errcode = 'P0001', message = 'otp_send_rate_limited',
      detail = greatest(1, ceil(extract(epoch from (v_last_sent + interval '45 seconds' - v_now))))::text;
  end if;
  new.last_sent_at := v_now;
  return new;
end;
$$;
revoke all on function public.guard_client_registration_otp_send() from public;
create trigger guard_client_registration_otp_send
before insert on public.email_otp_verifications
for each row execute function public.guard_client_registration_otp_send();
