-- CANDIDATE ONLY: tested offline, NOT applied to production.
-- Preserve every authorization check and grant. Normalize only the response
-- status for an invalid customer proof: older clients renew on 403, not 401.
-- PostgREST PT403: https://docs.postgrest.org/en/v14/references/errors.html
begin;
set local lock_timeout='1s';
set local statement_timeout='10s';
do $compatibility$
declare signature text; source text;
old_raise text := $old$RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='42501'$old$;
new_raise text := $new$RAISE EXCEPTION 'customer_portal_access_required' USING ERRCODE='PT403'$new$;
begin
 foreach signature in array array[
 'public.find_public_customer_by_password(text,text,text,text)',
 'public.get_client_portal_snapshot(text)',
 'salonpro_private.portal_assert(text,text,text,boolean)'
 ] loop
  source:=pg_get_functiondef(signature::regprocedure);
  if position(new_raise in source)>0 then continue;end if;
  if position(old_raise in source)=0 then raise exception 'legacy_proof_anchor_changed: %',signature;end if;
  execute replace(source,old_raise,new_raise);
 end loop;
end;
$compatibility$;
notify pgrst,'reload schema';
commit;
