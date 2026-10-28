#!/usr/bin/env node
// Prepare reviewable SQL only. This script never connects to or changes a DB.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = '20261009130000';
const migrationPath = resolve(repository, `supabase/migrations/${version}_customer_registration_approval.sql`);
const targetPath = resolve(repository, process.argv[2] || 'work/customer-registration-approval-20261009/apply.private.sql');
const migration = await readFile(migrationPath, 'utf8');
const migrationQuote = '$registration_approval_migration_20261009130000$';
const applyQuote = '$registration_approval_apply_20261009130000$';
if (migration.includes(migrationQuote) || migration.includes(applyQuote)) {
  throw new Error('Migration conflicts with SQL quotation delimiter');
}
const sql = `begin;
set local lock_timeout = '10s';
set local statement_timeout = '120s';
do ${applyQuote}
declare
  v_sql text := ${migrationQuote}${migration}${migrationQuote};
  v_registered text[];
begin
  -- Serialize this exact version without blocking unrelated migrations.
  perform pg_advisory_xact_lock(hashtextextended('salonpro:migration:${version}',0));
  select statements into v_registered from supabase_migrations.schema_migrations
    where version='${version}' for update;
  if found then
    if v_registered is distinct from array[v_sql] then
      raise exception 'migration_version_content_mismatch:${version}';
    end if;
    return;
  end if;
  execute v_sql;
  insert into supabase_migrations.schema_migrations(version,name,statements)
    values('${version}','customer_registration_approval',array[v_sql]);
end ${applyQuote};
notify pgrst, 'reload schema';
commit;
select version,name,cardinality(statements)=1 as migration_recorded
  from supabase_migrations.schema_migrations where version='${version}';
`;
await mkdir(dirname(targetPath), { recursive: true });
await writeFile(targetPath, sql, { mode: 0o600 });
console.log(JSON.stringify({ version, migrationPath, targetPath,
  sha256: createHash('sha256').update(migration).digest('hex') }, null, 2));
