const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.argv[2] || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create function public.is_public_booking_time_allowed_by_availability(uuid,date,time,integer)
    returns boolean language sql stable as $$ select $4 > 0 and $3 >= time '09:00'
      and $3 + make_interval(mins=>$4) <= time '18:00'
      and not ($3 < time '14:00' and $3 + make_interval(mins=>$4) > time '13:00') $$;
    create function public.is_public_booking_slot_available_cached_read_v1(uuid,date,time,integer,text,text,text)
    returns boolean language sql stable as $$ select public.is_public_booking_time_allowed_by_availability($1,$2,$3,$4) $$;`);
  const original = (await db.query(`select pg_get_functiondef('public.is_public_booking_time_allowed_by_availability(uuid,date,time,integer)'::regprocedure) d`)).rows[0].d;
  await db.exec(fs.readFileSync('supabase/migrations/20260906160000_cache_repeated_public_time_guards.sql','utf8'));
  const checks = await db.query(`select count(*)::int n, count(*) filter(where actual is distinct from expected)::int failures from (
    select public.public_time_guard_cached_read_v1('00000000-0000-4000-8000-000000000001',date '2026-09-08',t,d) actual,
      public.is_public_booking_time_allowed_by_availability('00000000-0000-4000-8000-000000000001',date '2026-09-08',t,d) expected
    from unnest(array[5,10,15,20,25,30,45,60,90,120,240,480]) d
    cross join unnest(array[5,10,15,20,30,60]) step
    cross join lateral (select (time '08:00'+make_interval(mins=>m)) t from generate_series(0,600,step) m) slots
    cross join generate_series(1,2) repeat
  ) results`);
  assert.equal(checks.rows[0].failures, 0);
  assert.equal((await db.query(`select pg_get_functiondef('public.is_public_booking_time_allowed_by_availability(uuid,date,time,integer)'::regprocedure) d`)).rows[0].d, original);
  assert.equal((await db.query(`select has_function_privilege('anon','public.public_time_guard_cached_read_v1(uuid,date,time,integer)','EXECUTE') allowed`)).rows[0].allowed, false);
  assert.equal((await db.query(`select nullif(current_setting('salonpro.time_guard_reads_v1',true),'') value`)).rows[0].value, null);
  console.log(`PASS: ${checks.rows[0].n} duration/step/boundary checks, unchanged original guard, transaction-local cache, no anonymous access.`);
  await db.close();
})().catch(error => { console.error(error); process.exitCode=1; });
