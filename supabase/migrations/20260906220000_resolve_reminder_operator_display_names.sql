-- Resolve current operator display names only; scheduling, occupancy and dedupe unchanged.
-- Technical appointment rows inside a composition are one customer journey.
-- Keep the established standalone reminder path unchanged, but schedule one
-- group reminder from the first component and include the full ordered
-- service/time/operator timeline in that single push.

create or replace function public.queue_due_appointment_push_reminders(
  p_now timestamptz default timezone('utc', now()),
  p_due_window interval default interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_count integer := 0;
  v_appointment_at timestamptz;
  v_scheduled_for timestamptz;
  v_customer_email citext;
  v_customer_phone text;
  v_customer_name text;
  v_service_name text;
  v_date_label text;
  v_time_label text;
  v_template text;
  v_body text;
  v_enqueued_count integer;
  v_dedupe_key text;
  v_due_window interval := greatest(
    coalesce(p_due_window, interval '15 minutes'),
    interval '1 minute'
  );
begin
  -- Standalone appointments intentionally retain the previous implementation:
  -- same schedule, template, payload and per-appointment reminder ledger.
  for v_row in
    select
      appointment.id as appointment_id,
      appointment.workspace_id,
      appointment.appointment_date,
      appointment.appointment_time,
      appointment.customer_name,
      appointment.service_name,
      workspace.salon_name,
      greatest(
        0,
        least(
          168,
          coalesce(
            portal.customer_reminder_hours_before,
            workspace.customer_reminder_hours_before,
            24
          )
        )
      ) as reminder_hours_before,
      lower(trim(coalesce(
        request.customer_email::text,
        customer.email::text,
        ''
      )))::citext as customer_email,
      nullif(
        regexp_replace(
          coalesce(request.customer_phone, customer.phone, ''),
          '\D+',
          '',
          'g'
        ),
        ''
      ) as customer_phone,
      coalesce(
        nullif(trim(template.reminder_template), ''),
        'Ciao {nome}, ti ricordiamo il tuo appuntamento presso {salone} il {data} alle {ora} per {servizio}. Ti aspettiamo!'
      ) as reminder_template
    from public.appointments as appointment
    join public.workspaces as workspace
      on workspace.id = appointment.workspace_id
    left join public.client_portals as portal
      on portal.workspace_id = appointment.workspace_id
    left join public.booking_requests as request
      on request.id = appointment.booking_request_id
    left join public.customers as customer
      on customer.id = appointment.customer_id
    left join public.message_templates as template
      on template.workspace_id = appointment.workspace_id
    where appointment.completed = false
      and appointment.no_show = false
      and appointment.appointment_group_id is null
  loop
    if v_row.reminder_hours_before <= 0 then
      continue;
    end if;

    v_customer_email := nullif(
      lower(trim(coalesce(v_row.customer_email::text, ''))),
      ''
    )::citext;
    v_customer_phone := nullif(
      regexp_replace(coalesce(v_row.customer_phone, ''), '\D+', '', 'g'),
      ''
    );

    if v_customer_email is null and v_customer_phone is null then
      continue;
    end if;

    v_appointment_at :=
      (v_row.appointment_date::timestamp + v_row.appointment_time)
      at time zone 'Europe/Rome';
    v_scheduled_for :=
      v_appointment_at - make_interval(hours => v_row.reminder_hours_before);

    if v_appointment_at <= p_now
      or v_scheduled_for > p_now
      or v_scheduled_for <= p_now - v_due_window
    then
      continue;
    end if;

    if exists (
      select 1
      from public.appointment_push_reminders as reminder
      where reminder.workspace_id = v_row.workspace_id
        and reminder.appointment_id = v_row.appointment_id
        and reminder.reminder_hours_before = v_row.reminder_hours_before
    ) then
      continue;
    end if;

    v_customer_name := nullif(trim(coalesce(v_row.customer_name, '')), '');
    v_service_name := nullif(trim(coalesce(v_row.service_name, '')), '');
    v_date_label := to_char(v_row.appointment_date, 'DD/MM/YYYY');
    v_time_label := to_char(v_row.appointment_time, 'HH24:MI');
    v_template := v_row.reminder_template;
    v_body := replace(
      replace(
        replace(
          replace(
            replace(
              v_template,
              '{nome}',
              coalesce(v_customer_name, 'Cliente')
            ),
            '{data}',
            v_date_label
          ),
          '{ora}',
          v_time_label
        ),
        '{servizio}',
        coalesce(v_service_name, 'appuntamento')
      ),
      '{salone}',
      coalesce(nullif(trim(v_row.salon_name), ''), 'salone')
    );

    select public.queue_public_customer_push(
      v_row.workspace_id,
      'custom',
      'Promemoria appuntamento',
      v_body,
      jsonb_build_object(
        'type', 'appointment_reminder',
        'appointmentId', v_row.appointment_id,
        'appointmentDate', v_row.appointment_date,
        'appointmentTime', v_row.appointment_time,
        'serviceName', v_row.service_name,
        'hoursBefore', v_row.reminder_hours_before,
        'timezone', 'Europe/Rome'
      ),
      v_customer_email,
      v_customer_phone
    ) into v_enqueued_count;

    if coalesce(v_enqueued_count, 0) <= 0 then
      continue;
    end if;

    insert into public.appointment_push_reminders (
      workspace_id,
      appointment_id,
      reminder_hours_before,
      scheduled_for,
      sent_at
    )
    values (
      v_row.workspace_id,
      v_row.appointment_id,
      v_row.reminder_hours_before,
      v_scheduled_for,
      timezone('utc', now())
    )
    on conflict (workspace_id, appointment_id, reminder_hours_before)
      do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  -- A linked group contributes only its first ordered surviving appointment.
  -- The group-level dedupe key remains stable even if phases are later
  -- reordered or one technical appointment is removed.
  for v_row in
    with group_anchors as (
      select distinct on (
        appointment.workspace_id,
        appointment.appointment_group_id
      )
        appointment.id as appointment_id,
        appointment.workspace_id,
        appointment.appointment_group_id,
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.customer_id,
        appointment.booking_request_id,
        appointment.customer_name,
        appointment.service_name,
        appointment.appointment_group_order,
        appointment.created_at
      from public.appointments as appointment
      join public.appointment_groups as appointment_group
        on appointment_group.workspace_id = appointment.workspace_id
       and appointment_group.id = appointment.appointment_group_id
       and appointment_group.status = 'active'
      where appointment.appointment_group_id is not null
        and appointment.completed = false
        and appointment.no_show = false
      order by
        appointment.workspace_id,
        appointment.appointment_group_id,
        appointment.appointment_group_order nulls last,
        appointment.appointment_date,
        appointment.appointment_time,
        appointment.created_at,
        appointment.id
    )
    select
      anchor.*,
      appointment_group.title as group_title,
      workspace.salon_name,
      greatest(
        0,
        least(
          168,
          coalesce(
            portal.customer_reminder_hours_before,
            workspace.customer_reminder_hours_before,
            24
          )
        )
      ) as reminder_hours_before,
      lower(trim(coalesce(
        appointment_group.metadata ->> 'customerEmail',
        request.customer_email::text,
        customer.email::text,
        ''
      )))::citext as customer_email,
      nullif(
        regexp_replace(
          coalesce(
            appointment_group.metadata ->> 'customerPhone',
            request.customer_phone,
            customer.phone,
            ''
          ),
          '\D+',
          '',
          'g'
        ),
        ''
      ) as customer_phone,
      coalesce(
        nullif(trim(template.reminder_template), ''),
        'Ciao {nome}, ti ricordiamo il tuo appuntamento presso {salone} il {data} alle {ora} per {servizio}. Ti aspettiamo!'
      ) as reminder_template,
      (
        select coalesce(
          string_agg(
            concat(
              coalesce(
                nullif(trim(component.service_name), ''),
                'Servizio'
              ),
              ' alle ',
              to_char(component.appointment_time, 'HH24:MI'),
              case
                when nullif(trim(coalesce(
                  nullif(trim(reminder_initial_operator.name), ''),
                  component.phase_operator_assignments #>> '{initial,name}',
                  component.phase_snapshot ->> 'initialOperatorName',
                  component.operator_name,
                  component_request.requested_operator_name,
                  ''
                )), '') is not null
                then ' con ' || trim(coalesce(
                  nullif(trim(reminder_initial_operator.name), ''),
                  component.phase_operator_assignments #>> '{initial,name}',
                  component.phase_snapshot ->> 'initialOperatorName',
                  component.operator_name,
                  component_request.requested_operator_name
                ))
                else ''
              end,
              case
                when lower(coalesce(
                  component.phase_snapshot ->> 'finalPhaseEnabled',
                  'false'
                )) = 'true'
                  and nullif(trim(coalesce(
                    nullif(trim(reminder_final_operator.name), ''),
                    component.phase_operator_assignments #>> '{final,name}',
                    component.phase_snapshot ->> 'finalOperatorName',
                    ''
                  )), '') is not null
                  and lower(trim(coalesce(
                    nullif(trim(reminder_final_operator.name), ''),
                    component.phase_operator_assignments #>> '{final,name}',
                    component.phase_snapshot ->> 'finalOperatorName',
                    ''
                  ))) is distinct from lower(trim(coalesce(
                    nullif(trim(reminder_initial_operator.name), ''),
                  component.phase_operator_assignments #>> '{initial,name}',
                    component.phase_snapshot ->> 'initialOperatorName',
                    component.operator_name,
                    component_request.requested_operator_name,
                    ''
                  )))
                then ', ripresa con ' || trim(coalesce(
                  nullif(trim(reminder_final_operator.name), ''),
                  component.phase_operator_assignments #>> '{final,name}',
                  component.phase_snapshot ->> 'finalOperatorName'
                ))
                else ''
              end,
              case
                when coalesce(component.phase_snapshot ->> 'mode', '') = 'phased'
                  and coalesce(
                    component.phase_snapshot ->> 'processingDurationMinutes',
                    ''
                  ) ~ '^[0-9]+$'
                  and (
                    component.phase_snapshot ->> 'processingDurationMinutes'
                  )::integer > 0
                then ' (posa ' ||
                  (
                    component.phase_snapshot ->> 'processingDurationMinutes'
                  )::integer::text ||
                  ' min)'
                else ''
              end
            ),
            ' · '
            order by
              component.appointment_group_order nulls last,
              component.appointment_date,
              component.appointment_time,
              component.created_at,
              component.id
          ),
          ''
        )
        from public.appointments as component
        left join public.booking_requests as component_request
          on component_request.id = component.booking_request_id
        -- Display-only lookup: stable ID and same workspace, never name matching.
        -- Legacy phase names without their own ID retain their original fallback.
        left join public.operators as reminder_initial_operator
          on reminder_initial_operator.workspace_id = component.workspace_id
         and reminder_initial_operator.id::text = coalesce(
           nullif(trim(component.phase_operator_assignments #>> '{initial,id}'), ''),
           nullif(trim(component.phase_snapshot ->> 'initialOperatorId'), ''),
           case when nullif(trim(coalesce(
             component.phase_operator_assignments #>> '{initial,name}',
             component.phase_snapshot ->> 'initialOperatorName', ''
           )), '') is null
           then coalesce(component.operator_id::text, component_request.requested_operator_id::text)
           end
         )
        left join public.operators as reminder_final_operator
          on reminder_final_operator.workspace_id = component.workspace_id
         and reminder_final_operator.id::text = coalesce(
           nullif(trim(component.phase_operator_assignments #>> '{final,id}'), ''),
           nullif(trim(component.phase_snapshot ->> 'finalOperatorId'), '')
         )
        where component.workspace_id = anchor.workspace_id
          and component.appointment_group_id = anchor.appointment_group_id
          and component.completed = false
          and component.no_show = false
      ) as booking_timeline
    from group_anchors as anchor
    join public.appointment_groups as appointment_group
      on appointment_group.workspace_id = anchor.workspace_id
     and appointment_group.id = anchor.appointment_group_id
     and appointment_group.status = 'active'
    join public.workspaces as workspace
      on workspace.id = anchor.workspace_id
    left join public.client_portals as portal
      on portal.workspace_id = anchor.workspace_id
    left join public.booking_requests as request
      on request.id = anchor.booking_request_id
    left join public.customers as customer
      on customer.id = anchor.customer_id
    left join public.message_templates as template
      on template.workspace_id = anchor.workspace_id
  loop
    if v_row.reminder_hours_before <= 0 then
      continue;
    end if;

    v_customer_email := nullif(
      lower(trim(coalesce(v_row.customer_email::text, ''))),
      ''
    )::citext;
    v_customer_phone := nullif(
      regexp_replace(coalesce(v_row.customer_phone, ''), '\D+', '', 'g'),
      ''
    );
    v_service_name := nullif(trim(coalesce(v_row.booking_timeline, '')), '');

    if (v_customer_email is null and v_customer_phone is null)
      or v_service_name is null
    then
      continue;
    end if;

    v_appointment_at :=
      (v_row.appointment_date::timestamp + v_row.appointment_time)
      at time zone 'Europe/Rome';
    v_scheduled_for :=
      v_appointment_at - make_interval(hours => v_row.reminder_hours_before);

    if v_appointment_at <= p_now
      or v_scheduled_for > p_now
      or v_scheduled_for <= p_now - v_due_window
    then
      continue;
    end if;

    v_dedupe_key := lower(concat_ws(
      '|',
      v_row.workspace_id::text,
      'appointment_reminder',
      v_row.appointment_group_id::text,
      v_row.reminder_hours_before::text
    ));

    if exists (
      select 1
      from public.push_notifications as notification
      where notification.workspace_id = v_row.workspace_id
        and notification.status in (
          'queued'::public.push_delivery_status,
          'processing'::public.push_delivery_status,
          'sent'::public.push_delivery_status
        )
        and lower(trim(coalesce(
          notification.payload ->> '_dedupeKey',
          ''
        ))) = v_dedupe_key
    ) then
      continue;
    end if;

    v_customer_name := nullif(trim(coalesce(v_row.customer_name, '')), '');
    v_date_label := to_char(v_row.appointment_date, 'DD/MM/YYYY');
    v_time_label := to_char(v_row.appointment_time, 'HH24:MI');
    v_template := v_row.reminder_template;
    v_body := replace(
      replace(
        replace(
          replace(
            replace(
              v_template,
              '{nome}',
              coalesce(v_customer_name, 'Cliente')
            ),
            '{data}',
            v_date_label
          ),
          '{ora}',
          v_time_label
        ),
        '{servizio}',
        v_service_name
      ),
      '{salone}',
      coalesce(nullif(trim(v_row.salon_name), ''), 'salone')
    );

    select public.queue_public_customer_push(
      v_row.workspace_id,
      'custom',
      'Promemoria appuntamento',
      v_body,
      jsonb_build_object(
        'type', 'appointment_reminder',
        'event_type', 'appointment_reminder',
        'notificationType', 'appointment_reminder',
        '_pushEventType', 'appointment_reminder',
        '_pushAudience', 'public',
        '_pushTarget', 'client',
        '_dedupeKey', v_dedupe_key,
        'eventId', v_dedupe_key,
        'appointmentId', v_row.appointment_id,
        'appointmentGroupId', v_row.appointment_group_id,
        'notificationScope', 'appointment_group',
        'appointmentDate', v_row.appointment_date,
        -- The ordered timeline already carries every component time.
        'appointmentTime', null,
        'anchorAppointmentTime', v_row.appointment_time,
        'serviceName', v_service_name,
        'operatorName', '',
        'bookingTimeline', v_service_name,
        'groupTitle', coalesce(
          nullif(trim(v_row.group_title), ''),
          'Composizione'
        ),
        'hoursBefore', v_row.reminder_hours_before,
        'timezone', 'Europe/Rome'
      ),
      v_customer_email,
      v_customer_phone
    ) into v_enqueued_count;

    if coalesce(v_enqueued_count, 0) <= 0 then
      continue;
    end if;

    insert into public.appointment_push_reminders (
      workspace_id,
      appointment_id,
      reminder_hours_before,
      scheduled_for,
      sent_at
    )
    values (
      v_row.workspace_id,
      v_row.appointment_id,
      v_row.reminder_hours_before,
      v_scheduled_for,
      timezone('utc', now())
    )
    on conflict (workspace_id, appointment_id, reminder_hours_before)
      do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

notify pgrst, 'reload schema';
