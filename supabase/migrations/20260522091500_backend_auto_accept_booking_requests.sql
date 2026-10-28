create or replace function public.process_due_auto_accept_booking_requests(p_limit integer default 50)
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
  for v_row in
    select
      booking_request.id,
      booking_request.workspace_id
    from public.booking_requests as booking_request
    join public.workspaces as workspace
      on workspace.id = booking_request.workspace_id
    where booking_request.origin = 'frontend'
      and booking_request.status = 'pending'
      and coalesce(workspace.auto_accept_booking_requests, false) = true
      and booking_request.created_at <= v_now - interval '15 seconds'
    order by booking_request.created_at asc, booking_request.id asc
    limit greatest(coalesce(p_limit, 50), 1)
    for update of booking_request skip locked
  loop
    begin
      perform public.update_owner_booking_request_status_core(
        v_row.workspace_id,
        v_row.id,
        'accepted'::public.request_status
      );
      v_processed := v_processed + 1;
    exception
      when others then
        if position('booking_request_conflict' in SQLERRM) > 0 then
          null;
        elsif position('booking_request_not_found' in SQLERRM) > 0 then
          null;
        else
          raise notice 'process_due_auto_accept_booking_requests failed for %: %', v_row.id, SQLERRM;
        end if;
    end;
  end loop;

  return v_processed;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer) to authenticated;
grant execute on function public.process_due_auto_accept_booking_requests(integer) to service_role;

do $$
declare
  v_job_id bigint;
begin
  select jobid
  into v_job_id
  from cron.job
  where jobname = 'process-auto-accept-booking-requests-every-15-seconds'
  limit 1;

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

select cron.schedule(
  'process-auto-accept-booking-requests-every-15-seconds',
  '15 seconds',
  $$
  select public.process_due_auto_accept_booking_requests(50);
  $$
);
