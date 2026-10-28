-- Run only inside an explicit transaction that is ALWAYS rolled back. Fixtures
-- use isolated workspaces and synthetic identities, never a real tester salon.
create temporary table registration_approval_test_results(name text primary key);
-- A future business ledger with CASCADE must still prevent destructive
-- rejection. This synthetic table exists only in the rollback transaction.
create table public.customer_registration_approval_fixture_ledger(
  customer_id uuid references public.customers(id) on delete cascade,
  amount numeric not null
);
create or replace function pg_temp.registration_assert(p_ok boolean,p_name text)
returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'TEST FAILED: %',p_name; end if;
  insert into registration_approval_test_results values(p_name);
end $$;
create or replace function pg_temp.registration_expect_error(p_sql text,p_error text,p_name text)
returns void language plpgsql as $$
declare v_message text;
begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_message = message_text;
    if v_message not like '%' || p_error || '%' then
      raise exception 'TEST FAILED %: expected %, received %',p_name,p_error,v_message;
    end if;
    insert into registration_approval_test_results values(p_name);
    return;
  end;
  raise exception 'TEST FAILED %: expected % but write succeeded',p_name,p_error;
end $$;

do $test$
declare
  v_workspace uuid := gen_random_uuid();
  v_other_workspace uuid := gen_random_uuid();
  v_owner uuid := gen_random_uuid();
  v_owner_email text := 'registration-owner-' || gen_random_uuid()::text || '@example.test';
  v_other_email text := 'registration-other-' || gen_random_uuid()::text || '@example.test';
  v_code text := 'registration-approval-' || gen_random_uuid()::text;
  v_other_code text := 'registration-other-' || gen_random_uuid()::text;
  v_service uuid := gen_random_uuid();
  v_operator uuid := gen_random_uuid();
  v_device uuid := gen_random_uuid();
  v_client_device uuid := gen_random_uuid();
  v_existing uuid := gen_random_uuid();
  v_owner_created uuid := gen_random_uuid();
  v_automatic jsonb;
  v_pending jsonb;
  v_reject jsonb;
  v_history jsonb;
  v_elsewhere uuid := gen_random_uuid();
  v_result jsonb;
  v_settings jsonb;
  v_booking_sql text;
  v_registered uuid;
  v_request uuid;
  v_count integer;
  v_style text;
  v_legacy_customer uuid := gen_random_uuid();
  v_homonym_pending uuid := gen_random_uuid();
  v_business_pending uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.role','',true);
  insert into public.workspaces(id,salon_name,slug,owner_email,is_internal_tester,subscription_status)
    values(v_workspace,'Registration Approval SQL Fixture',v_code,v_owner_email,true,'active'),
      (v_other_workspace,'Other Registration SQL Fixture',v_other_code,v_other_email,true,'active');
  v_settings := jsonb_build_object('unrelatedSetting','preserved','guidedSlotsEnabled',false,
    'publicSlotIntervalMode','custom','publicSlotMinimumIntervalMinutes',5,
    'publicBookingWindowValue',365,'publicBookingWindowUnit','days','weeklySchedule',
    (select jsonb_agg(jsonb_build_object('weekday',day,'isClosed',false,'startTime','09:00','endTime','18:00')) from generate_series(0,6)day));
  insert into public.client_portals(workspace_id,owner_email,salon_code,salon_name,availability_settings)
    values(v_workspace,v_owner_email,v_code,'Registration Approval SQL Fixture',v_settings),
      (v_other_workspace,v_other_email,v_other_code,'Other Registration SQL Fixture',v_settings);
  insert into public.owner_app_snapshots(workspace_id,payload)
    values(v_workspace,jsonb_build_object('workspace',jsonb_build_object('id',v_workspace,'ownerEmail',v_owner_email,'salonCode',v_code,'salonName','Fixture'),
      'clienti','[]'::jsonb,'appuntamenti','[]'::jsonb,'richiestePrenotazione','[]'::jsonb,
      'availabilitySettings',v_settings,'servizi',jsonb_build_array(jsonb_build_object('id',v_service,'nome','Fixture Service','prezzo',20,'durataMinuti',20,'online',true,'requiredRole','Barber')),
      'operatori',jsonb_build_array(jsonb_build_object('id',v_operator,'nome','Fixture Operator','requiredRole','Barber')))),
      (v_other_workspace,jsonb_build_object('clienti','[]'::jsonb,'availabilitySettings',v_settings));
  insert into public.services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
    values(v_service,v_workspace,'Fixture Service',20,20,true,'Barber');
  insert into public.operators(id,workspace_id,name,required_role)
    values(v_operator,v_workspace,'Fixture Operator','Barber');
  insert into public.push_devices(id,workspace_id,owner_email,expo_push_token,platform,audience,recipient_kind,is_active)
    values(v_device,v_workspace,v_owner_email,'ExponentPushToken[fixtureowner00000000000]','ios','auth','owner',true);
  insert into public.customers(id,workspace_id,full_name,phone,email,source)
    values(v_existing,v_workspace,'Existing Fixture Customer','3331000000','existing-fixture@example.test','frontend');
  perform pg_temp.registration_assert((select registration_status='approved' from public.customers where id=v_existing),'Existing frontend customer stays approved');
  insert into public.email_otp_verifications(email,purpose,salon_code,code_hash,code_salt,expires_at,consumed_at)
    values('automatic-fixture@example.test','client_registration',v_code,'synthetic-fixture','synthetic-salt',now()+interval '15 minutes',now());
  v_automatic := public.register_public_customer_with_password(v_code,'Automatic Fixture Customer','3331000001','automatic-fixture@example.test',null,'Password123!');
  perform pg_temp.registration_assert(v_automatic->>'registrationStatus'='approved' and v_automatic->'ownerNotificationQueued'='true'::jsonb,'Default-off public registration is automatic with server notification marker');
  v_registered := (v_automatic->>'customerId')::uuid;
  select count(*) into v_count from public.push_notifications where workspace_id=v_workspace and payload->>'customerId'=v_registered::text and payload->>'kind'='frontend_customer_registered';
  perform pg_temp.registration_assert(v_count=1,'New registration queues owner event once');
  update public.push_notifications set status='processing' where workspace_id=v_workspace;
  perform public.queue_public_owner_push(v_workspace,'custom','Old client push','Duplicate old client push',jsonb_build_object('kind','frontend_customer_registered','customerId',v_registered));
  select count(*) into v_count from public.push_notifications where workspace_id=v_workspace and payload->>'customerId'=v_registered::text and payload->>'kind'='frontend_customer_registered';
  perform pg_temp.registration_assert(v_count=1,'Older client push cannot duplicate processing server registration event');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'email',v_owner_email,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  v_result := public.set_customer_registration_approval_v1(true);
  perform pg_temp.registration_assert(v_result->'availabilitySettings'->'customerRegistrationApprovalRequired'='true'::jsonb and v_result->'availabilitySettings'->>'unrelatedSetting'='preserved','Owner enables admission while preserving unrelated settings');
  perform pg_temp.registration_assert((select payload->'availabilitySettings'->'customerRegistrationApprovalRequired'='true'::jsonb from public.owner_app_snapshots where workspace_id=v_workspace),'Approval setting is saved in private snapshot');
  update public.owner_app_snapshots set payload=payload || jsonb_build_object('availabilitySettings',jsonb_build_object('customerRegistrationApprovalRequired',false)) where workspace_id=v_workspace;
  perform pg_temp.registration_assert((select payload->'availabilitySettings'->'customerRegistrationApprovalRequired'='true'::jsonb from public.owner_app_snapshots where workspace_id=v_workspace),'Old private snapshot cannot clear new approval preference');
  perform pg_temp.registration_assert(public.merge_client_portal_availability_settings(v_result->'availabilitySettings','{}'::jsonb)->'customerRegistrationApprovalRequired'='true'::jsonb,'Old public snapshot omitting flag cannot clear preference');
  update public.client_portals set availability_settings=availability_settings || jsonb_build_object(
    'customerRegistrationApprovalRequired',false,'customerRegistrationApprovalUpdatedAt',now()+interval '10 years') where workspace_id=v_workspace;
  update public.owner_app_snapshots set payload=jsonb_set(payload,'{availabilitySettings}',
    (payload->'availabilitySettings') || jsonb_build_object('customerRegistrationApprovalRequired',false,'customerRegistrationApprovalUpdatedAt',now()+interval '10 years'),true) where workspace_id=v_workspace;
  perform pg_temp.registration_assert((select availability_settings->'customerRegistrationApprovalRequired'='true'::jsonb from public.client_portals where workspace_id=v_workspace)
    and (select payload->'availabilitySettings'->'customerRegistrationApprovalRequired'='true'::jsonb from public.owner_app_snapshots where workspace_id=v_workspace),
    'Future timestamp publisher cannot disable committed owner preference');
  insert into public.email_otp_verifications(email,purpose,salon_code,code_hash,code_salt,expires_at,consumed_at)
    values('pending-fixture@example.test','client_registration',v_code,'synthetic-fixture','synthetic-salt',now()+interval '15 minutes',now());
  v_pending := public.register_public_customer_with_password(v_code,'Pending Fixture Customer','3331000002','pending-fixture@example.test',null,'Password123!');
  v_registered := (v_pending->>'customerId')::uuid;
  perform pg_temp.registration_assert(v_pending->>'registrationStatus'='pending','Enabled public registration waits for salon approval');
  perform pg_temp.registration_assert((select registration_status='approved' from public.customers where id=v_existing),'Enabling admission does not reclassify existing clients');
  insert into public.customers(id,workspace_id,full_name,phone,email,source) values(v_owner_created,v_workspace,'Owner Fixture Customer','3331000003','owner-fixture@example.test','salon');
  perform pg_temp.registration_assert((select registration_status='approved' from public.customers where id=v_owner_created),'Salon-created customer stays approved');
  v_result := public.find_public_customer_by_password(v_code,'pending-fixture@example.test','3331000002','Password123!');
  perform pg_temp.registration_assert(v_result->>'registrationStatus'='pending','Authenticated pending customer can log in and see admission status');
  v_result := public.get_public_customer_registration_status_v1(v_code,'pending-fixture@example.test','+39 3331000002');
  perform pg_temp.registration_assert(v_result->'found'='true'::jsonb and v_result->>'registrationStatus'='pending','Status probe is salon-scoped and normalizes international phone prefix');
  v_result := public.get_public_customer_registration_status_v1(v_code,'pending-fixture@example.test','3331009999');
  perform pg_temp.registration_assert(v_result->'found'='false'::jsonb,'Both contact fields must match status probe');
  update public.workspaces set is_internal_tester=false,subscription_ends_at=now()-interval '1 day' where id=v_workspace;
  v_result := public.get_public_customer_registration_status_v1(v_code,'pending-fixture@example.test','3331000002');
  perform pg_temp.registration_assert(v_result->'found'='true'::jsonb and v_result->>'registrationStatus'='pending',
    'Membership status remains available when salon subscription expires');
  update public.workspaces set is_internal_tester=true,subscription_ends_at=null where id=v_workspace;
  update public.owner_app_snapshots set payload=jsonb_set(payload,'{clienti}',jsonb_build_array(jsonb_build_object('id',v_registered,'registrationStatus','approved','nota','preserved')),true) where workspace_id=v_workspace;
  v_result := public.get_client_portal_snapshot(v_code);
  perform pg_temp.registration_assert(v_result->'clienti'->0->>'registrationStatus'='pending' and v_result->'clienti'->0->>'nota'='preserved','Public snapshot overlays canonical status while preserving customer fields');
  update public.customers set viewed_by_salon=true where id=v_registered;
  perform pg_temp.registration_assert((select viewed_by_salon is false from public.customers where id=v_registered),'Mark-read cannot hide the pending approval badge');
  insert into public.customers(id,workspace_id,full_name,phone,email,source)
    values(v_registered,v_workspace,'Pending Fixture Customer','3331000002','pending-fixture@example.test','frontend')
    on conflict(id) do update set registration_status=excluded.registration_status,viewed_by_salon=true;
  perform pg_temp.registration_assert((select registration_status='pending' and viewed_by_salon is false from public.customers where id=v_registered),
    'Older full upsert cannot promote pending admission through default approved');

  for v_style in select unnest(array['ordinary','accepted','phased','linked','spoofed']) loop
    v_booking_sql := format('insert into public.booking_requests(workspace_id,customer_id,customer_email,customer_phone,customer_name,requested_service_name,requested_price,requested_duration_minutes,appointment_date,appointment_time,origin,status,phase_snapshot) values(%L::uuid,%L::uuid,%L::citext,%L,%L,%L,20,20,current_date+14,time ''10:00'',''frontend'',%L::public.request_status,%L::jsonb)',
      v_workspace,case when v_style='spoofed' then v_owner_created else v_registered end,
      'pending-fixture@example.test','3331000002','Pending Fixture Customer','Fixture Service',
      case when v_style='accepted' then 'accepted' else 'pending' end,
      case when v_style='phased' then '{"mode":"phased","initialDurationMinutes":20}' else '{}' end);
    perform pg_temp.registration_expect_error(v_booking_sql,'customer_registration_pending','Pending customer blocked for ' || v_style || ' booking write');
  end loop;
  perform pg_temp.registration_expect_error(format('select public.create_public_booking_request_ultralight_v4(%L,%L,20,20,current_date+14,time ''10:00'',%L,'''',%L::citext,%L,null,null,%L,%L,%L)',v_code,'Fixture Service','Pending Fixture Customer','pending-fixture@example.test','3331000002','Barber',v_operator,'Fixture Operator'),
    'customer_registration_pending','Public booking RPC blocks pending registration');
  perform pg_temp.registration_expect_error(format('select public.assert_customer_registration_approved_v1(%L::uuid,%L,%L)',v_workspace,'unknown-fixture@example.test','3339990000'),
    'customer_registration_required','Moderated salon rejects booking without registered identity');
  perform pg_temp.registration_expect_error(format('select public.booking_payment_customer_context(%L,%L,%L)',v_code,'pending-fixture@example.test','3331000002'),
    'customer_registration_pending','Stable payment context rejects pending customer before prepayment');
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.role','anon',true);
  insert into public.customers(id,workspace_id,full_name,phone,email,source)
    values(v_legacy_customer,v_workspace,'Anonymous Legacy Fixture','3331000010','anonymous-legacy-fixture@example.test','frontend');
  perform pg_temp.registration_assert((select registration_status='pending' from public.customers where id=v_legacy_customer),
    'Anonymous legacy frontend insert cannot default to approved in moderated salon');
  perform pg_temp.registration_expect_error(format('select public.create_public_booking_request(%L,%L,20,20,current_date+14,time ''12:00'',%L,'''',%L::citext,%L,null,null,%L,%L,%L)',
    v_code,'Fixture Service','Legacy Auto-create Fixture','legacy-autocreate-fixture@example.test','3331000011','Barber',v_operator,'Fixture Operator'),
    'customer_registration_pending','Legacy public booking RPC cannot auto-create an approved customer');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'email',v_owner_email,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform public.set_customer_registration_approval_v1(false);
  update public.client_portals set availability_settings=availability_settings || jsonb_build_object(
    'customerRegistrationApprovalRequired',true,'customerRegistrationApprovalUpdatedAt',now()+interval '10 years') where workspace_id=v_workspace;
  update public.owner_app_snapshots set payload=jsonb_set(payload,'{availabilitySettings}',
    (payload->'availabilitySettings') || jsonb_build_object('customerRegistrationApprovalRequired',true,'customerRegistrationApprovalUpdatedAt',now()+interval '10 years'),true) where workspace_id=v_workspace;
  perform pg_temp.registration_assert((select availability_settings->'customerRegistrationApprovalRequired'='false'::jsonb from public.client_portals where workspace_id=v_workspace)
    and (select payload->'availabilitySettings'->'customerRegistrationApprovalRequired'='false'::jsonb from public.owner_app_snapshots where workspace_id=v_workspace),
    'Future timestamp publisher cannot reactivate preference disabled by dedicated RPC');
  perform pg_temp.registration_expect_error(v_booking_sql,'customer_registration_pending','Disabling admission preserves pending customer booking block');
  perform pg_temp.registration_expect_error(format('select public.booking_payment_customer_context(%L,%L,%L)',v_code,'pending-fixture@example.test','3331000002'),
    'customer_registration_pending','Disabling admission preserves pending prepayment block');
  perform pg_temp.registration_expect_error(format('insert into public.booking_requests(workspace_id,customer_id,customer_email,customer_phone,customer_name,requested_service_name,requested_price,requested_duration_minutes,appointment_date,appointment_time,origin,status) values(%L::uuid,%L::uuid,%L::citext,%L,%L,%L,20,20,current_date+14,time ''12:00'',''frontend'',''pending'')',
    v_workspace,v_registered,'pending-fixture@example.test','3331999999','Pending Fixture Customer','Fixture Service'),
    'customer_registration_pending','Pending canonical ID cannot bypass admission by changing one contact field with flag off');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'email',v_other_email,'role','authenticated')::text,true);
  perform pg_temp.registration_expect_error(format('select public.decide_customer_registration(%L::uuid,''approved'')',v_registered),'customer_not_found','Different salon cannot approve pending customer');
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  perform set_config('request.jwt.claim.role','anon',true);
  perform pg_temp.registration_expect_error(format('select public.decide_customer_registration(%L::uuid,''approved'')',v_registered),'owner_session_required','Anonymous customer cannot approve own registration');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner,'email',v_owner_email,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  insert into public.push_devices(id,workspace_id,owner_email,expo_push_token,platform,audience,recipient_kind,is_active,customer_email,customer_phone)
    values(v_client_device,v_workspace,v_owner_email,'ExponentPushToken[fixtureclient0000000000]','ios','public','client',true,'pending-fixture@example.test','3331000002');
  v_result := public.decide_customer_registration(v_registered,'approved');
  perform pg_temp.registration_assert(v_result->'replayed'='false'::jsonb and v_result->>'registrationStatus'='approved','Owner approval succeeds atomically');
  v_result := public.decide_customer_registration(v_registered,'approved');
  perform pg_temp.registration_assert(v_result->'replayed'='true'::jsonb,'Approval is idempotent');
  update public.customers set registration_status='pending' where id=v_registered;
  perform pg_temp.registration_assert((select registration_status='approved' from public.customers where id=v_registered),
    'Stale pending publisher cannot downgrade completed approval');
  select count(*) into v_count from public.push_notifications where workspace_id=v_workspace and payload->>'kind'='customer_registration_approved' and payload->>'customerId'=v_registered::text;
  perform pg_temp.registration_assert(v_count=1,'Approval retries notify customer once');
  perform public.set_customer_registration_approval_v1(true);
  v_result := public.booking_payment_customer_context(v_code,'pending-fixture@example.test','3331000002');
  perform pg_temp.registration_assert(v_result->>'customerId'=v_registered::text,'Stable payment context works for approved customer');
  v_result := public.create_public_booking_request_ultralight_v4(v_code,'Fixture Service',20,20,current_date+14,time '10:00','Pending Fixture Customer','','pending-fixture@example.test','3331000002',null,null,'Barber',v_operator::text,'Fixture Operator');
  v_request := (v_result->>'id')::uuid;
  perform pg_temp.registration_assert(v_request is not null and exists(select 1 from public.booking_requests where id=v_request),'Same public booking RPC succeeds after approval');
  perform pg_temp.registration_expect_error(format('select public.decide_customer_registration(%L::uuid,''rejected'')',v_registered),'customer_registration_not_pending','Approved customer cannot be removed via rejection action');

  perform public.set_customer_registration_approval_v1(true);
  insert into public.email_otp_verifications(email,purpose,salon_code,code_hash,code_salt,expires_at,consumed_at)
    values('reject-fixture@example.test','client_registration',v_code,'synthetic-fixture','synthetic-salt',now()+interval '15 minutes',now());
  update public.customers set full_name='Rejected Fixture Customer' where id=v_existing;
  update public.owner_app_snapshots set payload=jsonb_set(payload,'{clienti}',
    (payload->'clienti') || jsonb_build_array(jsonb_build_object('id',v_existing,'nome','Rejected Fixture Customer','telefono','3331000000','email','existing-fixture@example.test')),true) where workspace_id=v_workspace;
  v_reject := public.register_public_customer_with_password(v_code,'Rejected Fixture Customer','3331000004','reject-fixture@example.test',null,'Password123!');
  v_registered := (v_reject->>'customerId')::uuid;
  perform pg_temp.registration_assert(exists(select 1 from public.client_portals cross join jsonb_array_elements(clienti)item where workspace_id=v_workspace and item->>'id'=v_existing::text),
    'Pending homonym registration preserves approved customer portal card');
  update public.customers set note='Pending profile update' where id=v_registered;
  perform pg_temp.registration_assert(exists(select 1 from public.client_portals cross join jsonb_array_elements(clienti)item where workspace_id=v_workspace and item->>'id'=v_existing::text),
    'Pending homonym profile update preserves approved customer portal card');
  insert into public.customers(id,workspace_id,full_name,phone,email,source)
    values(v_elsewhere,v_other_workspace,'Rejected Fixture Customer','3331000004','reject-fixture@example.test','salon');
  insert into public.customer_login_credentials(customer_id,password_hash) values(v_elsewhere,extensions.crypt('Password123!',extensions.gen_salt('bf',4)));
  v_result := public.decide_customer_registration(v_registered,'rejected');
  perform pg_temp.registration_assert(v_result->'replayed'='false'::jsonb and not exists(select 1 from public.customers where id=v_registered) and not exists(select 1 from public.customer_login_credentials where customer_id=v_registered),'Rejection removes only pending salon customer and credentials');
  perform pg_temp.registration_assert(exists(select 1 from public.client_portals cross join jsonb_array_elements(clienti)item where workspace_id=v_workspace and item->>'id'=v_existing::text),
    'Rejecting pending homonym preserves approved customer in portal');
  perform pg_temp.registration_assert(exists(select 1 from public.owner_app_snapshots cross join jsonb_array_elements(payload->'clienti')item where workspace_id=v_workspace and item->>'id'=v_existing::text),
    'Rejecting pending homonym preserves approved customer in private snapshot');
  perform pg_temp.registration_assert(exists(select 1 from public.customers where id=v_elsewhere) and exists(select 1 from public.customer_login_credentials where customer_id=v_elsewhere),'Rejection preserves another salon with identical contact details');
  v_result := public.decide_customer_registration(v_registered,'rejected');
  perform pg_temp.registration_assert(v_result->'replayed'='true'::jsonb,'Rejection transport retry is idempotent within salon tombstone');
  perform pg_temp.registration_assert(public.get_public_customer_registration_status_v1(v_code,'reject-fixture@example.test','3331000004')->'found'='false'::jsonb,'Rejected customer status probe detects missing membership');
  update public.client_portals set clienti=clienti || jsonb_build_array(jsonb_build_object('id',v_registered,'nome','Rejected Fixture Customer','telefono','3331000004','email','reject-fixture@example.test')) where workspace_id=v_workspace;
  perform pg_temp.registration_assert(not exists(select 1 from public.client_portals cross join jsonb_array_elements(clienti)item where workspace_id=v_workspace and item->>'id'=v_registered::text),'Stale snapshot cannot resurrect rejected salon customer');
  v_result := public.register_public_customer_with_password(v_code,'Rejected Fixture Customer','3331000004','reject-fixture@example.test',null,'Password123!');
  perform pg_temp.registration_assert(v_result->>'registrationStatus'='pending' and (v_result->>'customerId')::uuid<>v_registered,'Fresh registration after rejection receives new pending identity');
  update public.client_portals set clienti=clienti || jsonb_build_array(jsonb_build_object('id',v_registered,'nome','Rejected Fixture Customer','telefono','3331000004','email','reject-fixture@example.test')) where workspace_id=v_workspace;
  perform pg_temp.registration_assert(not exists(select 1 from public.client_portals cross join jsonb_array_elements(clienti)item where workspace_id=v_workspace and item->>'id'=v_registered::text),
    'Old rejected UUID stays hidden after new registration clears name tombstone');
  insert into public.customers(id,workspace_id,full_name,phone,email,source)
    values(v_registered,v_workspace,'Rejected Fixture Customer','3331000004','reject-fixture@example.test','salon')
    on conflict(id) do update set full_name=excluded.full_name;
  perform pg_temp.registration_assert(not exists(select 1 from public.customers where id=v_registered),
    'Old owner upsert cannot recreate canonical rejected UUID after fresh registration');
  v_registered := (v_result->>'customerId')::uuid;
  perform pg_temp.registration_assert(exists(select 1 from public.client_portals cross join jsonb_array_elements(clienti)item where workspace_id=v_workspace and item->>'id'=v_registered::text),'Fresh pending registration is not hidden by old tombstone');

  insert into public.customers(id,workspace_id,full_name,phone,email,source,registration_status)
    values(v_homonym_pending,v_workspace,'Rejected Fixture Customer','3331000006','homonym-approve-fixture@example.test','frontend','pending');
  update public.owner_app_snapshots set payload=jsonb_set(payload,'{clienti}',
    (payload->'clienti') || jsonb_build_array(jsonb_build_object('id',v_homonym_pending,'nome','Rejected Fixture Customer','telefono','3331000006','email','homonym-approve-fixture@example.test')),true) where workspace_id=v_workspace;
  perform public.decide_customer_registration(v_homonym_pending,'approved');
  perform pg_temp.registration_assert((select count(distinct item->>'id')=2 from public.client_portals cross join jsonb_array_elements(clienti)item
    where workspace_id=v_workspace and item->>'id' in (v_existing::text,v_homonym_pending::text)),
    'Approving pending homonym preserves both canonical customer portal cards');
  perform pg_temp.registration_assert((select count(distinct item->>'id')=2 from public.owner_app_snapshots cross join jsonb_array_elements(payload->'clienti')item
    where workspace_id=v_workspace and item->>'id' in (v_existing::text,v_homonym_pending::text)),
    'Approving pending homonym preserves both private snapshot cards');

  insert into public.customers(id,workspace_id,full_name,phone,email,source,registration_status)
    values(v_business_pending,v_workspace,'Business Fixture Customer','3331000007','business-fixture@example.test','frontend','pending');
  insert into public.customer_registration_approval_fixture_ledger(customer_id,amount) values(v_business_pending,42);
  perform pg_temp.registration_expect_error(format('select public.decide_customer_registration(%L::uuid,''rejected'')',v_business_pending),
    'pending_customer_has_history','Pending customer with CASCADE business balance cannot be rejected');
  perform pg_temp.registration_assert(exists(select 1 from public.customer_registration_approval_fixture_ledger where customer_id=v_business_pending and amount=42),
    'Failed business rejection preserves ledger value');

  insert into public.email_otp_verifications(email,purpose,salon_code,code_hash,code_salt,expires_at,consumed_at)
    values('history-fixture@example.test','client_registration',v_code,'synthetic-fixture','synthetic-salt',now()+interval '15 minutes',now());
  v_history := public.register_public_customer_with_password(v_code,'History Fixture Customer','3331000005','history-fixture@example.test',null,'Password123!');
  v_registered := (v_history->>'customerId')::uuid;
  insert into public.booking_requests(workspace_id,customer_id,customer_email,customer_phone,customer_name,requested_service_name,requested_price,requested_duration_minutes,appointment_date,appointment_time,origin,status)
    values(v_workspace,v_registered,'history-fixture@example.test','3331000005','History Fixture Customer','Fixture Service',20,20,current_date+14,time '11:00','backoffice','pending');
  perform pg_temp.registration_assert(exists(select 1 from public.booking_requests where customer_id=v_registered),'Backoffice booking remains possible for pending customer');
  perform pg_temp.registration_expect_error(format('select public.decide_customer_registration(%L::uuid,''rejected'')',v_registered),'pending_customer_has_history','Pending customer with owner booking is protected from destructive rejection');
  perform pg_temp.registration_assert(not has_function_privilege('anon','public.decide_customer_registration(uuid,text)','EXECUTE') and not has_function_privilege('anon','public.set_customer_registration_approval_v1(boolean)','EXECUTE'),'Owner actions are not callable by anonymous role');
end $test$;
select jsonb_agg(name order by name) as passed_cases from registration_approval_test_results;
