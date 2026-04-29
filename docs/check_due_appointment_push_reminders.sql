-- Verifica promemoria appuntamenti cliente.
-- Esegui questo file nel SQL Editor di Supabase.
--
-- Cosa mostra:
-- 1. quali reminder sono "due adesso" con la nuova finestra robusta di 15 minuti
-- 2. quali reminder erano arretrati e con la logica vecchia sarebbero partiti tutti insieme
-- 3. ultimi reminder già registrati come inviati

with params as (
  select
    timezone('utc', now()) as now_utc,
    interval '15 minutes' as due_window
),
appointments_base as (
  select
    appointment.id as appointment_id,
    appointment.workspace_id,
    workspace.salon_name,
    appointment.customer_name,
    appointment.service_name,
    appointment.appointment_date,
    appointment.appointment_time,
    (
      appointment.appointment_date::timestamp + appointment.appointment_time
    ) as appointment_at,
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
    ) as reminder_hours_before
  from public.appointments as appointment
  join public.workspaces as workspace
    on workspace.id = appointment.workspace_id
  left join public.client_portals as portal
    on portal.workspace_id = appointment.workspace_id
  where appointment.completed = false
    and appointment.no_show = false
),
appointments_due as (
  select
    base.*,
    (
      base.appointment_at - make_interval(hours => base.reminder_hours_before)
    ) as scheduled_for
  from appointments_base as base
  where base.reminder_hours_before > 0
),
not_sent_yet as (
  select
    due.*
  from appointments_due as due
  where not exists (
    select 1
    from public.appointment_push_reminders as reminder
    where reminder.workspace_id = due.workspace_id
      and reminder.appointment_id = due.appointment_id
      and reminder.reminder_hours_before = due.reminder_hours_before
  )
)

select
  'due_now_new_logic' as bucket,
  due.workspace_id,
  due.salon_name,
  due.appointment_id,
  due.customer_name,
  due.service_name,
  due.appointment_date,
  due.appointment_time,
  due.reminder_hours_before,
  due.scheduled_for,
  params.now_utc,
  due.appointment_at - params.now_utc as time_until_appointment
from not_sent_yet as due
cross join params
where due.appointment_at > params.now_utc
  and due.scheduled_for <= params.now_utc
  and due.scheduled_for > params.now_utc - params.due_window

union all

select
  'old_logic_backlog' as bucket,
  due.workspace_id,
  due.salon_name,
  due.appointment_id,
  due.customer_name,
  due.service_name,
  due.appointment_date,
  due.appointment_time,
  due.reminder_hours_before,
  due.scheduled_for,
  params.now_utc,
  due.appointment_at - params.now_utc as time_until_appointment
from not_sent_yet as due
cross join params
where due.appointment_at > params.now_utc
  and due.scheduled_for <= params.now_utc - params.due_window

order by bucket, scheduled_for asc, appointment_date asc, appointment_time asc;

-- Ultimi reminder già registrati come inviati.
select
  reminder.sent_at,
  reminder.scheduled_for,
  reminder.workspace_id,
  workspace.salon_name,
  reminder.appointment_id,
  reminder.reminder_hours_before
from public.appointment_push_reminders as reminder
left join public.workspaces as workspace
  on workspace.id = reminder.workspace_id
order by reminder.sent_at desc
limit 50;
