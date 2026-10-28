-- Explicit end-of-visit checkout intent. Deposits and ordinary payment links are unchanged.
create table if not exists public.appointment_checkout_completions (
 movement_id uuid primary key references public.cash_movements(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id), appointment_id uuid not null references public.appointments(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.appointment_checkout_completions enable row level security;
revoke all on public.appointment_checkout_completions from public,anon,authenticated;
create or replace function public.prepare_owner_appointment_checkout_v1(p_appointment uuid,p_workspace uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; m jsonb;
begin
 if auth.uid() is null or not workspace_access_allowed() or current_workspace_id() is distinct from p_workspace then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=p_workspace for update;
 if not found or a.no_show or a.appointment_date>(now() at time zone 'Europe/Rome')::date then raise exception 'Servizio non disponibile per la chiusura'; end if;
 m=prepare_cash_appointment(p_workspace,p_appointment);
 insert into appointment_checkout_completions(movement_id,workspace_id,appointment_id) values((m->>'id')::uuid,p_workspace,p_appointment) on conflict(movement_id) do nothing;
 return m;
end $$;
create or replace function public.finish_appointment_checkout_v1(p_movement uuid)
returns void language plpgsql security definer set search_path=public as $$
declare intent appointment_checkout_completions; a appointments; paid boolean; o booking_payment_orders;
begin
 select * into intent from appointment_checkout_completions where movement_id=p_movement;
 if not found then return; end if;
 select * into a from appointments where id=intent.appointment_id and workspace_id=intent.workspace_id for update;
 if not found or a.no_show or a.appointment_date>(now() at time zone 'Europe/Rome')::date then return; end if;
 select * into o from booking_payment_orders where appointment_id=a.id and workspace_id=a.workspace_id;
 if found then paid=booking_payment_received_cents(o.request_id)>=o.total_cents;
 else paid=exists(select 1 from cash_movements where id=p_movement and workspace_id=a.workspace_id and payment_method is not null and amount>=a.price and not booking_voided); end if;
 if not paid then return; end if;
 -- Group completion needs each payable component fully settled. Never complete on a partial balance.
 if a.appointment_group_id is not null and exists(select 1 from appointments x where x.appointment_group_id=a.appointment_group_id and x.workspace_id=a.workspace_id and (x.no_show or x.appointment_date>(now() at time zone 'Europe/Rome')::date or (x.price>0 and not x.cashed_in and x.id<>a.id))) then return; end if;
 update appointments set completed=true,updated_at=clock_timestamp() where workspace_id=a.workspace_id and (id=a.id or (a.appointment_group_id is not null and appointment_group_id=a.appointment_group_id)) and not completed;
end $$;
create or replace function public.sync_explicit_appointment_checkout() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if TG_TABLE_NAME='cash_movements' then perform finish_appointment_checkout_v1(new.id);
 elsif new.status='paid' then perform finish_appointment_checkout_v1(new.movement_id); end if;
 return new;
end $$;
create trigger zz_explicit_checkout_cash after update of payment_method on public.cash_movements for each row execute function public.sync_explicit_appointment_checkout();
create trigger zz_explicit_checkout_stripe after update of status on public.cash_stripe_payments for each row execute function public.sync_explicit_appointment_checkout();
create or replace function public.collect_owner_appointment_checkout_v1(p_movement uuid,p_workspace uuid,p_method text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m cash_movements;
begin
 if auth.uid() is null or not workspace_access_allowed() or current_workspace_id() is distinct from p_workspace or p_method not in('cash','card','bank_transfer') or p_method is null then raise exception 'Accesso non consentito'; end if;
 select * into m from cash_movements where id=p_movement and workspace_id=p_workspace for update;
 if not found or not exists(select 1 from appointment_checkout_completions where movement_id=m.id and workspace_id=p_workspace) then raise exception 'Incasso non disponibile'; end if;
 if m.payment_method is not null then return to_jsonb(m); end if;
 update cash_movements set payment_method=p_method::public.payment_method,card_label=case when p_method='card' then 'POS esterno' else null end,updated_at=clock_timestamp() where id=m.id;
 perform finish_appointment_checkout_v1(m.id);
 return (select to_jsonb(x) from cash_movements x where id=m.id);
end $$;
revoke all on function public.prepare_owner_appointment_checkout_v1(uuid,uuid),public.collect_owner_appointment_checkout_v1(uuid,uuid,text),public.finish_appointment_checkout_v1(uuid),public.sync_explicit_appointment_checkout() from public,anon,authenticated;
grant execute on function public.prepare_owner_appointment_checkout_v1(uuid,uuid),public.collect_owner_appointment_checkout_v1(uuid,uuid,text) to authenticated;
