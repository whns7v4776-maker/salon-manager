alter table public.customer_communications add column reminder_title text, add column reminder_body text;
alter table public.scheduled_customer_communications add column reminder_title text, add column reminder_body text;
alter table public.customer_communications add constraint reminder_text_valid check (
  (reminder_title is null and reminder_body is null) or
  (reminder_title is not null and reminder_body is not null and length(trim(reminder_title)) between 2 and 80 and length(trim(reminder_body)) between 2 and 500));
alter table public.scheduled_customer_communications add constraint scheduled_reminder_text_valid check (
  (reminder_title is null and reminder_body is null) or
  (reminder_title is not null and reminder_body is not null and length(trim(reminder_title)) between 2 and 80 and length(trim(reminder_body)) between 2 and 500));

create function public.send_owner_customer_communication_v3(
  p_title text, p_body text, p_targets jsonb, p_request_key text,
  p_starts_local timestamp default null, p_ends_local timestamp default null, p_send_local timestamp default null,
  p_reminder_title text default null, p_reminder_body text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_workspace uuid := public.current_workspace_id();
  v_result jsonb;
  v_exists boolean;
begin
  if auth.uid() is null or v_workspace is null or not public.workspace_access_allowed() then raise exception 'workspace_not_allowed'; end if;
  if p_request_key is null or length(p_request_key) not between 8 and 128 then raise exception 'invalid_send_request_key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || ':' || p_request_key,0));
  select exists(select 1 from public.customer_communications where workspace_id=v_workspace and send_request_key=p_request_key)
    or exists(select 1 from public.scheduled_customer_communications where workspace_id=v_workspace and request_key=p_request_key) into v_exists;
  if (p_reminder_title is null) <> (p_reminder_body is null) or
     (p_reminder_title is not null and (p_starts_local is null or length(trim(p_reminder_title)) not between 2 and 80 or length(trim(p_reminder_body)) not between 2 and 500)) then
    raise exception 'invalid_reminder_text';
  end if;
  v_result := public.send_owner_customer_communication_v2(p_title,p_body,p_targets,p_request_key,p_starts_local,p_ends_local,p_send_local);
  if not v_exists then
    if coalesce((v_result->>'scheduled')::boolean,false) then
      update public.scheduled_customer_communications set reminder_title=trim(p_reminder_title),reminder_body=trim(p_reminder_body) where id=(v_result->>'communicationId')::uuid and workspace_id=v_workspace;
    else
      update public.customer_communications set reminder_title=trim(p_reminder_title),reminder_body=trim(p_reminder_body) where id=(v_result->>'communicationId')::uuid and workspace_id=v_workspace;
    end if;
  end if;
  return v_result;
end $$;
revoke all on function public.send_owner_customer_communication_v3(text,text,jsonb,text,timestamp,timestamp,timestamp,text,text) from public;
grant execute on function public.send_owner_customer_communication_v3(text,text,jsonb,text,timestamp,timestamp,timestamp,text,text) to authenticated;

create or replace function public.claim_public_customer_daily_reminder(
  p_salon_code text, p_customer_email citext default null, p_customer_phone text default null
) returns table (communication_id uuid, title text, body text, ends_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_workspace uuid;
  v_email text := nullif(lower(trim(p_customer_email::text)), '');
  v_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone,''), '\D+', '', 'g'),10),'');
  v_today date := (now() at time zone 'Europe/Rome')::date;
  v_candidate record;
  v_claimed integer;
begin
  if v_email is null and v_phone is null then return; end if;
  select id into v_workspace from public.workspaces where slug = lower(trim(p_salon_code));
  if v_workspace is null then return; end if;
  -- Serialize the matching recipient set (also covers matching duplicate customer rows).
  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text, 731));
  for v_candidate in
    select distinct c.id, coalesce(c.reminder_title, c.title) as title, coalesce(c.reminder_body, c.body) as body, c.reminder_ends_at, c.created_at
    from public.customer_communications c
    join public.customer_communication_recipients r on r.communication_id=c.id
    join public.customers u on u.id=r.customer_id and u.workspace_id=v_workspace
    where c.workspace_id=v_workspace and c.kind='custom'
      and c.reminder_starts_at <= now() and c.reminder_ends_at > now()
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
      and not exists (select 1 from public.customer_communication_reminder_days d
        where d.communication_id=c.id and d.customer_id=u.id and d.shown_day=v_today)
    order by c.created_at, c.id
  loop
    insert into public.customer_communication_reminder_days(communication_id,customer_id,shown_day)
    select v_candidate.id, u.id, v_today
    from public.customer_communication_recipients r
    join public.customers u on u.id=r.customer_id and u.workspace_id=v_workspace
    where r.communication_id=v_candidate.id
      and (v_email is null or lower(trim(u.email::text))=v_email)
      and (v_phone is null or right(regexp_replace(coalesce(u.phone,''),'\D+','','g'),10)=v_phone)
    on conflict do nothing;
    get diagnostics v_claimed = row_count;
    if v_claimed > 0 then
      return query select v_candidate.id, v_candidate.title, v_candidate.body, v_candidate.reminder_ends_at;
      return;
    end if;
  end loop;
end $$;
revoke all on function public.claim_public_customer_daily_reminder(text,citext,text) from public;
grant execute on function public.claim_public_customer_daily_reminder(text,citext,text) to anon, authenticated;

create or replace function public.dispatch_due_customer_communications() returns integer
language plpgsql security definer set search_path=public as $$
declare j record; result jsonb; dispatched integer := 0;
begin
  for j in select * from public.scheduled_customer_communications
    where status='pending' and scheduled_at <= now() order by scheduled_at limit 50 for update skip locked
  loop
    begin
      result := public.dispatch_scheduled_customer_communication_internal(j.workspace_id,j.created_by,j.title,j.body,j.targets,'custom',null);
      update public.customer_communications set reminder_starts_at=j.reminder_starts_at,
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
