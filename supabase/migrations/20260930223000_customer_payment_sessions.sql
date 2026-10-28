-- Payment access requires proof of the customer's password, never contact details alone.
create table public.customer_payment_sessions (
 token_hash text primary key,
 customer_id uuid not null references public.customers(id) on delete cascade,
 credential_hash text not null,
 expires_at timestamptz not null
);
alter table public.customer_payment_sessions enable row level security;
revoke all on public.customer_payment_sessions from public, anon, authenticated;
grant all on public.customer_payment_sessions to service_role;
create index customer_payment_sessions_customer on public.customer_payment_sessions(customer_id);

create function public.create_customer_payment_session(p_salon_code text,p_email text,p_phone text,p_password text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare context jsonb; credential text; token text; expiry timestamptz;
begin
 if length(coalesce(p_password,''))=0 or length(p_password)>1024 then raise exception 'Verifica la password per accedere ai pagamenti.'; end if;
 context=public.booking_payment_customer_context(p_salon_code,p_email,p_phone);
 select password_hash into credential from public.customer_login_credentials where customer_id=(context->>'customerId')::uuid;
 if credential is null or extensions.crypt(p_password,credential)<>credential then
  raise exception 'Verifica la password per accedere ai pagamenti.';
 end if;
 token=encode(extensions.gen_random_bytes(32),'hex'); expiry=now()+interval '7 days';
 delete from public.customer_payment_sessions where customer_id=(context->>'customerId')::uuid and expires_at<now();
 insert into public.customer_payment_sessions values(encode(extensions.digest(token,'sha256'),'hex'),(context->>'customerId')::uuid,credential,expiry);
 return jsonb_build_object('token',token,'expiresAt',expiry);
end $$;
revoke all on function public.create_customer_payment_session(text,text,text,text) from public;
grant execute on function public.create_customer_payment_session(text,text,text,text) to anon,authenticated;

create function public.verified_booking_payment_context(p_salon_code text,p_email text,p_phone text,p_token text)
returns jsonb language plpgsql stable security definer set search_path=public,extensions as $$
declare context jsonb;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
 context=public.booking_payment_customer_context(p_salon_code,p_email,p_phone);
 if not exists(select 1 from public.customer_payment_sessions s
 join public.customer_login_credentials c on c.customer_id=s.customer_id and c.password_hash=s.credential_hash
 where s.customer_id=(context->>'customerId')::uuid and s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and s.expires_at>now()) then return null; end if;
 return context;
end $$;
revoke all on function public.verified_booking_payment_context(text,text,text,text) from public,anon,authenticated;
grant execute on function public.verified_booking_payment_context(text,text,text,text) to service_role;
