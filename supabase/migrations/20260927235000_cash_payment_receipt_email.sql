-- Snapshot only the customer associated with this appointment in the same salon.
-- Existing attempts retain their original parameters (Stripe idempotency).
alter table public.cash_stripe_payments add column receipt_email text;
create function public.snapshot_cash_receipt_email() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 select lower(trim(c.email::text)) into new.receipt_email
 from cash_movements m
 join appointments a on a.id=m.appointment_id and a.workspace_id=m.workspace_id
 join customers c on c.id=a.customer_id and c.workspace_id=a.workspace_id
 where m.id=new.movement_id and m.workspace_id=new.workspace_id
 and length(c.email::text)<=254 and c.email::text ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';
 return new;
end; $$;
revoke all on function public.snapshot_cash_receipt_email() from public,anon,authenticated;
create trigger cash_payment_receipt_email before insert on public.cash_stripe_payments
for each row execute function public.snapshot_cash_receipt_email();
