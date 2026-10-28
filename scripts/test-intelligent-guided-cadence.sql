begin;
do $$
declare
  portal public.client_portals%rowtype;
  saved jsonb; settings jsonb; before_settings jsonb; before_snapshot jsonb; after_snapshot jsonb;
  backup jsonb; denied boolean; snapshot_settings jsonb; visibility text; fetched jsonb;
begin
  select * into portal from public.client_portals where workspace_id='d84f3211-d20f-45a3-9d7f-f551400690fd';
  if not found then raise exception 'QA portal missing'; end if;
  select payload into before_snapshot from public.owner_app_snapshots where workspace_id=portal.workspace_id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',gen_random_uuid(),'email',portal.owner_email,'role','authenticated')::text,true);
  -- Known baseline; the entire test is rolled back.
  perform public.set_guided_slots_with_cadence_v1(false,'balanced','recommended_first');
  perform public.set_public_slot_interval_v1('follow_agenda',20);
  select availability_settings into before_settings from public.client_portals where workspace_id=portal.workspace_id;
  saved := public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_and_all',10);
  settings := saved->'availabilitySettings';
  if settings->>'guidedSlotsStrategy'<>'intelligent' or settings->>'guidedSlotsVisibility'<>'recommended_and_all'
     or settings->>'publicSlotIntervalMode'<>'custom' or settings->>'publicSlotMinimumIntervalMinutes'<>'10'
     then raise exception 'Activation was not atomic'; end if;
  backup := settings->'intelligentGuidedCadenceRestore';
  if backup->>'previousMode'<>'follow_agenda' or backup->>'previousMinimum'<>'20'
     then raise exception 'Previous preference missing'; end if;
  select payload->'availabilitySettings' into snapshot_settings from public.owner_app_snapshots where workspace_id=portal.workspace_id;
  if before_snapshot is not null and (snapshot_settings->>'guidedSlotsStrategy'<>'intelligent'
     or snapshot_settings->>'publicSlotMinimumIntervalMinutes'<>'10' or snapshot_settings->'intelligentGuidedCadenceRestore' is distinct from backup)
     then raise exception 'Private recovery snapshot disagrees with the portal'; end if;
  if settings-array['guidedSlotsEnabled','guidedSlotsStrategy','guidedSlotsVisibility','guidedSlotsUpdatedAt','publicSlotIntervalMode','publicSlotMinimumIntervalMinutes','publicSlotIntervalUpdatedAt','intelligentGuidedCadenceRestore']
     is distinct from before_settings-array['guidedSlotsEnabled','guidedSlotsStrategy','guidedSlotsVisibility','guidedSlotsUpdatedAt','publicSlotIntervalMode','publicSlotMinimumIntervalMinutes','publicSlotIntervalUpdatedAt','intelligentGuidedCadenceRestore']
     then raise exception 'Unrelated availability settings changed'; end if;
  -- Visibility changes are independent from the initial cadence and its backup.
  foreach visibility in array array['recommended_and_all','recommended_first','recommended_only'] loop
    saved := public.set_guided_slots_with_cadence_v1(true,'intelligent',visibility);
    if saved->'availabilitySettings'->>'guidedSlotsVisibility' is distinct from visibility
       or saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'10'
       or saved->'availabilitySettings'->'intelligentGuidedCadenceRestore' is distinct from backup then
      raise exception 'Visibility choice changed cadence/backup or did not save: %',visibility;
    end if;
    fetched := public.get_client_portal_availability_settings(portal.salon_code);
    if fetched->'availabilitySettings'->>'guidedSlotsVisibility' is distinct from visibility then
      raise exception 'Public reload disagrees with visibility: %',visibility;
    end if;
    select payload->'availabilitySettings' into snapshot_settings from public.owner_app_snapshots where workspace_id=portal.workspace_id;
    if before_snapshot is not null and snapshot_settings->>'guidedSlotsVisibility' is distinct from visibility then
      raise exception 'Owner recovery snapshot disagrees with visibility: %',visibility;
    end if;
  end loop;
  -- Repeated selection and stale full snapshots must keep the original backup.
  saved := public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',5);
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'10'
     or saved->'availabilitySettings'->'intelligentGuidedCadenceRestore' is distinct from backup then raise exception 'Repeated selection overwrote cadence or backup'; end if;
  saved := public.update_client_portal_availability_settings(portal.owner_email::text,portal.salon_code,
    (saved->'availabilitySettings')-'intelligentGuidedCadenceRestore');
  if saved->'availabilitySettings'->'intelligentGuidedCadenceRestore' is distinct from backup then raise exception 'Legacy payload erased recovery backup'; end if;
  update public.owner_app_snapshots set payload=jsonb_set(payload,'{availabilitySettings}',
    (payload->'availabilitySettings')-'intelligentGuidedCadenceRestore',true) where workspace_id=portal.workspace_id;
  if before_snapshot is not null and (select payload->'availabilitySettings'->'intelligentGuidedCadenceRestore'
    from public.owner_app_snapshots where workspace_id=portal.workspace_id) is distinct from backup
    then raise exception 'Stale private snapshot erased recovery backup'; end if;
  saved := public.set_guided_slots_with_cadence_v1(true,'balanced','recommended_first');
  if saved->'availabilitySettings'->>'publicSlotIntervalMode'<>'follow_agenda'
     or saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'20' then raise exception 'Strategy change did not restore the prior cadence'; end if;
  -- Manual edits, including explicitly choosing the same automatic value, win.
  perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',10);
  perform public.set_public_slot_interval_v1('custom',30);
  saved := public.set_guided_slots_with_cadence_v1(false,'intelligent','recommended_only');
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'30' then raise exception 'Manual choice was overwritten on disable'; end if;
  perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',10);
  perform public.set_public_slot_interval_v1('custom',10);
  saved := public.set_guided_slots_with_cadence_v1(false,'balanced','recommended_first');
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'10' then raise exception 'Same-value manual choice was not preserved'; end if;
  perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',5);
  perform public.set_public_slot_interval_v1('follow_agenda',20);
  saved := public.set_guided_slots_with_cadence_v1(false,'balanced','recommended_first');
  if saved->'availabilitySettings'->>'publicSlotIntervalMode'<>'follow_agenda'
     or saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'20' then raise exception 'Manual follow-agenda choice was not preserved'; end if;
  perform public.set_public_slot_interval_v1('custom',10);
  -- Empty/unavailable catalog leaves the existing cadence untouched.
  saved := public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',null);
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'10'
     or jsonb_typeof(saved->'availabilitySettings'->'intelligentGuidedCadenceRestore')='object'
     then raise exception 'No-catalog activation changed the cadence'; end if;
  perform public.set_guided_slots_with_cadence_v1(false,'balanced','recommended_first');
  perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',5);
  saved := public.set_guided_slots_with_cadence_v1(false,'intelligent','recommended_only');
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'10' then raise exception 'Reactivation did not use the latest manual choice as baseline'; end if;
  -- An older web/app can leave the mode through the old writer too.
  perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',5);
  select availability_settings into settings from public.client_portals where workspace_id=portal.workspace_id;
  saved := public.update_client_portal_availability_settings(portal.owner_email::text,portal.salon_code,
    settings||jsonb_build_object('guidedSlotsEnabled',false,'guidedSlotsUpdatedAt',clock_timestamp()+interval '1 second'));
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'10' then raise exception 'Legacy exit did not restore cadence'; end if;
  -- A future timestamp left by an older device must not block a manual edit.
  select availability_settings into settings from public.client_portals where workspace_id=portal.workspace_id;
  perform public.update_client_portal_availability_settings(portal.owner_email::text,portal.salon_code,
    settings||jsonb_build_object('publicSlotIntervalUpdatedAt',clock_timestamp()+interval '1 hour'));
  perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',5);
  perform public.set_public_slot_interval_v1('custom',30);
  saved := public.set_guided_slots_with_cadence_v1(false,'intelligent','recommended_only');
  if saved->'availabilitySettings'->>'publicSlotMinimumIntervalMinutes'<>'30' then raise exception 'Skewed device clock prevented the manual edit'; end if;
  -- Invalid values and anonymous callers cannot partially save either group.
  select availability_settings into settings from public.client_portals where workspace_id=portal.workspace_id;
  denied:=false;
  begin perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',17);
  exception when sqlstate '22023' then denied:=true; end;
  if not denied then raise exception 'Invalid cadence accepted'; end if;
  if (select availability_settings from public.client_portals where workspace_id=portal.workspace_id) is distinct from settings then raise exception 'Failed save changed the portal'; end if;
  perform set_config('request.jwt.claims','{}',true);
  denied:=false;
  begin perform public.set_guided_slots_with_cadence_v1(true,'intelligent','recommended_only',10);
  exception when sqlstate '42501' then denied:=true; end;
  if not denied then raise exception 'Anonymous strategy write allowed'; end if;
  select payload into after_snapshot from public.owner_app_snapshots where workspace_id=portal.workspace_id;
  if before_snapshot is not null and after_snapshot-'availabilitySettings' is distinct from before_snapshot-'availabilitySettings'
     then raise exception 'Unrelated recovery snapshot data changed'; end if;
end $$;
rollback;
