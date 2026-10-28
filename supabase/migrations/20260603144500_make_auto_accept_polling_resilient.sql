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
  if coalesce(current_setting('salonpro.auto_accept_processor_running', true), '') = 'on' then
    return 0;
  end if;

  perform set_config('salonpro.auto_accept_processor_running', 'on', true);

  if not pg_try_advisory_xact_lock(hashtext('salonpro:auto_accept_booking_requests')) then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    return 0;
  end if;

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

  perform set_config('salonpro.auto_accept_processor_running', 'off', true);
  return v_processed;
exception
  when others then
    perform set_config('salonpro.auto_accept_processor_running', 'off', true);
    raise;
end;
$$;

grant execute on function public.process_due_auto_accept_booking_requests(integer) to authenticated;
grant execute on function public.process_due_auto_accept_booking_requests(integer) to service_role;

create or replace function public.kick_due_auto_accept_booking_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.process_due_auto_accept_booking_requests(50);
  return null;
exception
  when others then
    raise notice 'kick_due_auto_accept_booking_requests failed: %', SQLERRM;
    return null;
end;
$$;

drop trigger if exists kick_due_auto_accept_booking_requests_after_booking_change on public.booking_requests;
create trigger kick_due_auto_accept_booking_requests_after_booking_change
after insert or update of workspace_id, origin, status, created_at on public.booking_requests
for each statement execute function public.kick_due_auto_accept_booking_requests();

drop trigger if exists kick_due_auto_accept_booking_requests_after_workspace_auto_accept_change on public.workspaces;
create trigger kick_due_auto_accept_booking_requests_after_workspace_auto_accept_change
after update of auto_accept_booking_requests on public.workspaces
for each statement execute function public.kick_due_auto_accept_booking_requests();

do $$
declare
  v_job record;
  v_job_exists boolean := false;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron not available: auto-accept triggers remain active, cron scheduling skipped.';
    return;
  end if;

  for v_job in
    execute
      'select jobid from cron.job where jobname = $1'
      using 'process-auto-accept-booking-requests-catchup-every-minute'
  loop
    execute 'select cron.unschedule($1)' using v_job.jobid;
  end loop;

  begin
    execute
      'select cron.schedule($1, $2, $3)'
      using
        'process-auto-accept-booking-requests-catchup-every-minute',
        '* * * * *',
        'select public.process_due_auto_accept_booking_requests(200);';
  exception
    when others then
      raise notice 'Could not schedule minute auto-accept catch-up cron: %', SQLERRM;
  end;

  execute
    'select exists(select 1 from cron.job where jobname = $1)'
    into v_job_exists
    using 'process-auto-accept-booking-requests-every-5-seconds';

  if not v_job_exists then
    begin
      execute
        'select cron.schedule($1, $2, $3)'
        using
          'process-auto-accept-booking-requests-every-5-seconds',
          '5 seconds',
          'select public.process_due_auto_accept_booking_requests(50);';
    exception
      when others then
        raise notice 'Could not schedule 5-second auto-accept cron: %', SQLERRM;
    end;
  end if;
end
$$;

select public.process_due_auto_accept_booking_requests(200);

notify pgrst, 'reload schema';
