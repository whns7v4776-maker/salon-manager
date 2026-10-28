-- Booking and entitlement reservation commit together, including retries.
create table if not exists public.owner_package_booking_operations (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 operation_id uuid not null,
 package_id uuid not null references public.customer_service_packages(id),
 customer_id uuid not null references public.customers(id),
 payload jsonb not null,
 result jsonb not null,
 primary key(workspace_id,operation_id)
);
alter table public.owner_package_booking_operations enable row level security;
revoke all on public.owner_package_booking_operations from public,anon,authenticated;

create or replace function public.create_owner_package_appointment_v1(
 p_package_id uuid, p_customer_id uuid, p_key uuid, p_payload jsonb, p_group boolean default false
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 w uuid=public.current_workspace_id();
 p public.customer_service_packages;
 previous public.owner_package_booking_operations;
 r jsonb; ids uuid[]; original_payload jsonb=p_payload; c public.customers;
begin
 if auth.uid() is null or w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 if p_key is null or p_customer_id is null then raise exception 'Cliente e conferma richiesti'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text||p_key::text,0));
 select * into previous from owner_package_booking_operations where workspace_id=w and operation_id=p_key;
 if found then
  if previous.package_id<>p_package_id or previous.customer_id<>p_customer_id or previous.payload<>jsonb_build_object('booking',original_payload,'group',p_group) then raise exception 'Conferma già usata per una scelta diversa'; end if;
  return previous.result;
 end if;
 select * into p from customer_service_packages where id=p_package_id and workspace_id=w for update;
 if not found or p.customer_id is distinct from p_customer_id then raise exception 'Il pacchetto appartiene a un altro cliente'; end if;
 select * into c from customers where id=p_customer_id and workspace_id=w;
 if not found then raise exception 'Cliente non disponibile'; end if;
 -- The selected UUID owns the wallet. The existing engine must resolve that
 -- same UUID; homonyms or stale contacts never silently transfer an entitlement.
 p_payload=p_payload||jsonb_build_object('p_customer_name',c.full_name,'p_customer_phone',c.phone,'p_customer_email',c.email);
  if p_group then
    r := public.create_owner_appointment_group_flexible_v1(
      p_salon_code => p_payload->>'p_salon_code',
      p_customer_name => p_payload->>'p_customer_name',
      p_customer_phone => p_payload->>'p_customer_phone',
      p_customer_email => (p_payload->>'p_customer_email')::citext,
      p_customer_instagram => p_payload->>'p_customer_instagram', p_customer_note => p_payload->>'p_customer_note',
      p_customer_source => coalesce(p_payload->>'p_customer_source','salon'), p_group_title => p_payload->>'p_group_title',
      p_items => p_payload->'p_items', p_idempotency_key => p_payload->>'p_idempotency_key',
      p_create_customer_record => false, p_create_booking_requests => coalesce((p_payload->>'p_create_booking_requests')::boolean,false),
      p_allow_operator_overlap => coalesce((p_payload->>'p_allow_operator_overlap')::boolean,false),
      p_allow_customer_overlap => coalesce((p_payload->>'p_allow_customer_overlap')::boolean,false),
      p_allow_machinery_overlap => coalesce((p_payload->>'p_allow_machinery_overlap')::boolean,false),
      p_allow_outside_schedule => true, p_allow_capability_override => true);
    select array_agg(value::uuid) into ids from jsonb_array_elements_text(r->'appointmentIds');
  else
    r := public.create_owner_appointment_flexible_v1(
      p_salon_code => p_payload->>'p_salon_code',
      p_customer_name => p_payload->>'p_customer_name',
      p_customer_phone => p_payload->>'p_customer_phone',
      p_customer_email => (p_payload->>'p_customer_email')::citext,
      p_customer_instagram => p_payload->>'p_customer_instagram', p_customer_note => p_payload->>'p_customer_note',
      p_customer_source => coalesce(p_payload->>'p_customer_source','salon'), p_create_customer_record => false, p_create_booking_request => coalesce((p_payload->>'p_create_booking_request')::boolean,false),
      p_service_name => p_payload->>'p_service_name', p_price => (p_payload->>'p_price')::numeric,
      p_duration_minutes => (p_payload->>'p_duration_minutes')::integer,
      p_appointment_date => (p_payload->>'p_appointment_date')::date,
      p_appointment_time => (p_payload->>'p_appointment_time')::time,
      p_operator_id => p_payload->>'p_operator_id', p_operator_name => p_payload->>'p_operator_name',
      p_required_role => p_payload->>'p_required_role', p_phase_snapshot => nullif(p_payload->'p_phase_snapshot','null'::jsonb),
      p_allow_operator_overlap => coalesce((p_payload->>'p_allow_operator_overlap')::boolean,false),
      p_allow_customer_overlap => coalesce((p_payload->>'p_allow_customer_overlap')::boolean,false),
      p_allow_machinery_overlap => coalesce((p_payload->>'p_allow_machinery_overlap')::boolean,false),
      p_allow_outside_schedule => true, p_allow_capability_override => true);
    ids := array[(r->>'appointmentId')::uuid];
  end if;
  if coalesce(cardinality(ids),0)=0 or (r->>'workspaceId')::uuid is distinct from w then raise exception 'Appuntamento non confermato'; end if;
  if exists(select 1 from appointments where id=any(ids) and (workspace_id<>w or customer_id is distinct from p_customer_id)) then raise exception 'Il cliente risolto non corrisponde alla selezione'; end if;
  if (select count(*) from appointments where id=any(ids) and workspace_id=w)<>cardinality(ids) then raise exception 'Appuntamenti non disponibili'; end if;
  perform public.apply_owner_service_package(p_package_id,ids[1]);
  -- A composition selection must cover the entire exact set, not just its first slot.
  if exists(select 1 from appointments a where a.id=any(ids) and not exists(
    select 1 from service_package_booking_lines l join service_package_redemptions d on d.id=l.redemption_id
    where l.appointment_id=a.id and d.package_id=p_package_id and d.state='reserved')) then
    raise exception 'Il pacchetto non copre tutti i servizi selezionati';
  end if;
  insert into owner_package_booking_operations values(w,p_key,p_package_id,p_customer_id,jsonb_build_object('booking',original_payload,'group',p_group),r);
  return r;
end $$;
revoke all on function public.create_owner_package_appointment_v1(uuid,uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.create_owner_package_appointment_v1(uuid,uuid,uuid,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
