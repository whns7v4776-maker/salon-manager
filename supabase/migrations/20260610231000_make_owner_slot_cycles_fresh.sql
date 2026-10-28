do $$
declare
  v_create_definition text;
  v_next_create_definition text;
  v_cancel_definition text;
  v_next_cancel_definition text;
begin
  select pg_get_functiondef(
    'public.create_owner_appointment_ultralight_v2(text,text,citext,text,text,text,boolean,boolean,text,numeric,integer,date,time,text,text,text,text)'::regprocedure
  )
  into v_create_definition;

  if v_create_definition is null then
    raise exception 'create_owner_appointment_ultralight_v2() not found';
  end if;

  v_next_create_definition := v_create_definition;

  if position('owner_created_client_push' in v_next_create_definition) = 0 then
    v_next_create_definition := regexp_replace(
      v_next_create_definition,
      E'\\)\\s*returning\\s+id\\s+into\\s+v_booking_request_id;\\s*end\\s+if;',
      E'    ) returning id into v_booking_request_id;\n\n    perform public.queue_public_customer_push(\n      v_workspace_id,\n      ''booking_request_status_changed'',\n      ''Nuova richiesta aggiunta'',\n      concat_ws(\n        ''. '',\n        nullif(''Servizio: '' || v_normalized_service_name, ''Servizio: ''),\n        case when v_required_role is not null then ''Mestiere: '' || v_required_role else null end,\n        case when v_normalized_operator_name is not null then ''Operatore: '' || v_normalized_operator_name else null end,\n        case\n          when p_appointment_date is not null and p_appointment_time is not null then\n            ''Data: '' || to_char(p_appointment_date, ''DD/MM/YYYY'') || '' alle '' || to_char(p_appointment_time, ''HH24:MI'')\n          else null\n        end\n      ) || ''.'',\n      jsonb_build_object(\n        ''type'', ''booking_request_status_changed'',\n        ''event_type'', ''booking_request_status_changed'',\n        ''notificationType'', ''booking_request_status_changed'',\n        ''_pushAudience'', ''public'',\n        ''_pushTarget'', ''client'',\n        ''_pushEventType'', ''booking_request_status_changed'',\n        ''_dedupeKey'', concat_ws(''|'', v_workspace_id::text, ''owner_created_client_push'', v_booking_request_id::text, ''accepted'', ''''),\n        ''bookingRequestId'', v_booking_request_id,\n        ''status'', ''Accettata'',\n        ''statusCode'', ''accepted'',\n        ''cancellationSource'', '''',\n        ''appointmentDate'', p_appointment_date,\n        ''appointmentTime'', p_appointment_time,\n        ''customerName'', v_normalized_customer_name,\n        ''serviceName'', v_normalized_service_name,\n        ''roleName'', coalesce(v_required_role, ''''),\n        ''operatorName'', coalesce(v_normalized_operator_name, ''''),\n        ''customerEmail'', coalesce(v_normalized_customer_email::text, ''''),\n        ''customerPhone'', coalesce(v_normalized_customer_phone, ''''),\n        ''source'', ''backoffice''\n      ),\n      v_normalized_customer_email,\n      v_normalized_customer_phone\n    );\n  end if;'
    );
  end if;

  if position('owner_created_client_push' in v_create_definition) = 0
    and v_next_create_definition = v_create_definition then
    raise exception 'create_owner_appointment_ultralight_v2() was not updated';
  end if;

  execute v_next_create_definition;

  select pg_get_functiondef(
    'public.cancel_owner_appointment(uuid,date,time,text,text,citext,text,citext,text)'::regprocedure
  )
  into v_cancel_definition;

  if v_cancel_definition is null then
    raise exception 'cancel_owner_appointment() not found';
  end if;

  v_next_cancel_definition := replace(
    v_cancel_definition,
    E'    where request.workspace_id = v_workspace_id\n      and request.appointment_date = v_appointment.appointment_date',
    E'    where request.workspace_id = v_workspace_id\n      and request.status in (''accepted''::public.request_status, ''pending''::public.request_status)\n      and request.appointment_date = v_appointment.appointment_date'
  );

  if v_next_cancel_definition = v_cancel_definition then
    raise exception 'cancel_owner_appointment() active-request filter was not applied';
  end if;

  execute v_next_cancel_definition;
end;
$$;

notify pgrst, 'reload schema';
