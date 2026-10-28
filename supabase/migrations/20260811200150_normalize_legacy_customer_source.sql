-- Keep legacy customer self-healing compatible with the canonical source enum.
-- Older portal snapshots use the Italian value `salone`, while customers.source
-- has always accepted the canonical values `salon` and `frontend` only.

create or replace function public.normalize_legacy_customer_source()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(trim(coalesce(new.source, ''))) = 'salone' then
    new.source := 'salon';
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_legacy_customer_source_before_write
on public.customers;

create trigger normalize_legacy_customer_source_before_write
before insert or update of source on public.customers
for each row
execute function public.normalize_legacy_customer_source();

comment on function public.normalize_legacy_customer_source() is
  'Normalizes the legacy Italian customer source salone to the canonical salon value before constraint validation.';

-- The legacy lookup stores its result in a polymorphic record. The regular
-- lookup returns count(*) as bigint, while the self-heal branch historically
-- assigned a plain integer literal. PostgreSQL can cache either shape and then
-- fail the next login with 42804. Keep both branches on the same stable type
-- without copying or otherwise changing the lookup implementation.
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.find_public_customer_by_credentials_legacy_impl(text,text,text)'::regprocedure
  )
  into v_definition;

  if position('1::bigint as same_score_count' in v_definition) > 0 then
    return;
  end if;

  if position('1 as same_score_count' in v_definition) = 0 then
    raise exception 'legacy_customer_lookup_shape_not_recognized';
  end if;

  v_definition := replace(
    v_definition,
    '1 as same_score_count',
    '1::bigint as same_score_count'
  );

  execute v_definition;
end;
$migration$;
