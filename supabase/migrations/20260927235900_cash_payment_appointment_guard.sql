create or replace function public.guard_cash_stripe() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if current_setting('salonpro.stripe_settle',true)='yes' then return new; end if;
 if exists(select 1 from cash_stripe_payments where movement_id=old.id and status<>'expired') then
  if tg_op='DELETE' then raise exception 'Pagamento Stripe associato: il movimento va conservato'; end if;
  if new.amount is distinct from old.amount or new.payment_method is distinct from old.payment_method
    or new.appointment_id is distinct from old.appointment_id
    or new.card_label is distinct from old.card_label or new.workspace_id is distinct from old.workspace_id
  then raise exception 'Pagamento Stripe associato: verifica o annulla il link prima di modificare l’incasso'; end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
