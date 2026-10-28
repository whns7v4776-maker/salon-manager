create index if not exists customer_communications_workspace_created_id_idx
  on public.customer_communications (workspace_id, created_at desc, id desc);

create or replace function public.get_public_customer_communications_page_v1(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_before_created_at timestamptz default null,
  p_before_communication_id uuid default null,
  p_limit integer default 100
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
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_customer_email is null and v_customer_phone is null then
    return;
  end if;

  if (p_before_created_at is null) <> (p_before_communication_id is null) then
    raise exception using
      errcode = '22023',
      message = 'invalid_public_customer_communications_cursor';
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
  with candidate_communications as (
    select
      communication.id as communication_id,
      communication.kind,
      communication.title,
      communication.body,
      communication.appointment_id,
      communication.created_at
    from public.customer_communications as communication
    where communication.workspace_id = v_workspace_id
      and (
        p_before_created_at is null
        or (communication.created_at, communication.id) <
          (p_before_created_at, p_before_communication_id)
      )
      and exists (
        select 1
        from public.customer_communication_recipients as recipient
        join public.customers as customer
          on customer.id = recipient.customer_id
        where recipient.communication_id = communication.id
          and customer.workspace_id = v_workspace_id
          and (
            v_customer_email is null
            or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
          )
          and (
            v_customer_phone is null
            or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
              v_customer_phone
          )
      )
    order by communication.created_at desc, communication.id desc
    limit v_limit
  )
  select
    candidate.communication_id,
    candidate.kind,
    candidate.title,
    candidate.body,
    candidate.appointment_id,
    candidate.created_at,
    recipient_state.read_at
  from candidate_communications as candidate
  cross join lateral (
    select
      case
        when count(*) filter (where recipient.read_at is null) > 0
          then null::timestamptz
        else max(recipient.read_at)
      end as read_at
    from public.customer_communication_recipients as recipient
    join public.customers as customer
      on customer.id = recipient.customer_id
    where recipient.communication_id = candidate.communication_id
      and customer.workspace_id = v_workspace_id
      and (
        v_customer_email is null
        or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
      and (
        v_customer_phone is null
        or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
          v_customer_phone
      )
  ) as recipient_state
  order by candidate.created_at desc, candidate.communication_id desc;
end;
$$;

create or replace function public.get_public_customer_unread_communication_count_v1(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext :=
    nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_unread_count bigint := 0;
begin
  if v_customer_email is null and v_customer_phone is null then
    return 0;
  end if;

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  select count(distinct communication.id)
  into v_unread_count
  from public.customer_communication_recipients as recipient
  join public.customer_communications as communication
    on communication.id = recipient.communication_id
  join public.customers as customer
    on customer.id = recipient.customer_id
  where communication.workspace_id = v_workspace_id
    and customer.workspace_id = v_workspace_id
    and recipient.read_at is null
    and (
      v_customer_email is null
      or lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
    )
    and (
      v_customer_phone is null
      or right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) =
        v_customer_phone
    );

  return coalesce(v_unread_count, 0);
end;
$$;

revoke all on function public.get_public_customer_communications_page_v1(
  text,
  citext,
  text,
  timestamptz,
  uuid,
  integer
) from public;

grant execute on function public.get_public_customer_communications_page_v1(
  text,
  citext,
  text,
  timestamptz,
  uuid,
  integer
) to anon, authenticated, service_role;

revoke all on function public.get_public_customer_unread_communication_count_v1(
  text,
  citext,
  text
) from public;

grant execute on function public.get_public_customer_unread_communication_count_v1(
  text,
  citext,
  text
) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
