create or replace function public.get_public_slot_waitlist_entries(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_appointment_date date default null,
  p_requested_service_name text default null
)
returns setof public.booking_slot_waitlist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return;
  end if;

  return query
  select waitlist.*
  from public.booking_slot_waitlist as waitlist
  where waitlist.workspace_id = v_workspace_id
    and waitlist.status = 'waiting'
    and (p_appointment_date is null or waitlist.appointment_date = p_appointment_date)
    and (
      p_requested_service_name is null
      or lower(trim(waitlist.requested_service_name)) = lower(trim(p_requested_service_name))
    )
    and (
      (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
  order by waitlist.created_at asc;
end;
$$;
