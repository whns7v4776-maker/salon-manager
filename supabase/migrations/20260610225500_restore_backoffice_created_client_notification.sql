do $$
declare
  v_original_definition text;
  v_next_definition text;
begin
  select pg_get_functiondef('public.handle_booking_requests_push_queue()'::regprocedure)
  into v_original_definition;

  if v_original_definition is null then
    raise exception 'handle_booking_requests_push_queue() not found';
  end if;

  v_next_definition := regexp_replace(
    v_original_definition,
    E'\\s+and not \\(\\s*tg_op = ''INSERT''\\s+and new\\.status = ''accepted''::public\\.request_status\\s+and new\\.origin = ''backoffice''\\s+\\)',
    '',
    'g'
  );

  if v_next_definition = v_original_definition then
    raise exception 'backoffice accepted insert exclusion was not found in handle_booking_requests_push_queue()';
  end if;

  execute v_next_definition;
end;
$$;

notify pgrst, 'reload schema';
