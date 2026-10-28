-- A customer's manual acceptance override must keep an unworked public request
-- actionable even when the salon's general automatic acceptance is enabled.
create or replace function public.keep_unworked_manual_booking_request_unread()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_auto_accept_enabled boolean := false;
begin
  if new.workspace_id is null
    or new.status::text <> 'pending'
    or coalesce(new.operator_change_status, '') = 'pending'
    or new.payment_hold_state in ('awaiting_payment', 'expired') then
    return new;
  end if;

  if new.origin::text = 'frontend' then
    v_auto_accept_enabled := public.resolve_customer_online_auto_accept_v1(
      new.workspace_id,
      new.customer_id
    );
  else
    -- Customer online overrides do not change salon-created requests.
    select coalesce(workspace.auto_accept_booking_requests, false)
    into v_auto_accept_enabled
    from public.workspaces as workspace
    where workspace.id = new.workspace_id;
  end if;

  if v_auto_accept_enabled is not true then
    new.viewed_by_salon := false;
  end if;

  return new;
end;
$$;

drop trigger if exists keep_unworked_manual_booking_request_unread
  on public.booking_requests;
drop trigger if exists zzzz_keep_unworked_manual_booking_request_unread
  on public.booking_requests;

-- Run after zzz_booking_payment_hold_request: only the payment guard's final,
-- authoritative hold state may suppress a manual request's unread protection.
create trigger zzzz_keep_unworked_manual_booking_request_unread
before insert or update on public.booking_requests
for each row
execute function public.keep_unworked_manual_booking_request_unread();

-- Repair only actionable pending rows; accepted requests and unpaid/expired
-- payment reservations retain their existing read state.
update public.booking_requests as request
set
  viewed_by_salon = false,
  updated_at = timezone('utc', now())
from public.workspaces as workspace
where workspace.id = request.workspace_id
  and request.status::text = 'pending'
  and coalesce(request.operator_change_status, '') <> 'pending'
  and coalesce(request.payment_hold_state, 'paid') = 'paid'
  and request.viewed_by_salon is distinct from false
  and case
    when request.origin::text = 'frontend' then
      public.resolve_customer_online_auto_accept_v1(
        request.workspace_id,
        request.customer_id
      ) is not true
    else coalesce(workspace.auto_accept_booking_requests, false) = false
  end;
