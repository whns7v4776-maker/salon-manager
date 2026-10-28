-- Complete the already-published composition price contract without touching
-- atomic service prices. The public booking function must carry the item-level
-- override into its runtime record before customer-specific pricing is resolved.

alter table public.service_composition_items
  add column if not exists price_override numeric(10, 2)
    check (price_override is null or price_override between 0 and 9999);

do $$
declare
  v_signature regprocedure :=
    'public.create_public_booking_composition_v1(text,uuid,date,time,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  v_definition text;
  v_original text := 'select service.*, item.position, item.duration_override_minutes';
  v_replacement text :=
    'select service.*, item.position, item.duration_override_minutes, item.price_override';
begin
  select pg_get_functiondef(v_signature) into v_definition;

  if position(v_replacement in v_definition) = 0 then
    if position(v_original in v_definition) = 0 then
      raise exception 'composition_price_contract_anchor_missing';
    end if;
    v_definition := replace(v_definition, v_original, v_replacement);
    execute v_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
