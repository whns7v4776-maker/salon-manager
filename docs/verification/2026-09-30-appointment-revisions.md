# Appointment service revisions and bottom-anchored dialogs

## Delivered behavior

- Owner editor is embedded in the existing Agenda edit modal, avoiding overlapping native modal presentations. Future, active, accepted appointments can change service, price, duration, phase timing and operators.
- Server checks workspace ownership, expected update timestamp, service/phase configuration, existing availability helpers, operator and customer conflicts. The appointment identity is preserved and its booking request is updated in one transaction.
- Existing receipts remain immutable. Revised unpaid rows are retired; new upfront/balance rows reflect the agreed price and original booking percentage. Open Stripe reservations block changes. Refunds remain salon-controlled; no automatic charges or refunds.
- An `appointment_updated` push is queued with a revision dedupe key. Stale revisions/cancelled appointments are suppressed. Owner-created appointments can notify the linked customer's contact. Unchanged saves do not create new revisions or pushes.
- Cassa shows excess receipts to review. Stripe refund reporting clears the excess from webhook data. Cash refunds executed outside the app are not automatically recorded by this feature.
- Service title tokens wrap only between words, at normal readable size. An exceptionally long single token can scroll horizontally.
- Custom dialog overlays are bottom aligned across web/native, with a shared safe-area surface for affected panels. Existing keyboard handlers, dismissal handlers and native gesture mechanisms are retained. OS alerts, OS-owned selectors, full-screen poster viewer and anchored context menus keep their original presentation.

## Validation

- TypeScript: passed.
- Deno checks for cash-stripe/send-push: passed.
- PGlite revision/ledger tests: passed. Includes preserved receipts, revised deposits/balances, open checkout blocking, cancellations, stale save rejection, simple/phased conversion, atomic conflict rollback, no-op idempotency and owner-created appointment push enqueueing.
- Availability functions in isolated tests are stubs: those tests do not prove all real availability combinations.
- Whole SQL migration executed against linked schema in BEGIN/ROLLBACK: passed, no test data persisted.
- Agenda popup input isolation, owner phase organizer and native drag release contracts: passed.
- Existing native resize contract remains failing at the previously observed 23px/minimum-handle assertion. Its gesture implementation was not changed by this work.
- Web export: passed. Packagers 8081/8082 report running.
- Actual editor rendered in isolated browser fixture: service selection, phased fields and save feedback exercised. This is not a real backend transaction or a physical-device keyboard test.
- The local full Agenda browser test timed out. Published web entry subsequently rendered the customer sign-in page successfully.
- Physical iOS/Android keyboard/swipe behavior, real customer push delivery, actual Stripe charging/refunds and multi-device interaction are not independently proven by this run.

## Release

- Database migration `20260930183000_appointment_service_revisions` applied.
- Edge functions cash-stripe and send-push deployed with existing no-verify-jwt gateway setting; their application authorization remains in place.
- Web production: `dpl_EVqfswnPVgqY5iBodbtxmcbq8vwj`, alias https://salonpro.dev, Ready and HTTP 200.
- Compared native fingerprint to preceding iOS update: native sources match; only Expo extra.supabaseAnonKey differs (public anon JWT to public publishable credential for the same project). No private key was printed or embedded.
- OTA publication details are in the adjacent release JSON when complete. No native build created.
