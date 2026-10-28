-- Notification consent is technical metadata, not appointment/purchase history.
-- Its customer FK already uses ON DELETE CASCADE. Preserve all other guards.
begin;
CREATE OR REPLACE FUNCTION public.decide_customer_registration(p_customer_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_workspace_id uuid;
  v_customer public.customers%rowtype;
  v_decision text := lower(trim(coalesce(p_decision,'')));
  v_history boolean;
  v_fk record;
begin
  if auth.uid() is null or coalesce(auth.role(),'') <> 'authenticated' then raise exception 'owner_session_required'; end if;
  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then raise exception 'workspace_access_denied'; end if;
  if v_decision not in ('approved','rejected') then raise exception 'customer_registration_decision_invalid'; end if;
  if p_customer_id is null then raise exception 'customer_id_invalid'; end if;
  -- Terminal responses need no projection/customer lock. In particular, an
  -- approval retry must not wait for a booking that holds the customer FK and
  -- is about to refresh the portal. Approved admission cannot be downgraded.
  select * into v_customer from public.customers
    where id=p_customer_id and workspace_id=v_workspace_id;
  if found and v_customer.registration_status='approved' then
    if v_decision='rejected' then raise exception 'customer_registration_not_pending'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
  end if;
  if not found then
    if v_decision='rejected' and exists(select 1 from public.customer_registration_rejections
      where workspace_id=v_workspace_id and customer_id=p_customer_id) then
      return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','rejected','registrationStatus','rejected');
    end if;
    raise exception 'customer_not_found';
  end if;
  -- Same order as settings/full snapshot publishing; acquire these before
  -- changing customers because their existing trigger touches the portal.
  perform 1 from public.owner_app_snapshots where workspace_id=v_workspace_id for update;
  perform 1 from public.client_portals where workspace_id=v_workspace_id for update;
  -- A different owner decision may have completed while we waited above.
  select * into v_customer from public.customers
    where id=p_customer_id and workspace_id=v_workspace_id;
  if found and v_customer.registration_status='approved' then
    if v_decision='rejected' then raise exception 'customer_registration_not_pending'; end if;
    return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
  end if;
  -- Owner booking/editor writes can hold a customer FK before touching the
  -- portal. Never wait in the opposite direction: report a clean retry rather
  -- than deadlock, and hold the exclusive row lock through rejection's delete.
  begin
    select * into v_customer from public.customers
      where id=p_customer_id and workspace_id=v_workspace_id for update nowait;
  exception when lock_not_available then raise exception 'customer_registration_busy'; end;
  if not found then
    if v_decision='rejected' and exists(select 1 from public.customer_registration_rejections
      where workspace_id=v_workspace_id and customer_id=p_customer_id) then
      return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','rejected','registrationStatus','rejected');
    end if;
    raise exception 'customer_not_found';
  end if;
  if v_decision='approved' then
    if v_customer.registration_status='approved' then
      return jsonb_build_object('ok',true,'replayed',true,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
    end if;
    perform set_config('salonpro.approving_customer_registration',p_customer_id::text,true);
    update public.customers set registration_status='approved',viewed_by_salon=true where id=p_customer_id;
    perform set_config('salonpro.approving_customer_registration','',true);
    update public.owner_app_snapshots
      set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{clienti}',
        public.overlay_customer_registration_status_v1(v_workspace_id,coalesce(payload->'clienti','[]'::jsonb)),true)
      where workspace_id=v_workspace_id;
    perform public.queue_public_customer_push(v_workspace_id,'custom','Registrazione approvata',
      'Il salone ha abilitato il tuo account. Ora puoi prenotare.',
      jsonb_build_object('kind','customer_registration_approved','type','customer_registration_approved',
        'customerId',p_customer_id,'salonCode',(select slug from public.workspaces where id=v_workspace_id),
        '_dedupeKey','customer-registration-approved:' || p_customer_id::text),
      v_customer.email,v_customer.phone);
    return jsonb_build_object('ok',true,'replayed',false,'customerId',p_customer_id,'decision','approved','registrationStatus','approved');
  end if;
  if v_customer.registration_status<>'pending' then raise exception 'customer_registration_not_pending'; end if;
  -- No historical/business data is deleted. A salon may have added an owner
  -- appointment or benefit while admission was pending; it must approve and
  -- use the regular customer management flow instead of rejecting that row.
  if exists(select 1 from public.appointments where workspace_id=v_workspace_id and customer_id=p_customer_id)
    or exists(select 1 from public.appointment_groups where workspace_id=v_workspace_id and customer_id=p_customer_id)
    or exists(select 1 from public.booking_requests where workspace_id=v_workspace_id and (
      customer_id=p_customer_id or (lower(trim(coalesce(customer_email::text,'')))=lower(trim(coalesce(v_customer.email::text,'')))
        and right(regexp_replace(coalesce(customer_phone,''),'\D+','','g'),10)=right(regexp_replace(coalesce(v_customer.phone,''),'\D+','','g'),10)))) then
    raise exception 'pending_customer_has_history';
  end if;
  for v_fk in
    select namespace.nspname,relation.relname,attribute.attname
    from pg_constraint constraint_row
    join pg_class relation on relation.oid=constraint_row.conrelid
    join pg_namespace namespace on namespace.oid=relation.relnamespace
    join pg_attribute attribute on attribute.attrelid=constraint_row.conrelid and attribute.attnum=constraint_row.conkey[1]
    where constraint_row.contype='f' and constraint_row.confrelid='public.customers'::regclass
      and namespace.nspname='public'
      and relation.relname not in (
        'customer_login_credentials','customer_payment_sessions',
        'customer_communication_recipients','customer_service_duration_overrides',
        'customer_service_price_overrides','customer_personalization_revisions',
        'customer_online_booking_policies','customer_online_service_overrides',
        'customer_online_composition_overrides','booking_payment_policies',
        'customer_identity_colors','customer_communication_reminder_days',
        'customer_communication_reminder_dismissals','client_gps_reminder_state',
        'customer_benefit_notifications','customer_notification_consent_updates')
  loop
    execute format('select exists(select 1 from %I.%I where %I=$1)',v_fk.nspname,v_fk.relname,v_fk.attname)
      into v_history using p_customer_id;
    if v_history then raise exception 'pending_customer_has_history'; end if;
  end loop;
  -- Notifications carry no business balance and must not prevent removing a
  -- just-registered customer; all credentials/sessions cascade from this row.
  delete from public.customer_benefit_notifications where customer_id=p_customer_id and workspace_id=v_workspace_id;
  insert into public.customer_registration_rejections(workspace_id,customer_id)
    values(v_workspace_id,p_customer_id) on conflict do nothing;
  begin
    delete from public.customers where id=p_customer_id and workspace_id=v_workspace_id;
  exception when foreign_key_violation then raise exception 'pending_customer_has_history'; end;
  -- Filter both projections immediately. UUID evidence also survives clearing
  -- the old name tombstone during a later legitimate new registration.
  update public.client_portals set clienti=public.filter_deleted_snapshot_customers(v_workspace_id,clienti)
    where workspace_id=v_workspace_id;
  update public.owner_app_snapshots
    set payload=jsonb_set(coalesce(payload,'{}'::jsonb),'{clienti}',
      public.filter_deleted_snapshot_customers(v_workspace_id,coalesce(payload->'clienti','[]'::jsonb)),true)
    where workspace_id=v_workspace_id;
  return jsonb_build_object('ok',true,'replayed',false,'customerId',p_customer_id,'decision','rejected','registrationStatus','rejected');
end $function$
;
commit;
