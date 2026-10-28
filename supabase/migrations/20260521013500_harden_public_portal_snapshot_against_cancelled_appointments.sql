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
          greatest(
            0,
            least(
              168,
              coalesce(v_workspace.customer_reminder_hours_before, 24)
            )
          ),
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
              from public.booking_requests as request
              where request.workspace_id = v_workspace.id
                and request.status = 'cancelled'
                and request.appointment_date = appointment.appointment_date
                and request.appointment_time = appointment.appointment_time
                and lower(trim(coalesce(request.requested_service_name, ''))) =
                  lower(trim(coalesce(appointment.service_name, '')))
                and lower(
                  trim(
                    concat_ws(
                      ' ',
                      coalesce(request.customer_name, ''),
                      coalesce(request.customer_surname, '')
                    )
                  )
                ) = lower(trim(coalesce(appointment.customer_name, '')))
            )
        ),
        '[]'::jsonb
      ),
    'servizi',
      coalesce(
        v_owner_payload -> 'servizi',
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', service.id,
              'nome', service.name,
              'prezzo', service.price,
              'durataMinuti', service.duration_minutes,
              'mestiereRichiesto', coalesce(service.required_role, '')
            )
            order by service.updated_at desc, service.created_at desc
          )
          from public.services as service
          where service.workspace_id = v_workspace.id
        ),
        '[]'::jsonb
      ),
    'operatori',
      coalesce(
        v_owner_payload -> 'operatori',
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', operator.id,
              'nome', operator.name,
              'mestiere', coalesce(operator.required_role, ''),
              'fotoUri', coalesce(operator.photo_uri, ''),
              'availability', coalesce(operator.availability, '{}'::jsonb)
            )
            order by operator.updated_at desc, operator.created_at desc
          )
          from public.operators as operator
          where operator.workspace_id = v_workspace.id
        ),
        '[]'::jsonb
      ),
    'richiestePrenotazione',
      coalesce(
        v_owner_payload -> 'richiestePrenotazione',
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', request.id,
              'nome', request.customer_name,
              'telefono', request.customer_phone,
              'email', coalesce(request.customer_email::text, ''),
              'servizio', request.requested_service_name,
              'data', request.appointment_date,
              'ora', to_char(request.appointment_time, 'HH24:MI'),
              'note', coalesce(request.notes, ''),
              'stato', request.status
            )
            order by request.updated_at desc, request.created_at desc
          )
          from public.booking_requests as request
          where request.workspace_id = v_workspace.id
        ),
        '[]'::jsonb
      ),
    'availabilitySettings',
      coalesce(
        v_owner_payload -> 'availabilitySettings',
        (
          select coalesce(portal.availability_settings, '{}'::jsonb)
          from public.client_portals as portal
          where portal.workspace_id = v_workspace.id
          limit 1
        ),
        '{}'::jsonb
      ),
    'serviceCardColorOverrides',
      coalesce(v_owner_payload -> 'serviceCardColorOverrides', '{}'::jsonb),
    'roleCardColorOverrides',
      coalesce(v_owner_payload -> 'roleCardColorOverrides', '{}'::jsonb)
  );
end;
$$;

grant execute on function public.get_client_portal_snapshot(text) to anon, authenticated;

notify pgrst, 'reload schema';
