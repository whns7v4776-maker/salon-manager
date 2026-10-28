do $$
declare
  v_definition text;
  v_next_definition text;
begin
  select pg_get_functiondef(
    'public.create_owner_appointment_ultralight_v2(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text)'::regprocedure
  )
  into v_definition;

  if v_definition is null then
    raise exception 'create_owner_appointment_ultralight_v2() not found';
  end if;

  if position('owner_created_client_push' in v_definition) = 0
    and (
      position('''Appuntamento aggiunto dal salone''' in v_definition) = 0
      or position('''_pushEventType'', ''appointment_created_by_salon''' in v_definition) = 0
    )
  then
    raise exception 'owner-created client push block not found';
  end if;

  v_next_definition := v_definition;
  if position('owner_created_backoffice_origin' in v_next_definition) = 0 then
    v_next_definition := regexp_replace(
      v_next_definition,
      E'(\\)\\s*returning\\s+id\\s+into\\s+v_booking_request_id;\\s*)(perform\\s+public\\.queue_public_customer_push\\()',
      E'\\1\n\n    update public.booking_requests as owner_created_backoffice_origin\n    set origin = ''backoffice''::public.request_origin\n    where owner_created_backoffice_origin.id = v_booking_request_id\n      and owner_created_backoffice_origin.origin is distinct from ''backoffice''::public.request_origin;\n\n    \\2',
      'i'
    );
  end if;

  v_next_definition := regexp_replace(
    v_next_definition,
    E'(perform\\s+public\\.queue_public_customer_push\\(\\s*v_workspace_id,\\s*)''booking_request_status_changed''(?:::public\\.push_event_type)?',
    E'\\1''custom''::public.push_event_type',
    'i'
  );
  v_next_definition := replace(
    v_next_definition,
    '''Nuova richiesta aggiunta''',
    '''Appuntamento aggiunto dal salone'''
  );
  v_next_definition := replace(
    v_next_definition,
    '''type'', ''booking_request_status_changed''',
    '''type'', ''appointment_created_by_salon'''
  );
  v_next_definition := replace(
    v_next_definition,
    '''event_type'', ''booking_request_status_changed''',
    '''event_type'', ''appointment_created_by_salon'''
  );
  v_next_definition := replace(
    v_next_definition,
    '''notificationType'', ''booking_request_status_changed''',
    '''notificationType'', ''appointment_created_by_salon'''
  );
  v_next_definition := replace(
    v_next_definition,
    '''_pushEventType'', ''booking_request_status_changed''',
    '''_pushEventType'', ''appointment_created_by_salon'''
  );
  v_next_definition := replace(
    v_next_definition,
    '''owner_created_client_push''',
    '''appointment_created_by_salon'''
  );

  if position('''Appuntamento aggiunto dal salone''' in v_next_definition) = 0
    or position('''type'', ''appointment_created_by_salon''' in v_next_definition) = 0
    or position('''event_type'', ''appointment_created_by_salon''' in v_next_definition) = 0
    or position('''notificationType'', ''appointment_created_by_salon''' in v_next_definition) = 0
    or position('''_pushEventType'', ''appointment_created_by_salon''' in v_next_definition) = 0
    or position('''custom''::public.push_event_type' in v_next_definition) = 0
    or position('owner_created_backoffice_origin' in v_next_definition) = 0
    or position('set origin = ''backoffice''::public.request_origin' in v_next_definition) = 0
    or position('where owner_created_backoffice_origin.id = v_booking_request_id' in v_next_definition) = 0
    or position('origin is distinct from ''backoffice''::public.request_origin' in v_next_definition) = 0
  then
    raise exception 'owner-created appointment push was not canonicalized';
  end if;

  if v_next_definition <> v_definition then
    execute v_next_definition;
  end if;
end;
$$;

notify pgrst, 'reload schema';
