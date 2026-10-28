create or replace function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid)
returns public.cash_stripe_payments language plpgsql security definer set search_path=public as $$
declare m cash_movements; a cash_stripe_accounts; p cash_stripe_payments;
begin
 select * into m from cash_movements where id=p_movement and workspace_id=p_workspace for update;
 if not found then raise exception 'Movimento non trovato'; end if;
 select * into p from cash_stripe_payments where movement_id=m.id and status<>'expired';
 if found then return p; end if;
 if m.payment_method is not null or m.amount<0.50 or m.amount>999999.99 then raise exception 'Movimento già incassato o importo non valido'; end if;
 select * into a from cash_stripe_accounts where workspace_id=p_workspace;
 if not found then raise exception 'Collega prima Stripe'; end if;
 insert into cash_stripe_payments(workspace_id,movement_id,account_id,amount_cents)
 values(p_workspace,m.id,a.account_id,round(m.amount*100)) returning * into p;
 return p;
end $$;

create or replace function public.settle_cash_stripe(p_id uuid,p_account text,p_session text,p_amount bigint,p_currency text,p_intent text)
returns void language plpgsql security definer set search_path=public as $$
declare p cash_stripe_payments;
begin
 select * into p from cash_stripe_payments where id=p_id for update;
 if not found or p_session is null or p_intent is null or p.account_id is distinct from p_account or p.amount_cents is distinct from p_amount or p.currency is distinct from p_currency
 or (p.session_id is not null and p.session_id is distinct from p_session) then raise exception 'Pagamento non corrispondente'; end if;
 perform set_config('salonpro.stripe_settle','yes',true);
 update cash_movements set payment_method='card',card_label='Stripe',updated_at=now() where id=p.movement_id;
 update cash_stripe_payments set status='paid',session_id=p_session,payment_intent=p_intent,checkout_url=null where id=p.id;
 perform set_config('salonpro.stripe_settle','no',true);
end $$;
