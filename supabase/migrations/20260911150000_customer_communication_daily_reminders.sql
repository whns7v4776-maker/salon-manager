-- Optional reminder interval. Existing clients and the original send RPC remain compatible.
alter table public.customer_communications
  add column if not exists reminder_starts_at timestamptz,
  add column if not exists reminder_ends_at timestamptz,
  add column if not exists send_request_key text;
alter table public.customer_communications add constraint communication_reminder_interval_valid
  check ((reminder_starts_at is null and reminder_ends_at is null) or
    (reminder_starts_at is not null and reminder_ends_at is not null and reminder_ends_at > reminder_starts_at));
create unique index customer_communication_send_request_idx
  on public.customer_communications(workspace_id, send_request_key) where send_request_key is not null;
create index customer_communication_active_reminder_idx
  on public.customer_communications(workspace_id, reminder_ends_at) where reminder_starts_at is not null;

create table public.customer_communication_reminder_days (
  communication_id uuid not null references public.customer_communications(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  shown_day date not null,
  shown_at timestamptz not null default now(),
  primary key (communication_id, customer_id, shown_day)
);
alter table public.customer_communication_reminder_days enable row level security;
revoke all on public.customer_communication_reminder_days from anon, authenticated;

create table public.scheduled_customer_communications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  title text not null, body text not null, targets jsonb not null,
  scheduled_at timestamptz not null, reminder_starts_at timestamptz, reminder_ends_at timestamptz,
  request_key text not null, status text not null default 'pending' check(status in ('pending','sent','cancelled','failed')),
  communication_id uuid references public.customer_communications(id) on delete set null,
  created_at timestamptz not null default now(), last_error text,
  unique(workspace_id, request_key)
);
alter table public.scheduled_customer_communications enable row level security;
create policy scheduled_communications_owner_read on public.scheduled_customer_communications
  for select to authenticated using(workspace_id=public.current_workspace_id());
grant select on public.scheduled_customer_communications to authenticated;
create index scheduled_communications_due_idx on public.scheduled_customer_communications(scheduled_at) where status='pending';

create function public.send_owner_customer_communication_v2(
  p_title text, p_body text, p_targets jsonb, p_request_key text,
  p_starts_local timestamp default null, p_ends_local timestamp default null, p_send_local timestamp default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_workspace uuid := public.current_workspace_id();
  v_existing public.customer_communications%rowtype;
  v_result jsonb;
  v_job public.scheduled_customer_communications%rowtype;
  v_send timestamptz := p_send_local at time zone 'Europe/Rome';
  v_start timestamptz := p_starts_local at time zone 'Europe/Rome';
  v_end timestamptz := p_ends_local at time zone 'Europe/Rome';
begin
  if auth.uid() is null or v_workspace is null or not public.workspace_access_allowed() then
    raise exception 'workspace_not_allowed';
  end if;
  if p_request_key is null or length(p_request_key) not between 8 and 128 then
    raise exception 'invalid_send_request_key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace::text || ':' || p_request_key, 0));
  select * into v_existing from public.customer_communications
    where workspace_id = v_workspace and send_request_key = p_request_key;
  if found then
    return jsonb_build_object('communicationId', v_existing.id,
      'requestedCount', v_existing.requested_count, 'matchedCount', v_existing.matched_count,
      'queuedCount', v_existing.queued_count,
      'unavailableCount', greatest(v_existing.requested_count - v_existing.queued_count, 0));
  end if;
  select * into v_job from public.scheduled_customer_communications
    where workspace_id=v_workspace and request_key=p_request_key;
  if found then return jsonb_build_object('communicationId',v_job.id,'scheduled',true,'matchedCount',jsonb_array_length(v_job.targets),'queuedCount',0); end if;
  if (v_start is null) <> (v_end is null) or
    (v_start is not null and (v_end <= v_start or v_end <= now())) then
    raise exception 'invalid_reminder_period';
  end if;
  if v_send is not null then
    if v_send <= now() or (v_start is not null and v_start < v_send) then raise exception 'invalid_scheduled_send'; end if;
    if length(trim(p_title)) not between 2 and 80 or length(trim(p_body)) not between 2 and 500
      or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) not between 1 and 500 then
      raise exception 'invalid_communication';
    end if;
    insert into public.scheduled_customer_communications(workspace_id,created_by,title,body,targets,scheduled_at,reminder_starts_at,reminder_ends_at,request_key)
    values(v_workspace,auth.uid(),trim(p_title),trim(p_body),p_targets,v_send,v_start,v_end,p_request_key) returning * into v_job;
    return jsonb_build_object('communicationId',v_job.id,'scheduled',true,'matchedCount',jsonb_array_length(p_targets),'queuedCount',0);
  end if;
  v_result := public.send_owner_customer_communication(p_title, p_body, p_targets, 'custom', null);
  update public.customer_communications set reminder_starts_at = v_start,
    reminder_ends_at = v_end, send_request_key = p_request_key
    where id = (v_result->>'communicationId')::uuid;
  return v_result;
