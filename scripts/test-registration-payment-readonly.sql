-- Run after the corrective migration inside BEGIN ... ROLLBACK only. Fixtures
-- and their payment sessions are synthetic and never committed. The switch
-- below exercises the actual PostgreSQL read-only transaction used by
-- PostgREST for STABLE RPCs; calling STABLE inside a writable test is not enough.
create temporary table registration_payment_readonly_results(name text primary key);
create temporary table registration_payment_readonly_identities(
  salon_code text, workspace_id uuid, customer_id uuid, email text, phone text,
  registration_status text, approval_required boolean, token text
);
create or replace function pg_temp.readonly_registration_assert(p_ok boolean,p_name text)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED: %',p_name; end if;
  insert into registration_payment_readonly_results values(p_name);
end $$;
create or replace function pg_temp.readonly_registration_expect_error(p_sql text,p_error text,p_name text)
returns void language plpgsql as $$
declare v_message text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message not like '%' || p_error || '%' then
      raise exception 'TEST FAILED %: expected %, received %',p_name,p_error,v_message;
    end if;
    insert into registration_payment_readonly_results values(p_name);
    return;
  end;
  raise exception 'TEST FAILED %: expected %, but call succeeded',p_name,p_error;
end $$;

do $fixtures$
declare
  v_workspace uuid; v_customer uuid; v_code text; v_email text;
  v_token text; v_pending boolean; v_required boolean; v_owner_email text;
begin
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.role','',true);
  foreach v_required in array array[false,true] loop
    v_workspace:=gen_random_uuid(); v_code:='readonly-registration-' || gen_random_uuid()::text;
    v_owner_email:='readonly-owner-' || gen_random_uuid()::text || '@example.test';
    insert into public.workspaces(id,salon_name,slug,owner_email,is_internal_tester,subscription_status)
      values(v_workspace,'Registration Readonly SQL Fixture',v_code,v_owner_email,true,'active');
    insert into public.client_portals(workspace_id,owner_email,salon_code,salon_name,availability_settings)
      values(v_workspace,v_owner_email,v_code,'Registration Readonly SQL Fixture','{}'::jsonb);
    -- Only the dedicated setting write marker may update this property.
    perform set_config('salonpro.updating_customer_registration_approval','true',true);
    update public.client_portals set availability_settings=jsonb_build_object(
      'customerRegistrationApprovalRequired',v_required,
      'customerRegistrationApprovalUpdatedAt',clock_timestamp()) where workspace_id=v_workspace;
    perform set_config('salonpro.updating_customer_registration_approval','',true);
    foreach v_pending in array array[false,true] loop
      v_customer:=gen_random_uuid(); v_email:='readonly-customer-' || v_customer::text || '@example.test';
      v_token:=encode(extensions.gen_random_bytes(32),'hex');
      insert into public.customers(id,workspace_id,full_name,email,phone,source,registration_status)
        values(v_customer,v_workspace,'Readonly Fixture Customer',v_email,'3336000000','salon',
          case when v_pending then 'pending' else 'approved' end);
      insert into public.customer_login_credentials(customer_id,password_hash)
        values(v_customer,'synthetic-readonly-test-hash');
      insert into public.customer_payment_sessions(token_hash,customer_id,credential_hash,expires_at)
        values(encode(extensions.digest(v_token,'sha256'),'hex'),v_customer,
          'synthetic-readonly-test-hash',now()+interval '1 hour');
      insert into registration_payment_readonly_identities values(
        v_code,v_workspace,v_customer,v_email,'3336000000',
        case when v_pending then 'pending' else 'approved' end,v_required,v_token);
    end loop;
  end loop;
end $fixtures$;

set transaction read only;
do $readonly_tests$
declare v record; v_context jsonb; v_suffix text;
begin
  perform pg_temp.readonly_registration_assert(current_setting('transaction_read_only')='on',
    'The regression suite runs in an actual read-only transaction');
  perform pg_temp.readonly_registration_assert((select provolatile='s' from pg_proc
    where oid='public.assert_customer_registration_approved_v1(uuid,text,text)'::regprocedure),
    'Read admission helper is STABLE');
  perform pg_temp.readonly_registration_assert((select provolatile='v' from pg_proc
    where oid='public.assert_customer_registration_approved_for_write_v1(uuid,text,text)'::regprocedure),
    'Mutation admission helper retains locking volatility');
  for v in select * from registration_payment_readonly_identities loop
    v_suffix:=case when v.approval_required then 'moderated' else 'automatic' end;
    if v.registration_status='approved' then
      perform public.assert_customer_registration_approved_v1(v.workspace_id,v.email,v.phone);
      perform pg_temp.readonly_registration_assert(true,'Approved read gate succeeds: ' || v_suffix);
      v_context:=public.booking_payment_customer_context(v.salon_code,v.email,v.phone);
      perform pg_temp.readonly_registration_assert(v_context->>'customerId'=v.customer_id::text
        and v_context->>'workspaceId'=v.workspace_id::text and v_context->'policy'->>'mode'='salon',
        'Payment context returns the correct customer and policy: ' || v_suffix);
      perform pg_temp.readonly_registration_assert(
        public.verified_booking_payment_context(v.salon_code,v.email,v.phone,v.token)=v_context,
        'Valid payment token is verified in read-only transaction: ' || v_suffix);
      perform pg_temp.readonly_registration_assert(
        public.verified_booking_payment_context(v.salon_code,v.email,v.phone,repeat('0',64)) is null,
        'Invalid payment token remains denied: ' || v_suffix);
      perform pg_temp.readonly_registration_assert(
        public.verified_booking_payment_context(v.salon_code,v.email,v.phone,'invalid') is null,
        'Malformed payment token remains denied: ' || v_suffix);
      perform pg_temp.readonly_registration_assert(
        public.customer_booking_payment_notices(v.workspace_id,v.customer_id)='[]'::jsonb,
        'Payment summary still reads normally: ' || v_suffix);
      if v.approval_required then
        perform pg_temp.readonly_registration_expect_error(format(
          'select public.assert_customer_registration_approved_for_write_v1(%L::uuid,%L,%L)',
          v.workspace_id,v.email,v.phone),'SELECT FOR KEY SHARE',
          'Mutation gate retains its customer lock');
        perform pg_temp.readonly_registration_expect_error(format(
          'select public.assert_customer_registration_approved_v1(%L::uuid,%L,%L)',
          v.workspace_id,'missing-readonly@example.test','3336999999'),'customer_registration_required',
          'Moderated salon still rejects an unregistered identity');
      end if;
    else
      perform pg_temp.readonly_registration_expect_error(format(
        'select public.assert_customer_registration_approved_v1(%L::uuid,%L,%L)',
        v.workspace_id,v.email,v.phone),'customer_registration_pending',
        'Pending read gate keeps the domain error: ' || v_suffix);
      perform pg_temp.readonly_registration_expect_error(format(
        'select public.booking_payment_customer_context(%L,%L,%L)',
        v.salon_code,v.email,v.phone),'customer_registration_pending',
        'Pending payment context remains blocked: ' || v_suffix);
      perform pg_temp.readonly_registration_expect_error(format(
        'select public.verified_booking_payment_context(%L,%L,%L,%L)',
        v.salon_code,v.email,v.phone,v.token),'customer_registration_pending',
        'Pending verified payment token remains blocked: ' || v_suffix);
    end if;
  end loop;
end $readonly_tests$;
select count(*) as readonly_checks_passed from registration_payment_readonly_results;
