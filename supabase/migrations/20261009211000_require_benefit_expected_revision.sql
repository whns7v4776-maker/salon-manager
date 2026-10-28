-- NULL cannot prove that a catalogue/reward quote is current.
-- Retain existing idempotent replay behavior for already committed operations.

create or replace function public.assign_service_package(p_purchase_id uuid,p_customer_id uuid,p_catalog_id uuid,p_revision integer,p_starts_on date,p_payment_method public.payment_method)
returns public.customer_service_packages language plpgsql security definer set search_path=public as $$
declare w uuid=public.current_workspace_id(); c service_package_catalog; result customer_service_packages; m uuid; label text;
begin
 if w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_purchase_id::text,0));
 select * into result from customer_service_packages where id=p_purchase_id;
 if found then
  if result.workspace_id<>w or result.customer_id<>p_customer_id or result.catalog_id<>p_catalog_id then raise exception 'Identificativo acquisto già utilizzato'; end if;
  return result;
 end if;
 select full_name into label from customers where id=p_customer_id and workspace_id=w;
 if not found then raise exception 'Cliente non trovato'; end if;
 select * into c from service_package_catalog where id=p_catalog_id and workspace_id=w for share;
 if not exists(select 1 from salon_benefit_settings where workspace_id=w and packages_enabled) then raise exception 'Attiva gli abbonamenti prima di assegnarli'; end if;
 if not found or c.archived or c.revision is distinct from p_revision then raise exception 'Catalogo cambiato: aggiorna il pacchetto prima di confermare'; end if;
 if p_payment_method is null or p_starts_on is null then raise exception 'Indica data di inizio e pagamento ricevuto'; end if;
 insert into cash_movements(workspace_id,description,amount,payment_method)
 values(w,'Pacchetto '||c.name||' · '||label,c.price_cents/100.0,p_payment_method) returning id into m;
 insert into customer_service_packages(id,workspace_id,customer_id,catalog_id,name,entitlements,uses,starts_on,expires_on,price_cents,product_discount,purchase_movement_id)
 values(p_purchase_id,w,p_customer_id,c.id,c.name,c.entitlements,c.uses,p_starts_on,
 (p_starts_on+make_interval(months=>c.months))::date-1,c.price_cents,c.product_discount,m) returning * into result;
 return result;
end $$;

create or replace function public.prepare_service_package_order(p_order uuid,p_workspace uuid,p_customer uuid,p_catalog uuid,p_revision integer)
returns public.service_package_orders language plpgsql security definer set search_path=public as $$
declare result service_package_orders; c service_package_catalog;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_order::text,2));
 select * into result from service_package_orders where id=p_order;
 if found then
  if (result.workspace_id,result.customer_id,result.catalog_id) is distinct from (p_workspace,p_customer,p_catalog) then raise exception 'Ordine già utilizzato'; end if;
  return result;
 end if;
 if not exists(select 1 from salon_benefit_settings where workspace_id=p_workspace and packages_enabled) then raise exception 'Vendita pacchetti disattivata'; end if;
 if not exists(select 1 from customers where id=p_customer and workspace_id=p_workspace and is_active) then raise exception 'Cliente non disponibile'; end if;
 select * into c from service_package_catalog where id=p_catalog and workspace_id=p_workspace for share;
 if not found or c.archived or not c.online_visible or c.revision is distinct from p_revision then raise exception 'Catalogo cambiato: aggiorna i pacchetti disponibili'; end if;
 if c.price_cents<50 then raise exception 'Prezzo non disponibile per il pagamento online'; end if;
 insert into service_package_orders(id,workspace_id,customer_id,catalog_id,terms,amount_cents)
 values(p_order,p_workspace,p_customer,p_catalog,to_jsonb(c),c.price_cents) returning * into result;
 return result;
end $$;

