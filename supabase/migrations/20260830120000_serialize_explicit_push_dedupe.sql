-- An explicit _dedupeKey is the authoritative identity of one push event.
-- Serialize inserts per workspace/device/key so two concurrent enqueue paths
-- cannot both pass a NOT EXISTS check and create duplicate customer pushes.

begin;

create or replace function public.prevent_duplicate_explicit_push_event_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dedupe_key text := lower(
    nullif(trim(coalesce(new.payload ->> '_dedupeKey', '')), '')
  );
begin
  if v_dedupe_key is null
    or new.status::text not in ('queued', 'processing', 'sent')
  then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'salonpro:push-dedupe:' ||
      new.workspace_id::text || ':' ||
      coalesce(new.device_id::text, 'no-device') || ':' ||
      v_dedupe_key,
      0
    )
  );

  if exists (
    select 1
    from public.push_notifications as notification
    where notification.workspace_id = new.workspace_id
      and notification.device_id is not distinct from new.device_id
      and notification.status::text in ('queued', 'processing', 'sent')
      and lower(
        trim(coalesce(notification.payload ->> '_dedupeKey', ''))
      ) = v_dedupe_key
  ) then
    return null;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_explicit_push_event
  on public.push_notifications;

create trigger prevent_duplicate_explicit_push_event
before insert on public.push_notifications
for each row
execute function public.prevent_duplicate_explicit_push_event_v1();

revoke all on function public.prevent_duplicate_explicit_push_event_v1()
  from public, anon, authenticated;

commit;
