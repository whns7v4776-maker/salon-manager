-- Salone Fondatore: ogni salone nuovo entra subito, senza abbonamento store,
-- per 60 giorni. L'accesso usa le stesse colonne che tutti i controlli gia
-- verificano (status active + subscription_ends_at futura), quindi nessuna
-- regola di sicurezza viene allargata. Il piano resta 'demo': nessun acquisto
-- store e' stato fatto finche RevenueCat non riconcilia un abbonamento vero.
-- I saloni gia esistenti non vengono toccati.

create or replace function public.grant_founder_access_on_new_workspace()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.subscription_status = 'demo'
     and coalesce(new.is_internal_tester, false) = false then
    new.subscription_status := 'active';
    new.trial_ends_at := now() + interval '60 days';
    new.subscription_ends_at := new.trial_ends_at;
  end if;
  return new;
end;
$$;

revoke all on function public.grant_founder_access_on_new_workspace() from public, anon, authenticated;

drop trigger if exists grant_founder_access_on_new_workspace on public.workspaces;
create trigger grant_founder_access_on_new_workspace
before insert on public.workspaces
for each row execute function public.grant_founder_access_on_new_workspace();
