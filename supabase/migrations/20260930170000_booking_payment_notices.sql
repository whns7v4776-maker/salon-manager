-- Persistent customer payment reminders derive from the ledger, never read badges.
create function public.booking_payment_notice_is_due(p_request uuid)
returns boolean language sql stable security definer set search_path=public as $$
 select exists (
  select 1 from booking_payment_orders o
  join booking_requests r on r.id=o.request_id and r.workspace_id=o.workspace_id
  join appointments a on a.id=o.appointment_id and a.workspace_id=o.workspace_id
  join cash_movements m on m.id=o.upfront_movement_id and m.workspace_id=o.workspace_id
  where o.request_id=p_request and r.status::text='accepted' and not a.no_show
    and m.payment_method is null and not m.booking_voided
 );
$$;
revoke all on function public.booking_payment_notice_is_due(uuid) from public,anon,authenticated;
grant execute on function public.booking_payment_notice_is_due(uuid) to service_role;

create function public.customer_booking_payment_notices(p_workspace uuid,p_customer uuid)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'requestId',o.request_id,'serviceName',a.service_name,
  'dueCents',o.due_cents,'totalCents',o.total_cents,'mode',t.mode,'percent',t.percent
 ) order by o.created_at,o.request_id),'[]'::jsonb)
 from booking_payment_orders o
 join booking_requests r on r.id=o.request_id and r.workspace_id=o.workspace_id
 join booking_payment_terms t on t.request_id=o.request_id and t.workspace_id=o.workspace_id
 join appointments a on a.id=o.appointment_id and a.workspace_id=o.workspace_id
 where o.workspace_id=p_workspace and r.customer_id=p_customer
   and public.booking_payment_notice_is_due(o.request_id);
$$;
revoke all on function public.customer_booking_payment_notices(uuid,uuid) from public,anon,authenticated;
grant execute on function public.customer_booking_payment_notices(uuid,uuid) to service_role;

-- One insert per booking order: retries never send a second payment request.
create function public.queue_booking_payment_notice() returns trigger
language plpgsql security definer set search_path=public as $$
declare r booking_requests; t booking_payment_terms; label text;
begin
 if not public.booking_payment_notice_is_due(new.request_id) then return null; end if;
 select * into r from booking_requests where id=new.request_id and workspace_id=new.workspace_id;
 select * into t from booking_payment_terms where request_id=new.request_id;
 label := case when t.mode='deposit' then 'Acconto richiesto' else 'Pagamento richiesto' end;
 perform public.queue_public_customer_push(new.workspace_id,'custom',label,
  'Il salone ha confermato la prenotazione. ' ||
  case when t.mode='deposit' then 'Acconto' else 'Importo' end || ' da versare: ' ||
  replace(to_char(new.due_cents/100.0,'FM999999990.00'),'.',',') || ' €. Apri SalonPro per pagare.',
  jsonb_build_object('type','booking_payment_due','notificationType','booking_payment_due',
   'bookingRequestId',new.request_id,'requestId',new.request_id,'_pushTarget','client',
   '_dedupeKey','booking-payment-due:'||new.request_id,'screen','cliente','tab','notifications'),
  r.customer_email::citext,r.customer_phone);
 return null;
end $$;
revoke all on function public.queue_booking_payment_notice() from public,anon,authenticated;
create constraint trigger booking_payment_notice after insert on public.booking_payment_orders
 deferrable initially deferred for each row execute function public.queue_booking_payment_notice();
