# Remaining popup docking and Cassa spacing

## Scope

- Booking payment card: 16 px below the standalone Cassa section (not the customer popup editor). Uses the same `PremiumExpandButton salon compact` as fiscal receipts. Header and button are sibling controls sharing one toggle, preventing nested press/double-toggle behavior.
- Agenda slot: fix inner keyboard/composer wrappers that overrode the already bottom-aligned overlay with center/start alignment. Remove outer bottom padding. Use `DockedSheetSurface` for the slot, nested forms, service chooser, search, operator block and confirmation surfaces; retain callbacks, modal lifecycle, fixed composer sizing and scroll/keyboard code.
- Complete lower-edge treatment in remaining request/approval, Android service/operator edit, saved-salon options, guide, and number/date/time sheet surfaces. Insets stay inside the surface. Embedded picker panels keep their existing inline surface; native picker engines are unchanged.
- Shared expansion pattern documented in `docs/ui/expand-controls.md` for subsequent UI work.
- No payment logic, backend, native gesture engine, navigation, or native build changes.
- OS-owned alerts/pickers and full-screen media viewers retain their platform presentation. Existing corrected customer/creation dialogs were not rebuilt.

## Validation

- `npx tsc --noEmit`: passed.
- `test:agenda-popup-input-isolation`: passed.
- `test:customer-popup-input-isolation`: passed.
- `test:owner-phase-organizer`: passed.
- `test:native-agenda-drag-release`: passed.
- `test:remaining-popup-input-boundaries`: existing stale count assertion fails on landing-page Modal count (2 actual vs 1 expected). Both Modal blocks already existed before this intervention; no new Modal or text input was added there.
- Browser layout fixture at 390 px: real BookingPaymentPolicyEditor with fake read-only payment data, real PremiumExpandButton styling, simplified haptic/animation adapter, and real DockedSheetSurface; payment button opens/closes; 16 px card gap; both expansion controls measure 36 px with the same circular background.
- Agenda layout fixture extracts styles from the current source and uses the same style order as the slot. Web/iOS/Android variants, Android keyboard override and nested composer alignment: bottom gap <0.001 px. With a reduced available viewport, the last field can be focused and remains within the panel. This is browser layout evidence, not physical device/native keyboard proof.
- Artifacts: `work/popup-docking/cassa-spacing.png`, `work/popup-docking/layout-results.json` and isolated fixture sources.

## Limits

The full authenticated local `/cassa` route timed out although Metro `/status` responds. No claim of full local-page or physical iOS/Android interaction verification. Existing keyboard handling and native selection/swipe engines are preserved. No real customer data or payment was changed by validation.

Publication recorded separately after successful deployment.

## Publication completed

- Web production Ready, alias https://salonpro.dev. The served Cassa entry bundle matches this export byte-for-byte. Ionicons font returns 389724 bytes. Production /cassa correctly reaches the unauthenticated salon login, with no browser console errors.
- Production OTA group f0a34426-2b30-4abc-b1ee-5f8e7fab48ef, iOS and Android runtime 1.0.18-meta1. Both production update manifests serve their expected new IDs.
- Native fingerprint comparison against the previous iOS update differs only at extra.supabaseAnonKey (environment/public credential), not native files or dependencies. No native build or backend deployment.
- IDs and delivery evidence in 2026-09-30-popup-docking-release.json. Device installation/launch and real keyboard QA remain unverified.
