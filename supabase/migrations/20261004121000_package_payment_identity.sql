create or replace function public.settle_service_package_order(p_order uuid,p_session text,p_account text,p_live boolean,p_amount bigint,p_currency text,p_intent text)
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
