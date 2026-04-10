alter table public.message_templates
  alter column reminder_template
  set default 'Ciao {nome}, ti ricordiamo il tuo appuntamento presso {salone} il {data} alle {ora} per {servizio}. Ti aspettiamo!';

update public.message_templates
set
  reminder_template = 'Ciao {nome}, ti ricordiamo il tuo appuntamento presso {salone} il {data} alle {ora} per {servizio}. Ti aspettiamo!',
  updated_at = timezone('utc', now())
where trim(reminder_template) = 'Ciao {nome}, ti aspettiamo il {data} alle {ora}.';
