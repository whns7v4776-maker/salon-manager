-- Audit: gift residuals, completed checkout and consumption on payment.
CREATE OR REPLACE FUNCTION public.apply_customer_gift_card(p_card uuid, p_appointment uuid, p_amount bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare w uuid=current_workspace_id(); g customer_gift_cards; a appointments; prior gift_card_uses; available bigint; result uuid;
begin
 if w is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into g from customer_gift_cards where id=p_card and workspace_id=w for update;
 if not found then raise exception 'Gift card non disponibile'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=w for update;
 if not found or a.customer_id is distinct from g.customer_id then raise exception 'Gift card intestata a un altro cliente'; end if;
 select * into prior from gift_card_uses where appointment_id=a.id;
 if found then
  if prior.gift_card_id<>g.id or prior.amount_cents<>p_amount then raise exception 'Gift card già applicata all’appuntamento'; end if;
  return prior.id;
 end if;
 if a.no_show or a.cashed_in or (g.expires_on is not null and greatest(a.appointment_date,(now() at time zone 'Europe/Rome')::date)>g.expires_on) then raise exception 'Verifica scadenza e stato dell’appuntamento'; end if;
 select g.amount_cents-coalesce(sum(amount_cents) filter(where state<>'released'),0) into available from gift_card_uses where gift_card_id=g.id;
 if p_amount is null or p_amount<=0 or p_amount>available or p_amount>round(a.price*100) then raise exception 'Credito insufficiente o importo superiore al servizio'; end if;
 if exists(select 1 from booking_payment_orders where request_id=a.booking_request_id)
 or exists(select 1 from appointment_payment_revisions where appointment_id=a.id)
 or exists(select 1 from cash_movements m where m.appointment_id=a.id and (m.payment_method is not null or exists(select 1 from cash_stripe_payments s where s.movement_id=m.id and s.status<>'expired'))) then raise exception 'Gestisci prima il pagamento già avviato'; end if;
 -- Update before inserting the immutable allocation; later changes are guarded.
 perform 1 from cash_movements where appointment_id=a.id for update;
 if round(a.price*100)=p_amount then delete from cash_movements where appointment_id=a.id;
 else update cash_movements set amount=a.price-p_amount/100.0 where appointment_id=a.id and payment_method is null; end if;
 delete from booking_payment_terms where request_id=a.booking_request_id;
 update appointments set price=price-p_amount/100.0 where id=a.id;
 update booking_requests set requested_price=a.price-p_amount/100.0,customer_id=g.customer_id where id=a.booking_request_id;
 insert into gift_card_uses(workspace_id,gift_card_id,appointment_id,request_id,amount_cents,original_price)
 values(w,g.id,a.id,a.booking_request_id,p_amount,a.price) returning id into result;
 update appointment_groups gg set total_price=(select sum(x.price) from appointments x where x.appointment_group_id=gg.id) where gg.id=a.appointment_group_id;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.sync_gift_card_use()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare usage gift_card_uses; aid uuid; request uuid; a appointments;
begin
 if tg_table_name='appointments' then aid=case when tg_op='DELETE' then old.id else new.id end;
 else request=case when tg_op='DELETE' then old.id else new.id end; end if;
 select * into usage from gift_card_uses where appointment_id=aid or request_id=request;
 if not found then return null; end if;
 perform 1 from customer_gift_cards where id=usage.gift_card_id for update;
 select * into a from appointments where id=usage.appointment_id;
 if (a.completed or a.cashed_in) and not a.no_show then update gift_card_uses set state='consumed' where id=usage.id and state='reserved';
 elsif a.id is null or a.no_show or exists(select 1 from booking_requests where id=usage.request_id and status::text not in ('pending','accepted')) then update gift_card_uses set state='released' where id=usage.id and state='reserved'; end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public.guard_gift_card_agreement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare usage gift_card_uses; card customer_gift_cards;
begin
 if tg_table_name='cash_movements' then
  if exists(select 1 from customer_gift_cards where purchase_movement_id=old.id) then
   if tg_op='DELETE' then raise exception 'Conserva l’incasso della gift card'; end if;
   if (new.amount,new.payment_method,new.workspace_id,new.appointment_id,new.booking_voided) is distinct from (old.amount,old.payment_method,old.workspace_id,old.appointment_id,old.booking_voided) then raise exception 'Incasso gift card protetto'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
 end if;
 if tg_table_name='appointments' then select * into usage from gift_card_uses where appointment_id=old.id;
 else select * into usage from gift_card_uses where request_id=old.id; end if;
 if not found then return case when tg_op='DELETE' then old else new end; end if;
 if tg_op='DELETE' then
  if usage.state='consumed' then raise exception 'Gift card già utilizzata: conserva la prestazione'; end if;
  return old;
 end if;
 select * into card from customer_gift_cards where id=usage.gift_card_id;
 if new.customer_id is distinct from card.customer_id or new.workspace_id<>card.workspace_id or (card.expires_on is not null and new.appointment_date>card.expires_on) then raise exception 'Rispetta intestatario e scadenza della gift card'; end if;
 if tg_table_name='appointments' then
  if new.price is distinct from old.price or new.service_name is distinct from old.service_name or (usage.state='consumed' and ((old.completed and not new.completed) or new.no_show)) or (usage.state='released' and (new.completed or not new.no_show)) then raise exception 'Copertura gift card già registrata: conserva le condizioni'; end if;
 else
  if new.requested_price is distinct from old.requested_price or new.requested_service_name is distinct from old.requested_service_name or (usage.state='consumed' and new.status::text not in ('pending','accepted')) or (usage.state='released' and new.status::text in ('pending','accepted')) then raise exception 'Copertura gift card già registrata'; end if;
 end if;
 return new;
end $function$;
create function public.guard_gift_checkout_amount() returns trigger language plpgsql security definer set search_path=public as $$
declare u gift_card_uses;
begin
 select * into u from gift_card_uses where appointment_id=new.appointment_id;
 if found and u.state<>'released' and (u.workspace_id<>new.workspace_id or round(new.amount*100)<>round(u.original_price*100)-u.amount_cents) then raise exception 'Saldo coperto da gift card: aggiorna la Cassa prima di incassare';end if;
 return new;
end $$;
create trigger gift_checkout_amount_guard before insert or update on public.cash_movements for each row execute function guard_gift_checkout_amount();
revoke all on function public.guard_gift_checkout_amount() from public,anon,authenticated;

-- One small owner-readable revision per salon, with no customer data in realtime.
create table public.benefit_sync_revisions (
 workspace_id uuid primary key references workspaces(id) on delete cascade,
 revision bigint not null default 1, updated_at timestamptz not null default now()
);
alter table public.benefit_sync_revisions enable row level security;
revoke all on public.benefit_sync_revisions from public,anon,authenticated;
grant select on public.benefit_sync_revisions to authenticated;
grant all on public.benefit_sync_revisions to service_role;
create policy benefit_sync_owner on public.benefit_sync_revisions for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());
create function public.bump_benefit_revision() returns trigger language plpgsql security definer set search_path=public as $$
declare w uuid;
begin
 w=case when tg_op='DELETE' then old.workspace_id else new.workspace_id end;
 if exists(select 1 from workspaces where id=w) then
 insert into benefit_sync_revisions(workspace_id) values(w) on conflict(workspace_id) do update set revision=benefit_sync_revisions.revision+1,updated_at=clock_timestamp();
 end if;
 return null;
end $$;
revoke all on function public.bump_benefit_revision() from public,anon,authenticated;
do $$ declare t text;begin
 foreach t in array array['salon_benefit_settings','service_package_catalog','customer_service_packages','service_package_redemptions','salon_loyalty_rewards','customer_loyalty_ledger','customer_gift_cards','gift_card_uses','gift_card_templates','loyalty_checkout_uses'] loop
 execute format('create trigger benefit_revision_changed after insert or update or delete on public.%I for each row execute function public.bump_benefit_revision()',t);
 end loop;
end $$;
alter publication supabase_realtime add table public.benefit_sync_revisions;