create or replace function public.redeem_loyalty_reward(p_customer uuid,p_reward uuid,p_revision integer,p_operation uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); r salon_loyalty_rewards; prior customer_loyalty_ledger; balance bigint; result uuid;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 perform 1 from customers where id=p_customer and workspace_id=w for update;
 if not found then raise exception 'Cliente non trovato'; end if;
 select * into prior from customer_loyalty_ledger where workspace_id=w and reference_key='reward:'||p_operation;
 if found then
  if prior.customer_id<>p_customer then raise exception 'Operazione già utilizzata'; end if;
  return prior.id;
 end if;
 select * into r from salon_loyalty_rewards where id=p_reward and workspace_id=w for share;
 if not found or r.archived or r.revision is distinct from p_revision then raise exception 'Premio non disponibile: aggiorna'; end if;
 select coalesce(sum(delta),0) into balance from customer_loyalty_ledger where customer_id=p_customer and workspace_id=w;
 if r.reward_type<>'custom' then raise exception 'Applica questo premio dalla Cassa o dall’appuntamento'; end if;
 if r.expires_on is not null and r.expires_on<(now() at time zone 'Europe/Rome')::date then raise exception 'Premio scaduto'; end if;
 if balance<r.points_cost then raise exception 'Punti insufficienti'; end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description)
 values(w,p_customer,-r.points_cost,'reward','reward:'||p_operation,'Omaggio consegnato: '||r.name) returning id into result;
 return result;
end $$;

create or replace function public.apply_loyalty_checkout_reward(p_appointment uuid,p_reward uuid,p_revision integer)
returns public.loyalty_checkout_uses language plpgsql security definer set search_path=public as $$
declare w uuid=current_workspace_id(); a appointments; r salon_loyalty_rewards; prior loyalty_checkout_uses; discount bigint; ledger uuid;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=w for update;
 if not found then raise exception 'Appuntamento non trovato'; end if;
 perform 1 from customers where id=a.customer_id and workspace_id=w for update;
 select * into prior from loyalty_checkout_uses where appointment_id=a.id;
 if found then
 if prior.reward_id<>p_reward or prior.state='released' then raise exception 'Premio già gestito su questo appuntamento'; end if;
 return prior; end if;
 select * into r from salon_loyalty_rewards where id=p_reward and workspace_id=w for share;
 if not found or r.revision is distinct from p_revision then raise exception 'Premio modificato: aggiorna'; end if;
 -- Serialize with checkout: payment code locks the same cash movement.
 perform 1 from cash_movements where appointment_id=a.id for update;
 discount=loyalty_reward_quote(a.id,r.id);
 if discount is null then raise exception 'Premio non più utilizzabile: verifica punti, scadenza e pagamenti'; end if;
 if discount>0 then
 delete from booking_payment_terms where request_id=a.booking_request_id;
 update appointments set price=a.price-discount/100.0 where id=a.id;
 update booking_requests set requested_price=a.price-discount/100.0 where id=a.booking_request_id;
 if round(a.price*100)=discount then delete from cash_movements where appointment_id=a.id and payment_method is null;
 else update cash_movements set amount=a.price-discount/100.0 where appointment_id=a.id and payment_method is null; end if;
 update appointment_groups g set total_price=(select sum(x.price) from appointments x where x.appointment_group_id=g.id) where id=a.appointment_group_id;
 end if;
 insert into customer_loyalty_ledger(workspace_id,customer_id,delta,kind,reference_key,description)
 values(w,a.customer_id,-r.points_cost,'reward','checkout:'||a.id,'Premio fedeltà: '||r.name) returning id into ledger;
 insert into loyalty_checkout_uses(workspace_id,customer_id,appointment_id,request_id,reward_id,snapshot,discount_cents,original_price,ledger_id,state)
 values(w,a.customer_id,a.id,a.booking_request_id,r.id,to_jsonb(r),discount,a.price,ledger,case when a.completed or r.reward_type='custom' then 'consumed' else 'reserved' end) returning * into prior;
 return prior;
end $$;

revoke all on function public.assign_service_package(uuid,uuid,uuid,integer,date,payment_method),public.redeem_loyalty_reward(uuid,uuid,integer,uuid),public.apply_loyalty_checkout_reward(uuid,uuid,integer) from public,anon;
grant execute on function public.assign_service_package(uuid,uuid,uuid,integer,date,payment_method),public.redeem_loyalty_reward(uuid,uuid,integer,uuid),public.apply_loyalty_checkout_reward(uuid,uuid,integer) to authenticated;
revoke all on function public.prepare_service_package_order(uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.prepare_service_package_order(uuid,uuid,uuid,uuid,integer) to service_role;
