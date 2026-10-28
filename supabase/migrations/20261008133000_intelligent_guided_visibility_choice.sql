-- Visibility is a salon preference independent of recommendation ranking/cadence.
-- Preserve all explicit choices; only missing/invalid intelligent values default.
create or replace function public.enforce_intelligent_guided_visibility()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.availability_settings->>'guidedSlotsStrategy' = 'intelligent'
     and coalesce(new.availability_settings->>'guidedSlotsVisibility', '')
       not in ('recommended_and_all', 'recommended_first', 'recommended_only') then
    new.availability_settings := jsonb_set(
      new.availability_settings, '{guidedSlotsVisibility}', '"recommended_and_all"'::jsonb, true
    );
  end if;
  return new;
end;
$$;

-- Retain the existing authenticated writer, timestamp ordering and cadence backup.
do $$
declare
  v_definition text;
  v_anchor text := '  if v_strategy = ''intelligent'' then v_visibility := ''recommended_only''; end if;';
  v_replacement text := '  -- Keep the requested visibility independent from intelligent cadence.';
begin
  select pg_get_functiondef('public.set_guided_slots_with_cadence_v1(boolean,text,text,integer)'::regprocedure)
    into v_definition;
  if position(v_replacement in v_definition) > 0 then return; end if;
  if position(v_anchor in v_definition) = 0 then
    raise exception 'intelligent_guided_visibility_anchor_missing';
  end if;
  execute replace(v_definition, v_anchor, v_replacement);
end;
$$;

notify pgrst, 'reload schema';
