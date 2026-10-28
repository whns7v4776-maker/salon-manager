import fs from "node:fs";
import os from "node:os";
const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const token = fs
  .readFileSync(os.homedir() + "/.supabase/access-token", "utf8")
  .trim();
const migration = process.argv.includes("--deployed")
  ? ""
  : fs.readFileSync(
      "supabase/migrations/20261002093000_custom_loyalty_earning_rules.sql",
      "utf8",
    );
const files = [
  "scripts/test-loyalty-earning.sql",
  "scripts/test-service-packages.sql",
  "scripts/test-loyalty-checkout.sql",
  "scripts/test-benefit-notifications.sql",
];
const query =
  "BEGIN;\n" +
  migration +
  "\n" +
  files.map((f) => fs.readFileSync(f, "utf8")).join("\n") +
  "\nSET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;";
const result = await fetch(
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
if (!result.ok) {
  console.error(await result.text());
  process.exit(1);
}
console.log(
  "Loyalty earning + existing package, checkout and notification regressions passed. All fixture changes rolled back.",
);
