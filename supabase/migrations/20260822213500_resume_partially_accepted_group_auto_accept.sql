-- Finish partially accepted logical bookings from the first still-pending
-- member. The group core validates and materializes every remaining phase in
-- one transaction.

create or replace function public.process_due_auto_accept_booking_requests(
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_processed integer := 0;
  v_row record;
begin
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;

  perform set_config('salonpro.auto_accept_processor_running', 'on', true);

  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

  for v_row in
    select candidate.id, candidate.workspace_id
    from public.booking_requests as candidate
    where candidate.origin = 'frontend'
      and candidate.status = 'pending'::public.request_status
      and candidate.created_at <= v_now - interval '15 seconds'
      and public.resolve_customer_online_auto_accept_v1(candidate.workspace_id, candidate.customer_id) is true
      and (
        candidate.appointment_group_id is null
        or candidate.id = (
          select member.id
          from public.booking_requests as member
          where member.workspace_id = candidate.workspace_id
            and member.appointment_group_id = candidate.appointment_group_id
            and member.status = 'pending'::public.request_status
          order by member.appointment_group_order nulls first,
                   member.created_at,
                   member.id
          limit 1
        )
      )
      and (
        candidate.appointment_group_id is null
        or not exists (
          select 1
          from public.booking_requests as member
          where member.workspace_id = candidate.workspace_id
            and member.appointment_group_id = candidate.appointment_group_id
            and (
              member.origin <> 'frontend'
              or member.status not in ('pending', 'accepted')
              or member.created_at > v_now - interval '15 seconds'
              or public.resolve_customer_online_auto_accept_v1(member.workspace_id, member.customer_id) is not true
            )
        )
      )
    order by candidate.created_at, candidate.id
    limit greatest(coalesce(p_limit, 50), 1)
  loop
    begin
      perform public.accept_booking_request_or_group_core_v3(v_row.workspace_id, v_row.id);
      perform public.queue_owner_badge_refresh_after_auto_accept(v_row.workspace_id, v_row.id);
      v_processed := v_processed + 1;
    exception when others then
      if position('booking_request_conflict' in SQLERRM) > 0
        or position('booking_request_not_found' in SQLERRM) > 0 then
        null;
      else
        raise notice 'process_due_auto_accept_booking_requests failed for %: %', v_row.id, SQLERRM;
      end if;
    end;
  end loop;

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception when others then
  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer)
  to authenticated, service_role;

notify pgrst, 'reload schema';
