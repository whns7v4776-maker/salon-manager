-- Fix JSON null handling only. Preserve the installed function, permissions,
-- availability checks, price resolution and all phase validation downstream.
BEGIN;
DO $patch$
DECLARE
  fn regprocedure := 'public.create_public_phased_booking_request_v5(text,text,numeric,integer,date,time without time zone,text,text,citext,text,text,text,text,text,text,jsonb)'::regprocedure;
  source text := pg_get_functiondef(fn);
  before_text text := $before$v_phase := coalesce(v_timing -> 'phaseConfig', p_phase_snapshot);$before$;
  after_text text := $after$v_phase := coalesce(nullif(v_timing -> 'phaseConfig', 'null'::jsonb), nullif(p_phase_snapshot, 'null'::jsonb));$after$;
BEGIN
  IF position(after_text in source) > 0 THEN RETURN; END IF;
  IF position(before_text in source) = 0 THEN
    RAISE EXCEPTION 'phased_v5_null_fallback_anchor_missing';
  END IF;
  EXECUTE replace(source, before_text, after_text);
END;
$patch$;
NOTIFY pgrst, 'reload schema';
COMMIT;
