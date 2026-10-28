-- Emergency moves retain owner membership, row locks and all existing placement
-- validators. Financially finalized rows in the complete plan must be unchanged.
create or replace function public.assert_active_owner_move_plan_v1(p_anchor uuid, p_items jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare a public.appointments%rowtype; r public.appointments%rowtype; i jsonb;
  changed boolean; protected boolean;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  select x.* into a from public.appointments x join public.workspace_members m
    on m.workspace_id=x.workspace_id and m.user_id=auth.uid() where x.id=p_anchor for update of x;
  if a.id is null then raise exception 'appointment_not_found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_reorganization_plan'; end if;
  -- Deterministic order matches the existing atomic writer's locking order.
  perform 1 from public.appointments x where x.workspace_id=a.workspace_id
    and x.id in (select (value->>'appointmentId')::uuid from jsonb_array_elements(p_items)) order by x.id for update;
  for i in select value from jsonb_array_elements(p_items) loop
    select * into r from public.appointments where id=(i->>'appointmentId')::uuid and workspace_id=a.workspace_id;
    if r.id is null then raise exception 'appointment_not_found'; end if;
    changed := coalesce((i->>'appointmentDate')::date,r.appointment_date) is distinct from r.appointment_date
      or coalesce((i->>'appointmentTime')::time,r.appointment_time) is distinct from r.appointment_time
      or coalesce((i->>'durationMinutes')::integer,r.duration_minutes) is distinct from r.duration_minutes
      or coalesce((i->>'priceValue')::numeric,r.price) is distinct from r.price
      or (i ? 'phaseConfig' and coalesce(i->'phaseConfig','null'::jsonb) is distinct from coalesce(r.phase_snapshot,'null'::jsonb))
      or (i ? 'initialOperatorId' and coalesce(nullif(i->>'initialOperatorId',''),'') is distinct from coalesce(nullif(r.phase_operator_assignments->'initial'->>'id',''),r.operator_id,''))
      or (i ? 'initialOperatorName' and coalesce(i->>'initialOperatorName','') is distinct from coalesce(r.phase_operator_assignments->'initial'->>'name',r.operator_name,''))
      or (i ? 'finalOperatorId' and coalesce(nullif(i->>'finalOperatorId',''),'') is distinct from coalesce(nullif(r.phase_operator_assignments->'final'->>'id',''),r.operator_id,''))
      or (i ? 'finalOperatorName' and coalesce(i->>'finalOperatorName','') is distinct from coalesce(r.phase_operator_assignments->'final'->>'name',r.operator_name,''));
    protected := coalesce(r.completed,false) or coalesce(r.cashed_in,false) or coalesce(r.no_show,false);
    if changed and protected then raise exception 'appointment_already_finished'; end if;
  end loop;
end $$;
revoke all on function public.assert_active_owner_move_plan_v1(uuid,jsonb) from public,anon,authenticated;

-- Patch the installed definitions rather than overwriting later validation fixes.
do $migration$
declare body text; old_guard text := $old$if v_current.appointment_date::timestamp + v_current.appointment_time
       <= timezone('Europe/Rome', now()) then
      raise exception 'appointment_already_started';
    end if;$old$;
new_guard text := $new$-- Active moves require the preflight in the authenticated atomic v6 writer.
    if v_current.appointment_date::timestamp + v_current.appointment_time
       <= timezone('Europe/Rome', now())
       and coalesce(current_setting('salonpro.active_move_plan_verified',true),'') <> p_anchor_appointment_id::text then
      raise exception 'appointment_already_started';
    end if;$new$;
needle text := 'v_result := public.apply_owner_linked_reorganization_v5(';
begin
  body := pg_get_functiondef('public.apply_owner_linked_reorganization_v1(uuid,jsonb,boolean,boolean)'::regprocedure);
  if position(old_guard in body)>0 then execute replace(body,old_guard,new_guard);
  elsif position('Active moves require the preflight' in body)=0 then raise exception 'unexpected_active_move_v1_definition'; end if;
  body := pg_get_functiondef('public.apply_owner_linked_reorganization_v6(uuid,jsonb,boolean,boolean)'::regprocedure);
  if position('perform public.assert_active_owner_move_plan_v1(' in body)=0 then
    if position(needle in body)=0 then raise exception 'unexpected_active_move_v6_definition'; end if;
    body := replace(body,needle,'perform public.assert_active_owner_move_plan_v1(p_anchor_appointment_id, p_items);'||chr(10)||'  perform set_config(''salonpro.active_move_plan_verified'',p_anchor_appointment_id::text,true);'||chr(10)||'  '||needle);
    body := replace(body,'    p_allow_customer_overlap'||chr(10)||'  );','    p_allow_customer_overlap'||chr(10)||'  );'||chr(10)||'  perform set_config(''salonpro.active_move_plan_verified'','''',true);');
    execute body;
  end if;
end $migration$;
