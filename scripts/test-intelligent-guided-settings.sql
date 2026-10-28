-- Always roll back the QA writes: no salon settings are committed.
begin;
do $$
declare portal public.client_portals; saved jsonb; fetched jsonb; visibility text;
begin
 select * into portal from public.client_portals where workspace_id='d84f3211-d20f-45a3-9d7f-f551400690fd';
 if portal.workspace_id is null then raise exception 'QA portal missing'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'email',portal.owner_email,'role','authenticated')::text,true);
 saved:=public.update_client_portal_availability_settings(portal.owner_email::text,portal.salon_code,
   portal.availability_settings||jsonb_build_object('guidedSlotsEnabled',true,'guidedSlotsStrategy','intelligent','guidedSlotsVisibility','recommended_and_all','guidedSlotsUpdatedAt',clock_timestamp()));
 if saved->'availabilitySettings'->>'guidedSlotsStrategy' is distinct from 'intelligent' or saved->'availabilitySettings'->>'guidedSlotsVisibility' is distinct from 'recommended_and_all' then raise exception 'Owner save lost intelligent defaults'; end if;
 fetched:=public.get_client_portal_availability_settings(portal.salon_code);
 if fetched->'availabilitySettings'->>'guidedSlotsStrategy' is distinct from 'intelligent' then raise exception 'Public read lost intelligent settings'; end if;
 if public.merge_client_portal_availability_settings_v2(saved->'availabilitySettings',jsonb_build_object('guidedSlotsStrategy','fill_gaps','guidedSlotsUpdatedAt','2020-01-01T00:00:00Z'))->>'guidedSlotsStrategy' is distinct from 'intelligent' then raise exception 'Older mirror replaced new strategy'; end if;
 -- All three explicit choices survive the legacy writer and public reload.
 foreach visibility in array array['recommended_and_all','recommended_first','recommended_only'] loop
   saved:=public.update_client_portal_availability_settings(portal.owner_email::text,portal.salon_code,
     saved->'availabilitySettings'||jsonb_build_object('guidedSlotsVisibility',visibility,'guidedSlotsUpdatedAt',
       greatest(clock_timestamp(),(saved->'availabilitySettings'->>'guidedSlotsUpdatedAt')::timestamptz+interval '1 millisecond')));
   if saved->'availabilitySettings'->>'guidedSlotsVisibility' is distinct from visibility then raise exception 'Server replaced explicit visibility %', visibility; end if;
   fetched:=public.get_client_portal_availability_settings(portal.salon_code);
   if fetched->'availabilitySettings'->>'guidedSlotsVisibility' is distinct from visibility then raise exception 'Public reload replaced visibility %', visibility; end if;
   if public.merge_client_portal_availability_settings_v2(saved->'availabilitySettings',
     jsonb_build_object('guidedSlotsVisibility','recommended_and_all','guidedSlotsUpdatedAt','2020-01-01T00:00:00Z'))->>'guidedSlotsVisibility'
     is distinct from visibility then raise exception 'Older mirror replaced visibility %', visibility; end if;
 end loop;
 -- Only absent/invalid intelligent preferences receive the default.
 update public.client_portals set availability_settings=availability_settings-'guidedSlotsVisibility'
   where workspace_id=portal.workspace_id returning availability_settings into fetched;
 if fetched->>'guidedSlotsVisibility' is distinct from 'recommended_and_all' then raise exception 'Missing visibility did not default'; end if;
 update public.client_portals set availability_settings=jsonb_set(availability_settings,'{guidedSlotsVisibility}','"invalid"')
   where workspace_id=portal.workspace_id returning availability_settings into fetched;
 if fetched->>'guidedSlotsVisibility' is distinct from 'recommended_and_all' then raise exception 'Invalid visibility did not default'; end if;
 -- Existing strategies keep their freely chosen visibility.
 saved:=public.update_client_portal_availability_settings(portal.owner_email::text,portal.salon_code,
   saved->'availabilitySettings'||jsonb_build_object('guidedSlotsStrategy','balanced','guidedSlotsVisibility','recommended_and_all','guidedSlotsUpdatedAt',clock_timestamp()));
 if saved->'availabilitySettings'->>'guidedSlotsVisibility' is distinct from 'recommended_and_all' then raise exception 'Server changed an existing strategy'; end if;
end $$;
rollback;
