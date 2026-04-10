do $$
declare
  v_trigger record;
begin
  for v_trigger in
    select trigger_name
    from information_schema.triggers
    where event_object_schema = 'public'
      and event_object_table = 'booking_requests'
  loop
    execute format(
      'drop trigger if exists %I on public.booking_requests',
      v_trigger.trigger_name
    );
  end loop;
end;
$$;

drop trigger if exists set_updated_at_booking_requests on public.booking_requests;
create trigger set_updated_at_booking_requests
before update on public.booking_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists booking_requests_push_queue_trigger on public.booking_requests;
create trigger booking_requests_push_queue_trigger
after insert or update of status on public.booking_requests
for each row execute procedure public.handle_booking_requests_push_queue();

drop trigger if exists sync_client_portal_after_booking_requests_change on public.booking_requests;
create trigger sync_client_portal_after_booking_requests_change
after insert or update or delete on public.booking_requests
for each row execute procedure public.handle_client_portal_public_snapshot_sync();
