-- Preserve sandbox accounts and payment history when enabling live Connect.
alter table public.cash_stripe_accounts drop constraint cash_stripe_accounts_pkey;
alter table public.cash_stripe_accounts add primary key(workspace_id,livemode);
create or replace function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid,p_live boolean)
returns public.cash_stripe_payments language plpgsql security definer set search_path=public as $$
declare m cash_movements; a cash_stripe_accounts; p cash_stripe_payments;
begin
 select * into m from cash_movements where id=p_movement and workspace_id=p_workspace for update;
 if not found then raise exception 'Movimento non trovato'; end if;
 select * into p from cash_stripe_payments where movement_id=m.id and status<>'expired';
 if found then
  if not exists(select 1 from cash_stripe_accounts where workspace_id=p_workspace and livemode=p_live and account_id=p.account_id) then raise exception 'Movimento di un altro collegamento Stripe'; end if;
  return p;
 end if;
 if m.payment_method is not null or m.amount<0.50 or m.amount>999999.99 then raise exception 'Movimento già incassato o importo non valido'; end if;
 select * into a from cash_stripe_accounts where workspace_id=p_workspace and livemode=p_live;
 if not found then raise exception 'Collega prima Stripe'; end if;
 insert into cash_stripe_payments(workspace_id,movement_id,account_id,amount_cents)
 values(p_workspace,m.id,a.account_id,round(m.amount*100)) returning * into p;
 return p;
end $$;


revoke all on function public.reserve_cash_stripe(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_cash_stripe(uuid,uuid,boolean) to service_role;
-- Legacy callers remain restricted to sandbox accounts.
create or replace function public.reserve_cash_stripe(p_workspace uuid,p_movement uuid)
returns public.cash_stripe_payments language sql security definer set search_path=public as $$
 select public.reserve_cash_stripe(p_workspace,p_movement,false);
$$;
