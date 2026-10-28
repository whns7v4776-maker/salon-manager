do $$
declare w uuid=gen_random_uuid();w2 uuid=gen_random_uuid();c uuid=gen_random_uuid();
begin
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values(w,'Consent QA','consent-'||w,w||'@example.invalid','active',now()+interval '1 year'),(w2,'Other consent QA','consent-'||w2,w2||'@example.invalid','active',now()+interval '1 year');
 insert into customers(id,workspace_id,full_name,phone,active_client_app_instance_id,active_client_platform) values(c,w,'Consent QA','390000000001','qa-instance-'||c,'ios');
 insert into push_devices(workspace_id,owner_email,expo_push_token,recipient_kind,customer_phone,is_active) values(w,w||'@example.invalid','ExponentPushToken[consent-'||c||']','client','390000000001',true);
 insert into push_devices(workspace_id,owner_email,expo_push_token,recipient_kind,customer_phone,is_active) values(w,w||'@example.invalid','ExponentPushToken[owner-'||c||']','owner','390000000001',true),(w,w||'@example.invalid','ExponentPushToken[other-'||c||']','client','390000000002',true);
 if report_customer_notification_permission_v1('consent-'||w,'qa-instance-'||c,'denied','android') then raise exception 'Wrong platform accepted'; end if;
 if report_customer_notification_permission_v1('consent-'||w,'wrong-instance','denied','ios') then raise exception 'Wrong session accepted'; end if;
 if report_customer_notification_permission_v1('consent-'||w2,'qa-instance-'||c,'denied','ios') then raise exception 'Wrong workspace accepted'; end if;
 if (select notification_permission from customers where id=c) is not null then raise exception 'Unknown consent inferred'; end if;
 if not report_customer_notification_permission_v1('consent-'||w,'qa-instance-'||c,'denied','ios') then raise exception 'Valid denial rejected'; end if;
 if not (select notification_permission='denied' and notification_permission_checked_at is not null from customers where id=c) then raise exception 'Denial not saved'; end if;
 if exists(select 1 from push_devices where workspace_id=w and recipient_kind='client' and customer_phone='390000000001' and is_active) then raise exception 'Denied push device still active'; end if;
 if (select count(*) from push_devices where workspace_id=w and is_active)<>2 then raise exception 'Unrelated devices modified'; end if;
 if not report_customer_notification_permission_v1('consent-'||w,'qa-instance-'||c,'granted','ios') then raise exception 'Valid grant rejected'; end if;
 if not (select notification_permission='granted' from customers where id=c) then raise exception 'Consent re-enable not saved'; end if;
 update customers set active_client_app_instance_id='replacement-instance' where id=c;
 if (select notification_permission from customers where id=c) is not null then raise exception 'Old device consent leaked into new session'; end if;
 if report_customer_notification_permission_v1('consent-'||w,'qa-instance-'||c,'denied','ios') then raise exception 'Stale device overwrote current consent'; end if;
end $$;
