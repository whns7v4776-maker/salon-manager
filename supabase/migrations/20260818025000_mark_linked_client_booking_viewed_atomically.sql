-- A linked booking is one customer notification even though Agenda stores one
-- request row per phase. Reading its representative request must therefore
-- mark every phase in the same appointment group as viewed.

create or replace function public.mark_public_booking_requests_viewed_by_ids(
  p_salon_code text,
  p_customer_email citext default null,
  p_customer_phone text default null,
  p_request_ids uuid[] default '{}'
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

  if p_request_ids is null or cardinality(p_request_ids) = 0 then
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

  with requested_groups as (
    select distinct request.appointment_group_id
    from public.booking_requests as request
    where request.workspace_id = v_workspace_id
      and request.id = any(p_request_ids)
      and request.appointment_group_id is not null
      and (
        (v_customer_email is not null and lower(trim(request.customer_email::text)) = v_customer_email::text)
        or (
          v_customer_phone is not null
          and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
        )
      )
  )
  update public.booking_requests as request
  set
    viewed_by_customer = true,
    updated_at = timezone('utc', now())
  where request.workspace_id = v_workspace_id
    and request.status <> 'pending'
    and request.viewed_by_customer = false
    and (
      request.id = any(p_request_ids)
      or request.appointment_group_id in (select appointment_group_id from requested_groups)
    )
    and (
      (v_customer_email is not null and lower(trim(request.customer_email::text)) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g') = v_customer_phone
      )
    );

  get diagnostics v_updated_count = row_count;

  if v_updated_count > 0 then
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  end if;

  return v_updated_count;
end;
$$;

revoke all on function public.mark_public_booking_requests_viewed_by_ids(
  text, citext, text, uuid[]
) from public;
grant execute on function public.mark_public_booking_requests_viewed_by_ids(
  text, citext, text, uuid[]
) to anon, authenticated;

notify pgrst, 'reload schema';
