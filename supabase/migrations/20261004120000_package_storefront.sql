-- Publication is opt-in per model; existing owner-only models remain private.
alter table public.service_package_catalog add column online_visible boolean not null default false;
alter table public.service_package_orders add column account_id text;
alter table public.service_package_orders add column livemode boolean;
alter table public.service_package_orders add column payment_intent text;
create function public.set_package_online_visibility(p_catalog uuid,p_visible boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if public.current_workspace_id() is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 update service_package_catalog set online_visible=p_visible,revision=revision+1 where id=p_catalog and workspace_id=public.current_workspace_id() and not archived;
 if not found then raise exception 'Modello non disponibile'; end if;
end $$;
revoke all on function public.set_package_online_visibility(uuid,boolean) from public,anon;
grant execute on function public.set_package_online_visibility(uuid,boolean) to authenticated;
-- Keep preparation server-only and lock the published terms during creation.
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
 if not found or c.archived or not c.online_visible or c.revision<>p_revision then raise exception 'Catalogo cambiato: aggiorna i pacchetti disponibili'; end if;
 if c.price_cents<50 then raise exception 'Prezzo non disponibile per il pagamento online'; end if;
 insert into service_package_orders(id,workspace_id,customer_id,catalog_id,terms,amount_cents)
 values(p_order,p_workspace,p_customer,p_catalog,to_jsonb(c),c.price_cents) returning * into result;
 return result;
end $$;
-- Activation and the Stripe ledger entry commit together, including webhook retries.
create function public.settle_service_package_order(p_order uuid,p_session text,p_account text,p_live boolean,p_amount bigint,p_currency text,p_intent text)
returns uuid language plpgsql security definer set search_path=public as $$
declare o service_package_orders; package uuid; m uuid;
begin
 select * into o from service_package_orders where id=p_order for update;
 if not found or o.account_id is distinct from p_account or o.livemode is distinct from p_live then raise exception 'Pagamento non corrispondente'; end if;
 package=activate_paid_service_package_order(p_order,p_session,p_amount,p_currency);
 select purchase_movement_id into m from customer_service_packages where id=package;
 insert into cash_stripe_payments(id,workspace_id,movement_id,account_id,amount_cents,currency,status,session_id,payment_intent)
 values(o.id,o.workspace_id,m,p_account,p_amount,p_currency,'paid',p_session,p_intent)
 on conflict(id) do nothing;
 if not exists(select 1 from cash_stripe_payments where id=o.id and workspace_id=o.workspace_id and movement_id=m and account_id=p_account and amount_cents=p_amount and session_id=p_session) then raise exception 'Identificativo pagamento già utilizzato'; end if;
 update service_package_orders set payment_intent=p_intent where id=o.id;
 return package;
end $$;
revoke all on function public.settle_service_package_order(uuid,text,text,boolean,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_service_package_order(uuid,text,text,boolean,bigint,text,text) to service_role;
-- A provider refund invalidates remaining online benefits; existing bookings require salon review.
create function public.suspend_refunded_service_package() returns trigger language plpgsql security definer set search_path=public as $$
declare o service_package_orders; cutoff date=(now() at time zone 'Europe/Rome')::date-1;
begin
 if new.refunded_cents>0 and new.refunded_cents is distinct from old.refunded_cents then
  select * into o from service_package_orders where id=new.id and package_id is not null;
  if found then
   update service_package_orders set status='refunded' where id=o.id;
   update customer_service_packages set starts_on=least(starts_on,cutoff),expires_on=least(expires_on,cutoff),product_discount=0 where id=o.package_id;
   perform record_benefit_notification(o.workspace_id,o.customer_id,'package-refund:'||o.id,'Pacchetto sospeso dopo rimborso','Il salone ha rimborsato il tuo pacchetto. Contattalo per verificare gli appuntamenti già prenotati.');
  end if;
 end if;
 return new;
end $$;
create trigger package_refund_sync after update of refunded_cents on public.cash_stripe_payments for each row execute function public.suspend_refunded_service_package();
revoke all on function public.suspend_refunded_service_package() from public,anon,authenticated;
