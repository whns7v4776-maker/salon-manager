delete from public.cash_movements
where appointment_id in (
  select a.id
  from public.appointments as a
  left join public.customers as c
    on c.id = a.customer_id
  left join public.booking_requests as br
    on br.id = a.booking_request_id
  where lower(trim(coalesce(c.email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com')
     or lower(trim(coalesce(br.customer_email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com')
     or a.workspace_id in (
       select w.id
       from public.workspaces as w
       where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
     )
);

delete from public.appointments
where id in (
  select a.id
  from public.appointments as a
  left join public.customers as c
    on c.id = a.customer_id
  left join public.booking_requests as br
    on br.id = a.booking_request_id
  where lower(trim(coalesce(c.email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com')
     or lower(trim(coalesce(br.customer_email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com')
     or a.workspace_id in (
       select w.id
       from public.workspaces as w
       where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
     )
);

delete from public.booking_requests
where lower(trim(coalesce(customer_email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com')
   or workspace_id in (
     select w.id
     from public.workspaces as w
     where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
   );

delete from public.booking_slot_waitlist
where lower(trim(coalesce(customer_email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com');

delete from public.customers
where lower(trim(coalesce(email::text, ''))) in ('marziomus@icloud.com', 'marzioposte13@gmail.com')
   or workspace_id in (
     select w.id
     from public.workspaces as w
     where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
   );

update public.client_portals
set
  clienti = '[]'::jsonb,
  appuntamenti = '[]'::jsonb,
  servizi = '[]'::jsonb,
  operatori = '[]'::jsonb,
  richieste_prenotazione = '[]'::jsonb,
  updated_at = timezone('utc', now())
where workspace_id in (
  select w.id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
);

delete from public.services
where workspace_id in (
  select w.id
  from public.workspaces as w
  where lower(trim(coalesce(w.owner_email::text, ''))) = 'marziomus@gmail.com'
);

delete from public.workspace_members
where lower(trim(coalesce(email::text, ''))) = 'marziomus@gmail.com';
