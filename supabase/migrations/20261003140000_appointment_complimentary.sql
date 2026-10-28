-- An explicit, audited per-service gift, separate from package or gift-card coverage.
alter table public.appointments add column complimentary boolean not null default false;
alter table public.appointments add column complimentary_original_price numeric;
alter table public.appointments add constraint complimentary_zero_price check (not complimentary or (price=0 and complimentary_original_price is not null));
create table public.appointment_complimentary_history (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id),
 appointment_id uuid not null, actor_id uuid not null, enabled boolean not null,
 original_price numeric not null, created_at timestamptz not null default now()
);
alter table public.appointment_complimentary_history enable row level security;
create policy complimentary_owner_read on public.appointment_complimentary_history for select to authenticated using(workspace_id=current_workspace_id() and workspace_access_allowed());
revoke all on public.appointment_complimentary_history from public,anon,authenticated;
grant select on public.appointment_complimentary_history to authenticated;
grant all on public.appointment_complimentary_history to service_role;

create function public.set_owner_appointment_complimentary_v1(p_appointment uuid,p_expected timestamptz,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; original numeric; payable numeric; financial jsonb; o booking_payment_orders;
begin
 if auth.uid() is null or not workspace_access_allowed() or p_enabled is null then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=current_workspace_id() for update;
 if not found then raise exception 'Appuntamento non disponibile'; end if;
 if a.complimentary=p_enabled then return to_jsonb(a); end if;
 if a.updated_at is distinct from p_expected then raise exception 'Appuntamento aggiornato da un altro dispositivo. Riapri il dettaglio.'; end if;
 if a.completed or a.no_show or a.cashed_in then raise exception 'Gestisci l’omaggio prima di completare o incassare il servizio'; end if;
 -- Never silently release a purchased entitlement or rewrite an existing receipt.
 if exists(select 1 from service_package_booking_lines l join service_package_redemptions r on r.id=l.redemption_id where (l.appointment_id=a.id or l.request_id=a.booking_request_id) and r.state<>'released')
 or exists(select 1 from gift_card_uses where (appointment_id=a.id or request_id=a.booking_request_id) and state<>'released')
 or exists(select 1 from loyalty_checkout_uses where (appointment_id=a.id or request_id=a.booking_request_id) and state<>'released') then
  raise exception 'È già applicato un pacchetto, una gift card o un premio. Rimuovilo prima di offrire il servizio';
 end if;
 select * into o from booking_payment_orders where appointment_id=a.id for update;
 perform 1 from cash_movements m where m.workspace_id=a.workspace_id and (m.appointment_id=a.id or m.id in(o.upfront_movement_id,o.balance_movement_id) or m.id in(select movement_id from appointment_revision_receipts where appointment_id=a.id)) order by m.id for update;
 if exists(select 1 from cash_movements m where m.workspace_id=a.workspace_id and (m.appointment_id=a.id or m.id in(o.upfront_movement_id,o.balance_movement_id) or m.id in(select movement_id from appointment_revision_receipts where appointment_id=a.id)) and (m.payment_method is not null or exists(select 1 from cash_stripe_payments p where p.movement_id=m.id and p.status<>'expired'))) then
  raise exception 'Pagamento già registrato o aperto. Gestiscilo in Cassa prima di applicare l’omaggio';
 end if;
 original=case when p_enabled then a.price else a.complimentary_original_price end;
 payable=case when p_enabled then 0 else original end;
 perform set_config('salonpro.complimentary',a.id::text,true);
 perform set_config('salonpro.service_revision',a.id::text,true);
 perform set_config('salonpro.service_revision_free',case when a.price=0 then a.id::text else '' end,true);
 update appointments set complimentary=p_enabled,complimentary_original_price=original,price=payable,updated_at=clock_timestamp() where id=a.id;
 financial=revise_appointment_payment(a.id,round(payable*100)::bigint);
 if a.booking_request_id is not null then
  update booking_requests set requested_price=(select coalesce(sum(price),0) from appointments where booking_request_id=a.booking_request_id and not no_show) where id=a.booking_request_id;
 end if;
 update appointment_groups g set total_price=(select coalesce(sum(price),0) from appointments where appointment_group_id=g.id) where g.id=a.appointment_group_id;
 insert into appointment_complimentary_history(workspace_id,appointment_id,actor_id,enabled,original_price) values(a.workspace_id,a.id,auth.uid(),p_enabled,original);
 return (select to_jsonb(x) from appointments x where id=a.id);
end $$;
revoke all on function public.set_owner_appointment_complimentary_v1(uuid,timestamptz,boolean) from public,anon;
grant execute on function public.set_owner_appointment_complimentary_v1(uuid,timestamptz,boolean) to authenticated;

create function public.guard_appointment_complimentary() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_OP='INSERT' then
  if new.complimentary or new.complimentary_original_price is not null then raise exception 'Crea il servizio, poi usa il comando Omaggio'; end if;
  return new;
 end if;
 if (new.complimentary is distinct from old.complimentary or new.complimentary_original_price is distinct from old.complimentary_original_price or (old.complimentary and (new.price is distinct from old.price or new.service_name is distinct from old.service_name))) and current_setting('salonpro.complimentary',true) is distinct from old.id::text then
  raise exception 'Usa il comando Omaggio nel dettaglio del servizio';
 end if;
 if new.complimentary then new.cashed_in=false; end if;
 return new;
end $$;
create trigger complimentary_appointment_guard before insert or update on public.appointments for each row execute function public.guard_appointment_complimentary();
create function public.guard_complimentary_cash() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if not new.booking_voided and exists(select 1 from appointments a where a.complimentary and (a.id=new.appointment_id or a.id in(select appointment_id from appointment_revision_receipts where movement_id=new.id))) then raise exception 'Servizio in omaggio: nessun importo da incassare'; end if;
 return new;
end $$;
create trigger complimentary_cash_guard before insert or update on public.cash_movements for each row execute function public.guard_complimentary_cash();
create function public.guard_complimentary_benefit() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME <> 'service_package_booking_lines' and to_jsonb(new)->>'state'='released' then return new; end if;
 perform 1 from appointments a where a.id=new.appointment_id or (new.request_id is not null and a.booking_request_id=new.request_id) order by a.id for update;
 if exists(select 1 from appointments a where a.complimentary and (a.id=new.appointment_id or (new.request_id is not null and a.booking_request_id=new.request_id))) then raise exception 'Servizio in omaggio: pacchetti, gift card e premi non vengono utilizzati'; end if;
 return new;
end $$;
create trigger complimentary_package_guard before insert or update on public.service_package_booking_lines for each row execute function public.guard_complimentary_benefit();
create trigger complimentary_gift_guard before insert or update on public.gift_card_uses for each row execute function public.guard_complimentary_benefit();
create trigger complimentary_loyalty_guard before insert or update on public.loyalty_checkout_uses for each row execute function public.guard_complimentary_benefit();
revoke all on function public.guard_appointment_complimentary(),public.guard_complimentary_cash(),public.guard_complimentary_benefit() from public,anon,authenticated;
