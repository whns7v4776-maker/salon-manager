create table if not exists public.customer_communications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null default 'custom'
    check (kind in ('custom', 'late_reminder')),
  title text not null,
  body text not null,
  appointment_id text,
  requested_count integer not null default 0 check (requested_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  queued_count integer not null default 0 check (queued_count >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists customer_communications_workspace_created_idx
  on public.customer_communications (workspace_id, created_at desc);

create table if not exists public.customer_communication_recipients (
  id uuid primary key default gen_random_uuid(),
  communication_id uuid not null
    references public.customer_communications(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  device_id uuid references public.push_devices(id) on delete set null,
  delivery_status text not null
    check (delivery_status in ('queued', 'unavailable')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (communication_id, customer_id)
);

create index if not exists customer_communication_recipients_communication_idx
  on public.customer_communication_recipients (communication_id, delivery_status);

alter table public.customer_communications enable row level security;
alter table public.customer_communication_recipients enable row level security;

drop policy if exists customer_communications_owner_select
  on public.customer_communications;
create policy customer_communications_owner_select
on public.customer_communications
for select
using (workspace_id = public.current_workspace_id());

drop policy if exists customer_communication_recipients_owner_select
  on public.customer_communication_recipients;
create policy customer_communication_recipients_owner_select
on public.customer_communication_recipients
for select
using (
  exists (
    select 1
    from public.customer_communications as communication
    where communication.id = communication_id
      and communication.workspace_id = public.current_workspace_id()
  )
);

create or replace function public.send_owner_customer_communication(
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
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();
  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_not_allowed';
  end if;

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
    auth.uid()
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

revoke all on function public.send_owner_customer_communication(text, text, jsonb, text, text)
  from public;
grant execute on function public.send_owner_customer_communication(text, text, jsonb, text, text)
  to authenticated;

grant select on public.customer_communications to authenticated;
grant select on public.customer_communication_recipients to authenticated;
