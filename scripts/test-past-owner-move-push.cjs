const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 const migration = fs.readFileSync('supabase/migrations/20260914120000_suppress_past_owner_move_push.sql', 'utf8');
 await db.exec(migration.split('do $migration$')[0]);
 const check = async (event,date,time,reference,expected) => {
  const payload={event_type:event,appointmentDate:date,appointmentTime:time};
  const {rows}=await db.query('select public.is_past_owner_move_push($1::jsonb,$2::timestamptz) as suppressed',[JSON.stringify(payload),reference]);
  assert.equal(rows[0].suppressed,expected,JSON.stringify(payload));
 };
 const ref='2026-09-14T10:00:00Z';
 await check('appointment_rescheduled_by_salon','2026-09-14','11:59',ref,true);
 await check('appointment_rescheduled_by_salon','2026-09-14','12:00',ref,false);
 await check('appointment_rescheduled_by_salon','2026-09-14','12:01',ref,false);
 await check('appointment_rescheduled_by_salon','2026-09-13','23:59',ref,true);
 await check('appointment_rescheduled_by_salon','2026-09-15','09:00',ref,false);
 await check('appointment_rescheduled_by_salon','2026-01-14','10:59','2026-01-14T10:00:00Z',true);
 for (const event of ['appointment_created','appointment_reorganized_by_salon','appointment_cancelled','booking_reminder']) await check(event,'2026-09-13','09:00',ref,false);
 await check('appointment_rescheduled_by_salon','bad','09:00',ref,false);
 await check('appointment_rescheduled_by_salon','2026-02-31','09:00',ref,false);
 await db.close();
 console.log('PASS: past move only; future, exact boundary, summer/winter Rome timezone and other notifications preserved');
})().catch(e=>{console.error(e);process.exit(1)});
