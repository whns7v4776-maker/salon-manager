create or replace function public.prepare_cash_appointment(p_workspace uuid,p_appointment uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; m cash_movements; n integer;
begin
 select * into a from appointments where id=p_appointment and workspace_id=p_workspace for update;
 if not found or a.no_show then raise exception 'Appuntamento non disponibile'; end if;
 select count(*) into n from cash_movements where appointment_id=a.id and workspace_id=p_workspace;
 if n>1 then raise exception 'Sono presenti più movimenti: verifica la Cassa'; end if;
 select * into m from cash_movements where appointment_id=a.id and workspace_id=p_workspace;
 if found then
  if m.payment_method is not null then raise exception 'Pagamento già registrato'; end if;
 else
  if a.cashed_in then raise exception 'Appuntamento già segnato incassato: verifica la Cassa'; end if;
  if a.price is null or a.price<=0 then raise exception 'Importo non valido'; end if;
  insert into cash_movements(workspace_id,appointment_id,description,amount)
  values(p_workspace,a.id,coalesce(a.service_name,'Servizio')||' · '||coalesce(a.customer_name,'Cliente'),a.price) returning * into m;
 end if;
 return jsonb_build_object('id',m.id,'importo',m.amount);
end; $$;
revoke all on function public.prepare_cash_appointment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.prepare_cash_appointment(uuid,uuid) to service_role;
create or replace function public.mark_stripe_appointment_paid() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='paid' and old.status is distinct from 'paid' then
  update appointments a set cashed_in=true,updated_at=now()
  from cash_movements m where m.id=new.movement_id and m.workspace_id=new.workspace_id
  and a.id=m.appointment_id and a.workspace_id=new.workspace_id;
 end if;
 return new;
end; $$;
revoke all on function public.mark_stripe_appointment_paid() from public,anon,authenticated;
create trigger stripe_appointment_paid after update of status on public.cash_stripe_payments for each row execute function public.mark_stripe_appointment_paid();
