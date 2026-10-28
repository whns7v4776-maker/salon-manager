-- No inferred/backfilled consent: only the customer's current app session may report it.
alter table public.customers
 add column if not exists notification_permission text,
 add column if not exists notification_permission_checked_at timestamptz,
 add column if not exists notification_permission_platform text;
alter table public.customers add constraint customer_notification_permission_valid
 check (notification_permission is null or notification_permission in ('granted','denied','undetermined'));
create or replace function public.report_customer_notification_permission_v1(
 p_salon_code text, p_app_instance_id text, p_permission text, p_platform text
) returns boolean language plpgsql security definer set search_path=public as $$
declare c public.customers; wid uuid;
begin
 if p_permission is null or p_platform is null or p_permission not in ('granted','denied','undetermined') or p_platform not in ('ios','android') then raise exception 'Invalid permission report'; end if;
 if nullif(trim(p_app_instance_id),'') is null then return false; end if;
 select id into wid from workspaces where lower(trim(slug))=lower(trim(p_salon_code));
 if (select count(*) from customers where workspace_id=wid and active_client_app_instance_id=trim(p_app_instance_id) and coalesce(is_active,true)) <> 1 then return false; end if;
 select * into c from customers where workspace_id=wid and active_client_app_instance_id=trim(p_app_instance_id) and coalesce(is_active,true) and active_client_platform::text=p_platform for update;
 if c.id is null then return false; end if;
 update customers set notification_permission=p_permission, notification_permission_checked_at=clock_timestamp(),notification_permission_platform=p_platform where id=c.id;
 if p_permission <> 'granted' then
  update push_devices set is_active=false,updated_at=clock_timestamp() where workspace_id=wid and recipient_kind='client' and
   ((nullif(lower(trim(c.email::text)),'') is not null and lower(trim(customer_email::text))=lower(trim(c.email::text))) or
    (nullif(right(regexp_replace(c.phone,'[^0-9]','','g'),10),'') is not null and right(regexp_replace(customer_phone,'[^0-9]','','g'),10)=right(regexp_replace(c.phone,'[^0-9]','','g'),10)));
 end if;
 return true;
end $$;
revoke all on function public.report_customer_notification_permission_v1(text,text,text,text) from public;
grant execute on function public.report_customer_notification_permission_v1(text,text,text,text) to anon,authenticated;

create or replace function public.reset_customer_notification_consent_on_session_v1()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.active_client_app_instance_id is distinct from old.active_client_app_instance_id then
  new.notification_permission=null;
  new.notification_permission_checked_at=null;
  new.notification_permission_platform=null;
 end if;
 return new;
end $$;
create trigger reset_customer_notification_consent_on_session_v1
 before update of active_client_app_instance_id on public.customers
 for each row execute function public.reset_customer_notification_consent_on_session_v1();
