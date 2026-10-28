const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/salon-short-code.ts', 'utf8');
let calls = 0;
let response = { data: 'salone-originale', error: null };
const exportsObject = {};
new Function('exports', 'require', ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText)(exportsObject, (name) => name === 'react' ? {} : {
  publicSupabase: { rpc: async () => { calls++; return response; } },
});

(async () => {
  assert.equal(await exportsObject.resolveManualSalonCode('salone-originale'), 'salone-originale');
  assert.equal(calls, 0, 'Old codes must not make an alias request');
  assert.equal(await exportsObject.resolveManualSalonCode('123456'), 'salone-originale');
  response = { data: null, error: { code: 'PGRST202' } };
  assert.equal(await exportsObject.resolveManualSalonCode('123456'), '123456');
  response = { data: null, error: null };
  assert.equal(await exportsObject.resolveManualSalonCode('123456'), '123456');
  const home = fs.readFileSync('app/(tabs)/index.tsx', 'utf8');
  assert.match(home, /buildSalonClientLink\(parsedPublicClientBaseUrl, normalizedSalonCode\)/);
  const landing = fs.readFileSync('app/index.tsx', 'utf8');
  assert.match(landing, /fetchClientPortalSnapshot\(canonicalSalonCode\)/);
  assert.match(landing, /Hai un vecchio codice\? Inseriscilo qui/);
  assert.match(landing, /resolvedPortal\?\.workspace\?\.salonCode/);
  console.log('PASS: legacy lookup, aliases, missing migration, unknown code, canonical QR and association');
})().catch((error) => { console.error(error); process.exitCode = 1; });
