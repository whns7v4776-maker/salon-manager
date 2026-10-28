create extension if not exists pgcrypto with schema extensions;

create table if not exists public.customer_login_credentials (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  password_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.customer_login_credentials enable row level security;
revoke all on table public.customer_login_credentials from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.register_public_customer_legacy_impl(text,text,text,text,text)') is null
     and to_regprocedure('public.register_public_customer(text,text,text,text,text)') is not null then
    alter function public.register_public_customer(text, text, text, text, text)
      rename to register_public_customer_legacy_impl;
  end if;

  if to_regprocedure('public.find_public_customer_by_credentials_legacy_impl(text,text,text)') is null
     and to_regprocedure('public.find_public_customer_by_credentials(text,text,text)') is not null then
    alter function public.find_public_customer_by_credentials(text, text, text)
      rename to find_public_customer_by_credentials_legacy_impl;
  end if;
end;
$$;

revoke all on function public.register_public_customer_legacy_impl(text, text, text, text, text)
from public, anon, authenticated;
revoke all on function public.find_public_customer_by_credentials_legacy_impl(text, text, text)
from public, anon, authenticated;

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
begin
  raise exception 'customer_password_required';
end;
$$;

create or replace function public.register_public_customer_with_password(
  p_salon_code text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_customer_instagram text,
  p_customer_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_customer_id uuid;
begin
  if length(coalesce(p_customer_password, '')) < 8
     or p_customer_password !~ '[a-z]'
     or p_customer_password !~ '[A-Z]'
     or p_customer_password !~ '[0-9]'
     or p_customer_password !~ '[^A-Za-z0-9]' then
    raise exception 'customer_password_weak';
  end if;

  v_result := public.register_public_customer_legacy_impl(
    p_salon_code,
    p_customer_name,
    p_customer_phone,
    p_customer_email,
    p_customer_instagram
  );
  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;

  if v_customer_id is null then
    raise exception 'customer_registration_failed';
  end if;

  insert into public.customer_login_credentials (customer_id, password_hash)
  values (
    v_customer_id,
    extensions.crypt(p_customer_password, extensions.gen_salt('bf', 12))
  );

  return v_result;
end;
$$;

create or replace function public.find_public_customer_by_credentials(
  p_salon_code text,
  p_customer_email text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_customer_id uuid;
begin
  v_result := public.find_public_customer_by_credentials_legacy_impl(
    p_salon_code,
    p_customer_email,
    p_customer_phone
  );

  if v_result is null then
    return null;
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  if exists (
    select 1
    from public.customer_login_credentials as credential
    where credential.customer_id = v_customer_id
  ) then
    return null;
  end if;

  return v_result || jsonb_build_object('passwordRequired', false);
end;
$$;

create or replace function public.find_public_customer_by_password(
  p_salon_code text,
  p_customer_email text default null,
  p_customer_phone text default null,
  p_customer_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_result jsonb;
  v_customer_id uuid;
  v_password_hash text;
begin
  v_result := public.find_public_customer_by_credentials_legacy_impl(
    p_salon_code,
    p_customer_email,
    p_customer_phone
  );

  if v_result is null then
    return null;
  end if;

  v_customer_id := nullif(v_result ->> 'customerId', '')::uuid;
  select credential.password_hash
  into v_password_hash
  from public.customer_login_credentials as credential
  where credential.customer_id = v_customer_id;

  if v_password_hash is null then
    return v_result || jsonb_build_object('passwordRequired', false);
  end if;

  if coalesce(p_customer_password, '') = '' then
    raise exception 'customer_password_required';
  end if;

  if extensions.crypt(p_customer_password, v_password_hash) <> v_password_hash then
    raise exception 'invalid_customer_password';
  end if;

  return v_result || jsonb_build_object('passwordRequired', true);
end;
$$;

grant execute on function public.register_public_customer(text, text, text, text, text)
to anon, authenticated;
grant execute on function public.register_public_customer_with_password(text, text, text, text, text, text)
to anon, authenticated;
grant execute on function public.find_public_customer_by_credentials(text, text, text)
to anon, authenticated;
grant execute on function public.find_public_customer_by_password(text, text, text, text)
to anon, authenticated;

comment on table public.customer_login_credentials is
  'Password hashes for customer accounts created after password enforcement; missing rows are legacy accounts.';
