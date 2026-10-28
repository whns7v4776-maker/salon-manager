import fs from "node:fs";
import os from "node:os";
const ref = fs.readFileSync("supabase/.temp/project-ref", "utf8").trim();
const token = fs
  .readFileSync(`${os.homedir()}/.supabase/access-token`, "utf8")
  .trim();
const migration = process.argv.includes("--deployed")
  ? ""
  : (process.argv.includes("--pending")
      ? ["supabase/migrations/20261001192000_benefit_booking_totals.sql", "supabase/migrations/20261001193000_benefit_payment_verification.sql"]
      : [
          "supabase/migrations/20261001190000_customer_service_packages.sql",
          "supabase/migrations/20261001191000_customer_loyalty_and_gifts.sql",
          "supabase/migrations/20261001192000_benefit_booking_totals.sql",
          "supabase/migrations/20261001193000_benefit_payment_verification.sql",
          "supabase/migrations/20261001200000_benefits_console.sql",
          "supabase/migrations/20261001201000_gift_card_display_identity.sql",
        ]
    )
      .map((p) => fs.readFileSync(p, "utf8"))
      .join("\n");
const tests = fs.readFileSync("scripts/test-service-packages.sql", "utf8");
const response = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `BEGIN;\n${migration}\n${tests}\nSET CONSTRAINTS ALL IMMEDIATE;\nROLLBACK;`,
    }),
  },
);
const output = await response.text();
if (!response.ok) {
  console.error(output);
  process.exit(1);
}
console.log(
  "Database package integration checks passed; transaction rolled back.",
);
