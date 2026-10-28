create or replace function public.sync_client_portal_appointments(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals as portal
  set appuntamenti = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', appointment.id,
          'data', appointment.appointment_date,
          'ora', to_char(appointment.appointment_time, 'HH24:MI'),
          'cliente', appointment.customer_name,
          'servizio', appointment.service_name,
          'prezzo', appointment.price,
          'durataMinuti', appointment.duration_minutes,
          'operatoreId', nullif(trim(coalesce(appointment.operator_id, '')), ''),
          'operatoreNome', nullif(trim(coalesce(appointment.operator_name, '')), ''),
          'incassato', appointment.cashed_in,
          'completato', appointment.completed,
          'nonEffettuato', appointment.no_show
        )
        order by appointment.appointment_date asc, appointment.appointment_time asc, appointment.created_at asc
      )
      from public.appointments as appointment
      where appointment.workspace_id = portal.workspace_id
        and not exists (
          select 1
          from public.booking_requests as terminal_request
          where terminal_request.workspace_id = portal.workspace_id
            and terminal_request.status = 'cancelled'
            and terminal_request.appointment_date = appointment.appointment_date
            and terminal_request.appointment_time = appointment.appointment_time
            and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
              lower(trim(coalesce(appointment.service_name, '')))
            and lower(
              trim(
                concat_ws(
                  ' ',
                  coalesce(terminal_request.customer_name, ''),
                  coalesce(terminal_request.customer_surname, '')
                )
              )
            ) = lower(trim(coalesce(appointment.customer_name, '')))
            and not exists (
              select 1
              from public.booking_requests as newer_active_request
              where newer_active_request.workspace_id = terminal_request.workspace_id
                and newer_active_request.status in ('pending', 'accepted')
                and newer_active_request.appointment_date = terminal_request.appointment_date
                and newer_active_request.appointment_time = terminal_request.appointment_time
                and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                  lower(trim(coalesce(terminal_request.requested_service_name, '')))
                and lower(
                  trim(
                    concat_ws(
                      ' ',
                      coalesce(newer_active_request.customer_name, ''),
                      coalesce(newer_active_request.customer_surname, '')
                    )
                  )
                ) = lower(
                  trim(
                    concat_ws(
                      ' ',
                      coalesce(terminal_request.customer_name, ''),
                      coalesce(terminal_request.customer_surname, '')
                    )
                  )
                )
                and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                  coalesce(terminal_request.created_at, '-infinity'::timestamptz)
            )
        )
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

