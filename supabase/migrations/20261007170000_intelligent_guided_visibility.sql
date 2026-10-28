-- Keep the intelligent strategy consistent across app, web and older mirrors.
create or replace function public.enforce_intelligent_guided_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.availability_settings->>'guidedSlotsStrategy' = 'intelligent' then
    new.availability_settings := jsonb_set(
      new.availability_settings, '{guidedSlotsVisibility}', '"recommended_only"'::jsonb, true
    );
  end if;
  return new;
end;
$$;

create trigger zz_client_portal_intelligent_guided_visibility
before insert or update of availability_settings on public.client_portals
for each row execute function public.enforce_intelligent_guided_visibility();

update public.client_portals
set availability_settings = jsonb_set(
  availability_settings, '{guidedSlotsVisibility}', '"recommended_only"'::jsonb, true
)
where availability_settings->>'guidedSlotsStrategy' = 'intelligent'
  and availability_settings->>'guidedSlotsVisibility' is distinct from 'recommended_only';
