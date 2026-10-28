-- A composition consists of appointment rows for its component services.
-- Public services and private components may intentionally share name + role.
-- Never pick an arbitrary recipe when a legacy appointment has no service UUID.
alter table public.shop_service_consumptions
  add column identity_review_required boolean not null default false;

create function public.shop_consumption_service_identity(p_appointment uuid)
returns table(resolved_service_id uuid, requires_review boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  a appointments;
  metadata jsonb;
  ids uuid[];
  snapshot_count integer;
  valid_snapshot_count integer;
begin
  select * into a from appointments where id = p_appointment;
  if not found then return; end if;

  -- The appointment UUID is authoritative, including after a catalogue rename.
  if a.service_id is not null then
    select array_agg(s.id) into ids from services s
    where s.id = a.service_id and s.workspace_id = a.workspace_id;
    if cardinality(ids) = 1 then
      return query select ids[1], false;
      return;
    end if;
    -- A foreign/stale explicit UUID must never fall back to a different recipe.
    return query select null::uuid, exists (
      select 1 from services s join shop_service_recipes r on r.service_id = s.id
      where s.workspace_id = a.workspace_id and r.workspace_id = a.workspace_id
        and lower(btrim(s.name)) = lower(btrim(a.service_name))
        and jsonb_array_length(r.lines) > 0
    );
    return;
  end if;

  if a.appointment_group_id is not null then
    select g.metadata into metadata from appointment_groups g
    where g.id = a.appointment_group_id and g.workspace_id = a.workspace_id;

    -- Saved operator assignments carry the service UUID at booking time.
    -- Match the actual component, not merely the mutable composition catalogue.
    select array_agg(distinct s.id) filter(where s.id is not null), count(*), count(s.id)
      into ids, snapshot_count, valid_snapshot_count
    from jsonb_array_elements(case when jsonb_typeof(metadata->'operatorAssignments') = 'array'
      then metadata->'operatorAssignments' else '[]'::jsonb end) entry
    left join services s on s.id::text = lower(entry->>'serviceId')
      and s.workspace_id = a.workspace_id
    where entry->>'position' = a.appointment_group_order::text
      and lower(btrim(entry->>'serviceName')) = lower(btrim(a.service_name))
      and entry->>'date' = a.appointment_date::text
      and left(entry->>'time', 5) = to_char(a.appointment_time, 'HH24:MI');
    if snapshot_count > 0 then
      if cardinality(ids) = 1 and valid_snapshot_count = snapshot_count then
        return query select ids[1], false;
        return;
      end if;
      -- A matching snapshot with an invalid/foreign UUID or conflicting UUIDs
      -- contradicts name inference. Never discard it and guess by a unique name.
      return query select null::uuid, exists (
        select 1 from services s join shop_service_recipes r on r.service_id = s.id
        where s.workspace_id = a.workspace_id and r.workspace_id = a.workspace_id
          and (lower(btrim(s.name)) = lower(btrim(a.service_name)) or s.id = any(ids))
          and jsonb_array_length(r.lines) > 0
      );
      return;
    end if;

    -- Dependency bookings have separate immutable parent/add-on service UUIDs.
    -- Match identity by snapshot name and role, never by a potentially reordered
    -- requestIds array or today's composition items.
    select array_agg(distinct s.id) into ids from services s
    where s.workspace_id = a.workspace_id
      and s.id::text in (lower(metadata->>'dependencyParentServiceId'), lower(metadata->>'dependencyServiceId'))
      and lower(btrim(s.name)) = lower(btrim(a.service_name))
      and (nullif(btrim(a.required_role), '') is null
        or lower(btrim(coalesce(s.required_role, ''))) = lower(btrim(a.required_role)));
    if cardinality(ids) = 1 then
      return query select ids[1], false;
      return;
    end if;
  end if;

  select array_agg(s.id) into ids from services s
  where s.workspace_id = a.workspace_id
    and s.superseded_by_composition_id is null
    and lower(btrim(s.name)) = lower(btrim(a.service_name))
    and (nullif(btrim(a.required_role), '') is null
      or lower(btrim(coalesce(s.required_role, ''))) = lower(btrim(a.required_role)));
  if cardinality(ids) = 1 then
    return query select ids[1], false;
    return;
  end if;

  -- Unconfigured/custom services do not produce noise. When a matching recipe
  -- does exist, an unresolved identity is actionable instead of silently skipped.
  return query select null::uuid, exists (
    select 1 from services s join shop_service_recipes r on r.service_id = s.id
    where s.workspace_id = a.workspace_id and r.workspace_id = a.workspace_id
      and lower(btrim(s.name)) = lower(btrim(a.service_name))
      and jsonb_array_length(r.lines) > 0
  );
end $$;

create or replace function public.shop_on_service_completed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r shop_service_recipes;
  cid uuid;
  owner_id uuid;
  service_key uuid;
  review_identity boolean;
begin
  if not new.completed or new.no_show then return new; end if;
  if tg_op = 'UPDATE' and old.completed then return new; end if;
  if not coalesce((select enabled and consumption_enabled from shop_settings where workspace_id = new.workspace_id), false) then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('shop:' || new.workspace_id::text, 0));
  select resolved_service_id, requires_review into service_key, review_identity
    from shop_consumption_service_identity(new.id);
  if not coalesce(review_identity, false) then
    select * into r from shop_service_recipes where service_id = service_key and workspace_id = new.workspace_id;
    if not found or jsonb_array_length(r.lines) = 0 then return new; end if;
  end if;
  select user_id into owner_id from workspace_members
    where workspace_id = new.workspace_id and role = 'owner' order by user_id limit 1;
  insert into shop_service_consumptions(
    workspace_id, appointment_id, service_name, appointment_date, lines, actor_id,
    identity_review_required, issue
  ) values (
    new.workspace_id, new.id, new.service_name, new.appointment_date,
    case when review_identity then '[]'::jsonb else r.lines end,
    coalesce(auth.uid(), owner_id), coalesce(review_identity, false),
    case when review_identity then
      'Il servizio di questo appuntamento non è identificabile con certezza. Nessun prodotto è stato scaricato. Registra manualmente il consumo corretto, poi scegli “Già gestito o non avvenuto” e indica la motivazione.'
      else '' end
  ) on conflict(workspace_id, appointment_id) do nothing returning id into cid;
  if cid is null or review_identity then return new; end if;
  begin
    perform shop_apply_consumption(cid);
  exception when others then
    update shop_service_consumptions set issue = left(sqlerrm, 500) where id = cid;
  end;
  return new;
