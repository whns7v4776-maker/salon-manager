do $$
declare
  w uuid=gen_random_uuid();
  c uuid=gen_random_uuid();
  salon text='consent-persistence-'||w;
  instance text='qa-original-'||c;
  replacement text='qa-replacement-'||c;
  checked timestamptz;
begin
  insert into workspaces(id,salon_name,slug,owner_email,subscription_status,subscription_ends_at)
    values(w,'Consent persistence QA',salon,w||'@example.invalid','active',now()+interval '1 year');
  insert into customers(id,workspace_id,full_name,phone)
    values(c,w,'Consent persistence QA','390000000003');
  if not (select ok from claim_public_customer_app_session(salon,null,'390000000003',instance,'ios')) then
    raise exception 'Native session claim failed';
  end if;
  if not report_customer_notification_permission_v1(salon,instance,'granted','ios') then
    raise exception 'Explicit permission report failed';
  end if;
  select notification_permission_checked_at into checked from customers where id=c;
  if not release_public_customer_app_session(salon,null,'390000000003',instance) then
    raise exception 'Session release failed';
  end if;
  if not (select notification_permission='granted'
    and notification_permission_checked_at=checked
    and notification_permission_app_instance_id=instance from customers where id=c) then
    raise exception 'Logout discarded explicitly verified permission';
  end if;
  if report_customer_notification_permission_v1(salon,instance,'denied','ios') then
    raise exception 'Logged-out installation changed permission';
  end if;
  perform claim_public_customer_app_session(salon,null,'390000000003','qa-web-'||c,'manual');
  if not (select notification_permission='granted' and notification_permission_checked_at=checked from customers where id=c) then
    raise exception 'Web access discarded native permission';
  end if;
  perform release_public_customer_app_session(salon,null,'390000000003','qa-web-'||c);
  perform claim_public_customer_app_session(salon,null,'390000000003',instance,'ios');
  if not (select notification_permission='granted' and notification_permission_checked_at=checked from customers where id=c) then
    raise exception 'Same-phone login discarded verified permission';
  end if;
  perform report_customer_notification_permission_v1(salon,instance,'denied','ios');
  perform release_public_customer_app_session(salon,null,'390000000003',instance);
  if not (select notification_permission='denied' from customers where id=c) then
    raise exception 'Logout discarded explicit denial';
  end if;
  perform claim_public_customer_app_session(salon,null,'390000000003',replacement,'android');
  if (select notification_permission is not null
    or notification_permission_checked_at is not null
    or notification_permission_app_instance_id is not null from customers where id=c) then
    raise exception 'Permission leaked to a different native installation';
  end if;
  if report_customer_notification_permission_v1(salon,instance,'granted','ios') then
    raise exception 'Old phone overwrote the new phone';
  end if;
  if not report_customer_notification_permission_v1(salon,replacement,'undetermined','android') then
    raise exception 'New phone cannot report its own permission';
  end if;
end $$;
