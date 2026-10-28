-- Keep the customer-facing notification precise: this is a direct appointment,
-- not a booking request created by the customer.
do $$
declare
  v_function_definition text;
begin
  select pg_get_functiondef('public.handle_booking_requests_push_queue()'::regprocedure)
  into v_function_definition;

  v_function_definition := replace(
    v_function_definition,
    '''Nuova richiesta aggiunta''',
    '''Appuntamento aggiunto dal salone'''
  );

  execute v_function_definition;
end;
$$;

notify pgrst, 'reload schema';
