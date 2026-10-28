-- Additive attachment support: old applications keep their existing RPC contracts.
alter table public.customer_communications add column image_path text;
alter table public.scheduled_customer_communications add column image_path text;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('communication-posters','communication-posters',true,5242880,array['image/jpeg']) on conflict(id) do nothing;
create policy communication_poster_upload on storage.objects for insert to authenticated
with check(bucket_id='communication-posters' and (storage.foldername(name))[1]=auth.uid()::text and public.workspace_access_allowed());
-- Immutable images: no overwrite or delete rights, so delivered attachments remain valid.
create function public.validate_communication_poster(p_path text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_path is null then return; end if;
 if auth.uid() is null or split_part(p_path,'/',1)<>auth.uid()::text or
 not exists(select 1 from storage.objects where bucket_id='communication-posters' and name=p_path) then
 raise exception 'invalid_communication_poster'; end if;
end $$;
revoke all on function public.validate_communication_poster(text) from public,anon,authenticated;

create function public.send_owner_customer_communication_v4(
 p_title text,p_body text,p_targets jsonb,p_request_key text,
 p_starts_local timestamp default null,p_ends_local timestamp default null,p_send_local timestamp default null,
 p_reminder_title text default null,p_reminder_body text default null,p_image_path text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid:=public.current_workspace_id(); result jsonb; already_exists boolean;
begin
 if auth.uid() is null or w is null or not public.workspace_access_allowed() then raise exception 'workspace_not_allowed'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text || ':' || p_request_key,0));
 perform public.validate_communication_poster(p_image_path);
 select exists(select 1 from public.customer_communications where workspace_id=w and send_request_key=p_request_key)
 or exists(select 1 from public.scheduled_customer_communications where workspace_id=w and request_key=p_request_key) into already_exists;
 result:=public.send_owner_customer_communication_v3(p_title,p_body,p_targets,p_request_key,p_starts_local,p_ends_local,p_send_local,p_reminder_title,p_reminder_body);
 if not already_exists then
 if coalesce((result->>'scheduled')::boolean,false) then
 update public.scheduled_customer_communications set image_path=p_image_path where id=(result->>'communicationId')::uuid and workspace_id=w;
 else
 update public.customer_communications set image_path=p_image_path where id=(result->>'communicationId')::uuid and workspace_id=w;
 end if; end if;
 return result;
end $$;
revoke all on function public.send_owner_customer_communication_v4(text,text,jsonb,text,timestamp,timestamp,timestamp,text,text,text) from public;
grant execute on function public.send_owner_customer_communication_v4(text,text,jsonb,text,timestamp,timestamp,timestamp,text,text,text) to authenticated;

create function public.save_owner_customer_popup_v2(
 p_title text,p_body text,p_targets jsonb,p_all_customers boolean,p_request_key text,p_starts_local timestamp,p_ends_local timestamp,p_image_path text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare w uuid:=public.current_workspace_id(); result jsonb; already_exists boolean;
begin
 if auth.uid() is null or w is null or not public.workspace_access_allowed() then raise exception 'workspace_not_allowed'; end if;
 perform pg_advisory_xact_lock(hashtextextended(w::text || ':' || p_request_key,0));
 perform public.validate_communication_poster(p_image_path);
 select exists(select 1 from public.customer_communications where workspace_id=w and send_request_key=p_request_key) into already_exists;
 result:=public.save_owner_customer_popup_v1(p_title,p_body,p_targets,p_all_customers,p_request_key,p_starts_local,p_ends_local);
 if not already_exists then update public.customer_communications set image_path=p_image_path where id=(result->>'communicationId')::uuid and workspace_id=w; end if;
 return result;
end $$;
revoke all on function public.save_owner_customer_popup_v2(text,text,jsonb,boolean,text,timestamp,timestamp,text) from public;
grant execute on function public.save_owner_customer_popup_v2(text,text,jsonb,boolean,text,timestamp,timestamp,text) to authenticated;

create function public.get_public_customer_communications_page_v2(
 p_salon_code text,p_customer_email citext default null,p_customer_phone text default null,
 p_before_created_at timestamptz default null,p_before_communication_id uuid default null,p_limit integer default 100
) returns table(communication_id uuid,kind text,title text,body text,appointment_id text,created_at timestamptz,read_at timestamptz,image_path text)
language sql security definer set search_path=public as $$
 select r.*,c.image_path from public.get_public_customer_communications_page_v1(p_salon_code,p_customer_email,p_customer_phone,p_before_created_at,p_before_communication_id,p_limit) r
 join public.customer_communications c on c.id=r.communication_id order by r.created_at desc,r.communication_id desc;
$$;
revoke all on function public.get_public_customer_communications_page_v2(text,citext,text,timestamptz,uuid,integer) from public;
grant execute on function public.get_public_customer_communications_page_v2(text,citext,text,timestamptz,uuid,integer) to anon,authenticated;
create function public.claim_public_customer_daily_reminder_v2(p_salon_code text,p_customer_email citext default null,p_customer_phone text default null)
returns table(communication_id uuid,title text,body text,ends_at timestamptz,image_path text)
language sql security definer set search_path=public as $$
 select r.*,c.image_path from public.claim_public_customer_daily_reminder(p_salon_code,p_customer_email,p_customer_phone) r
 join public.customer_communications c on c.id=r.communication_id;
$$;
revoke all on function public.claim_public_customer_daily_reminder_v2(text,citext,text) from public;
grant execute on function public.claim_public_customer_daily_reminder_v2(text,citext,text) to anon,authenticated;
create or replace function public.dispatch_due_customer_communications() returns integer
language plpgsql security definer set search_path=public as $$
declare j record; result jsonb; dispatched integer := 0;
begin
  for j in select * from public.scheduled_customer_communications
    where status='pending' and scheduled_at <= now() order by scheduled_at limit 50 for update skip locked
  loop
    begin
      result := public.dispatch_scheduled_customer_communication_internal(j.workspace_id,j.created_by,j.title,j.body,j.targets,'custom',null);
      update public.customer_communications set image_path=j.image_path, reminder_starts_at=j.reminder_starts_at,
        reminder_ends_at=j.reminder_ends_at, reminder_title=j.reminder_title, reminder_body=j.reminder_body where id=(result->>'communicationId')::uuid;
      update public.scheduled_customer_communications set status='sent',communication_id=(result->>'communicationId')::uuid,last_error=null where id=j.id;
      dispatched := dispatched+1;
    exception when others then
      update public.scheduled_customer_communications set status='failed',last_error=sqlstate where id=j.id;
    end;
  end loop;
  return dispatched;
end $$;
revoke all on function public.dispatch_due_customer_communications() from public, anon, authenticated;



notify pgrst, 'reload schema';
