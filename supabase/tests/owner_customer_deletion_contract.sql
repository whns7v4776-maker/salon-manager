begin;

do $contract$
declare
  v_workspace_id uuid;
  v_owner_user_id uuid;
  v_owner_email text;
  v_customer_id uuid := gen_random_uuid();
  v_recreated_customer_id uuid := gen_random_uuid();
  v_direct_delete_customer_id uuid := gen_random_uuid();
  v_customer_name text := 'Codex Delete Contract ' || gen_random_uuid()::text;
  v_direct_delete_customer_name text :=
    'Codex Direct Delete Contract ' || gen_random_uuid()::text;
  v_result jsonb;
begin
  select workspace.id, owner_user.id, workspace.owner_email::text
  into v_workspace_id, v_owner_user_id, v_owner_email
  from public.workspaces as workspace
  join auth.users as owner_user
    on lower(btrim(owner_user.email)) = lower(btrim(workspace.owner_email::text))
  where workspace.is_internal_tester = true
     or (
       workspace.subscription_status = 'active'
       and workspace.subscription_ends_at is not null
       and workspace.subscription_ends_at > timezone('utc', now())
     )
  order by workspace.created_at
  limit 1;

  if v_workspace_id is null or v_owner_user_id is null then
    raise exception 'owner_customer_delete_test_workspace_missing';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', v_owner_user_id,
      'email', v_owner_email,
      'role', 'authenticated'
    )::text,
    true
  );
  perform set_config(
    'salonpro.skip_client_portal_snapshot_sync',
    'on',
    true
  );

  insert into public.customers (
    id,
    workspace_id,
    full_name,
    phone,
    email,
    source,
    is_active,
    viewed_by_salon
  )
  values (
    v_customer_id,
    v_workspace_id,
    v_customer_name,
    '3999999999',
    'codex-delete-contract@example.invalid',
    'salon',
    true,
    true
  );

  insert into public.customer_login_credentials (customer_id, password_hash)
  values (v_customer_id, 'contract-only-rolled-back');

  v_result := public.delete_owner_customer_v1(
    v_workspace_id,
    array[v_customer_id],
    v_customer_name
  );

  if coalesce((v_result ->> 'ok')::boolean, false) is not true then
    raise exception 'owner_customer_delete_test_not_confirmed';
  end if;
  if exists (
    select 1 from public.customers where id = v_customer_id
  ) then
    raise exception 'owner_customer_delete_test_customer_survived';
  end if;
  if exists (
    select 1
    from public.customer_login_credentials
    where customer_id = v_customer_id
  ) then
    raise exception 'owner_customer_delete_test_credentials_survived';
  end if;
  if not exists (
    select 1
    from public.customer_deletion_tombstones as tombstone
    where tombstone.workspace_id = v_workspace_id
      and tombstone.customer_id = v_customer_id
  ) then
    raise exception 'owner_customer_delete_test_tombstone_missing';
  end if;

  v_result := public.delete_owner_customer_v1(
    v_workspace_id,
    array[v_customer_id],
    v_customer_name
  );
  if coalesce((v_result ->> 'replayed')::boolean, false) is not true then
    raise exception 'owner_customer_delete_test_retry_not_idempotent';
  end if;

  insert into public.customers (
    id,
    workspace_id,
    full_name,
    phone,
    email,
    source,
    is_active,
    viewed_by_salon
  )
  values (
    v_recreated_customer_id,
    v_workspace_id,
    v_customer_name,
    '3999999999',
    'codex-delete-contract@example.invalid',
    'frontend',
    true,
    false
  );

  if exists (
    select 1
    from public.customer_deletion_tombstones as tombstone
    where tombstone.workspace_id = v_workspace_id
      and tombstone.normalized_name = lower(v_customer_name)
  ) then
    raise exception 'owner_customer_delete_test_recreation_still_blocked';
  end if;

  insert into public.customers (
    id,
    workspace_id,
    full_name,
    phone,
    email,
    source,
    is_active,
    viewed_by_salon
  )
  values (
    v_direct_delete_customer_id,
    v_workspace_id,
    v_direct_delete_customer_name,
    '3888888888',
    'codex-direct-delete-contract@example.invalid',
    'salon',
    true,
    true
  );

  delete from public.customers
  where id = v_direct_delete_customer_id
    and workspace_id = v_workspace_id;

  if not exists (
    select 1
    from public.customer_deletion_tombstones as tombstone
    where tombstone.workspace_id = v_workspace_id
      and tombstone.customer_id = v_direct_delete_customer_id
  ) then
    raise exception 'owner_customer_direct_delete_tombstone_missing';
  end if;
end;
$contract$;

rollback;
