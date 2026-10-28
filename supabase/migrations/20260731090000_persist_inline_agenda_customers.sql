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

  v_next_definition := replace(
    v_definition,
    'if v_customer_id is null and p_create_customer_record then',
    'if v_customer_id is null and (p_create_customer_record or v_customer_phone is not null or v_customer_email is not null) then'
  );

  if v_next_definition = v_definition then
    raise exception 'create_owner_appointment_ultralight_v2() customer persistence guard was not applied';
  end if;

  execute v_next_definition;
end;
$$;

do $$
declare
  v_workspace_id uuid;
  v_appointment_id uuid := '5e6d9bbb-79b6-4430-a570-f703448fde0d';
  v_customer_id uuid;
  v_customer_name text;
  v_snapshot_customer jsonb;
  v_temporary_customer_id text;
begin
  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = 'amarea-lcom'
  limit 1;

  if v_workspace_id is null then
    raise exception 'amarea workspace not found';
  end if;

  select appointment.customer_name
  into v_customer_name
  from public.appointments as appointment
  where appointment.id = v_appointment_id
    and appointment.workspace_id = v_workspace_id
  limit 1;

  if nullif(trim(coalesce(v_customer_name, '')), '') is null then
    raise exception 'target appointment not found';
  end if;

  select customer_item
  into v_snapshot_customer
  from public.owner_app_snapshots as snapshot
  cross join lateral jsonb_array_elements(
    coalesce(snapshot.payload -> 'clienti', '[]'::jsonb)
  ) as customer_item
  where snapshot.workspace_id = v_workspace_id
    and lower(trim(coalesce(customer_item ->> 'nome', ''))) =
      lower(trim(v_customer_name))
  order by
    case when coalesce(customer_item ->> 'id', '') like 'cliente-%' then 0 else 1 end
  limit 1;

  if v_snapshot_customer is null then
    raise exception 'target customer snapshot not found';
  end if;

  v_temporary_customer_id := nullif(trim(coalesce(v_snapshot_customer ->> 'id', '')), '');

  select customer.id
  into v_customer_id
  from public.customers as customer
  where customer.workspace_id = v_workspace_id
    and (
      (
        nullif(regexp_replace(coalesce(v_snapshot_customer ->> 'telefono', ''), '\D+', '', 'g'), '') is not null
        and regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g') =
          regexp_replace(coalesce(v_snapshot_customer ->> 'telefono', ''), '\D+', '', 'g')
      )
      or (
        nullif(lower(trim(coalesce(v_snapshot_customer ->> 'email', ''))), '') is not null
        and lower(trim(coalesce(customer.email::text, ''))) =
          lower(trim(coalesce(v_snapshot_customer ->> 'email', '')))
      )
      or lower(trim(coalesce(customer.full_name, ''))) = lower(trim(v_customer_name))
    )
  order by customer.updated_at desc, customer.created_at desc
  limit 1;

  if v_customer_id is null then
    insert into public.customers (
      workspace_id,
      full_name,
      phone,
      email,
      instagram,
      note,
      source,
      is_active,
      viewed_by_salon
    )
    values (
      v_workspace_id,
      trim(v_customer_name),
      nullif(regexp_replace(coalesce(v_snapshot_customer ->> 'telefono', ''), '\D+', '', 'g'), ''),
      nullif(lower(trim(coalesce(v_snapshot_customer ->> 'email', ''))), '')::citext,
      nullif(trim(coalesce(v_snapshot_customer ->> 'instagram', '')), ''),
      coalesce(v_snapshot_customer ->> 'nota', ''),
      'salon',
      true,
      true
    )
    returning id into v_customer_id;
  end if;

  update public.appointments as appointment
  set customer_id = v_customer_id
  where appointment.id = v_appointment_id
    and appointment.workspace_id = v_workspace_id
    and appointment.customer_id is null;

  if v_temporary_customer_id is not null then
    update public.owner_app_snapshots as snapshot
    set payload = jsonb_set(
      snapshot.payload,
      '{clienti}',
      (
        select coalesce(
          jsonb_agg(
            case
              when coalesce(customer_item ->> 'id', '') = v_temporary_customer_id then
                customer_item || jsonb_build_object('id', v_customer_id::text)
              else customer_item
            end
            order by ordinal_position
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(
          coalesce(snapshot.payload -> 'clienti', '[]'::jsonb)
        ) with ordinality as listed_customer(customer_item, ordinal_position)
      ),
      true
    )
    where snapshot.workspace_id = v_workspace_id;
  end if;
end;
$$;

notify pgrst, 'reload schema';
