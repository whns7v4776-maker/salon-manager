-- The dedicated phase organizer edits the complete appointment snapshot in
-- one transaction: timing/operator layout, per-card duration, pose and price.

create or replace function public.apply_owner_linked_reorganization_v4(
  p_anchor_appointment_id uuid,
  p_items jsonb,
  p_allow_operator_overlap boolean default false,
  p_allow_customer_overlap boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor public.appointments%rowtype;
  v_item jsonb;
  v_item_id uuid;
  v_duration integer;
  v_price numeric(10, 2);
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if p_anchor_appointment_id is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'invalid_reorganization_plan';
  end if;

  select appointment.*
  into v_anchor
  from public.appointments as appointment
  join public.workspace_members as member
    on member.workspace_id = appointment.workspace_id
   and member.user_id = auth.uid()
  where appointment.id = p_anchor_appointment_id
  for update;
  if v_anchor.id is null then
    raise exception 'appointment_not_found';
  end if;

  perform 1
  from public.appointments as appointment
  where appointment.workspace_id = v_anchor.workspace_id
    and (
      (v_anchor.appointment_group_id is not null
        and appointment.appointment_group_id = v_anchor.appointment_group_id)
      or (v_anchor.appointment_group_id is null and appointment.id = v_anchor.id)
    )
  order by appointment.id
  for update;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_id := nullif(v_item ->> 'appointmentId', '')::uuid;
    if v_item_id is null then
      raise exception 'invalid_reorganization_item';
    end if;

    if v_item ? 'durationMinutes' then
      v_duration := (v_item ->> 'durationMinutes')::integer;
      if v_duration < 5 or v_duration > 720 or v_duration % 5 <> 0 then
        raise exception 'invalid_appointment_duration';
      end if;
    else
      v_duration := null;
    end if;

    if v_item ? 'priceValue' then
      v_price := round((v_item ->> 'priceValue')::numeric, 2);
      if v_price < 0 or v_price > 9999 then
        raise exception 'invalid_appointment_price';
      end if;
    else
      v_price := null;
    end if;

    update public.appointments as appointment
    set duration_minutes = coalesce(v_duration, appointment.duration_minutes),
        price = coalesce(v_price, appointment.price),
        updated_at = timezone('utc', now())
    where appointment.id = v_item_id
      and appointment.workspace_id = v_anchor.workspace_id
      and (
        (v_anchor.appointment_group_id is not null
          and appointment.appointment_group_id = v_anchor.appointment_group_id)
        or (v_anchor.appointment_group_id is null and appointment.id = v_anchor.id)
      );
    if not found then
      raise exception 'unexpected_linked_reorganization_item';
    end if;

    update public.booking_requests as request
    set requested_duration_minutes = coalesce(
          v_duration,
          request.requested_duration_minutes
        ),
        requested_price = coalesce(v_price, request.requested_price),
        viewed_by_customer = false,
        updated_at = timezone('utc', now())
    from public.appointments as appointment
    where appointment.id = v_item_id
      and request.id = appointment.booking_request_id;
  end loop;

  -- Any overlap or completeness failure rolls every edit above back together.
  return public.apply_owner_linked_reorganization_v3(
    p_anchor_appointment_id,
    p_items,
    p_allow_operator_overlap,
    p_allow_customer_overlap
  );
end;
$$;

revoke all on function public.apply_owner_linked_reorganization_v4(
  uuid, jsonb, boolean, boolean
) from public;
grant execute on function public.apply_owner_linked_reorganization_v4(
  uuid, jsonb, boolean, boolean
) to authenticated;

notify pgrst, 'reload schema';
