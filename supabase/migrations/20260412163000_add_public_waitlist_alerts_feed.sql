create or replace function public.get_public_customer_waitlist_alerts(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null
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
    and waitlist.status in ('waiting', 'notified', 'expired')
    and (
      (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    )
  order by coalesce(waitlist.notified_at, waitlist.updated_at, waitlist.created_at) desc;
end;
$$;

grant execute on function public.get_public_customer_waitlist_alerts(
  text,
  citext,
  text
) to anon;

grant execute on function public.get_public_customer_waitlist_alerts(
  text,
  citext,
  text
) to authenticated;
