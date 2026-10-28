-- Memoize only stable, identical time-guard reads within the current transaction.
-- Booking writers and the original availability guard remain unchanged.
begin;
create or replace function public.public_time_guard_cached_read_v1(
  p_workspace_id uuid, p_appointment_date date, p_appointment_time time,
  p_requested_duration_minutes integer
) returns boolean language plpgsql stable security definer
set search_path = public
as $$
declare
  cache_key text := jsonb_build_array(p_workspace_id,p_appointment_date,p_appointment_time,p_requested_duration_minutes)::text;
  cached jsonb := coalesce(nullif(current_setting('salonpro.time_guard_reads_v1',true),''),'{}')::jsonb;
  result boolean;
begin
  if cached ? cache_key then
    return (cached ->> cache_key)::boolean;
  end if;
  result := public.is_public_booking_time_allowed_by_availability(
    p_workspace_id,p_appointment_date,p_appointment_time,p_requested_duration_minutes);
  -- Keep transaction-local memory bounded for very large booking windows.
  if octet_length(cached::text) > 65536 then cached := '{}'::jsonb; end if;
  perform set_config('salonpro.time_guard_reads_v1',
    (cached || jsonb_build_object(cache_key,result))::text,true);
  return result;
end;
$$;
revoke all on function public.public_time_guard_cached_read_v1(uuid,date,time,integer) from public,anon,authenticated;

do $$
declare
  definition text;
  updated text;
begin
  select pg_get_functiondef('public.is_public_booking_slot_available_cached_read_v1(uuid,date,time,integer,text,text,text)'::regprocedure)
    into definition;
  if position('public.public_time_guard_cached_read_v1(' in definition)>0 then return; end if;
  updated := replace(definition,'public.is_public_booking_time_allowed_by_availability(',
    'public.public_time_guard_cached_read_v1(');
  if updated=definition then raise exception 'public_time_guard_anchor_missing'; end if;
  execute updated;
end;
$$;
notify pgrst,'reload schema';
commit;
