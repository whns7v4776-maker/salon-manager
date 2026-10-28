-- A short owner replacement window; public customer cancellations stay immediate.
create table if not exists public.owner_slot_release_holds (
 source_key text primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
 appointment_date date not null, appointment_time time not null, duration_minutes integer not null,
 service_name text, operator_id text, operator_name text, phase_snapshot jsonb,
 release_at timestamptz not null default (clock_timestamp()+interval '60 seconds')
);
alter table public.owner_slot_release_holds enable row level security;
revoke all on public.owner_slot_release_holds from public,anon,authenticated;
create index if not exists owner_slot_release_holds_lookup on public.owner_slot_release_holds(workspace_id,appointment_date,release_at);

create or replace function public.hold_owner_released_slot_v1()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_old jsonb := to_jsonb(OLD); v_new jsonb; v_duration integer;
begin
 if current_setting('salonpro.customer_slot_release',true)='on'
    or (coalesce(current_setting('salonpro.owner_unrestricted',true),'')<>'on'
      and not exists(select 1 from public.workspace_members where workspace_id=(v_old->>'workspace_id')::uuid and user_id=auth.uid())) then
   if TG_OP='DELETE' then return OLD; else return NEW; end if;
 end if;
 if TG_TABLE_NAME='booking_requests' then
   v_new:=to_jsonb(NEW);
   if coalesce(v_old->>'status','') not in ('pending','accepted') or coalesce(v_new->>'status','') not in ('cancelled','rejected') then return NEW; end if;
 end if;
 v_duration:=greatest(coalesce((v_old->>'duration_minutes')::integer,(v_old->>'requested_duration_minutes')::integer,1),1);
 if ((v_old->>'appointment_date')::date + (v_old->>'appointment_time')::time + make_interval(mins=>v_duration)) > (clock_timestamp() at time zone 'Europe/Rome') then
   insert into public.owner_slot_release_holds(source_key,workspace_id,appointment_date,appointment_time,duration_minutes,service_name,operator_id,operator_name,phase_snapshot)
   values(TG_TABLE_NAME||':'||(v_old->>'id'),(v_old->>'workspace_id')::uuid,(v_old->>'appointment_date')::date,(v_old->>'appointment_time')::time,v_duration,
     coalesce(v_old->>'service_name',v_old->>'requested_service_name'),coalesce(v_old->>'operator_id',v_old->>'requested_operator_id'),coalesce(v_old->>'operator_name',v_old->>'requested_operator_name'),v_old->'phase_snapshot')
   on conflict(source_key) do nothing;
 end if;
 if TG_OP='DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function public.hold_owner_released_slot_v1() from public,anon,authenticated;
