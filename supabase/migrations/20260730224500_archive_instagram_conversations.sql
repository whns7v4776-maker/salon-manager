alter table public.instagram_conversations
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by text;

create index if not exists instagram_conversations_archived_at_idx
  on public.instagram_conversations (archived_at desc)
  where archived_at is not null;

update public.instagram_conversations
set
  archived_at = coalesce(archived_at, updated_at, timezone('utc', now())),
  archived_by = coalesce(archived_by, 'admin')
where status = 'closed';

comment on column public.instagram_conversations.archived_at is
  'Manual archive marker. Archived conversations remain closed until explicitly restored.';
