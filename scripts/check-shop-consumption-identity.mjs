import fs from 'node:fs';
import os from 'node:os';

const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const token = fs.readFileSync(os.homedir() + '/.supabase/access-token', 'utf8').trim();
const migration = process.argv.includes('--deployed') ? '' : fs.readFileSync(
  'supabase/migrations/20261002040000_shop_consumption_service_identity.sql', 'utf8',
);
const tests = [
  'test-shop-consumption-service-identity.sql', 'test-shop-stock-control.sql',
  'test-shop-purchasing.sql', 'test-shop-pickup.sql', 'test-shop-inventory.sql',
  'test-service-packages.sql', 'test-loyalty-checkout.sql', 'test-benefit-notifications.sql',
].map(file => fs.readFileSync('scripts/' + file, 'utf8')).join('\n');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `BEGIN;\n${migration}\n${tests}\nSET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;` }),
});
if (!response.ok) throw new Error(await response.text());
console.log('Shop identity, stock, purchasing, pickup and benefits checks passed; all fixtures rolled back.');
