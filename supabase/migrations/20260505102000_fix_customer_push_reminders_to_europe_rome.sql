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
  v_due_window interval := greatest(coalesce(p_due_window, interval '15 minutes'), interval '1 minute');
begin
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
      lower(trim(coalesce(request.customer_email::text, customer.email::text, '')))::citext as customer_email,
      nullif(
        regexp_replace(coalesce(request.customer_phone, customer.phone, ''), '\D+', '', 'g'),
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
  loop
    if v_row.reminder_hours_before <= 0 then
      continue;
    end if;

    v_customer_email := nullif(lower(trim(coalesce(v_row.customer_email::text, ''))), '')::citext;
    v_customer_phone := nullif(regexp_replace(coalesce(v_row.customer_phone, ''), '\D+', '', 'g'), '');

    if v_customer_email is null and v_customer_phone is null then
      continue;
    end if;

    v_appointment_at :=
      (v_row.appointment_date::timestamp + v_row.appointment_time) at time zone 'Europe/Rome';
    v_scheduled_for := v_appointment_at - make_interval(hours => v_row.reminder_hours_before);

    if v_appointment_at <= p_now then
      continue;
    end if;

    if v_scheduled_for > p_now then
      continue;
    end if;

    if v_scheduled_for <= p_now - v_due_window then
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
    on conflict (workspace_id, appointment_id, reminder_hours_before) do nothing;

    if found then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;
