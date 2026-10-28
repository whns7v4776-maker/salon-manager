import fs from "node:fs";
import os from "node:os";
const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const token = fs
  .readFileSync(os.homedir() + "/.supabase/access-token", "utf8")
  .trim();
const migration = process.argv.includes("--pending-access") ? fs.readFileSync("supabase/migrations/20261002011000_shop_closed_order_access.sql","utf8") : process.argv.includes("--deployed")
  ? ""
  : fs.readFileSync(
      "supabase/migrations/20261002010000_shop_pickup_orders.sql",
      "utf8",
    ) + fs.readFileSync("supabase/migrations/20261002011000_shop_closed_order_access.sql","utf8");
const tests = ["test-shop-pickup.sql", "test-shop-inventory.sql", "test-service-packages.sql", "test-loyalty-checkout.sql", "test-benefit-notifications.sql"].map(f => fs.readFileSync("scripts/"+f,"utf8")).join("\n");
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
console.log("Shop pickup integration checks passed, rolled back.");
