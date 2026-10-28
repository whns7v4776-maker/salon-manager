-- Keep composition prices, contractual terms and Checkout totals consistent.
-- Existing requests and paid receipts retain their original price snapshots.
create function public.bind_public_composition_pricing_group_v1()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare group_id text;
begin
  if new.origin::text<>'frontend' or new.appointment_group_id is not null then return new;end if;
  group_id=nullif(current_setting('salonpro.public_composition_pricing_group',true),'');
  if group_id is null then return new;end if;
  -- The constructor supplies only its persisted group identity. Prices always
  -- come from canonical composition items; caller amounts are never trusted.
  select g.id into new.appointment_group_id from appointment_groups g
    join service_compositions c on c.id::text=g.metadata->>'compositionId' and c.workspace_id=g.workspace_id
    join service_composition_items i on i.composition_id=c.id and i.workspace_id=c.workspace_id
    join services s on s.id=i.service_id and s.workspace_id=i.workspace_id
    where g.id::text=group_id and g.workspace_id=new.workspace_id and g.source='frontend'
      and c.visibility='public' and c.is_active and i.link_type='required'
      and lower(trim(s.name))=lower(trim(new.requested_service_name)) limit 1;
  if new.appointment_group_id is null then raise exception 'composition_pricing_context_invalid';end if;
  return new;
end $$;
revoke all on function public.bind_public_composition_pricing_group_v1() from public,anon,authenticated;
create trigger ab_bind_public_composition_pricing_group_v1 before insert on public.booking_requests
  for each row execute function public.bind_public_composition_pricing_group_v1();

do $patch$
declare signature regprocedure;definition text;updated text;
begin
  signature='public.apply_scheduled_service_price_to_booking_request()'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'  v_promotion_active boolean := false;',
    '  v_promotion_active boolean := false;'||chr(10)||'  v_composition_price numeric;');
  updated=replace(updated,'  v_promotion_active :=',
    $price$  -- Customer-specific prices above keep first priority. A stored
  -- composition override then replaces the standalone catalog/promotion price.
  select i.price_override into v_composition_price
    from appointment_groups g
    join service_compositions c on c.id::text=g.metadata->>'compositionId' and c.workspace_id=g.workspace_id
    join service_composition_items i on i.composition_id=c.id and i.workspace_id=c.workspace_id
    where g.id=new.appointment_group_id and g.workspace_id=new.workspace_id and g.source='frontend'
      and c.is_active and c.visibility='public' and i.link_type='required' and i.service_id=v_service.id;
  if v_composition_price is not null then
    new.requested_price=greatest(v_composition_price,0);return new;
  end if;

  v_promotion_active :=$price$);
  if updated=definition or position('v_composition_price numeric' in updated)=0 then
    raise exception 'composition_payment_price_trigger_anchor_missing';end if;execute updated;

  -- A genuine zero-price component is a stored salon decision, unlike an old
  -- client sending zero for a priced standalone service.
  signature='public.guard_booking_payment_hold_request_v1()'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,
    'if new.requested_price=0 and nullif(current_setting(''salonpro.package_redemption'',true),'''') is null then',
    $zero$if new.requested_price=0 and nullif(current_setting('salonpro.package_redemption',true),'') is null
      and not exists(select 1 from appointment_groups g
        join service_compositions c on c.id::text=g.metadata->>'compositionId' and c.workspace_id=g.workspace_id
        join service_composition_items i on i.composition_id=c.id and i.workspace_id=c.workspace_id
        join services s on s.id=i.service_id and s.workspace_id=i.workspace_id
        where g.id=new.appointment_group_id and g.workspace_id=new.workspace_id and g.source='frontend'
          and c.is_active and c.visibility='public' and i.link_type='required' and i.price_override=0
          and lower(trim(s.name))=lower(trim(new.requested_service_name))) then$zero$);
  if updated=definition then raise exception 'composition_payment_zero_component_anchor_missing';end if;execute updated;

  signature='public.create_public_booking_composition_v1(text,uuid,date,time without time zone,text,text,citext,text,text,text,text,text,text)'::regprocedure;
  select pg_get_functiondef(signature) into definition;
  updated=replace(definition,'  v_workspace_id uuid;',
    '  v_workspace_id uuid;'||chr(10)||'  v_previous_pricing_group text:=coalesce(current_setting(''salonpro.public_composition_pricing_group'',true),'''');');
  updated=replace(updated,'  for v_item in',
    '  perform set_config(''salonpro.public_composition_pricing_group'',v_group.id::text,true);'||chr(10)||chr(10)||'  for v_item in');
  updated=replace(updated,'v_total_price := v_total_price + v_effective_item_price;',
    'v_total_price := v_total_price + v_request.requested_price;');
  updated=replace(updated,'  update public.appointment_groups'||chr(10)||'  set customer_id',
    '  perform set_config(''salonpro.public_composition_pricing_group'',v_previous_pricing_group,true);'||chr(10)||chr(10)||'  update public.appointment_groups'||chr(10)||'  set customer_id');
  if updated=definition or position('v_previous_pricing_group text' in updated)=0
    or position('v_total_price := v_total_price + v_request.requested_price;' in updated)=0
    or position('v_previous_pricing_group,true' in updated)=0 then
    raise exception 'composition_payment_constructor_anchor_missing';end if;execute updated;
end $patch$;

notify pgrst,'reload schema';
