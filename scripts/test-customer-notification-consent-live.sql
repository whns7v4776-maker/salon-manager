-- Execute only inside a transaction that is rolled back by the audit runner.
do $$
declare
 w uuid=gen_random_uuid(); w2 uuid=gen_random_uuid(); c uuid=gen_random_uuid(); c2 uuid=gen_random_uuid();
 instance text; salon text; before_row public.customer_notification_consent_updates; after_row public.customer_notification_consent_updates;
begin
 instance='consent-live-'||c; salon='consent-live-'||w;
 insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at) values
 (w,'Consent live isolated QA',salon,w||'@example.invalid','active',now()+interval '1 year'),
 (w2,'Consent live other QA','consent-live-'||w2,w2||'@example.invalid','active',now()+interval '1 year');
 insert into customers(id,workspace_id,full_name,phone,active_client_app_instance_id,active_client_platform) values
 (c,w,'Consent isolated QA','390000000021',instance,'ios'),
 (c2,w2,'Other isolated QA','390000000022','consent-live-'||c2,'android');
 if exists(select 1 from customer_notification_consent_updates where id=c) then raise exception 'Unverified installation inferred as consent'; end if;
 if report_customer_notification_permission_v1(salon,'other-installation','granted','ios') then raise exception 'Wrong installation accepted'; end if;
 if exists(select 1 from customer_notification_consent_updates where id=c) then raise exception 'Rejected report published'; end if;
 if report_customer_notification_permission_v1(salon,instance,'granted','android') then raise exception 'Wrong platform accepted'; end if;
 if not report_customer_notification_permission_v1(salon,instance,'granted','ios') then raise exception 'Valid report not acknowledged'; end if;
 select * into before_row from customer_notification_consent_updates where id=c;
 if before_row.notification_permission <> 'granted' or before_row.notification_permission_checked_at is null or before_row.workspace_id<>w then raise exception 'Accepted grant absent from live projection'; end if;
 update customers set active_client_last_seen_at=clock_timestamp() where id=c;
 select * into after_row from customer_notification_consent_updates where id=c;
 if after_row is distinct from before_row then raise exception 'Heartbeat modified consent projection'; end if;
 update customers set note='Unrelated note' where id=c;
 select * into after_row from customer_notification_consent_updates where id=c;
 if after_row is distinct from before_row then raise exception 'Unrelated customer edit modified consent projection'; end if;
 update customers set active_client_app_instance_id=null,active_client_platform=null where id=c;
 select * into after_row from customer_notification_consent_updates where id=c;
 if after_row is distinct from before_row then raise exception 'Logout erased recorded phone permission'; end if;
 update customers set active_client_app_instance_id=instance,active_client_platform='ios' where id=c;
 if not report_customer_notification_permission_v1(salon,instance,'denied','ios') then raise exception 'Denial not acknowledged'; end if;
 if not exists(select 1 from customer_notification_consent_updates where id=c and notification_permission='denied') then raise exception 'Denial not published'; end if;
 if not report_customer_notification_permission_v1(salon,instance,'undetermined','ios') then raise exception 'Undetermined not acknowledged'; end if;
 if not exists(select 1 from customer_notification_consent_updates where id=c and notification_permission='undetermined') then raise exception 'Undetermined not published'; end if;
 update customers set active_client_app_instance_id='new-'||instance where id=c;
 if not exists(select 1 from customer_notification_consent_updates where id=c and notification_permission is null and notification_permission_checked_at is null) then raise exception 'New-installation reset not published'; end if;
 if report_customer_notification_permission_v1(salon,instance,'granted','ios') then raise exception 'Stale installation overwrote reset'; end if;
 if not report_customer_notification_permission_v1('consent-live-'||w2,'consent-live-'||c2,'granted','android') then raise exception 'Android valid report not accepted'; end if;
 if has_table_privilege('anon','public.customer_notification_consent_updates','select') then raise exception 'Anonymous caller can read live consent'; end if;
 if has_table_privilege('authenticated','public.customer_notification_consent_updates','insert') or has_table_privilege('authenticated','public.customer_notification_consent_updates','update') then raise exception 'Owner can manufacture consent'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',gen_random_uuid(),'email',w||'@example.invalid')::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.customer_notification_consent_updates)<>1 then raise exception 'Owner can see another salon consent'; end if;
 if not exists(select 1 from public.customer_notification_consent_updates where id=c) then raise exception 'Owner cannot see own consent'; end if;
 execute 'reset role';
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='customer_notification_consent_updates') then raise exception 'Live projection unpublished'; end if;
 if (select count(*) from information_schema.columns where table_schema='public' and table_name='customer_notification_consent_updates')<>4 then raise exception 'Consent projection includes unexpected personal data'; end if;
 delete from customers where id=c;
 if exists(select 1 from customer_notification_consent_updates where id=c) then raise exception 'Deleted customer left consent behind'; end if;
end $$;
