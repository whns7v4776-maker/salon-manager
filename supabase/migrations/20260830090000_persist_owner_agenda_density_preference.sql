-- Agenda density is server-authoritative but intentionally independent by
-- surface: iOS/Android share "app", while browsers share "web". NULL means
-- that the owner never chose on that surface, so clients bootstrap app at 58%
-- and web at 100% without writing either default to the other surface.

alter table public.workspaces
  add column if not exists agenda_density_app text;

alter table public.workspaces
  add column if not exists agenda_density_app_updated_at timestamptz;

alter table public.workspaces
  add column if not exists agenda_density_web text;

alter table public.workspaces
  add column if not exists agenda_density_web_updated_at timestamptz;

-- Harden a possible partial/idempotent installation before adding checks.
update public.workspaces
set
  agenda_density_app = null,
  agenda_density_app_updated_at = null
where agenda_density_app is not null
  and agenda_density_app not in (
    'massima', 'panorama', 'compatta', 'comoda', 'normale'
  );

update public.workspaces
set
  agenda_density_web = null,
  agenda_density_web_updated_at = null
where agenda_density_web is not null
  and agenda_density_web not in (
    'massima', 'panorama', 'compatta', 'comoda', 'normale'
  );

update public.workspaces
set agenda_density_app_updated_at =
  date_trunc('milliseconds', clock_timestamp())
where agenda_density_app is not null
  and agenda_density_app_updated_at is null;

update public.workspaces
set agenda_density_app_updated_at = null
where agenda_density_app is null
  and agenda_density_app_updated_at is not null;

update public.workspaces
set agenda_density_web_updated_at =
  date_trunc('milliseconds', clock_timestamp())
where agenda_density_web is not null
  and agenda_density_web_updated_at is null;

