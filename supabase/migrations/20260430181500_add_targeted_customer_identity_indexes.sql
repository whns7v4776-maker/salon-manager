create index if not exists customers_workspace_lower_full_name_idx
  on public.customers (
    workspace_id,
    lower(trim(coalesce(full_name, '')))
  );
create index if not exists appointments_workspace_customer_id_date_idx
  on public.appointments (
    workspace_id,
    customer_id,
    appointment_date
  );
create index if not exists appointments_workspace_lower_customer_name_date_idx
  on public.appointments (
    workspace_id,
    lower(trim(coalesce(customer_name, ''))),
    appointment_date
  );
create index if not exists booking_requests_workspace_customer_id_active_date_idx
  on public.booking_requests (
    workspace_id,
    customer_id,
    appointment_date
  )
  where status in ('pending', 'accepted');
create index if not exists booking_requests_workspace_phone_active_date_idx
  on public.booking_requests (
    workspace_id,
    customer_phone,
    appointment_date
  )
  where status in ('pending', 'accepted');
create index if not exists booking_requests_workspace_email_active_date_idx
  on public.booking_requests (
    workspace_id,
    customer_email,
    appointment_date
  )
  where status in ('pending', 'accepted');
create index if not exists booking_requests_workspace_lower_full_name_active_date_idx
  on public.booking_requests (
    workspace_id,
    lower(
      trim(
        coalesce(customer_name, '') || ' ' || coalesce(customer_surname, '')
      )
    ),
    appointment_date
  )
  where status in ('pending', 'accepted');
