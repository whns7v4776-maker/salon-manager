alter table public.workspaces
  add column if not exists customer_reminder_hours_before integer not null default 24;

alter table public.workspaces
  drop constraint if exists workspaces_customer_reminder_hours_before_check;

alter table public.workspaces
  add constraint workspaces_customer_reminder_hours_before_check
  check (customer_reminder_hours_before >= 0 and customer_reminder_hours_before <= 168);

alter table public.client_portals
  add column if not exists customer_reminder_hours_before integer not null default 24;

alter table public.client_portals
  drop constraint if exists client_portals_customer_reminder_hours_before_check;

alter table public.client_portals
  add constraint client_portals_customer_reminder_hours_before_check
  check (customer_reminder_hours_before >= 0 and customer_reminder_hours_before <= 168);

update public.client_portals as portal
set customer_reminder_hours_before = coalesce(workspace.customer_reminder_hours_before, 24)
from public.workspaces as workspace
where workspace.id = portal.workspace_id;

create table if not exists public.appointment_push_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  reminder_hours_before integer not null check (reminder_hours_before >= 0 and reminder_hours_before <= 168),
  scheduled_for timestamptz not null,
  sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, appointment_id, reminder_hours_before)
);

create index if not exists appointment_push_reminders_workspace_sent_idx
  on public.appointment_push_reminders (workspace_id, sent_at desc);

drop trigger if exists set_updated_at_appointment_push_reminders on public.appointment_push_reminders;
create trigger set_updated_at_appointment_push_reminders
before update on public.appointment_push_reminders
for each row execute procedure public.set_updated_at();