end $$;

-- Preserve the existing atomic stock/snapshot worker; block an empty unresolved
-- recipe from being reported as a successful retry by the existing console.
create or replace function public.shop_apply_consumption(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c shop_service_consumptions; p shop_products; l jsonb; snapshot jsonb = '[]'; q numeric;
begin
  select * into c from shop_service_consumptions where id = p_id for update;
  if c.state <> 'pending' then return; end if;
  if c.identity_review_required then raise exception '%', c.issue; end if;
  if jsonb_array_length(c.lines) = 0 then raise exception 'Ricetta non disponibile: verifica il consumo prima di archiviarlo'; end if;
  insert into shop_operations(workspace_id,id,kind,payload) values(c.workspace_id,c.id,'service-consumption',jsonb_build_object('appointment',c.appointment_id));
  for l in select * from jsonb_array_elements(c.lines) loop
    select * into p from shop_products where id=(l->>'product_id')::uuid and workspace_id=c.workspace_id for update;
    q=(l->>'quantity')::numeric;
    if not found or p.archived or p.purpose='retail' or p.unit<>l->>'unit' or p.pack_size<>(l->>'pack_size')::numeric then raise exception 'Prodotto modificato o archiviato: %',l->>'name'; end if;
    if p.professional_qty<q then raise exception 'Scorta insufficiente: % (servono % %)',p.name,q,p.unit; end if;
    update shop_products set professional_qty=professional_qty-q,stock_revision=stock_revision+1 where id=p.id;
    insert into shop_stock_movements(workspace_id,product_id,operation_id,bucket,delta,reason,actor_id) values(c.workspace_id,p.id,c.id,'professional',-q,'Consumo servizio: '||c.service_name,c.actor_id);
    snapshot=snapshot||jsonb_build_array(l||jsonb_build_object('cost_cents',round(q*p.cost_cents/p.pack_size)));
  end loop;
  update shop_service_consumptions set state='applied',issue='',lines=snapshot,applied_at=now(),revision=revision+1 where id=c.id;
end $$;

revoke all on function public.shop_consumption_service_identity(uuid) from public, anon, authenticated;
revoke all on function public.shop_on_service_completed() from public, anon, authenticated;
revoke all on function public.shop_apply_consumption(uuid) from public, anon, authenticated;
