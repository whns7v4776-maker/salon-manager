import fs from 'node:fs';
import os from 'node:os';
const ref=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
const token=fs.readFileSync(`${os.homedir()}/.supabase/access-token`,'utf8').trim();
const migration=fs.readFileSync('supabase/migrations/20261003093000_owner_package_booking.sql','utf8');
const tests=fs.readFileSync('scripts/test-owner-package-booking.sql','utf8');
const deploy=process.argv.includes('--deploy');
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query:deploy?`BEGIN;${migration}COMMIT;`:`BEGIN;${migration}${tests}SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;`})});
if(!response.ok){console.error(await response.text());process.exit(1);}
console.log(deploy?'Owner package booking RPC deployed.':'Owner package booking integration tests passed; fixture transaction rolled back.');
