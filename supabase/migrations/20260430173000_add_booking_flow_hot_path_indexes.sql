create index if not exists booking_requests_workspace_date_customer_id_status_idx
  on public.booking_requests (
    workspace_id,
    appointment_date,
    customer_id,
    status
  );
create index if not exists booking_requests_workspace_date_customer_phone_status_idx
  on public.booking_requests (
    workspace_id,
    appointment_date,
    customer_phone,
    status
  );
create index if not exists booking_requests_workspace_date_customer_email_status_idx
  on public.booking_requests (
    workspace_id,
    appointment_date,
    customer_email,
    status
  );
create index if not exists appointments_workspace_date_customer_id_idx
  on public.appointments (
    workspace_id,
    appointment_date,
    customer_id
  );
create index if not exists appointments_workspace_date_customer_name_idx
  on public.appointments (
    workspace_id,
    appointment_date,
    customer_name
  );
