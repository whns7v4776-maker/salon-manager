import fs from "node:fs";
import os from "node:os";
const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const token = fs
  .readFileSync(`${os.homedir()}/.supabase/access-token`, "utf8")
  .trim();
const deploy = process.argv.includes("--deploy");
const filename = deploy
  ? "20261004121000_package_payment_identity"
  : "20261004120000_package_storefront";
const migration = fs.readFileSync(
  `supabase/migrations/${filename}.sql`,
  "utf8",
);
const tests = fs.readFileSync("scripts/test-package-storefront.sql", "utf8");
const query = deploy
  ? `BEGIN;${migration}\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES('20261004121000','package_payment_identity',ARRAY[${"'" + migration.replaceAll("'", "''") + "'"}]);COMMIT;`
  : `BEGIN;${fs.readFileSync("supabase/migrations/20261004121000_package_payment_identity.sql", "utf8")}${tests}SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;`;
const response = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  },
);
if (!response.ok) {
  console.error(await response.text());
  process.exit(1);
}
console.log(
  deploy
    ? "Storefront backend deployed."
    : "Storefront transactional checks passed; all fixtures rolled back.",
);
