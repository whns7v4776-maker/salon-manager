do $$
declare
  w uuid := gen_random_uuid();
  other_w uuid := gen_random_uuid();
  u uuid := gen_random_uuid();
  result jsonb;
  app_version timestamptz;
  denied boolean;
begin
  insert into auth.users(id, email) values(u, u || '@example.invalid');
  insert into public.workspaces(id, salon_name, slug, owner_email, subscription_status, subscription_ends_at)
    values(w, 'Density RPC fixture', 'density-' || w, u || '@example.invalid', 'active', now() + interval '1 year');
  insert into public.workspace_members(workspace_id, user_id, email) values(w, u, u || '@example.invalid');
  perform set_config('request.jwt.claim.sub', u::text, true);
  set local role authenticated;

  result := public.set_owner_agenda_density_preference_v1(w, 'app', 'compatta', null);
  if result->>'applied' <> 'true' or result->>'densityId' <> 'compatta' then
    raise exception 'Authenticated owner cannot persist app density';
  end if;
  app_version := (result->>'updatedAt')::timestamptz;
  result := public.set_owner_agenda_density_preference_v1(w, 'app', 'normale', null);
  if result->>'applied' <> 'false' or result->>'densityId' <> 'compatta' then
    raise exception 'Stale device overwrote current preference';
  end if;
  result := public.set_owner_agenda_density_preference_v1(w, 'web', 'massima', null);
  if result->>'applied' <> 'true' then raise exception 'Web preference rejected'; end if;
  result := public.get_owner_agenda_density_preference_v1(w, 'app');
  if result->>'densityId' <> 'compatta' or (result->>'updatedAt')::timestamptz <> app_version then
    raise exception 'Web write altered app preference';
  end if;
  result := public.set_owner_agenda_density_preference_v1(w, 'app', 'normale', app_version);
  if result->>'applied' <> 'true' or (result->>'updatedAt')::timestamptz <= app_version then
    raise exception 'Versioned update failed';
  end if;

  denied := false;
  begin perform public.set_owner_agenda_density_preference_v1(other_w, 'app', 'normale', null);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Foreign workspace accepted'; end if;
  denied := false;
  begin perform public.set_owner_agenda_density_preference_v1(w, 'other', 'normale', null);
  exception when invalid_parameter_value then denied := true; end;
  if not denied then raise exception 'Invalid surface accepted'; end if;
  denied := false;
  begin perform public.set_owner_agenda_density_preference_v1(w, 'app', 'invalid', null);
  exception when invalid_parameter_value then denied := true; end;
  if not denied then raise exception 'Invalid density accepted'; end if;
  denied := false;
  begin update public.workspaces set agenda_density_app = 'massima' where id = w;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Direct density write bypasses revision checks'; end if;

  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  denied := false;
  begin perform public.set_owner_agenda_density_preference_v1(w, 'app', 'normale', null);
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Nonmember accepted'; end if;
  reset role;
  if has_function_privilege('anon', 'public.set_owner_agenda_density_preference_v1(uuid,text,text,timestamptz)', 'EXECUTE') then
    raise exception 'Anonymous density write allowed';
  end if;
end;
$$;