create or replace function public.sync_client_portal_booking_requests(p_workspace_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_portals as portal
  set richieste_prenotazione = coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', booking_request.id,
          'data', booking_request.appointment_date,
          'ora', to_char(booking_request.appointment_time, 'HH24:MI'),
          'servizio', booking_request.requested_service_name,
          'prezzo', booking_request.requested_price,
          'durataMinuti', booking_request.requested_duration_minutes,
          'nome', booking_request.customer_name,
          'cognome', booking_request.customer_surname,
          'email', booking_request.customer_email,
          'telefono', booking_request.customer_phone,
          'instagram', coalesce(booking_request.customer_instagram, ''),
          'note', coalesce(booking_request.notes, ''),
          'operatoreId', nullif(trim(coalesce(booking_request.requested_operator_id, '')), ''),
          'operatoreNome', nullif(trim(coalesce(booking_request.requested_operator_name, '')), ''),
          'origine',
            case
              when booking_request.origin = 'backoffice' then 'backoffice'
              else 'frontend'
            end,
          'stato',
            case booking_request.status
              when 'accepted' then 'Accettata'
              when 'rejected' then 'Rifiutata'
              when 'cancelled' then 'Annullata'
              else 'In attesa'
            end,
          'cancellationSource', booking_request.cancellation_source,
          'createdAt', booking_request.created_at,
          'viewedByCliente', booking_request.viewed_by_customer,
          'viewedBySalon',
            case
              when booking_request.status in ('pending', 'cancelled') then false
              else true
            end
        )
        order by booking_request.created_at desc
      )
      from public.booking_requests as booking_request
      where booking_request.workspace_id = portal.workspace_id
        and (
          booking_request.status not in ('pending', 'accepted')
          or not exists (
            select 1
            from public.booking_requests as terminal_request
            where terminal_request.workspace_id = portal.workspace_id
              and terminal_request.status in ('cancelled', 'rejected')
              and terminal_request.appointment_date = booking_request.appointment_date
              and terminal_request.appointment_time = booking_request.appointment_time
              and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                lower(trim(coalesce(booking_request.requested_service_name, '')))
              and lower(
                trim(
                  concat_ws(
                    ' ',
                    coalesce(terminal_request.customer_name, ''),
                    coalesce(terminal_request.customer_surname, '')
                  )
                )
              ) = lower(
                trim(
                  concat_ws(
                    ' ',
                    coalesce(booking_request.customer_name, ''),
                    coalesce(booking_request.customer_surname, '')
                  )
                )
              )
              and not exists (
                select 1
                from public.booking_requests as newer_active_request
                where newer_active_request.workspace_id = terminal_request.workspace_id
                  and newer_active_request.status in ('pending', 'accepted')
                  and newer_active_request.appointment_date = terminal_request.appointment_date
                  and newer_active_request.appointment_time = terminal_request.appointment_time
                  and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                    lower(trim(coalesce(terminal_request.requested_service_name, '')))
                  and lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(newer_active_request.customer_name, ''),
                        coalesce(newer_active_request.customer_surname, '')
                      )
                    )
                  ) = lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(terminal_request.customer_name, ''),
                        coalesce(terminal_request.customer_surname, '')
                      )
                    )
                  )
                  and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                    coalesce(terminal_request.created_at, '-infinity'::timestamptz)
              )
          )
        )
    ),
    '[]'::jsonb
  ),
  updated_at = timezone('utc', now())
  where portal.workspace_id = p_workspace_id;
$$;

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_workspace public.workspaces%rowtype;
  v_owner_payload jsonb := '{}'::jsonb;
  v_workspace_payload jsonb := '{}'::jsonb;
