alter table public.customer_communication_recipients
  add column if not exists read_at timestamptz;

create index if not exists customer_communication_recipients_customer_read_idx
  on public.customer_communication_recipients (customer_id, read_at, created_at desc);

create or replace function public.get_public_customer_communications(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns table (
  communication_id uuid,
  kind text,
  title text,
  body text,
  appointment_id text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select
    communication.id as communication_id,
    communication.kind,
    communication.title,
    communication.body,
    communication.appointment_id,
    communication.created_at,
    recipient.read_at
  from public.customer_communication_recipients as recipient
  join public.customer_communications as communication
    on communication.id = recipient.communication_id
  join public.customers as customer
    on customer.id = recipient.customer_id
  where communication.workspace_id = v_workspace_id
    and customer.workspace_id = v_workspace_id
    and (
      v_customer_email is null
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
    and (
      v_customer_phone is null
      or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
    )
  order by communication.created_at desc
  limit 100;
end;
$$;

create or replace function public.mark_public_customer_communication_read(
  p_communication_id uuid,
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_updated_count integer := 0;
begin
  if p_communication_id is null or (v_customer_email is null and v_customer_phone is null) then
    return false;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return false;
  end if;

  update public.customer_communication_recipients as recipient
  set read_at = coalesce(recipient.read_at, timezone('utc', now()))
  from public.customer_communications as communication,
       public.customers as customer
  where recipient.communication_id = p_communication_id
    and communication.id = recipient.communication_id
    and communication.workspace_id = v_workspace_id
    and customer.id = recipient.customer_id
    and customer.workspace_id = v_workspace_id
    and (
      v_customer_email is null
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
    and (
      v_customer_phone is null
      or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
    );

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

revoke all on function public.get_public_customer_communications(text, citext, text) from public;
revoke all on function public.mark_public_customer_communication_read(uuid, text, citext, text) from public;

grant execute on function public.get_public_customer_communications(text, citext, text) to anon;
grant execute on function public.get_public_customer_communications(text, citext, text) to authenticated;
grant execute on function public.mark_public_customer_communication_read(uuid, text, citext, text) to anon;
grant execute on function public.mark_public_customer_communication_read(uuid, text, citext, text) to authenticated;

notify pgrst, 'reload schema';
