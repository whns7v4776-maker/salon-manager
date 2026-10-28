import fs from 'node:fs';
import os from 'node:os';
const ref = fs.readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const token = fs.readFileSync(`${os.homedir()}/.supabase/access-token`, 'utf8').trim();
const tests = fs.readFileSync('scripts/test-appointment-complimentary.sql', 'utf8');
const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: `BEGIN;\n${tests}\nSET CONSTRAINTS ALL IMMEDIATE;\nROLLBACK;` }),
});
if (!response.ok) { console.error(await response.text()); process.exit(1); }
console.log('Complimentary service integration checks passed; transaction rolled back.');