create or replace function public.upsert_client_portal_snapshot(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace jsonb;
  v_workspace_id uuid;
  v_workspace_row public.workspaces%rowtype;
  v_owner_email citext;
  v_salon_code text;
  v_salon_name text;
  v_business_phone text;
  v_activity_category text;
  v_salon_address text;
  v_street_type text;
  v_street_name text;
  v_street_number text;
  v_city text;
  v_postal_code text;
  v_display_style text;
  v_font_variant text;
  v_subscription_plan public.subscription_plan;
  v_subscription_status public.subscription_status;
  v_customer_reminder_hours_before integer;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  v_workspace_id := public.current_workspace_id();

  if v_workspace_id is null or not public.workspace_access_allowed() then
    raise exception 'workspace_access_denied';
  end if;

  select w.*
  into v_workspace_row
  from public.workspaces as w
  where w.id = v_workspace_id
  limit 1;

  if v_workspace_row.id is null then
    raise exception 'workspace_not_found';
  end if;

  v_workspace := coalesce(p_payload -> 'workspace', '{}'::jsonb);
  v_owner_email := lower(trim(coalesce(v_workspace ->> 'ownerEmail', v_workspace_row.owner_email::text, '')))::citext;
  v_salon_code := lower(trim(coalesce(v_workspace ->> 'salonCode', v_workspace_row.slug, '')));
  v_salon_name := trim(coalesce(v_workspace ->> 'salonName', v_workspace_row.salon_name, ''));
  v_business_phone := trim(coalesce(v_workspace ->> 'businessPhone', v_workspace_row.owner_phone, ''));
  v_activity_category := trim(coalesce(v_workspace ->> 'activityCategory', ''));
  v_salon_address := trim(coalesce(v_workspace ->> 'salonAddress', ''));
  v_street_type := trim(coalesce(v_workspace ->> 'streetType', ''));
  v_street_name := trim(coalesce(v_workspace ->> 'streetName', ''));
  v_street_number := trim(coalesce(v_workspace ->> 'streetNumber', ''));
  v_city := trim(coalesce(v_workspace ->> 'city', ''));
  v_postal_code := trim(coalesce(v_workspace ->> 'postalCode', ''));
  v_display_style := trim(coalesce(v_workspace ->> 'salonNameDisplayStyle', 'corsivo'));
  v_font_variant := trim(coalesce(v_workspace ->> 'salonNameFontVariant', 'neon'));
  v_subscription_plan := coalesce((v_workspace ->> 'subscriptionPlan')::public.subscription_plan, v_workspace_row.subscription_plan);
  v_subscription_status := coalesce((v_workspace ->> 'subscriptionStatus')::public.subscription_status, v_workspace_row.subscription_status);
  v_customer_reminder_hours_before := greatest(
    0,
    least(
      168,
      coalesce(
        nullif(trim(coalesce(v_workspace ->> 'customerReminderHoursBefore', '')), '')::integer,
        v_workspace_row.customer_reminder_hours_before,
        24
      )
    )
  );

  if v_owner_email is null or v_owner_email = ''::citext then
    raise exception 'owner_email_required';
  end if;

  if v_salon_code = '' or v_salon_name = '' then
    raise exception 'salon_code_and_name_required';
  end if;

  if v_workspace_row.owner_email is distinct from v_owner_email then
    raise exception 'owner_email_mismatch';
  end if;

  if v_workspace_row.slug is distinct from v_salon_code then
    raise exception 'salon_code_mismatch';
  end if;

  update public.workspaces
  set
    salon_name = v_salon_name,
    owner_phone = nullif(v_business_phone, ''),
    customer_reminder_hours_before = v_customer_reminder_hours_before,
    updated_at = timezone('utc', now())
  where id = v_workspace_id;

  insert into public.client_portals (
    workspace_id,
    owner_email,
    salon_code,
    salon_name,
    salon_name_display_style,
    salon_name_font_variant,
    business_phone,
    activity_category,
    salon_address,
    street_type,
    street_name,
    street_number,
    city,
    postal_code,
    subscription_plan,
    subscription_status,
    customer_reminder_hours_before,
    clienti,
    appuntamenti,
    servizi,
    operatori,
    richieste_prenotazione,
    availability_settings
  )
  values (
    v_workspace_id,
    v_owner_email,
    v_salon_code,
    v_salon_name,
    v_display_style,
    v_font_variant,
    v_business_phone,
    v_activity_category,
    v_salon_address,
    v_street_type,
    v_street_name,
    v_street_number,
    v_city,
    v_postal_code,
    v_subscription_plan,
    v_subscription_status,
    v_customer_reminder_hours_before,
    coalesce(p_payload -> 'clienti', '[]'::jsonb),
    coalesce(p_payload -> 'appuntamenti', '[]'::jsonb),
    coalesce(p_payload -> 'servizi', '[]'::jsonb),
    coalesce(p_payload -> 'operatori', '[]'::jsonb),
    coalesce(p_payload -> 'richiestePrenotazione', '[]'::jsonb),
    coalesce(p_payload -> 'availabilitySettings', '{}'::jsonb)
  )
  on conflict (workspace_id)
  do update set
    owner_email = excluded.owner_email,
    salon_code = excluded.salon_code,
    salon_name = excluded.salon_name,
    salon_name_display_style = excluded.salon_name_display_style,
    salon_name_font_variant = excluded.salon_name_font_variant,
    business_phone = excluded.business_phone,
    activity_category = excluded.activity_category,
    salon_address = excluded.salon_address,
    street_type = excluded.street_type,
    street_name = excluded.street_name,
    street_number = excluded.street_number,
    city = excluded.city,
    postal_code = excluded.postal_code,
    subscription_plan = excluded.subscription_plan,
    subscription_status = excluded.subscription_status,
    customer_reminder_hours_before = excluded.customer_reminder_hours_before,
    clienti = excluded.clienti,
    appuntamenti = excluded.appuntamenti,
    servizi = excluded.servizi,
    operatori = excluded.operatori,
    richieste_prenotazione = excluded.richieste_prenotazione,
    availability_settings = excluded.availability_settings,
    updated_at = timezone('utc', now());

  perform public.log_workspace_audit_event(
    v_workspace_id,
    'client_portal_snapshot_upserted',
    'client_portals',
    v_workspace_id::text,
    jsonb_build_object(
      'salonCode', v_salon_code,
      'salonName', v_salon_name,
      'customerReminderHoursBefore', v_customer_reminder_hours_before
    )
  );

  return v_workspace_id;
end;
$$;

create or replace function public.get_client_portal_snapshot(p_salon_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_portal public.client_portals%rowtype;
begin
  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.salon_code = lower(trim(p_salon_code))
    and portal.subscription_status = 'active'
  limit 1;

  if v_portal.workspace_id is null then
    return null;
  end if;

  perform public.sync_client_portal_appointments(v_portal.workspace_id);
  perform public.sync_client_portal_booking_requests(v_portal.workspace_id);
  perform public.process_public_slot_waitlist(v_portal.workspace_id, null, null);
  perform public.sync_client_portal_appointments(v_portal.workspace_id);
  perform public.sync_client_portal_booking_requests(v_portal.workspace_id);

  select portal.*
  into v_portal
  from public.client_portals as portal
  where portal.workspace_id = v_portal.workspace_id
  limit 1;

  return jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', v_portal.workspace_id,
      'ownerEmail', v_portal.owner_email,
      'salonCode', v_portal.salon_code,
      'salonName', v_portal.salon_name,
      'salonNameDisplayStyle', v_portal.salon_name_display_style,
      'salonNameFontVariant', v_portal.salon_name_font_variant,
      'businessPhone', v_portal.business_phone,
      'activityCategory', v_portal.activity_category,
      'salonAddress', v_portal.salon_address,
      'streetType', v_portal.street_type,
      'streetName', v_portal.street_name,
      'streetNumber', v_portal.street_number,
      'city', v_portal.city,
      'postalCode', v_portal.postal_code,
      'subscriptionPlan', v_portal.subscription_plan,
      'subscriptionStatus', v_portal.subscription_status,
      'customerReminderHoursBefore', v_portal.customer_reminder_hours_before,
      'createdAt', v_portal.created_at,
      'updatedAt', v_portal.updated_at
    ),
    'clienti', v_portal.clienti,
    'appuntamenti', v_portal.appuntamenti,
    'servizi', v_portal.servizi,
    'operatori', v_portal.operatori,
    'richiestePrenotazione', v_portal.richieste_prenotazione,
    'availabilitySettings', v_portal.availability_settings
  );
end;
$$;

create or replace function public.queue_due_appointment_push_reminders(
  p_now timestamptz default timezone('utc', now())
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

    v_appointment_at := v_row.appointment_date::timestamp + v_row.appointment_time;
    v_scheduled_for := v_appointment_at - make_interval(hours => v_row.reminder_hours_before);

    if v_scheduled_for > p_now or v_appointment_at <= p_now then
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
        'hoursBefore', v_row.reminder_hours_before
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
