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

  v_next_definition := v_definition;
  v_next_definition := replace(v_next_definition, 'v_normalized_service_name', 'trim(coalesce(p_service_name, ''''))');
  v_next_definition := replace(v_next_definition, 'v_normalized_operator_name', 'nullif(trim(coalesce(p_operator_name, '''')), '''')');
  v_next_definition := replace(v_next_definition, 'v_normalized_customer_name', 'v_customer_full_name');
  v_next_definition := replace(v_next_definition, 'v_normalized_customer_email', 'v_customer_email');
  v_next_definition := replace(v_next_definition, 'v_normalized_customer_phone', 'v_customer_phone');
  v_next_definition := replace(v_next_definition, 'v_required_role is not null', 'nullif(trim(coalesce(p_required_role, '''')), '''') is not null');
  v_next_definition := replace(v_next_definition, 'coalesce(v_required_role, '''')', 'coalesce(nullif(trim(coalesce(p_required_role, '''')), ''''), '''')');
  v_next_definition := replace(v_next_definition, '''Mestiere: '' || v_required_role', '''Mestiere: '' || nullif(trim(coalesce(p_required_role, '''')), '''')');

  if v_next_definition = v_definition then
    raise exception 'create_owner_appointment_ultralight_v2() variable-name hotfix did not change the function';
  end if;

  execute v_next_definition;
end;
$$;

notify pgrst, 'reload schema';
