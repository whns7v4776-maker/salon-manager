import assert from 'node:assert/strict';
import { pickSalonBrandingSource } from '../src/lib/salon-branding';
import { normalizeWorkspace } from '../src/lib/platform';

const confirmed = normalizeWorkspace({
  salonName: 'Salone di prova', salonNameFontVariant: 'manrope', salonNameDisplayStyle: 'stampatello',
  salonBrandingUpdatedAt: '2026-09-05T16:40:00Z', activityCategory: 'BARBER',
  businessPhone: '3331234567', streetName: 'VIA ROMA 1', city: 'MILANO', postalCode: '20100',
}, 'test@example.com');
const stale = { ...confirmed, salonNameFontVariant: 'editorial' as const, salonBrandingUpdatedAt: undefined, updatedAt: '2026-09-06T12:00:00Z' };
assert.equal(pickSalonBrandingSource(confirmed, stale)?.salonNameFontVariant, 'manrope');
const newer = { ...confirmed, salonNameFontVariant: 'neon' as const, salonBrandingUpdatedAt: '2026-09-05T16:41:00Z' };
assert.equal(pickSalonBrandingSource(confirmed, newer)?.salonNameFontVariant, 'neon');
assert.equal(pickSalonBrandingSource(null, confirmed)?.salonNameFontVariant, 'manrope');
assert.equal(pickSalonBrandingSource(confirmed, { ownerEmail: 'other@example.com', salonNameFontVariant: 'script' })?.salonNameFontVariant, 'script');
assert.equal(pickSalonBrandingSource(confirmed, { updatedAt: '2026-09-07T00:00:00Z' })?.salonNameFontVariant, 'manrope');
const freshDevice = normalizeWorkspace(JSON.parse(JSON.stringify(confirmed)), confirmed.ownerEmail);
for (const key of ['salonName', 'activityCategory', 'businessPhone', 'streetName', 'city', 'postalCode', 'salonNameFontVariant', 'salonNameDisplayStyle'] as const) {
  assert.equal(freshDevice[key], confirmed[key]);
}
console.log('Branding sync OK: stale refresh rejected, newer device choice accepted, empty-cache profile restored.');
