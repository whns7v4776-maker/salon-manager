drop function if exists public.cancel_owner_appointment(uuid, date, time, text, text, citext, text);

select pg_notify('pgrst', 'reload schema');