end $$;
revoke all on function public.send_owner_customer_communication_v2(text,text,jsonb,text,timestamp,timestamp,timestamp) from public;
grant execute on function public.send_owner_customer_communication_v2(text,text,jsonb,text,timestamp,timestamp,timestamp) to authenticated;

-- Same salon + customer identity boundary as communication history. Claim one at a time;
-- the unique day record makes concurrent devices/reopens unable to claim it twice.
create function public.claim_public_customer_daily_reminder(
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
    select distinct c.id, c.title, c.body, c.reminder_ends_at, c.created_at
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

create or replace function public.dispatch_scheduled_customer_communication_internal(
  p_workspace_id uuid,
  p_created_by uuid,
  p_title text,
  p_body text,
  p_targets jsonb,
  p_kind text default 'custom',
  p_appointment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_communication_id uuid;
  v_title text := trim(coalesce(p_title, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_kind text := lower(trim(coalesce(p_kind, 'custom')));
  v_requested_count integer := 0;
  v_matched_count integer := 0;
  v_queued_count integer := 0;
begin
  v_workspace_id := p_workspace_id;

  if v_kind not in ('custom', 'late_reminder') then
    raise exception 'invalid_communication_kind';
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 80 then
    raise exception 'invalid_communication_title';
  end if;

  if char_length(v_body) < 2 or char_length(v_body) > 500 then
    raise exception 'invalid_communication_body';
  end if;

  if jsonb_typeof(coalesce(p_targets, '[]'::jsonb)) <> 'array' then
    raise exception 'invalid_communication_targets';
  end if;

  v_requested_count := jsonb_array_length(coalesce(p_targets, '[]'::jsonb));
  if v_requested_count < 1 or v_requested_count > 500 then
    raise exception 'invalid_communication_target_count';
  end if;

  insert into public.customer_communications (
    workspace_id,
    kind,
    title,
    body,
    appointment_id,
    requested_count,
    created_by
  )
  values (
    v_workspace_id,
    v_kind,
    v_title,
    v_body,
    nullif(trim(coalesce(p_appointment_id, '')), ''),
    v_requested_count,
    p_created_by
  )
  returning id into v_communication_id;

  with raw_targets as (
    select
      nullif(trim(target ->> 'id'), '') as customer_id_text,
      nullif(lower(trim(target ->> 'email')), '')::citext as customer_email,
      nullif(right(regexp_replace(coalesce(target ->> 'phone', ''), '\D+', '', 'g'), 10), '') as customer_phone
    from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) as target
  ),
  matched_customers as (
    select distinct on (customer.id)
      customer.id,
      customer.email,
      customer.phone
    from raw_targets as target
    join public.customers as customer
      on customer.workspace_id = v_workspace_id
      and (
        (
          target.customer_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          and customer.id = target.customer_id_text::uuid
        )
        or (
          target.customer_email is not null
          and lower(trim(coalesce(customer.email::text, ''))) = target.customer_email::text
        )
        or (
          target.customer_phone is not null
          and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = target.customer_phone
        )
      )
    order by customer.id, customer.updated_at desc nulls last
  ),
  recipients as (
    select
      customer.id as customer_id,
      device.id as device_id
    from matched_customers as customer
    left join lateral (
      select candidate.id
      from public.push_devices as candidate
      where candidate.workspace_id = v_workspace_id
        and candidate.recipient_kind = 'client'
        and candidate.is_active = true
        and nullif(trim(coalesce(candidate.expo_push_token, '')), '') is not null
        and (
          (
            customer.email is not null
            and lower(trim(coalesce(candidate.customer_email::text, ''))) =
              lower(trim(customer.email::text))
          )
          or (
            nullif(right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10), '') is not null
            and right(regexp_replace(coalesce(candidate.customer_phone, ''), '\D+', '', 'g'), 10) =
              right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10)
          )
        )
      order by candidate.last_seen_at desc nulls last,
        candidate.updated_at desc nulls last,
        candidate.created_at desc nulls last
      limit 1
    ) as device on true
  )
  insert into public.customer_communication_recipients (
    communication_id,
    customer_id,
    device_id,
    delivery_status
  )
  select
    v_communication_id,
    recipient.customer_id,
    recipient.device_id,
    case when recipient.device_id is null then 'unavailable' else 'queued' end
  from recipients as recipient;

  select
    count(*),
    count(*) filter (where recipient.delivery_status = 'queued')
  into v_matched_count, v_queued_count
  from public.customer_communication_recipients as recipient
  where recipient.communication_id = v_communication_id;

  insert into public.push_notifications (
    workspace_id,
    device_id,
    event_type,
    title,
    body,
    payload,
    status
  )
  select
    v_workspace_id,
    recipient.device_id,
    'custom'::public.push_event_type,
    v_title,
    v_body,
    jsonb_strip_nulls(
      jsonb_build_object(
        'type', 'customer_communication',
        'notificationType', v_kind,
        'communicationId', v_communication_id,
        'appointmentId', nullif(trim(coalesce(p_appointment_id, '')), ''),
        '_pushTarget', 'client',
        '_pushAudience', 'public'
      )
    ),
    'queued'::public.push_delivery_status
  from public.customer_communication_recipients as recipient
  where recipient.communication_id = v_communication_id
    and recipient.device_id is not null;

  update public.customer_communications
  set matched_count = v_matched_count,
      queued_count = v_queued_count
  where id = v_communication_id;

  return jsonb_build_object(
    'communicationId', v_communication_id,
    'requestedCount', v_requested_count,
    'matchedCount', v_matched_count,
    'queuedCount', v_queued_count,
    'unavailableCount', greatest(v_requested_count - v_queued_count, 0)
  );
end;
$$;


revoke all on function public.dispatch_scheduled_customer_communication_internal(uuid,uuid,text,text,jsonb,text,text) from public, anon, authenticated;

create function public.dispatch_due_customer_communications() returns integer
language plpgsql security definer set search_path=public as $$
declare j record; result jsonb; dispatched integer := 0;
begin
  for j in select * from public.scheduled_customer_communications
    where status='pending' and scheduled_at <= now() order by scheduled_at limit 50 for update skip locked
  loop
    begin
      result := public.dispatch_scheduled_customer_communication_internal(j.workspace_id,j.created_by,j.title,j.body,j.targets,'custom',null);
      update public.customer_communications set reminder_starts_at=j.reminder_starts_at,
        reminder_ends_at=j.reminder_ends_at where id=(result->>'communicationId')::uuid;
      update public.scheduled_customer_communications set status='sent',communication_id=(result->>'communicationId')::uuid,last_error=null where id=j.id;
      dispatched := dispatched+1;
    exception when others then
      update public.scheduled_customer_communications set status='failed',last_error=sqlstate where id=j.id;
    end;
  end loop;
  return dispatched;
end $$;
revoke all on function public.dispatch_due_customer_communications() from public, anon, authenticated;

create function public.cancel_scheduled_customer_communication(p_id uuid) returns boolean
language plpgsql security definer set search_path=public as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  update public.scheduled_customer_communications set status='cancelled'
    where id=p_id and workspace_id=public.current_workspace_id() and status in ('pending','failed');
  get diagnostics n=row_count;
  return n>0;
end $$;
revoke all on function public.cancel_scheduled_customer_communication(uuid) from public;
grant execute on function public.cancel_scheduled_customer_communication(uuid) to authenticated;
select cron.schedule('dispatch-customer-communications-every-minute','* * * * *','select public.dispatch_due_customer_communications()');
notify pgrst, 'reload schema';
