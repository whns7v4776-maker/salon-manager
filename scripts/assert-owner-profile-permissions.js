const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const migration = read('supabase/migrations/20260905171500_allow_owner_welcome_profile_updates.sql');
const grants = migration.match(/grant update\s*\(([^)]+)\)/i)[1]
  .split(',').map((column) => column.trim()).sort();
assert.deepEqual(grants, ['client_welcome_enabled', 'client_welcome_message', 'client_welcome_title']);
assert.match(migration, /to authenticated;/);
assert.doesNotMatch(migration, /disable row level security|grant update on|to anon/i);
const home = read('app/(tabs)/index.tsx');
const save = home.slice(home.indexOf('const salvaDatiSalone ='), home.indexOf('const salvaAccountSalone ='));
assert.match(save, /ownerEmail: current.ownerEmail/);
assert.doesNotMatch(save, /ownerEmail: accountEmailInput/);
assert.match(save, /requireRemoteProfileConfirmation: true/);
assert.match(home, /value=\{salonAccountEmail\}[\s\S]{0,500}editable=\{false\}/);
assert.match(read('app/cliente-screen.tsx'), /resolveSalonNameFontFamily\(effectiveWorkspace\?\.salonNameDisplayStyle \?\? 'stampatello', effectiveWorkspace\?\.salonNameFontVariant\)/);
console.log('Owner profile permissions, immutable identity and client font: OK');
