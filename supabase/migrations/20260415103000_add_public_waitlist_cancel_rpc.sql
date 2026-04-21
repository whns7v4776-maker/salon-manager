create or replace function public.cancel_public_slot_waitlist_alerts(
  p_salon_code text,
  p_waitlist_ids uuid[],
  p_customer_email citext default null,
  p_customer_phone text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_email citext;
  v_customer_phone text;
  v_cancelled_count integer := 0;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  if p_waitlist_ids is null or array_length(p_waitlist_ids, 1) is null then
    return 0;
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  update public.booking_slot_waitlist as waitlist
  set
    status = 'cancelled',
    expires_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  where waitlist.workspace_id = v_workspace_id
    and waitlist.id = any(p_waitlist_ids)
    and waitlist.status in ('waiting', 'notified', 'expired')
    and (
      (v_customer_email is not null and lower(trim(waitlist.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(waitlist.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    );

  get diagnostics v_cancelled_count = row_count;
  return coalesce(v_cancelled_count, 0);
end;
$$;

grant execute on function public.cancel_public_slot_waitlist_alerts(
  text,
  uuid[],
  citext,
  text
) to anon;

grant execute on function public.cancel_public_slot_waitlist_alerts(
  text,
  uuid[],
  citext,
  text
) to authenticated;
