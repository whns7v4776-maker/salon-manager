-- End-of-visit manual collection includes every outstanding receipt for this service.
create function public.appointment_checkout_pending_ids(p_appointment uuid)
returns uuid[] language sql stable security definer set search_path=public as $$
 select coalesce(array_agg(m.id order by m.id),'{}'::uuid[]) from cash_movements m
 join appointments a on a.id=p_appointment and a.workspace_id=m.workspace_id
 left join booking_payment_orders o on o.appointment_id=a.id
 where not m.booking_voided and m.payment_method is null and
 (m.appointment_id=a.id or m.id in(o.upfront_movement_id,o.balance_movement_id) or exists(select 1 from appointment_revision_receipts l where l.movement_id=m.id and l.appointment_id=a.id and l.workspace_id=a.workspace_id));
$$;
create or replace function public.prepare_owner_appointment_checkout_v1(p_appointment uuid,p_workspace uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; m jsonb; ids uuid[]; total numeric;
begin
 if auth.uid() is null or not workspace_access_allowed() or current_workspace_id() is distinct from p_workspace then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=p_workspace for update;
 if not found or a.no_show or a.appointment_date>(now() at time zone 'Europe/Rome')::date then raise exception 'Servizio non disponibile per la chiusura'; end if;
 m=prepare_cash_appointment(p_workspace,p_appointment);
 ids=appointment_checkout_pending_ids(a.id);
 perform 1 from cash_movements where id=any(ids) order by id for update;
 insert into appointment_checkout_completions(movement_id,workspace_id,appointment_id) select id,p_workspace,a.id from unnest(ids) id on conflict(movement_id) do nothing;
 select sum(amount) into total from cash_movements where id=any(ids);
 return m||jsonb_build_object('importo',coalesce(total,(m->>'importo')::numeric),'digitalAvailable',cardinality(ids)=1);
end $$;
create or replace function public.collect_owner_appointment_checkout_v1(p_movement uuid,p_workspace uuid,p_method text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m cash_movements; intent appointment_checkout_completions; ids uuid[];
begin
 if auth.uid() is null or not workspace_access_allowed() or current_workspace_id() is distinct from p_workspace or p_method not in('cash','card','bank_transfer') or p_method is null then raise exception 'Accesso non consentito'; end if;
 select * into intent from appointment_checkout_completions where movement_id=p_movement and workspace_id=p_workspace;
 if not found then raise exception 'Incasso non disponibile'; end if;
 perform 1 from appointments where id=intent.appointment_id and workspace_id=p_workspace for update;
 ids=appointment_checkout_pending_ids(intent.appointment_id);
 perform 1 from cash_movements where id=any(ids) order by id for update;
 update cash_movements set payment_method=p_method::public.payment_method,card_label=case when p_method='card' then 'POS esterno' else null end,updated_at=clock_timestamp() where workspace_id=p_workspace and id=any(ids) and payment_method is null;
 perform finish_appointment_checkout_v1(p_movement);
 return (select to_jsonb(x) from cash_movements x where id=p_movement and workspace_id=p_workspace);
end $$;
revoke all on function public.appointment_checkout_pending_ids(uuid) from public,anon,authenticated;
create or replace function public.finish_appointment_checkout_v1(p_movement uuid)
returns void language plpgsql security definer set search_path=public as $$
declare intent appointment_checkout_completions; a appointments; paid boolean; revision_state jsonb; o booking_payment_orders;
begin
 select * into intent from appointment_checkout_completions where movement_id=p_movement;
 if not found then return; end if;
 select * into a from appointments where id=intent.appointment_id and workspace_id=intent.workspace_id for update;
 if not found or a.no_show or a.appointment_date>(now() at time zone 'Europe/Rome')::date then return; end if;
 select * into o from booking_payment_orders where appointment_id=a.id and workspace_id=a.workspace_id;
 if found then paid=booking_payment_received_cents(o.request_id)>=o.total_cents;
 else paid=exists(select 1 from cash_movements where id=p_movement and workspace_id=a.workspace_id and payment_method is not null and amount>=a.price and not booking_voided); end if;
 revision_state=appointment_revision_payment_state(a.id);
 if revision_state is not null then paid=(revision_state->>'balanceCents')::bigint=0; end if;
 if not paid then return; end if;
 -- Group completion needs each payable component fully settled. Never complete on a partial balance.
 if a.appointment_group_id is not null and exists(select 1 from appointments x where x.appointment_group_id=a.appointment_group_id and x.workspace_id=a.workspace_id and (x.no_show or x.appointment_date>(now() at time zone 'Europe/Rome')::date or (x.price>0 and not x.cashed_in and x.id<>a.id))) then return; end if;
 update appointments set completed=true,updated_at=clock_timestamp() where workspace_id=a.workspace_id and (id=a.id or (a.appointment_group_id is not null and appointment_group_id=a.appointment_group_id)) and not completed;
end $$;
