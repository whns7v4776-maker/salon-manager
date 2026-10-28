import fs from "node:fs";
import os from "node:os";
const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const token = fs
  .readFileSync(os.homedir() + "/.supabase/access-token", "utf8")
  .trim();
const migration = process.argv.includes("--deployed")
  ? ""
  : fs.readFileSync(
      "supabase/migrations/20261001210000_loyalty_checkout_rewards.sql",
      "utf8",
    );
const tests =
  fs.readFileSync("scripts/test-service-packages.sql", "utf8") +
  "\n" +
  fs.readFileSync("scripts/test-loyalty-checkout.sql", "utf8");
const result = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "BEGIN;\n" +
        migration +
        "\n" +
        tests +
        "\nSET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;",
    }),
  },
);
if (!result.ok) {
  console.log(await result.text());
  process.exit(1);
}
console.log("Loyalty transaction checks passed, rolled back.");