create trigger owner_slot_release_hold before delete on public.appointments for each row execute function public.hold_owner_released_slot_v1();
create trigger owner_request_release_hold before update of status on public.booking_requests for each row execute function public.hold_owner_released_slot_v1();
CREATE OR REPLACE FUNCTION public.is_public_booking_slot_available(p_workspace_id uuid, p_appointment_date date, p_appointment_time time without time zone, p_requested_duration_minutes integer, p_requested_service_name text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_owner_payload jsonb := '{}'::jsonb; v_services jsonb := '[]'::jsonb; v_operators jsonb := '[]'::jsonb; v_requested_start_at timestamp; v_requested_end_at timestamp; v_requested_service_name text := trim(coalesce(p_requested_service_name, '')); v_requested_operator_id text := nullif(trim(coalesce(p_requested_operator_id, '')), ''); v_requested_operator_name text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), ''); v_requested_role text := ''; v_requested_machinery_ids text[] := array[]::text[]; v_requested_uses_operator boolean := false; v_eligible_operator_keys text[] := array[]::text[]; v_eligible_operator_count integer := 0; v_busy_operator_keys text[] := array[]::text[]; v_busy_operator_count integer := 0; v_overlapping_record record; v_existing_role text; v_existing_machinery_ids text[]; v_existing_operator_id text; v_existing_operator_name text; v_existing_operator_key text; begin if (v_requested_operator_id is not null or v_requested_operator_name is not null)
    and not public.is_public_operator_available_on_date_v1(
      p_workspace_id,
      v_requested_operator_id,
      v_requested_operator_name,
      p_appointment_date
    )
  then
    return false;
  end if;

  v_owner_payload := public.get_public_portal_owner_payload_cached_v1(p_workspace_id); v_services := coalesce(v_owner_payload -> 'servizi', '[]'::jsonb); v_operators := coalesce(v_owner_payload -> 'operatori', '[]'::jsonb); select coalesce( lower( regexp_replace( regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g' ) ), '' ), coalesce( array( select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', service_item -> 'machinery_ids', '[]'::jsonb))) ), array[]::text[] ) into v_requested_role, v_requested_machinery_ids from jsonb_array_elements(v_services) as service_item where lower(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', ''))) = lower(v_requested_service_name) limit 1; v_requested_uses_operator := v_requested_role <> ''; v_requested_start_at := p_appointment_date::timestamp + p_appointment_time; v_requested_end_at := p_appointment_date::timestamp + p_appointment_time + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1)); if not public.is_public_booking_time_allowed_by_availability( p_workspace_id, p_appointment_date, p_appointment_time, greatest(coalesce(p_requested_duration_minutes, 60), 1) ) then return false; end if;

  if not public.is_public_booking_calendar_exception_allowed(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_requested_operator_id,
    v_requested_operator_name
  ) then
    return false;
  end if;
 if v_requested_uses_operator and v_requested_operator_id is null and v_requested_operator_name is null then select coalesce(array_agg(operator_key), array[]::text[]) into v_eligible_operator_keys from ( select distinct case when nullif(trim(coalesce(operator_item ->> 'id', '')), '') is not null then 'id:' || nullif(trim(coalesce(operator_item ->> 'id', '')), '') else 'name:' || lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', ''))) end as operator_key from jsonb_array_elements(v_operators) as operator_item where coalesce( lower( regexp_replace( regexp_replace(trim(coalesce(operator_item ->> 'mestiere', operator_item ->> 'required_role', '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g' ) ), '' 
      ) = v_requested_role
        and public.is_public_booking_calendar_exception_allowed(
          p_workspace_id,
          p_appointment_date,
          p_appointment_time,
          greatest(coalesce(p_requested_duration_minutes, 60), 1),
          nullif(trim(coalesce(operator_item ->> 'id', '')), ''),
          nullif(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')), '')
        )
        and (
          operator_item -> 'availability' is null
 or ( ( jsonb_typeof(coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)) = 0 or exists ( select 1 from jsonb_array_elements_text( coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb) ) as weekday_value where weekday_value::integer = extract(dow from p_appointment_date)::integer ) ) and ( jsonb_typeof(coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)) = 0 or exists ( select 1 from jsonb_array_elements( coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb) ) as range_item where nullif(trim(coalesce(range_item ->> 'startDate', '')), '') is not null and trim(coalesce(range_item ->> 'startDate', '')) <= p_appointment_date::text and trim(coalesce(range_item ->> 'endDate', '')) >= p_appointment_date::text ) ) ) ) ) as eligible_operators; v_eligible_operator_count := coalesce(array_length(v_eligible_operator_keys, 1), 0); if v_eligible_operator_count = 0 then v_eligible_operator_keys := array['id:salon-capacity::' || v_requested_role]; v_eligible_operator_count := 1; end if; end if; for v_overlapping_record in select appointment.service_name as existing_service_name, appointment.operator_id as existing_operator_id, appointment.operator_name as existing_operator_name from public.appointments as appointment where appointment.workspace_id = p_workspace_id and appointment.appointment_date = p_appointment_date and appointment.id::text <> coalesce( nullif(current_setting('app.booking_exclude_appointment_id', true), ''), '__none__' ) and public.booking_busy_snapshot_overlaps_range( appointment.appointment_date, appointment.appointment_time, appointment.duration_minutes, appointment.phase_snapshot, v_requested_start_at, v_requested_end_at ) and not exists ( select 1 from public.booking_requests as terminal_request where terminal_request.workspace_id = p_workspace_id and terminal_request.status in ('cancelled', 'rejected') and terminal_request.appointment_date = appointment.appointment_date and terminal_request.appointment_time = appointment.appointment_time and lower(trim(coalesce(terminal_request.requested_service_name, ''))) = lower(trim(coalesce(appointment.service_name, ''))) and lower( trim( concat_ws( ' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '') ) ) ) = lower(trim(coalesce(appointment.customer_name, ''))) and not exists ( select 1 from public.booking_requests as newer_active_request where newer_active_request.workspace_id = terminal_request.workspace_id and newer_active_request.status in ('pending', 'accepted') and newer_active_request.appointment_date = terminal_request.appointment_date and newer_active_request.appointment_time = terminal_request.appointment_time and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) = lower(trim(coalesce(terminal_request.requested_service_name, ''))) and lower( trim( concat_ws( ' ', coalesce(newer_active_request.customer_name, ''), coalesce(newer_active_request.customer_surname, '') ) ) ) = lower( trim( concat_ws( ' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '') ) ) ) and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >= coalesce(terminal_request.updated_at, terminal_request.created_at) ) ) union all select coalesce(matched_appointment.service_name, booking_request.requested_service_name) as existing_service_name, coalesce(matched_appointment.operator_id, booking_request.requested_operator_id) as existing_operator_id, coalesce(matched_appointment.operator_name, booking_request.requested_operator_name) as existing_operator_name from public.booking_requests as booking_request left join lateral ( select appointment.service_name, appointment.operator_id, appointment.operator_name from public.appointments as appointment where appointment.workspace_id = booking_request.workspace_id and ( appointment.booking_request_id = booking_request.id or ( appointment.appointment_date = booking_request.appointment_date and appointment.appointment_time = booking_request.appointment_time and lower(trim(coalesce(appointment.service_name, ''))) = lower(trim(coalesce(booking_request.requested_service_name, ''))) and ( appointment.customer_id = booking_request.customer_id or lower(trim(coalesce(appointment.customer_name, ''))) = lower( trim( concat_ws( ' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '') ) ) ) ) ) ) order by case when appointment.booking_request_id = booking_request.id then 0 else 1 end limit 1 ) as matched_appointment on booking_request.status = 'accepted' where booking_request.workspace_id = p_workspace_id and booking_request.appointment_date = p_appointment_date and booking_request.status in ('pending', 'accepted') and booking_request.id::text <> coalesce( nullif(current_setting('app.booking_exclude_request_id', true), ''), '__none__' ) and public.booking_busy_snapshot_overlaps_range( booking_request.appointment_date, booking_request.appointment_time, booking_request.requested_duration_minutes, booking_request.phase_snapshot, v_requested_start_at, v_requested_end_at ) and ( booking_request.status <> 'accepted' or matched_appointment.service_name is not null ) and not exists ( select 1 from public.booking_requests as terminal_request where terminal_request.workspace_id = p_workspace_id and terminal_request.status in ('cancelled', 'rejected') and terminal_request.appointment_date = booking_request.appointment_date and terminal_request.appointment_time = booking_request.appointment_time and lower(trim(coalesce(terminal_request.requested_service_name, ''))) = lower(trim(coalesce(booking_request.requested_service_name, ''))) and lower( trim( concat_ws( ' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '') ) ) ) = lower( trim( concat_ws( ' ', coalesce(booking_request.customer_name, ''), coalesce(booking_request.customer_surname, '') ) ) ) and not exists ( select 1 from public.booking_requests as newer_active_request where newer_active_request.workspace_id = terminal_request.workspace_id and newer_active_request.status in ('pending', 'accepted') and newer_active_request.appointment_date = terminal_request.appointment_date and newer_active_request.appointment_time = terminal_request.appointment_time and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) = lower(trim(coalesce(terminal_request.requested_service_name, ''))) and lower( trim( concat_ws( ' ', coalesce(newer_active_request.customer_name, ''), coalesce(newer_active_request.customer_surname, '') ) ) ) = lower( trim( concat_ws( ' ', coalesce(terminal_request.customer_name, ''), coalesce(terminal_request.customer_surname, '') ) ) ) and coalesce(newer_active_request.updated_at, newer_active_request.created_at) >= coalesce(terminal_request.updated_at, terminal_request.created_at) ) ) union all select hold.service_name,hold.operator_id,hold.operator_name
 from public.owner_slot_release_holds hold
 where hold.workspace_id=p_workspace_id and hold.appointment_date=p_appointment_date
 and hold.release_at>clock_timestamp()
 and coalesce(current_setting('salonpro.owner_unrestricted',true),'')<>'on'
 and public.booking_busy_snapshot_overlaps_range(hold.appointment_date,hold.appointment_time,hold.duration_minutes,hold.phase_snapshot,v_requested_start_at,v_requested_end_at)
 loop select coalesce( lower( regexp_replace( regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g' ) ), '' ), coalesce( array( select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', service_item -> 'machinery_ids', '[]'::jsonb))) ), array[]::text[] ) into v_existing_role, v_existing_machinery_ids from jsonb_array_elements(v_services) as service_item where lower(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', ''))) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) limit 1; v_existing_operator_id := nullif(trim(coalesce(v_overlapping_record.existing_operator_id, '')), ''); v_existing_operator_name := nullif(lower(trim(coalesce(v_overlapping_record.existing_operator_name, ''))), ''); v_existing_operator_key := null; if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 and exists ( select 1 from unnest(v_requested_machinery_ids) as requested_machinery_id join unnest(coalesce(v_existing_machinery_ids, array[]::text[])) as existing_machinery_id on existing_machinery_id = requested_machinery_id ) then return false; end if; if v_requested_uses_operator and v_requested_operator_id is null and v_requested_operator_name is null then if coalesce(v_existing_role, '') <> v_requested_role then continue; end if; if v_existing_operator_id is not null then v_existing_operator_key := 'id:' || v_existing_operator_id; elsif v_existing_operator_name is not null then v_existing_operator_key := 'name:' || v_existing_operator_name; end if; if v_existing_operator_key is null or not (v_existing_operator_key = any(v_eligible_operator_keys)) then continue; end if; if not (v_existing_operator_key = any(v_busy_operator_keys)) then v_busy_operator_keys := array_append(v_busy_operator_keys, v_existing_operator_key); end if; v_busy_operator_count := coalesce(array_length(v_busy_operator_keys, 1), 0); if v_busy_operator_count >= v_eligible_operator_count then return false; end if; continue; end if; if v_requested_operator_id is null and v_requested_operator_name is null then if not v_requested_uses_operator and coalesce(v_existing_role, '') <> '' then continue; end if; if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then continue; end if; if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then if v_requested_role = v_existing_role then return false; end if; continue; end if; if (v_requested_role <> '' and coalesce(v_existing_role, '') = '') or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then continue; end if; if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then return false; end if; continue; end if; if v_existing_operator_id is null and v_existing_operator_name is null then if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then continue; end if; if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then if v_requested_role = v_existing_role then return false; end if; continue; end if; if (v_requested_role <> '' and coalesce(v_existing_role, '') = '') or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then continue; end if; if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then return false; end if; continue; end if; if v_existing_operator_id = v_requested_operator_id then return false; end if; if v_requested_operator_name is not null and v_existing_operator_name = v_requested_operator_name then return false; end if; end loop; return true; end; $function$
;
CREATE OR REPLACE FUNCTION public.cancel_public_booking_request_without_cutoff_v1(p_salon_code text, p_request_id uuid, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_request public.booking_requests%rowtype;
  v_previous_status public.request_status;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_full_name text;
  v_deleted_appointment_id uuid;
  v_date_label text;
  v_time_label text;
  v_operator_label text;
  v_role_label text;
  v_push_title text;
  v_push_body text;
  v_push_payload jsonb;
  v_detail_parts text[];
begin
  perform set_config('salonpro.customer_slot_release','on',true);
  v_customer_email := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone := nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');

  select workspace.id
  into v_workspace_id
  from public.workspaces as workspace
  where workspace.slug = lower(trim(coalesce(p_salon_code, '')))
    and (
      workspace.subscription_status in ('demo', 'active')
      or coalesce(workspace.is_internal_tester, false)
    )
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select request.*
  into v_request
  from public.booking_requests as request
  where request.workspace_id = v_workspace_id
    and request.id = p_request_id
    and (
      (
        v_customer_email is not null
        and lower(trim(coalesce(request.customer_email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(request.customer_phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  for update;

  if v_request.id is null then
    raise exception 'booking_request_not_found';
  end if;

  v_previous_status := v_request.status;
  v_customer_full_name := trim(
    concat_ws(' ', coalesce(v_request.customer_name, ''), coalesce(v_request.customer_surname, ''))
  );

  update public.booking_requests
  set status = 'cancelled'::public.request_status,
      cancellation_source = 'cliente',
      viewed_by_customer = true,
      viewed_by_salon = false,
      updated_at = timezone('utc', now())
  where id = v_request.id;

  perform set_config('salonpro.skip_appointment_delete_client_cancellation', 'on', true);

  delete from public.appointments as appointment
  where appointment.workspace_id = v_workspace_id
    and appointment.booking_request_id = v_request.id
  returning appointment.id into v_deleted_appointment_id;

  if v_deleted_appointment_id is null and v_previous_status = 'accepted'::public.request_status then
    delete from public.appointments as appointment
    where appointment.workspace_id = v_workspace_id
      and appointment.appointment_date = v_request.appointment_date
      and appointment.appointment_time = v_request.appointment_time
      and lower(trim(coalesce(appointment.service_name, ''))) =
        lower(trim(coalesce(v_request.requested_service_name, '')))
      and appointment.completed = false
      and appointment.cashed_in = false
      and appointment.no_show = false
      and (
        (v_request.customer_id is not null and appointment.customer_id = v_request.customer_id)
        or lower(trim(coalesce(appointment.customer_name, ''))) = lower(v_customer_full_name)
        or exists (
          select 1
          from public.customers as customer
          where customer.id = appointment.customer_id
            and customer.workspace_id = v_workspace_id
            and (
              (
                v_customer_email is not null
                and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
              )
              or (
                v_customer_phone is not null
                and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
              )
            )
        )
      )
      and (
        (
          nullif(trim(coalesce(v_request.requested_operator_id, '')), '') is null
          and nullif(trim(coalesce(v_request.requested_operator_name, '')), '') is null
        )
        or nullif(trim(coalesce(appointment.operator_id, '')), '') =
          nullif(trim(coalesce(v_request.requested_operator_id, '')), '')
        or nullif(lower(trim(coalesce(appointment.operator_name, ''))), '') =
          nullif(lower(trim(coalesce(v_request.requested_operator_name, ''))), '')
      )
    returning appointment.id into v_deleted_appointment_id;
  end if;

  perform set_config('salonpro.skip_appointment_delete_client_cancellation', 'off', true);
  perform public.refresh_workspace_agenda_state(v_workspace_id);

  begin
    perform public.process_public_slot_waitlist(
      v_workspace_id,
      v_request.appointment_date,
      v_request.appointment_time
    );
  exception
    when undefined_function then
      null;
    when others then
      null;
  end;

  if coalesce(
      current_setting('salonpro.defer_linked_customer_cancel_push', true),
      ''
    ) <> 'on'
    and not exists (
      select 1
      from public.push_notifications as push
      where push.workspace_id = v_workspace_id
        and push.event_type = 'booking_request_status_changed'
        and (
          push.payload ->> 'bookingRequestId' = v_request.id::text
          or (
            v_request.appointment_group_id is not null
            and push.payload ->> 'appointmentGroupId' = v_request.appointment_group_id::text
          )
        )
        and push.payload ->> 'statusCode' = 'cancelled'
      and coalesce(push.payload ->> 'cancellationSource', '') = 'cliente'
      and push.created_at > timezone('utc', now()) - interval '2 minutes'
  ) then
    v_date_label := coalesce(to_char(v_request.appointment_date, 'DD/MM/YYYY'), '');
    v_time_label := case
      when v_request.appointment_time is not null then to_char(v_request.appointment_time, 'HH24:MI')
      else ''
    end;
    v_operator_label := nullif(trim(coalesce(v_request.requested_operator_name, '')), '');
    v_role_label := nullif(trim(coalesce(v_request.required_role, '')), '');
    v_push_title := case
      when v_previous_status = 'pending'::public.request_status then 'Richiesta annullata dal cliente'
      else 'Prenotazione annullata dal cliente'
    end;
    v_detail_parts := array_remove(
      array[
        case when nullif(v_customer_full_name, '') is not null then 'Cliente: ' || v_customer_full_name else null end,
        case when nullif(trim(coalesce(v_request.requested_service_name, '')), '') is not null then 'Servizio: ' || trim(v_request.requested_service_name) else null end,
        case when v_role_label is not null then 'Mestiere: ' || v_role_label else null end,
        case when v_operator_label is not null then 'Operatore: ' || v_operator_label else null end,
        case
          when v_date_label <> '' and v_time_label <> '' then 'Data: ' || v_date_label || ' alle ' || v_time_label
          when v_date_label <> '' then 'Data: ' || v_date_label
          else null
        end
      ],
      null
    );
    v_push_body := 'Annullata' ||
      case
        when coalesce(array_length(v_detail_parts, 1), 0) > 0 then '. ' || array_to_string(v_detail_parts, '. ') || '.'
        else '.'
      end;
    v_push_payload := jsonb_build_object(
      'type', 'booking_request_status_changed',
      '_pushAudience', 'auth',
      '_pushTarget', 'owner',
      '_pushEventType', 'booking_request_status_changed',
      'bookingRequestId', v_request.id,
      'appointmentId', v_deleted_appointment_id,
      'status', 'Annullata',
      'statusCode', 'cancelled',
      'cancellationSource', 'cliente',
      'appointmentDate', v_request.appointment_date,
      'appointmentTime', v_request.appointment_time,
      'customerName', v_customer_full_name,
      'serviceName', v_request.requested_service_name,
      'roleName', coalesce(v_role_label, ''),
      'operatorName', coalesce(v_operator_label, '')
    );

    perform public.queue_workspace_push(
      v_workspace_id,
      'booking_request_status_changed',
      v_push_title,
      v_push_body,
      v_push_payload
    );
  end if;

  return jsonb_build_object(
    'bookingRequestId', v_request.id,
    'appointmentId', v_deleted_appointment_id,
    'workspaceId', v_workspace_id
  );
end;
$function$
;
CREATE OR REPLACE FUNCTION public.cancel_public_appointment_by_composite_without_cutoff_v1(p_salon_code text, p_appointment_date date, p_appointment_time time without time zone, p_requested_service_name text, p_customer_email citext DEFAULT NULL::citext, p_customer_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_workspace_id uuid;
  v_requested_service_name text := lower(trim(coalesce(p_requested_service_name, '')));
  v_customer_email citext := nullif(lower(trim(coalesce(p_customer_email::text, ''))), '')::citext;
  v_customer_phone text :=
    nullif(right(regexp_replace(coalesce(p_customer_phone, ''), '\D+', '', 'g'), 10), '');
  v_customer public.customers%rowtype;
  v_appointment public.appointments%rowtype;
  v_booking_request_id uuid;
  v_customer_name text;
  v_customer_surname text;
  v_date_label text;
  v_time_label text;
  v_push_title text;
  v_push_body text;
  v_push_payload jsonb;
begin
  perform set_config('salonpro.customer_slot_release','on',true);
  if lower(trim(coalesce(p_salon_code, ''))) = '' then
    raise exception 'workspace_not_found';
  end if;

  if p_appointment_date is null or p_appointment_time is null or v_requested_service_name = '' then
    raise exception 'appointment_not_found';
  end if;

  if v_customer_email is null and v_customer_phone is null then
    raise exception 'customer_identity_required';
  end if;

  select w.id
  into v_workspace_id
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  limit 1;

  if v_workspace_id is null then
    raise exception 'workspace_not_found';
  end if;

  select c.*
  into v_customer
  from public.customers as c
  where c.workspace_id = v_workspace_id
    and (
      (v_customer_email is not null and lower(trim(coalesce(c.email::text, ''))) = v_customer_email::text)
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(c.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  order by c.updated_at desc nulls last, c.created_at desc nulls last
  limit 1;

  select appointment.*
  into v_appointment
  from public.appointments as appointment
  left join public.customers as customer
    on customer.id = appointment.customer_id
  where appointment.workspace_id = v_workspace_id
    and appointment.appointment_date = p_appointment_date
    and appointment.appointment_time = p_appointment_time
    and lower(trim(coalesce(appointment.service_name, ''))) = v_requested_service_name
    and appointment.completed = false
    and appointment.cashed_in = false
    and appointment.no_show = false
    and (
      (v_customer.id is not null and appointment.customer_id = v_customer.id)
      or (
        v_customer_email is not null
        and lower(trim(coalesce(customer.email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(customer.phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    )
  order by appointment.updated_at desc nulls last, appointment.created_at desc nulls last
  limit 1;

  if v_appointment.id is null then
    raise exception 'appointment_not_found';
  end if;

  if v_appointment.booking_request_id is not null then
    return public.cancel_public_booking_request(
      p_salon_code,
      v_appointment.booking_request_id,
      v_customer_email,
      v_customer_phone
    );
  end if;

  v_customer_name := trim(coalesce(v_appointment.customer_name, ''));
  v_customer_surname :=
    case
      when position(' ' in v_customer_name) > 0 then
        trim(substring(v_customer_name from position(' ' in v_customer_name) + 1))
      else ''
    end;

  insert into public.booking_requests (
    workspace_id,
    customer_id,
    requested_service_name,
    requested_price,
    requested_duration_minutes,
    appointment_date,
    appointment_time,
    customer_name,
    customer_surname,
    customer_email,
    customer_phone,
    customer_instagram,
    notes,
    requested_operator_id,
    requested_operator_name,
    origin,
    status,
    cancellation_source,
    viewed_by_customer
  )
  values (
    v_workspace_id,
    coalesce(v_appointment.customer_id, v_customer.id),
    v_appointment.service_name,
    v_appointment.price,
    v_appointment.duration_minutes,
    v_appointment.appointment_date,
    v_appointment.appointment_time,
    split_part(v_customer_name, ' ', 1),
    v_customer_surname,
    coalesce(v_customer.email, v_customer_email, ''::citext),
    coalesce(v_customer.phone, v_customer_phone, ''),
    coalesce(v_customer.instagram, ''),
    nullif(coalesce(v_customer.note, ''), ''),
    v_appointment.operator_id,
    v_appointment.operator_name,
    'frontend',
    'cancelled',
    'cliente',
    true
  )
  returning id into v_booking_request_id;

  update public.customers
  set
    viewed_by_salon = false,
    updated_at = timezone('utc', now())
  where workspace_id = v_workspace_id
    and (
      (coalesce(v_appointment.customer_id, v_customer.id) is not null and id = coalesce(v_appointment.customer_id, v_customer.id))
      or (
        v_customer_email is not null
        and lower(trim(coalesce(email::text, ''))) = v_customer_email::text
      )
      or (
        v_customer_phone is not null
        and right(regexp_replace(coalesce(phone, ''), '\D+', '', 'g'), 10) = v_customer_phone
      )
    );

  delete from public.appointments
  where id = v_appointment.id
    and workspace_id = v_workspace_id;

  begin
    perform public.sync_client_portal_booking_requests(v_workspace_id);
  exception
    when others then
      null;
  end;

  v_date_label := coalesce(to_char(v_appointment.appointment_date, 'DD/MM/YYYY'), '');
  v_time_label :=
    case
      when v_appointment.appointment_time is not null then to_char(v_appointment.appointment_time, 'HH24:MI')
      else ''
    end;
  v_push_title := 'Prenotazione annullata dal cliente';
  v_push_body :=
    coalesce(nullif(v_customer_name, ''), 'Cliente') ||
    ' - ' ||
    coalesce(v_appointment.service_name, 'Servizio') ||
    case
      when v_date_label <> '' and v_time_label <> '' then ' il ' || v_date_label || ' alle ' || v_time_label
      when v_date_label <> '' then ' il ' || v_date_label
      else ''
    end;
  v_push_payload := jsonb_build_object(
    'type', 'appointment_cancelled',
    'bookingRequestId', v_booking_request_id,
    'appointmentId', v_appointment.id,
    'appointmentDate', v_appointment.appointment_date,
    'appointmentTime', v_appointment.appointment_time,
    'customerName', v_customer_name,
    'serviceName', v_appointment.service_name,
    'previousStatus', 'Accettata'
  );

  begin
    perform public.queue_workspace_push(
      v_workspace_id,
      'appointment_cancelled',
      v_push_title,
      v_push_body,
      v_push_payload
    );
  exception
    when others then
      null;
  end;

  begin
    perform public.process_public_slot_waitlist(v_workspace_id, v_appointment.appointment_date, v_appointment.appointment_time);
  exception
    when others then
      null;
  end;

  return jsonb_build_object(
    'bookingRequestId', v_booking_request_id,
    'appointmentId', v_appointment.id,
    'workspaceId', v_workspace_id
  );
end;
$function$
;

create or replace function public.release_due_owner_slot_holds_v1()
returns void language plpgsql security definer set search_path=public as $$
declare v_group record;
begin
 if not pg_try_advisory_xact_lock(hashtext('salonpro.owner-slot-release-worker')) then return; end if;
 for v_group in select distinct workspace_id,appointment_date from public.owner_slot_release_holds where release_at<=clock_timestamp()
 loop
   -- Expired holds no longer block booking. Existing occupancy still does.
   perform public.process_public_slot_waitlist(v_group.workspace_id,v_group.appointment_date,null);
   delete from public.owner_slot_release_holds where workspace_id=v_group.workspace_id and appointment_date=v_group.appointment_date and release_at<=clock_timestamp();
 end loop;
end $$;
revoke all on function public.release_due_owner_slot_holds_v1() from public,anon,authenticated;
select cron.schedule('release-owner-slot-holds','5 seconds','select public.release_due_owner_slot_holds_v1();');
notify pgrst,'reload schema';

CREATE OR REPLACE FUNCTION public.is_public_booking_slot_available_cached_read_v1(p_workspace_id uuid, p_appointment_date date, p_appointment_time time without time zone, p_requested_duration_minutes integer, p_requested_service_name text DEFAULT NULL::text, p_requested_operator_id text DEFAULT NULL::text, p_requested_operator_name text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare v_owner_payload jsonb := '{}'::jsonb; v_services jsonb := '[]'::jsonb; v_operators jsonb := '[]'::jsonb; v_requested_start_at timestamp; v_requested_end_at timestamp; v_requested_service_name text := trim(coalesce(p_requested_service_name, '')); v_requested_operator_id text := nullif(trim(coalesce(p_requested_operator_id, '')), ''); v_requested_operator_name text := nullif(lower(trim(coalesce(p_requested_operator_name, ''))), ''); v_requested_role text := ''; v_requested_machinery_ids text[] := array[]::text[]; v_requested_uses_operator boolean := false; v_eligible_operator_keys text[] := array[]::text[]; v_eligible_operator_count integer := 0; v_busy_operator_keys text[] := array[]::text[]; v_busy_operator_count integer := 0; v_overlapping_record record; v_existing_role text; v_existing_machinery_ids text[]; v_existing_operator_id text; v_existing_operator_name text; v_existing_operator_key text; begin if (v_requested_operator_id is not null or v_requested_operator_name is not null)
    and not public.is_public_operator_available_on_date_cached_read_v1(
      p_workspace_id,
      v_requested_operator_id,
      v_requested_operator_name,
      p_appointment_date
    )
  then
    return false;
  end if;

  v_owner_payload := public.get_public_booking_context_cached_read_v1(p_workspace_id); v_services := coalesce(v_owner_payload -> 'servizi', '[]'::jsonb); v_operators := coalesce(v_owner_payload -> 'operatori', '[]'::jsonb); select coalesce( lower( regexp_replace( regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g' ) ), '' ), coalesce( array( select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', service_item -> 'machinery_ids', '[]'::jsonb))) ), array[]::text[] ) into v_requested_role, v_requested_machinery_ids from jsonb_array_elements(v_services) as service_item where lower(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', ''))) = lower(v_requested_service_name) limit 1; v_requested_uses_operator := v_requested_role <> ''; v_requested_start_at := p_appointment_date::timestamp + p_appointment_time; v_requested_end_at := p_appointment_date::timestamp + p_appointment_time + make_interval(mins => greatest(coalesce(p_requested_duration_minutes, 60), 1)); if not public.public_time_guard_cached_read_v1( p_workspace_id, p_appointment_date, p_appointment_time, greatest(coalesce(p_requested_duration_minutes, 60), 1) ) then return false; end if;

  if not public.is_public_booking_calendar_exception_allowed(
    p_workspace_id,
    p_appointment_date,
    p_appointment_time,
    greatest(coalesce(p_requested_duration_minutes, 60), 1),
    v_requested_operator_id,
    v_requested_operator_name
  ) then
    return false;
  end if;
 if v_requested_uses_operator and v_requested_operator_id is null and v_requested_operator_name is null then select coalesce(array_agg(operator_key), array[]::text[]) into v_eligible_operator_keys from ( select distinct case when nullif(trim(coalesce(operator_item ->> 'id', '')), '') is not null then 'id:' || nullif(trim(coalesce(operator_item ->> 'id', '')), '') else 'name:' || lower(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', ''))) end as operator_key from jsonb_array_elements(v_operators) as operator_item where coalesce( lower( regexp_replace( regexp_replace(trim(coalesce(operator_item ->> 'mestiere', operator_item ->> 'required_role', '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g' ) ), '' 
      ) = v_requested_role
        and public.is_public_booking_calendar_exception_allowed(
          p_workspace_id,
          p_appointment_date,
          p_appointment_time,
          greatest(coalesce(p_requested_duration_minutes, 60), 1),
          nullif(trim(coalesce(operator_item ->> 'id', '')), ''),
          nullif(trim(coalesce(operator_item ->> 'nome', operator_item ->> 'name', '')), '')
        )
        and (
          operator_item -> 'availability' is null
 or ( ( jsonb_typeof(coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb)) = 0 or exists ( select 1 from jsonb_array_elements_text( coalesce(operator_item -> 'availability' -> 'enabledWeekdays', '[]'::jsonb) ) as weekday_value where weekday_value::integer = extract(dow from p_appointment_date)::integer ) ) and ( jsonb_typeof(coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb)) = 0 or exists ( select 1 from jsonb_array_elements( coalesce(operator_item -> 'availability' -> 'dateRanges', '[]'::jsonb) ) as range_item where nullif(trim(coalesce(range_item ->> 'startDate', '')), '') is not null and trim(coalesce(range_item ->> 'startDate', '')) <= p_appointment_date::text and trim(coalesce(range_item ->> 'endDate', '')) >= p_appointment_date::text ) ) ) ) ) as eligible_operators; v_eligible_operator_count := coalesce(array_length(v_eligible_operator_keys, 1), 0); if v_eligible_operator_count = 0 then v_eligible_operator_keys := array['id:salon-capacity::' || v_requested_role]; v_eligible_operator_count := 1; end if; end if;   for v_overlapping_record in
    select
      busy.value ->> 'existingServiceName' as existing_service_name,
      busy.value ->> 'existingOperatorId' as existing_operator_id,
      busy.value ->> 'existingOperatorName' as existing_operator_name
    from jsonb_array_elements(
      public.get_public_booking_busy_records_cached_read_v1(
        p_workspace_id,
        p_appointment_date
      )
    ) as busy(value)
    where coalesce(busy.value ->> 'recordId', '') <> coalesce(
        nullif(current_setting('app.booking_exclude_appointment_id', true), ''),
        '__none__'
      )
      and coalesce(busy.value ->> 'bookingRequestId', '') <> coalesce(
        nullif(current_setting('app.booking_exclude_request_id', true), ''),
        '__none__'
      )
      and public.booking_busy_snapshot_overlaps_range(
        (busy.value ->> 'appointmentDate')::date,
        (busy.value ->> 'appointmentTime')::time,
        greatest(coalesce((busy.value ->> 'durationMinutes')::integer, 60), 1),
        coalesce(busy.value -> 'phaseSnapshot', '{}'::jsonb),
        v_requested_start_at,
        v_requested_end_at
      )
union all select hold.service_name,hold.operator_id,hold.operator_name
 from public.owner_slot_release_holds hold
 where hold.workspace_id=p_workspace_id and hold.appointment_date=p_appointment_date
 and hold.release_at>clock_timestamp()
 and coalesce(current_setting('salonpro.owner_unrestricted',true),'')<>'on'
 and public.booking_busy_snapshot_overlaps_range(hold.appointment_date,hold.appointment_time,hold.duration_minutes,hold.phase_snapshot,v_requested_start_at,v_requested_end_at)
loop select coalesce( lower( regexp_replace( regexp_replace(trim(coalesce(service_item ->> 'mestiereRichiesto', service_item ->> 'required_role', '')), '\s+', ' ', 'g'), '[^a-z0-9 ]', '', 'g' ) ), '' ), coalesce( array( select trim(jsonb_array_elements_text(coalesce(service_item -> 'macchinarioIds', service_item -> 'machinery_ids', '[]'::jsonb))) ), array[]::text[] ) into v_existing_role, v_existing_machinery_ids from jsonb_array_elements(v_services) as service_item where lower(trim(coalesce(service_item ->> 'nome', service_item ->> 'name', ''))) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) limit 1; v_existing_operator_id := nullif(trim(coalesce(v_overlapping_record.existing_operator_id, '')), ''); v_existing_operator_name := nullif(lower(trim(coalesce(v_overlapping_record.existing_operator_name, ''))), ''); v_existing_operator_key := null; if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 and exists ( select 1 from unnest(v_requested_machinery_ids) as requested_machinery_id join unnest(coalesce(v_existing_machinery_ids, array[]::text[])) as existing_machinery_id on existing_machinery_id = requested_machinery_id ) then return false; end if; if v_requested_uses_operator and v_requested_operator_id is null and v_requested_operator_name is null then if coalesce(v_existing_role, '') <> v_requested_role then continue; end if; if v_existing_operator_id is not null then v_existing_operator_key := 'id:' || v_existing_operator_id; elsif v_existing_operator_name is not null then v_existing_operator_key := 'name:' || v_existing_operator_name; end if; if v_existing_operator_key is null or not (v_existing_operator_key = any(v_eligible_operator_keys)) then continue; end if; if not (v_existing_operator_key = any(v_busy_operator_keys)) then v_busy_operator_keys := array_append(v_busy_operator_keys, v_existing_operator_key); end if; v_busy_operator_count := coalesce(array_length(v_busy_operator_keys, 1), 0); if v_busy_operator_count >= v_eligible_operator_count then return false; end if; continue; end if; if v_requested_operator_id is null and v_requested_operator_name is null then if not v_requested_uses_operator and coalesce(v_existing_role, '') <> '' then continue; end if; if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then continue; end if; if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then if v_requested_role = v_existing_role then return false; end if; continue; end if; if (v_requested_role <> '' and coalesce(v_existing_role, '') = '') or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then continue; end if; if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then return false; end if; continue; end if; if v_existing_operator_id is null and v_existing_operator_name is null then if coalesce(array_length(v_requested_machinery_ids, 1), 0) > 0 then continue; end if; if v_requested_role <> '' and coalesce(v_existing_role, '') <> '' then if v_requested_role = v_existing_role then return false; end if; continue; end if; if (v_requested_role <> '' and coalesce(v_existing_role, '') = '') or (v_requested_role = '' and coalesce(v_existing_role, '') <> '') then continue; end if; if lower(v_requested_service_name) = lower(trim(coalesce(v_overlapping_record.existing_service_name, ''))) then return false; end if; continue; end if; if v_existing_operator_id = v_requested_operator_id then return false; end if; if v_requested_operator_name is not null and v_existing_operator_name = v_requested_operator_name then return false; end if; end loop; return true; end; $function$
;
