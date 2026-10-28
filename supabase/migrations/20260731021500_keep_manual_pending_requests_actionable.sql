create or replace function public.keep_unworked_manual_booking_request_unread()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_auto_accept_enabled boolean := false;
begin
  if new.workspace_id is null or new.status::text <> 'pending' then
    return new;
  end if;

  select coalesce(workspace.auto_accept_booking_requests, false)
  into v_auto_accept_enabled
  from public.workspaces as workspace
  where workspace.id = new.workspace_id
  limit 1;

  if v_auto_accept_enabled = false
    and coalesce(new.operator_change_status, '') <> 'pending' then
    new.viewed_by_salon := false;
  end if;

  return new;
end;
$$;

drop trigger if exists keep_unworked_manual_booking_request_unread
  on public.booking_requests;
create trigger keep_unworked_manual_booking_request_unread
before insert or update of
  workspace_id,
  status,
  operator_change_status,
  viewed_by_salon
on public.booking_requests
for each row
execute function public.keep_unworked_manual_booking_request_unread();

update public.booking_requests as request
set
  viewed_by_salon = false,
  updated_at = timezone('utc', now())
from public.workspaces as workspace
where workspace.id = request.workspace_id
  and workspace.auto_accept_booking_requests = false
  and request.status::text = 'pending'
  and coalesce(request.operator_change_status, '') <> 'pending'
  and request.viewed_by_salon is distinct from false;
