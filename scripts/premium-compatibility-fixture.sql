-- Synthetic baseline for an existing logged-in customer. No production rows.
insert into auth.users(id,email) values('20000000-0000-4000-8000-000000000001','owner@isolated.invalid');
insert into workspaces(id,salon_name,slug,owner_email,is_internal_tester,subscription_status,subscription_ends_at,auto_accept_booking_requests)
values('10000000-0000-4000-8000-000000000001','Isolated Salon','isolated-premium-salon','owner@isolated.invalid',true,'active',now()+interval '1 year',false),
('10000000-0000-4000-8000-000000000002','Other Isolated Salon','isolated-other-salon','other@isolated.invalid',true,'active',now()+interval '1 year',false);
insert into workspace_members(workspace_id,user_id,email,role) values('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner@isolated.invalid','owner');
insert into client_portals(workspace_id,owner_email,salon_code,salon_name) values('10000000-0000-4000-8000-000000000001','owner@isolated.invalid','isolated-premium-salon','Isolated Salon');
insert into customers(id,workspace_id,full_name,email,phone,note,source,registration_status,max_future_appointments,max_daily_appointments)
values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Existing Customer','client@isolated.invalid','3331000001','Private fixture note','salon','approved',20,20),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Other Customer','other@isolated.invalid','3331000002','Other private note','salon','approved',20,20);
insert into services(id,workspace_id,name,price,duration_minutes,is_online,required_role)
values('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fixture Haircut',20,30,true,'Barber');
insert into operators(id,workspace_id,name,required_role) values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Fixture Operator','Barber');
insert into appointments(id,workspace_id,customer_id,appointment_date,appointment_time,customer_name,service_name,price,operator_id,duration_minutes,completed)
values('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',current_date-10,'10:00','Existing Customer','Fixture Haircut',20,'50000000-0000-4000-8000-000000000001',30,true);
insert into cash_movements(id,workspace_id,appointment_id,description,amount,payment_method)
values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Historical fixture receipt',20,'cash');
insert into owner_app_snapshots(workspace_id,payload) values('10000000-0000-4000-8000-000000000001',jsonb_build_object(
'workspace',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','salonCode','isolated-premium-salon','salonName','Isolated Salon'),
'clienti',jsonb_build_array(jsonb_build_object('id','30000000-0000-4000-8000-000000000001','nome','Existing Customer','email','client@isolated.invalid','telefono','3331000001','nota','Private fixture note')),
'servizi',jsonb_build_array(jsonb_build_object('id','40000000-0000-4000-8000-000000000001','nome','Fixture Haircut','prezzo',20,'durataMinuti',30,'mestiereRichiesto','Barber')),
'operatori',jsonb_build_array(jsonb_build_object('id','50000000-0000-4000-8000-000000000001','nome','Fixture Operator','mestiere','Barber')),
'appuntamenti','[]'::jsonb));
insert into customer_login_credentials(customer_id,password_hash) values('30000000-0000-4000-8000-000000000001',extensions.crypt('Fixture9!Password',extensions.gen_salt('bf',4)));
insert into customer_payment_sessions(token_hash,customer_id,credential_hash,expires_at)
select encode(extensions.digest(repeat('a',64),'sha256'),'hex'),customer_id,password_hash,now()+interval '6 days' from customer_login_credentials where customer_id='30000000-0000-4000-8000-000000000001';
update salonpro_private.portal_read_protection set enabled=true;
