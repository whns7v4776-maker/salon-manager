-- Keep older app builds compatible without leaving obsolete ON CONFLICT logic
-- that depended on the former one-row-per-token constraint.

create or replace function public.upsert_public_push_device(
  p_workspace_id uuid,
  p_owner_email citext,
  p_expo_push_token text,
  p_platform public.store_platform default 'manual',
  p_device_model text default null,
  p_app_version text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.upsert_public_push_device(
    p_workspace_id,
    p_owner_email,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    'client'::text,
    null::citext,
    null::text
  );
$$;

create or replace function public.upsert_public_push_device(
  p_workspace_id uuid,
  p_owner_email citext,
  p_expo_push_token text,
  p_platform public.store_platform default 'manual',
  p_device_model text default null,
  p_app_version text default null,
  p_recipient_kind text default 'client'
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.upsert_public_push_device(
    p_workspace_id,
    p_owner_email,
    p_expo_push_token,
    p_platform,
    p_device_model,
    p_app_version,
    p_recipient_kind,
    null::citext,
    null::text
  );
$$;

grant execute on function public.upsert_public_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text
) to anon, authenticated;

grant execute on function public.upsert_public_push_device(
  uuid,
  citext,
  text,
  public.store_platform,
  text,
  text,
  text
) to anon, authenticated;

notify pgrst, 'reload schema';
