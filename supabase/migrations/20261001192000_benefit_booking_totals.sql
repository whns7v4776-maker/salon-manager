-- Preserve extra charges in the immediate booking response and ignore optional composition suggestions.
create or replace function public.save_service_package(p_id uuid,p_revision integer,p_name text,p_services jsonb,p_uses integer,p_months integer,p_price_cents bigint,p_product_discount integer,p_archived boolean default false)
returns public.service_package_catalog language plpgsql security definer set search_path=public as $$
declare w uuid=public.current_workspace_id(); terms jsonb='[]'; item jsonb; entry jsonb; result service_package_catalog;
begin
 if w is null or not public.workspace_access_allowed() then raise exception 'Accesso non consentito'; end if;
 if p_archived and p_id is not null then
  update service_package_catalog set archived=true,revision=revision+1,updated_at=now() where id=p_id and workspace_id=w and revision=p_revision returning * into result;
  if not found then raise exception 'Catalogo cambiato: ricarica'; end if;
  return result;
 end if;
 if jsonb_typeof(p_services)<>'array' or jsonb_array_length(p_services) not between 1 and 50 then raise exception 'Seleziona i servizi inclusi'; end if;
 for item in select value from jsonb_array_elements(p_services) loop
  entry=null;
  if item->>'kind'='service' then
   select jsonb_build_object('kind','service','id',id,'name',name,'componentIds',jsonb_build_array(id)) into entry from services
   where id=(item->>'id')::uuid and workspace_id=w and superseded_by_composition_id is null;
  elsif item->>'kind'='composition' then
   select jsonb_build_object('kind','composition','id',c.id,'name',c.name,'componentIds',
    (select jsonb_agg(i.service_id order by i.position) from service_composition_items i where i.composition_id=c.id and i.workspace_id=w and i.link_type='required'))
    into entry from service_compositions c where c.id=(item->>'id')::uuid and c.workspace_id=w and c.is_active;
  end if;
  if entry is null or entry->'componentIds'='null'::jsonb then raise exception 'Servizio non disponibile'; end if;
  if not terms @> jsonb_build_array(entry) then terms=terms||jsonb_build_array(entry); end if;
 end loop;
 if p_id is null then
  insert into service_package_catalog(workspace_id,name,entitlements,uses,months,price_cents,product_discount)
  values(w,trim(p_name),terms,p_uses,p_months,p_price_cents,p_product_discount) returning * into result;
 else
  update service_package_catalog set name=trim(p_name),entitlements=terms,uses=p_uses,months=p_months,price_cents=p_price_cents,
   product_discount=p_product_discount,archived=p_archived,revision=revision+1,updated_at=now()
   where id=p_id and workspace_id=w and revision=p_revision returning * into result;
  if not found then raise exception 'Pacchetto aggiornato altrove: ricarica prima di salvare'; end if;
 end if;
 return result;
end $$;

create or replace function public.create_package_booking(p_package_id uuid,p_token text,p_key text,p_rpc text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare ctx jsonb; p customer_service_packages; r service_package_redemptions; ent jsonb; result jsonb; proc record; args text; service_id uuid; service_kind text; n integer;
begin
 if p_rpc not in ('create_public_booking_request_ultralight_v4','create_public_phased_booking_request_v5','create_public_booking_composition_v1','create_public_booking_dependency_v1') then raise exception 'Prenotazione pacchetto non supportata'; end if;
 if length(coalesce(p_key,'')) not between 1 and 200 then raise exception 'Identificativo prenotazione mancante'; end if;
 ctx=public.verified_booking_payment_context(p_payload->>'p_salon_code',p_payload->>'p_customer_email',p_payload->>'p_customer_phone',p_token);
 if ctx is null then raise exception 'Verifica la password per usare il pacchetto'; end if;
 select * into p from customer_service_packages where id=p_package_id and customer_id=(ctx->>'customerId')::uuid and workspace_id=(ctx->>'workspaceId')::uuid for update;
 if not found then raise exception 'Pacchetto non disponibile'; end if;
 select * into r from service_package_redemptions where package_id=p.id and idempotency_key=p_key;
 if found then
  if r.response is null then raise exception 'Prenotazione in elaborazione'; end if;
  return r.response;
 end if;
 if (p_payload->>'p_appointment_date')::date not between p.starts_on and p.expires_on then raise exception 'Pacchetto scaduto o non ancora valido'; end if;
 if (select count(*) from service_package_redemptions where package_id=p.id and state<>'released')>=p.uses then raise exception 'Utilizzi del pacchetto esauriti'; end if;
 if p_rpc='create_public_booking_composition_v1' then service_kind='composition'; service_id=(p_payload->>'p_composition_id')::uuid;
 else
  service_kind='service';
  select id into service_id from services where workspace_id=p.workspace_id and lower(trim(name))=lower(trim(coalesce(p_payload->>'p_requested_service_name',p_payload->>'p_parent_service_name')));
 end if;
 select value into ent from jsonb_array_elements(p.entitlements) where value->>'kind'=service_kind and value->>'id'=service_id::text;
 if ent is null then raise exception 'Servizio non incluso nel pacchetto'; end if;
 -- A changed composition cannot silently change an already purchased agreement.
 if service_kind='composition' and ent->'componentIds' is distinct from (select jsonb_agg(i.service_id order by i.position) from service_composition_items i where i.composition_id=(ent->>'id')::uuid and i.workspace_id=p.workspace_id and i.link_type='required') then
  raise exception 'Composizione modificata: contatta il salone per usare il pacchetto acquistato';
 end if;
 insert into service_package_redemptions(workspace_id,package_id,service_key,idempotency_key)
 values(p.workspace_id,p.id,service_kind||':'||service_id,p_key) returning * into r;
 perform set_config('salonpro.package_redemption',r.id::text,true);
 -- Bind only known named arguments from a strictly allowlisted function.
 select x.oid,x.proargnames,x.proargtypes into strict proc from pg_proc x join pg_namespace ns on ns.oid=x.pronamespace where ns.nspname='public' and x.proname=p_rpc;
 select string_agg(format('%I => %s',proc.proargnames[i+1],case when proc.proargtypes[i] in ('jsonb'::regtype,'json'::regtype)
  then format('($1->%L)::%s',proc.proargnames[i+1],format_type(proc.proargtypes[i],null))
  else format('($1->>%L)::%s',proc.proargnames[i+1],format_type(proc.proargtypes[i],null)) end),',') into args
  from generate_series(0,array_length(proc.proargnames,1)-1) i where p_payload ? proc.proargnames[i+1];
 execute format('select public.%I(%s)',p_rpc,args) into result using p_payload;
 perform set_config('salonpro.package_redemption','',true);
 select count(*) into n from service_package_booking_lines where redemption_id=r.id;
 if n<>jsonb_array_length(ent->'componentIds') then raise exception 'Prenotazione già presente o copertura incompleta: nessun utilizzo addebitato'; end if;
 -- Group totals must also reflect the covered components, including extra paid services.
 update appointment_groups g set total_price=(select sum(b.requested_price) from booking_requests b where b.appointment_group_id=g.id)
 where g.id in (select b.appointment_group_id from booking_requests b join service_package_booking_lines l on l.request_id=b.id where l.redemption_id=r.id);
 result=result||jsonb_build_object('packageId',p.id,'packageName',p.name,
  'packagePayablePrice',coalesce((select sum(b.requested_price) from booking_requests b where b.id=(result->>'id')::uuid or b.appointment_group_id=coalesce(result->>'groupId',result->>'group_id')::uuid),0));
 update service_package_redemptions set response=result where id=r.id;
 return result;
end $$;
