import assert from 'node:assert/strict';
import { normalizeWorkspace } from '../src/lib/platform';
import { salonNameFontOptions, resolveSalonNameFontFamily } from '../src/lib/fonts';

for (const option of salonNameFontOptions) {
  const draft = normalizeWorkspace({ salonNameFontVariant: option.key }, 'test@example.com');
  const reloaded = normalizeWorkspace(JSON.parse(JSON.stringify(draft)), 'test@example.com');
  assert.equal(reloaded.salonNameFontVariant, option.key, `${option.key} must survive persistence`);
  assert.equal(resolveSalonNameFontFamily('stampatello', option.key), option.family);
}
assert.equal(normalizeWorkspace({ salonNameFontVariant: 'invalid' as never }, 'test@example.com').salonNameFontVariant, 'neon');
console.log(`Salon font roundtrip: ${salonNameFontOptions.length} fonts OK; unknown values retain safe fallback.`);
