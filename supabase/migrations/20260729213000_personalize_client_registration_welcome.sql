alter table public.workspaces
  add column if not exists client_welcome_enabled boolean not null default true;

alter table public.workspaces
  add column if not exists client_welcome_title text not null
    default 'Benvenuto da {salone}!';

alter table public.workspaces
  add column if not exists client_welcome_message text not null
    default 'Ciao {nome}, siamo felici di averti con noi. Da qui puoi consultare i servizi e prenotare i tuoi appuntamenti.';

alter table public.workspaces
  drop constraint if exists workspaces_client_welcome_title_length_check;
alter table public.workspaces
  add constraint workspaces_client_welcome_title_length_check
  check (char_length(trim(client_welcome_title)) between 2 and 80);

alter table public.workspaces
  drop constraint if exists workspaces_client_welcome_message_length_check;
alter table public.workspaces
  add constraint workspaces_client_welcome_message_length_check
  check (char_length(trim(client_welcome_message)) between 2 and 500);