begin
  select w.*
  into v_workspace
  from public.workspaces as w
  where w.slug = lower(trim(coalesce(p_salon_code, '')))
    and w.subscription_status in ('demo', 'active')
  order by
    case when w.subscription_status = 'active' then 0 else 1 end,
    w.updated_at desc nulls last,
    w.created_at desc nulls last,
    w.id desc
  limit 1;

  if v_workspace.id is null then
    return null;
  end if;

  v_owner_payload := public.get_public_portal_owner_payload(v_workspace.id);
  v_workspace_payload := coalesce(v_owner_payload -> 'workspace', '{}'::jsonb);

  return jsonb_build_object(
    'workspace',
      jsonb_build_object(
        'id', v_workspace.id,
        'ownerEmail', coalesce(nullif(trim(v_workspace_payload ->> 'ownerEmail'), ''), v_workspace.owner_email::text),
        'salonCode', coalesce(nullif(trim(v_workspace_payload ->> 'salonCode'), ''), v_workspace.slug),
        'salonName', coalesce(nullif(trim(v_workspace_payload ->> 'salonName'), ''), v_workspace.salon_name),
        'salonNameDisplayStyle', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameDisplayStyle'), ''), 'corsivo'),
        'salonNameFontVariant', coalesce(nullif(trim(v_workspace_payload ->> 'salonNameFontVariant'), ''), 'neon'),
        'businessPhone', coalesce(nullif(trim(v_workspace_payload ->> 'businessPhone'), ''), coalesce(v_workspace.owner_phone, '')),
        'activityCategory', coalesce(nullif(trim(v_workspace_payload ->> 'activityCategory'), ''), ''),
        'salonAddress', coalesce(nullif(trim(v_workspace_payload ->> 'salonAddress'), ''), ''),
        'streetType', coalesce(nullif(trim(v_workspace_payload ->> 'streetType'), ''), ''),
        'streetName', coalesce(nullif(trim(v_workspace_payload ->> 'streetName'), ''), ''),
        'streetNumber', coalesce(nullif(trim(v_workspace_payload ->> 'streetNumber'), ''), ''),
        'city', coalesce(nullif(trim(v_workspace_payload ->> 'city'), ''), ''),
        'postalCode', coalesce(nullif(trim(v_workspace_payload ->> 'postalCode'), ''), ''),
        'subscriptionPlan', v_workspace.subscription_plan,
        'subscriptionStatus', v_workspace.subscription_status,
        'customerReminderHoursBefore',
          greatest(0, least(168, coalesce(v_workspace.customer_reminder_hours_before, 24))),
        'createdAt', v_workspace.created_at,
        'updatedAt', v_workspace.updated_at
      ),
    'clienti',
      coalesce(
        v_owner_payload -> 'clienti',
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', customer.id,
              'nome', customer.full_name,
              'telefono', coalesce(customer.phone, ''),
              'email', coalesce(customer.email::text, ''),
              'instagram', coalesce(customer.instagram, ''),
              'birthday', '',
              'nota', coalesce(customer.note, ''),
              'fonte', case when customer.source = 'frontend' then 'frontend' else 'salone' end,
              'viewedBySalon', customer.viewed_by_salon,
              'annullamentiCount', 0,
              'inibito', false,
              'maxFutureAppointments', customer.max_future_appointments,
              'maxFutureAppointmentsMode', customer.max_future_appointments_mode,
              'maxDailyAppointments', customer.max_daily_appointments
            )
            order by customer.updated_at desc, customer.created_at desc
          )
          from public.customers as customer
          where customer.workspace_id = v_workspace.id
        ),
        '[]'::jsonb
      ),
    'appuntamenti',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', appointment.id,
              'data', appointment.appointment_date,
              'ora', to_char(appointment.appointment_time, 'HH24:MI'),
              'cliente', appointment.customer_name,
              'servizio', appointment.service_name,
              'prezzo', appointment.price,
              'durataMinuti', appointment.duration_minutes,
              'operatoreId', nullif(trim(coalesce(appointment.operator_id, '')), ''),
              'operatoreNome', nullif(trim(coalesce(appointment.operator_name, '')), ''),
              'incassato', appointment.cashed_in,
              'completato', appointment.completed,
              'nonEffettuato', appointment.no_show
            )
            order by appointment.appointment_date asc, appointment.appointment_time asc, appointment.created_at asc
          )
          from public.appointments as appointment
          where appointment.workspace_id = v_workspace.id
            and not exists (
              select 1
              from public.booking_requests as terminal_request
              where terminal_request.workspace_id = v_workspace.id
                and terminal_request.status = 'cancelled'
                and terminal_request.appointment_date = appointment.appointment_date
                and terminal_request.appointment_time = appointment.appointment_time
                and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                  lower(trim(coalesce(appointment.service_name, '')))
                and lower(
                  trim(
                    concat_ws(
                      ' ',
                      coalesce(terminal_request.customer_name, ''),
                      coalesce(terminal_request.customer_surname, '')
                    )
                  )
                ) = lower(trim(coalesce(appointment.customer_name, '')))
                and not exists (
                  select 1
                  from public.booking_requests as newer_active_request
                  where newer_active_request.workspace_id = terminal_request.workspace_id
                    and newer_active_request.status in ('pending', 'accepted')
                    and newer_active_request.appointment_date = terminal_request.appointment_date
                    and newer_active_request.appointment_time = terminal_request.appointment_time
                    and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                      lower(trim(coalesce(terminal_request.requested_service_name, '')))
                    and lower(
                      trim(
                        concat_ws(
                          ' ',
                          coalesce(newer_active_request.customer_name, ''),
                          coalesce(newer_active_request.customer_surname, '')
                        )
                      )
                    ) = lower(
                      trim(
                        concat_ws(
                          ' ',
                          coalesce(terminal_request.customer_name, ''),
                          coalesce(terminal_request.customer_surname, '')
                        )
                      )
                    )
                    and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                      coalesce(terminal_request.created_at, '-infinity'::timestamptz)
                )
            )
        ),
        '[]'::jsonb
      ),
    'servizi', coalesce(v_owner_payload -> 'servizi', '[]'::jsonb),
    'operatori', coalesce(v_owner_payload -> 'operatori', '[]'::jsonb),
    'richiestePrenotazione',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', booking_request.id,
              'data', booking_request.appointment_date,
              'ora', to_char(booking_request.appointment_time, 'HH24:MI'),
              'servizio', booking_request.requested_service_name,
              'prezzo', booking_request.requested_price,
              'durataMinuti', booking_request.requested_duration_minutes,
              'nome', booking_request.customer_name,
              'cognome', booking_request.customer_surname,
              'email', booking_request.customer_email,
              'telefono', booking_request.customer_phone,
              'instagram', coalesce(booking_request.customer_instagram, ''),
              'note', coalesce(booking_request.notes, ''),
              'operatoreId', nullif(trim(coalesce(booking_request.requested_operator_id, '')), ''),
              'operatoreNome', nullif(trim(coalesce(booking_request.requested_operator_name, '')), ''),
              'origine', case when booking_request.origin = 'backoffice' then 'backoffice' else 'frontend' end,
              'stato',
                case booking_request.status
                  when 'accepted' then 'Accettata'
                  when 'rejected' then 'Rifiutata'
                  when 'cancelled' then 'Annullata'
                  else 'In attesa'
                end,
              'cancellationSource', booking_request.cancellation_source,
              'createdAt', booking_request.created_at,
              'viewedByCliente', booking_request.viewed_by_customer,
              'viewedBySalon',
                case
                  when booking_request.status in ('pending', 'cancelled') then false
                  else true
                end
            )
            order by booking_request.created_at desc
          )
          from public.booking_requests as booking_request
          where booking_request.workspace_id = v_workspace.id
            and (
              booking_request.status not in ('pending', 'accepted')
              or not exists (
                select 1
                from public.booking_requests as terminal_request
                where terminal_request.workspace_id = v_workspace.id
                  and terminal_request.status in ('cancelled', 'rejected')
                  and terminal_request.appointment_date = booking_request.appointment_date
                  and terminal_request.appointment_time = booking_request.appointment_time
                  and lower(trim(coalesce(terminal_request.requested_service_name, ''))) =
                    lower(trim(coalesce(booking_request.requested_service_name, '')))
                  and lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(terminal_request.customer_name, ''),
                        coalesce(terminal_request.customer_surname, '')
                      )
                    )
                  ) = lower(
                    trim(
                      concat_ws(
                        ' ',
                        coalesce(booking_request.customer_name, ''),
                        coalesce(booking_request.customer_surname, '')
                      )
                    )
                  )
                  and not exists (
                    select 1
                    from public.booking_requests as newer_active_request
                    where newer_active_request.workspace_id = terminal_request.workspace_id
                      and newer_active_request.status in ('pending', 'accepted')
                      and newer_active_request.appointment_date = terminal_request.appointment_date
                      and newer_active_request.appointment_time = terminal_request.appointment_time
                      and lower(trim(coalesce(newer_active_request.requested_service_name, ''))) =
                        lower(trim(coalesce(terminal_request.requested_service_name, '')))
                      and lower(
                        trim(
                          concat_ws(
                            ' ',
                            coalesce(newer_active_request.customer_name, ''),
                            coalesce(newer_active_request.customer_surname, '')
                          )
                        )
                      ) = lower(
                        trim(
                          concat_ws(
                            ' ',
                            coalesce(terminal_request.customer_name, ''),
                            coalesce(terminal_request.customer_surname, '')
                          )
                        )
                      )
                      and coalesce(newer_active_request.created_at, '-infinity'::timestamptz) >=
                        coalesce(terminal_request.created_at, '-infinity'::timestamptz)
                  )
              )
            )
        ),
        '[]'::jsonb
      ),
    'availabilitySettings', coalesce(v_owner_payload -> 'availabilitySettings', '{}'::jsonb),
    'serviceCardColorOverrides', coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides', coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$$;

grant execute on function public.sync_client_portal_booking_requests(uuid) to authenticated;
grant execute on function public.get_client_portal_snapshot(text) to anon, authenticated;

notify pgrst, 'reload schema';
