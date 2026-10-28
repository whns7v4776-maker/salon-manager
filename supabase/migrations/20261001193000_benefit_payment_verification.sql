-- Reject missing payment fields as well as mismatched values.
create or replace function public.activate_paid_service_package_order(p_order uuid,p_session text,p_paid_cents bigint,p_currency text)
returns uuid language plpgsql security definer set search_path=public as $$
declare o service_package_orders; m uuid; label text; start_date date=(now() at time zone 'Europe/Rome')::date;
begin
 select * into o from service_package_orders where id=p_order for update;
 if not found then raise exception 'Ordine non trovato'; end if;
 if o.provider_session_id is null or o.provider_session_id is distinct from p_session or o.amount_cents is distinct from p_paid_cents or o.currency is distinct from p_currency then raise exception 'Pagamento non corrispondente all’ordine'; end if;
 if o.package_id is not null then return o.package_id; end if;
 if o.status not in ('pending','paid') then raise exception 'Ordine non attivabile'; end if;
 if (o.terms->>'price_cents')::bigint<>o.amount_cents or (o.terms->>'uses')::integer not between 1 and 1000
  or (o.terms->>'months')::integer not between 1 and 60 or jsonb_array_length(o.terms->'entitlements')<1 then raise exception 'Condizioni ordine incomplete'; end if;
 select full_name into label from customers where id=o.customer_id and workspace_id=o.workspace_id;
 if not found then raise exception 'Intestatario ordine non valido'; end if;
 insert into cash_movements(workspace_id,description,amount,payment_method,card_label)
 values(o.workspace_id,'Pacchetto '||(o.terms->>'name')||' · '||label,o.amount_cents/100.0,'card','Acquisto pacchetto online') returning id into m;
 insert into customer_service_packages(id,workspace_id,customer_id,catalog_id,name,entitlements,uses,starts_on,expires_on,price_cents,product_discount,purchase_movement_id,source)
 values(o.id,o.workspace_id,o.customer_id,o.catalog_id,o.terms->>'name',o.terms->'entitlements',(o.terms->>'uses')::integer,start_date,
 (start_date+make_interval(months=>(o.terms->>'months')::integer))::date-1,o.amount_cents,coalesce((o.terms->>'product_discount')::integer,0),m,'online');
 update service_package_orders set status='paid',package_id=o.id where id=o.id;
 return o.id;
end $$;
