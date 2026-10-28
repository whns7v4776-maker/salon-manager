-- Use the existing queue enum; retain appointment_updated in the client payload.
create or replace function public.revise_owner_appointment_service_v1(p_appointment uuid,p_expected timestamptz,p_service uuid,p_price numeric,p_initial integer,p_processing integer,p_final integer,p_operator_id text,p_final_operator_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a appointments; s services; f services; phase jsonb; assignments jsonb; total integer; start_at timestamp; end_at timestamp;
 v_operator_name text; v_final_operator_name text; operators jsonb; owner_payload jsonb; machine text; op jsonb; final_op jsonb; financial jsonb; r booking_requests; customer customers;
begin
 if auth.uid() is null or not workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 select * into a from appointments where id=p_appointment and workspace_id=current_workspace_id();
 if not found then raise exception 'Appuntamento non disponibile'; end if;
 perform pg_advisory_xact_lock(hashtext(a.workspace_id::text||':'||a.appointment_date::text));
 select * into a from appointments where id=p_appointment and workspace_id=current_workspace_id() for update;
 if a.updated_at is distinct from p_expected then raise exception 'Appuntamento aggiornato da un altro dispositivo. Riapri la modifica.'; end if;
 start_at=a.appointment_date::timestamp+a.appointment_time;
 if a.no_show or start_at <= (now() at time zone 'Europe/Rome') then raise exception 'Puoi modificare solo appuntamenti futuri e attivi'; end if;
 if a.booking_request_id is not null then
  select * into r from booking_requests where id=a.booking_request_id and workspace_id=a.workspace_id for update;
  if r.id is null or r.status::text is distinct from 'accepted' then raise exception 'La prenotazione non è più confermata'; end if;
 end if;
 select * into s from services where id=p_service and workspace_id=a.workspace_id and not coalesce(composition_only,false) and superseded_by_composition_id is null for share;
 if not found then raise exception 'Servizio non disponibile nel listino'; end if;
 if coalesce(s.linked_service_config->>'dependencyMode','')='automatic' and exists(select 1 from jsonb_array_elements_text(coalesce(s.linked_service_config->'requiredServiceIds','[]')) d where d is distinct from s.phase_config->>'finalServiceId') then
  raise exception 'Questo servizio richiede una composizione: modifica i componenti dalla composizione';
 end if;
 if p_price is null or p_price<0 or p_price>999999.99 or p_price<>round(p_price,2) then raise exception 'Prezzo non valido'; end if;
 phase=case when s.phase_config->>'mode'='phased' then s.phase_config else null end;
 if p_initial is null or p_processing is null or p_final is null or p_initial<5 or p_initial>480 or p_processing<0 or p_processing>480 or p_final<0 or p_final>480 or p_initial%5<>0 or p_processing%5<>0 or p_final%5<>0 then raise exception 'Tempi non validi: usa intervalli di 5 minuti'; end if;
 if phase is null and (p_processing<>0 or p_final<>0) then raise exception 'Il servizio non prevede fasi'; end if;
 if phase is not null then
  if coalesce((phase->>'finalPhaseEnabled')::boolean,true) and p_final<5 then raise exception 'Durata della fase finale non valida'; end if;
  if not coalesce((phase->>'finalPhaseEnabled')::boolean,true) and p_final<>0 then raise exception 'Il servizio non prevede fase finale'; end if;
  phase=phase||jsonb_build_object('initialDurationMinutes',p_initial,'processingDurationMinutes',p_processing,'finalDurationMinutes',p_final);
  if p_final>0 then
   select * into f from services where workspace_id=a.workspace_id and (id::text=phase->>'finalServiceId' or name=phase->>'finalServiceName') order by (id::text=phase->>'finalServiceId') desc limit 1;
   if not found then raise exception 'Completa la fase finale nel listino'; end if;
  end if;
 end if;
 total=p_initial+p_processing+p_final;end_at=start_at+make_interval(mins=>total);
 if end_at::date<>a.appointment_date then raise exception 'Il servizio deve terminare nella stessa giornata'; end if;
 owner_payload=get_public_portal_owner_payload_cached_v1(a.workspace_id);
 operators=coalesce(owner_payload->'operatori','[]');
 for machine in select distinct jsonb_array_elements_text(coalesce(value->'macchinarioIds','[]')) from jsonb_array_elements(coalesce(owner_payload->'servizi','[]')) where value->>'id' in(s.id::text,f.id::text) or value->>'nome' in(s.name,f.name) loop
  if not exists(select 1 from jsonb_array_elements(coalesce(owner_payload->'macchinari','[]')) m where m->>'id'=machine and coalesce((m->>'attivo')::boolean,true)) then raise exception 'Un macchinario richiesto non è attivo'; end if;
 end loop;
 -- Owner changes may use salon capacity only when that trade has no configured operators.
 if coalesce(p_operator_id,'') like 'salon-capacity::%' then p_operator_id=null; end if;
 if coalesce(p_final_operator_id,'') like 'salon-capacity::%' then p_final_operator_id=null; end if;
 select value into op from jsonb_array_elements(operators) where value->>'id'=p_operator_id;
 v_operator_name=coalesce(op->>'nome',op->>'name');
 if p_operator_id is null then
  if exists(select 1 from jsonb_array_elements(operators) o where lower(trim(coalesce(o->>'mestiere',o->>'required_role','')))=lower(trim(coalesce(s.required_role,'')))) then raise exception 'Scegli l’operatore del nuovo servizio'; end if;
 elsif op is null or (nullif(s.required_role,'') is not null and lower(trim(coalesce(op->>'mestiere',op->>'required_role','')))<>lower(trim(s.required_role)) and public_operator_can_book_service_v1(a.workspace_id,p_operator_id,v_operator_name,s.name,s.required_role) is not true) then raise exception 'Scegli un operatore abilitato al nuovo servizio'; end if;
 if p_final>0 then
  if coalesce((phase->>'sameOperator')::boolean,true) and p_final_operator_id is distinct from p_operator_id then raise exception 'Questo servizio richiede lo stesso operatore nelle due fasi'; end if;
  select value into final_op from jsonb_array_elements(operators) where value->>'id'=p_final_operator_id;
  v_final_operator_name=coalesce(final_op->>'nome',final_op->>'name');
  if p_final_operator_id is null then
   if exists(select 1 from jsonb_array_elements(operators) o where lower(trim(coalesce(o->>'mestiere',o->>'required_role','')))=lower(trim(coalesce(f.required_role,'')))) then raise exception 'Scegli l’operatore della fase finale'; end if;
  elsif final_op is null or (nullif(f.required_role,'') is not null and lower(trim(coalesce(final_op->>'mestiere',final_op->>'required_role','')))<>lower(trim(f.required_role)) and public_operator_can_book_service_v1(a.workspace_id,p_final_operator_id,v_final_operator_name,f.name,f.required_role) is not true) then raise exception 'Scegli un operatore abilitato alla fase finale'; end if;
 end if;
 perform set_config('app.booking_exclude_appointment_id',a.id::text,true);
 perform set_config('app.booking_exclude_request_id',coalesce(a.booking_request_id::text,''),true);
 if not is_public_booking_time_allowed_by_availability(a.workspace_id,a.appointment_date,a.appointment_time,total)
 or not is_public_booking_slot_available(a.workspace_id,a.appointment_date,a.appointment_time,p_initial,s.name,p_operator_id,v_operator_name)
 or phased_operator_interval_conflicts_v1(a.workspace_id,a.appointment_date,a.appointment_time,p_initial,p_operator_id,v_operator_name,a.id,a.booking_request_id)
 or (p_final>0 and (not is_public_booking_slot_available(a.workspace_id,a.appointment_date,(a.appointment_time+make_interval(mins=>p_initial+p_processing))::time,p_final,f.name,p_final_operator_id,v_final_operator_name)
 or phased_operator_interval_conflicts_v1(a.workspace_id,a.appointment_date,(a.appointment_time+make_interval(mins=>p_initial+p_processing))::time,p_final,p_final_operator_id,v_final_operator_name,a.id,a.booking_request_id))) then
  raise exception 'Il nuovo servizio non entra in questo orario: verifica operatori, chiusure e macchinari';
 end if;
 if p_operator_id is null and exists(select 1 from appointments b where b.workspace_id=a.workspace_id and b.id<>a.id and b.appointment_date=a.appointment_date and lower(trim(coalesce(b.required_role,'')))=lower(trim(coalesce(s.required_role,''))) and b.appointment_date::timestamp+b.appointment_time<start_at+make_interval(mins=>p_initial) and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.duration_minutes)>start_at) then raise exception 'La disponibilità del salone è già occupata'; end if;
 if p_final>0 and p_final_operator_id is null and exists(select 1 from appointments b where b.workspace_id=a.workspace_id and b.id<>a.id and b.appointment_date=a.appointment_date and lower(trim(coalesce(b.required_role,'')))=lower(trim(coalesce(f.required_role,''))) and b.appointment_date::timestamp+b.appointment_time<end_at and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.duration_minutes)>start_at+make_interval(mins=>p_initial+p_processing)) then raise exception 'La disponibilità della fase finale è già occupata'; end if;
 if exists(select 1 from appointments b where b.workspace_id=a.workspace_id and b.id<>a.id and b.appointment_date=a.appointment_date
  and ((a.customer_id is not null and b.customer_id=a.customer_id) or lower(trim(b.customer_name))=lower(trim(a.customer_name)))
  and b.appointment_date::timestamp+b.appointment_time<end_at and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.duration_minutes)>start_at) then
  raise exception 'La nuova durata si sovrappone a un altro appuntamento del cliente';
 end if;
 if exists(select 1 from booking_requests b where b.workspace_id=a.workspace_id and b.id is distinct from a.booking_request_id and b.status::text='pending' and b.customer_id=a.customer_id and b.appointment_date=a.appointment_date and b.appointment_date::timestamp+b.appointment_time<end_at and b.appointment_date::timestamp+b.appointment_time+make_interval(mins=>b.requested_duration_minutes)>start_at) then raise exception 'Il cliente ha una richiesta in approvazione nello stesso intervallo'; end if;
 assignments=case when phase is null then null else jsonb_build_object('version',1,'initial',jsonb_build_object('id',p_operator_id,'name',v_operator_name),'final',jsonb_build_object('id',p_final_operator_id,'name',v_final_operator_name)) end;
 if a.service_name is not distinct from s.name and a.price is not distinct from p_price and a.duration_minutes=total
 and a.required_role is not distinct from s.required_role and a.phase_snapshot is not distinct from phase
 and a.phase_operator_assignments is not distinct from assignments and a.operator_id is not distinct from p_operator_id then
  return jsonb_build_object('appointment',to_jsonb(a),'payment',appointment_revision_payment_state(a.id),'unchanged',true);
 end if;
 -- A single transaction: no cancellation/recreation and no orphaned payment.
 perform set_config('salonpro.service_revision',a.id::text,true);
 perform set_config('salonpro.service_revision_free',case when a.price=0 then a.id::text else '' end,true);
 update appointments set service_name=s.name,price=p_price,duration_minutes=total,required_role=s.required_role,phase_snapshot=phase,phase_operator_assignments=assignments,operator_id=p_operator_id,operator_name=v_operator_name,updated_at=clock_timestamp() where id=a.id;
 financial=revise_appointment_payment(a.id,round(p_price*100)::bigint);
 update appointments set cashed_in=((financial->>'receivedCents')::bigint>=round(p_price*100)::bigint) where id=a.id;
 if a.booking_request_id is not null then
  update booking_requests set requested_service_name=s.name,requested_price=p_price,requested_duration_minutes=total,required_role=s.required_role,phase_snapshot=phase,phase_operator_assignments=assignments,requested_operator_id=p_operator_id,requested_operator_name=v_operator_name,viewed_by_customer=false,updated_at=clock_timestamp() where id=a.booking_request_id;
 end if;
 select * into customer from customers where id=a.customer_id and workspace_id=a.workspace_id;
 if coalesce(r.customer_email,customer.email) is not null or coalesce(r.customer_phone,customer.phone) is not null then
  perform queue_public_customer_push(a.workspace_id,'custom'::public.push_event_type,'Appuntamento aggiornato',s.name||' · '||to_char(a.appointment_date,'DD/MM/YYYY')||' alle '||to_char(a.appointment_time,'HH24:MI')||' · '||total||' min · '||replace(to_char(p_price,'FM999999990.00'),'.',',')||' €.'||
   case when (financial->>'refundDueCents')::bigint>0 then ' Rimborso da concordare con il salone: '||replace(to_char((financial->>'refundDueCents')::numeric/100,'FM999999990.00'),'.',',')||' €.'
   when (financial->>'balanceCents')::bigint>0 then ' Da saldare: '||replace(to_char((financial->>'balanceCents')::numeric/100,'FM999999990.00'),'.',',')||' €.' else ' Pagamento già coperto.' end,
   jsonb_build_object('type','appointment_updated','notificationType','appointment_updated','_serviceRevision',true,'revision',(financial->>'revision')::bigint,'eventId','service-revision:'||a.id||':'||(financial->>'revision'),'appointmentId',a.id,'appointmentDate',a.appointment_date,'appointmentTime',a.appointment_time,'serviceName',s.name,'bookingRequestId',a.booking_request_id,'requestId',a.booking_request_id,'_pushTarget','client','_dedupeKey','service-revision:'||a.id||':'||(financial->>'revision'),'screen','cliente','tab','notifications'),coalesce(r.customer_email,customer.email)::citext,coalesce(r.customer_phone,customer.phone));
 end if;
 insert into appointment_service_revision_history(workspace_id,appointment_id,actor_id,previous_snapshot,next_snapshot) values(a.workspace_id,a.id,auth.uid(),to_jsonb(a),(select to_jsonb(x) from appointments x where x.id=a.id));
 perform refresh_workspace_agenda_state(a.workspace_id);
 return jsonb_build_object('appointment',(select to_jsonb(x) from appointments x where x.id=a.id),'payment',financial);
end $$;
