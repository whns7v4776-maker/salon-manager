create or replace function public.mark_public_booking_requests_viewed(
  p_salon_code text,
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
  v_updated_count integer := 0;
begin
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), '');

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
  limit 1;

  if v_workspace_id is null then
    return 0;
  end if;

  update public.booking_requests as booking_request
  set
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where booking_request.workspace_id = v_workspace_id
    and booking_request.status <> 'pending'
    and booking_request.viewed_by_customer = false
    and (
      (v_customer_email is not null and lower(trim(booking_request.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(booking_request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count > 0 then
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  end if;

  return v_updated_count;
end;
$$;

grant execute on function public.mark_public_booking_requests_viewed(text, citext, text) to anon;
grant execute on function public.mark_public_booking_requests_viewed(text, citext, text) to authenticated;
