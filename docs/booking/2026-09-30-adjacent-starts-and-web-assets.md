# Direct booking boundaries and web icons — 2026-09-30

## Scope

The customer public cadence is preserved. Appointment-end times are added as candidates, then sent through the existing local and authoritative server availability checks. No appointments are moved and no native gesture or navigation code is changed. This does not enforce a fully packed day or forbid customers from choosing later existing slots.

Candidate generation uses the saved appointment duration/phase snapshot before catalogue fallback, ignores unknown/invalid timing, scopes candidates to the selected operator (IDs authoritative) and uses the final phase operator where supplied. Pending/accepted request occupancy retains phase assignments. Boundaries outside opening hours are excluded. Day summary cache keys include the boundary signature so timing/operator changes invalidate cached summaries. Submission rebuilds candidates from refreshed occupancy; the server remains authoritative for concurrent requests and conflicts.

## Validation

Passed: TypeScript; new behavioral adjacent-start tests (including all 12 cadence combinations, duplicate names/IDs, operator change/absence, role capability, phase assignments, catalogue changes, day closure, breaks, closing time, overlap and removal); public cadence integration/contracts; scheduled slot cadence; customer-aware public slot availability; paged day summary; public payload/day-conflict caches; booking release guards; phased submit work budget; archived operator sync and operator edit persistence. Web static export succeeded.

Two broader source-regex tests hit pre-existing expectations outside this change: public-booking-authority expects an older service filter in app/(tabs)/clienti.tsx; client-multiphase-slot-loading expects an older combined past-day/pending-day condition. Their target UI code was not changed for this task. Do not report the entire repository suite as green.

No real customer booking was created and physical iOS/Android end-to-end booking was not exercised. Server scheduling/mutations are unchanged. This JavaScript update is not delivered to installed apps by a Vercel deploy; compatible EAS Update runtimes/channels could receive it separately. No native build or OTA publication was performed.

## Web font incident

Reproduced on production in the browser, including the unauthenticated access page: icons render as squares. The Ionicons .ttf URL returns HTTP 200 with Content-Type text/html and the application HTML (277220 bytes), not a font. This is a deployed asset issue, unrelated to Windows activation.

`scripts/prepare-web-release.cjs` packages an existing `dist` export into a fresh staging folder under `work`: moves exported assets/node_modules to assets/vendor, rewrites HTML/JS/CSS/JSON references and verifies all 21 exported font files. This avoids dependency-directory exclusion during a static CLI upload. Native sources, glyphs, tab geometry and interaction engines are untouched.

Repeat release: `npm run web:export`, `npm run web:prepare-release`, deploy the printed staging directory to preview, verify font signatures/content type and browser rendering, then promote the same deployment. Do not upload the original dist directly with default node_modules exclusions.

## Deployment result

Preview `dpl_HgyomCGLKt1tuW7EdrAFPWy6cyfw` at salon-manager-rde40482m-6rwdtrgntc-3362s-projects.vercel.app rendered icons correctly and opened the owner access page. Unauthenticated command-line requests to the protected preview returned Vercel's login HTML, so asset HTTP verification was performed on the public production alias after promotion.

Promoted to production (`dpl_4j4HPSbw5WuwjzmpuaLk86LPLj4Y`) at https://salonpro.dev. All 21 fonts return HTTP 200, font/ttf, with valid font binary signatures. Ionicons is 389724 bytes; MaterialCommunityIcons is 1307660 bytes. Client, cash and settings routes return HTTP 200; Apple association returns application/json. Browser reload on the public domain displays actual icons instead of squares. Authenticated custom-bar navigation and a real customer booking were not exercised because the available browser sessions were at the login screen.
