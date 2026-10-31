-- One checkout settles the whole booking group.
-- Before: collecting one service of a combination paid only that service's movement, so the other
-- services stayed "Da incassare" and the group never completed. Now the owner checkout prepares a
-- movement for every payable service of the same group and settles all of them in one payment.
-- Single appointments keep exactly the previous behaviour (the group set is just the appointment).

create or replace function public.appointment_checkout_pending_ids(p_appointment uuid)
returns uuid[] language sql stable security definer set search_path=public as $$
 with base as (
  select a.* from appointments a where a.id=p_appointment
 ), members as (
  select x.id, x.workspace_id from base a
  join appointments x on x.workspace_id=a.workspace_id
   and (x.id=a.id or (a.appointment_group_id is not null and x.appointment_group_id=a.appointment_group_id
    and not x.no_show and x.appointment_date<=(now() at time zone 'Europe/Rome')::date))
 )
 select coalesce(array_agg(distinct m.id order by m.id),'{}'::uuid[]) from cash_movements m
 join members x on x.workspace_id=m.workspace_id
 left join booking_payment_orders o on o.appointment_id=x.id
 where not m.booking_voided and m.payment_method is null and
 (m.appointment_id=x.id or m.id in(o.upfront_movement_id,o.balance_movement_id) or exists(select 1 from appointment_revision_receipts l where l.movement_id=m.id and l.appointment_id=x.id and l.workspace_id=x.workspace_id));
$$;
revoke all on function public.appointment_checkout_pending_ids(uuid) from public,anon,authenticated;

create or replace function public.prepare_owner_appointment_checkout_v1(p_appointment uuid,p_workspace uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; m jsonb; ids uuid[]; total numeric; member uuid;
begin
 if auth.uid() is null or not workspace_access_allowed() or current_workspace_id() is distinct from p_workspace then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=p_workspace for update;
 if not found or a.no_show or a.appointment_date>(now() at time zone 'Europe/Rome')::date then raise exception 'Servizio non disponibile per la chiusura'; end if;
 m=prepare_cash_appointment(p_workspace,p_appointment);
 -- Every other payable service of the same booking gets its movement too, so one payment covers all.
 if a.appointment_group_id is not null then
  for member in select x.id from appointments x where x.workspace_id=p_workspace and x.appointment_group_id=a.appointment_group_id
   and x.id<>a.id and not x.no_show and not x.cashed_in and coalesce(x.price,0)>0
   and x.appointment_date<=(now() at time zone 'Europe/Rome')::date order by x.id for update
  loop
   begin
    perform prepare_cash_appointment(p_workspace,member);
   exception when others then
    -- A service with nothing left to collect (e.g. already settled by a revision) is skipped, not fatal.
    null;
   end;
  end loop;
 end if;
 ids=appointment_checkout_pending_ids(a.id);
 perform 1 from cash_movements where id=any(ids) order by id for update;
 insert into appointment_checkout_completions(movement_id,workspace_id,appointment_id) select id,p_workspace,a.id from unnest(ids) id on conflict(movement_id) do nothing;
 select sum(amount) into total from cash_movements where id=any(ids);
 return m||jsonb_build_object('importo',coalesce(total,(m->>'importo')::numeric),'digitalAvailable',cardinality(ids)=1,'groupServices',cardinality(ids));
end $$;
revoke all on function public.prepare_owner_appointment_checkout_v1(uuid,uuid) from public,anon;
grant execute on function public.prepare_owner_appointment_checkout_v1(uuid,uuid) to authenticated;