update public.workspaces
set agenda_density_web_updated_at = null
where agenda_density_web is null
  and agenda_density_web_updated_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_agenda_density_app_valid'
  ) then
    alter table public.workspaces
      add constraint workspaces_agenda_density_app_valid
      check (
        agenda_density_app is null
        or agenda_density_app in (
          'massima', 'panorama', 'compatta', 'comoda', 'normale'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_agenda_density_web_valid'
  ) then
    alter table public.workspaces
      add constraint workspaces_agenda_density_web_valid
      check (
        agenda_density_web is null
        or agenda_density_web in (
          'massima', 'panorama', 'compatta', 'comoda', 'normale'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_agenda_density_app_version_pair_valid'
  ) then
    alter table public.workspaces
      add constraint workspaces_agenda_density_app_version_pair_valid
      check (
        (agenda_density_app is null) =
        (agenda_density_app_updated_at is null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.workspaces'::regclass
      and conname = 'workspaces_agenda_density_web_version_pair_valid'
  ) then
    alter table public.workspaces
      add constraint workspaces_agenda_density_web_version_pair_valid
      check (
        (agenda_density_web is null) =
        (agenda_density_web_updated_at is null)
      );
  end if;
end;
$$;

-- Remove an unapplied/partially applied unified overload if present. The
-- surface-aware overloads below are the only supported contract.
drop function if exists public.get_owner_agenda_density_preference_v1(uuid);
drop function if exists public.get_owner_agenda_density_preference_v1(
  uuid,
  text
);
drop function if exists public.set_owner_agenda_density_preference_v1(
  uuid,
  text,
  timestamptz
);
drop function if exists public.set_owner_agenda_density_preference_v1(
  uuid,
  text,
  text,
  timestamptz
);

create function public.get_owner_agenda_density_preference_v1(
  p_workspace_id uuid,
  p_surface text
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $$
declare
  v_surface text := lower(trim(coalesce(p_surface, '')));
  v_workspace public.workspaces%rowtype;
begin
  if p_workspace_id is null
    or p_workspace_id is distinct from public.current_workspace_id()
    or not public.workspace_access_allowed()
  then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if v_surface not in ('app', 'web') then
    raise exception 'invalid_agenda_density_surface' using errcode = '22023';
  end if;

  select workspace.*
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
  limit 1;

  if v_workspace.id is null then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'surface', v_surface,
    'densityId', case
      when v_surface = 'app' then v_workspace.agenda_density_app
      else v_workspace.agenda_density_web
    end,
    'updatedAt', case
      when v_surface = 'app' then v_workspace.agenda_density_app_updated_at
      else v_workspace.agenda_density_web_updated_at
    end
  );
end;
$$;

create function public.set_owner_agenda_density_preference_v1(
  p_workspace_id uuid,
  p_surface text,
  p_density_id text,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_surface text := lower(trim(coalesce(p_surface, '')));
  v_density_id text := lower(trim(coalesce(p_density_id, '')));
  v_workspace public.workspaces%rowtype;
  v_applied boolean := false;
begin
  if p_workspace_id is null
    or p_workspace_id is distinct from public.current_workspace_id()
    or not public.workspace_access_allowed()
  then
    raise exception 'workspace_access_denied' using errcode = '42501';
  end if;

  if v_surface not in ('app', 'web') then
    raise exception 'invalid_agenda_density_surface' using errcode = '22023';
  end if;

  if v_density_id not in (
    'massima',
    'panorama',
    'compatta',
    'comoda',
    'normale'
  ) then
    raise exception 'invalid_agenda_density' using errcode = '22023';
  end if;

  select workspace.*
  into v_workspace
  from public.workspaces as workspace
  where workspace.id = p_workspace_id
  for update;

  if v_workspace.id is null then
    raise exception 'workspace_not_found' using errcode = 'P0002';
  end if;

  if v_surface = 'app' then
    if (
      v_workspace.agenda_density_app is null
      and v_workspace.agenda_density_app_updated_at is null
      and p_expected_updated_at is null
    ) or (
      v_workspace.agenda_density_app is not null
      and v_workspace.agenda_density_app_updated_at is not null
      and p_expected_updated_at is not null
      and v_workspace.agenda_density_app_updated_at = p_expected_updated_at
    ) then
      update public.workspaces as workspace
      set
        agenda_density_app = v_density_id,
        agenda_density_app_updated_at = greatest(
          date_trunc('milliseconds', clock_timestamp()),
          coalesce(
            v_workspace.agenda_density_app_updated_at + interval '1 millisecond',
            '-infinity'::timestamptz
          )
        )
      where workspace.id = p_workspace_id
      returning workspace.* into v_workspace;

      v_applied := true;
    end if;
  else
    if (
      v_workspace.agenda_density_web is null
      and v_workspace.agenda_density_web_updated_at is null
      and p_expected_updated_at is null
    ) or (
      v_workspace.agenda_density_web is not null
      and v_workspace.agenda_density_web_updated_at is not null
      and p_expected_updated_at is not null
      and v_workspace.agenda_density_web_updated_at = p_expected_updated_at
    ) then
      update public.workspaces as workspace
      set
        agenda_density_web = v_density_id,
        agenda_density_web_updated_at = greatest(
          date_trunc('milliseconds', clock_timestamp()),
          coalesce(
            v_workspace.agenda_density_web_updated_at + interval '1 millisecond',
            '-infinity'::timestamptz
          )
        )
      where workspace.id = p_workspace_id
      returning workspace.* into v_workspace;

      v_applied := true;
    end if;
  end if;

  return jsonb_build_object(
    'workspaceId', v_workspace.id,
    'surface', v_surface,
    'densityId', case
      when v_surface = 'app' then v_workspace.agenda_density_app
      else v_workspace.agenda_density_web
    end,
    'updatedAt', case
      when v_surface = 'app' then v_workspace.agenda_density_app_updated_at
      else v_workspace.agenda_density_web_updated_at
    end,
    'applied', v_applied
  );
end;
$$;

revoke all on function public.get_owner_agenda_density_preference_v1(
  uuid,
  text
) from public;
grant execute on function public.get_owner_agenda_density_preference_v1(
  uuid,
  text
) to authenticated;

revoke all on function public.set_owner_agenda_density_preference_v1(
  uuid,
  text,
  text,
  timestamptz
) from public;
grant execute on function public.set_owner_agenda_density_preference_v1(
  uuid,
  text,
  text,
  timestamptz
) to authenticated;

notify pgrst, 'reload schema';
