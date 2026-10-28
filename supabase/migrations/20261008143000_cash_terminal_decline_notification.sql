-- A verified Stripe failure remains unpaid. Queue a durable owner notification
-- even when the app is closed; duplicate webhooks must not send it twice.
create table public.cash_terminal_outcome_events (
 event_id text primary key,
 payment_id uuid not null references public.cash_stripe_payments(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.cash_terminal_outcome_events enable row level security;
revoke all on public.cash_terminal_outcome_events from public,anon,authenticated;
grant all on public.cash_terminal_outcome_events to service_role;

create function public.record_cash_terminal_decline(p_payment uuid,p_intent text,p_event text)
returns void language plpgsql security definer set search_path=public as $$
declare payment cash_stripe_payments; recorded text;
begin
 if p_event is null or p_event='' then raise exception 'Evento mancante'; end if;
 select * into payment from cash_stripe_payments where id=p_payment for update;
 if not found or payment.channel<>'terminal' or payment.status in ('paid','expired') or payment.payment_intent is distinct from p_intent then return; end if;
 insert into cash_terminal_outcome_events(event_id,payment_id) values(p_event,p_payment)
 on conflict do nothing returning event_id into recorded;
 if recorded is null then return; end if;
 insert into public.push_notifications(workspace_id,device_id,event_type,title,body,payload,status)
 select payment.workspace_id,device.id,'custom','Pagamento Tap to Pay rifiutato',
 'Il pagamento non è stato approvato. Apri la Cassa e verifica il tentativo prima di incassare di nuovo.',
 jsonb_build_object('type','cash_terminal_outcome','eventId',p_event,'workspaceId',payment.workspace_id,'_pushTarget','owner','screen','cassa','movementId',payment.movement_id,'paymentId',payment.id,'outcome','declined'),'queued'
 from public.push_devices device
 where device.workspace_id=payment.workspace_id and device.recipient_kind='owner' and device.audience='auth' and device.is_active
 order by device.last_seen_at desc nulls last,device.updated_at desc nulls last,device.created_at desc nulls last,device.id desc limit 1;
end $$;
revoke all on function public.record_cash_terminal_decline(uuid,text,text) from public,anon,authenticated;
grant execute on function public.record_cash_terminal_decline(uuid,text,text) to service_role;
