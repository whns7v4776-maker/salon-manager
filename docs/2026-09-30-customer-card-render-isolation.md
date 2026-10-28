# Customer detail rendering — 30 September 2026

## Scope

Report: installed owner app on HONOR X5c Plus; opening individual customer details and tapping tabs are slow, while swiping tabs is smooth.

The individual customer expansion map lived in the Clienti page state. Toggling a customer changed `renderClienteCard` and rebuilt all cards inside the single Rubrica FlatList item. Expansion is now a page-scoped, per-customer subscription. A memoized boundary adds no native view and preserves the existing card tree, actions and gesture handlers. Workspace/account changes create a fresh presentation store. Search/filter unmounts retain expansion state, as before.

This patch changes only the customer detail render boundary. It does not modify the custom bar, native pager, gesture handlers, haptics, server data, deletion guards or refresh rules. No device-specific workaround is introduced.

## Verification

- `npx tsc --noEmit`: passed.
- `npm run test:client-identity`: passed.
- `node scripts/assert-native-client-expand-latency-contracts.js`: passed.
- `scripts/test-customer-card-expansion.tsx`: React render test with 1,000 cards passed. Changing one expansion renders one card. Also verifies multiple expanded cards, collapse, unchanged parent rerenders, fresh customer data, refreshed contextual render callbacks, filtering/remounting, workspace isolation and unsubscribe.
- Test renderer 19.1.0 was installed under `/tmp/salon-card-render-validation`, using the repository React instance. No runtime dependencies were added. Re-run with `CUSTOMER_CARD_TEST_RENDERER=/tmp/salon-card-render-validation/node_modules/react-test-renderer npx tsx scripts/test-customer-card-expansion.tsx`.

Existing broader source-contract checks are not all green:

- `test:native-tab-jump` expects literal `lazy: false` in the shared options, whereas the existing layout uses `lazy: IS_WEB` and progressive Android scene prewarming. This patch does not change that layout.
- `assert-client-card-single-direction-swipe-contracts.js` cannot locate its expected `const renderSwipeActions = () => (` source marker. The swipe action implementation was not changed by this patch.

## Limits and delivery

The measured reduction concerns expansion state updates, not complete native touch latency. Existing swipe-lock context updates and swipeable cleanup can still cause work on touch; they were deliberately preserved. The custom bar dispatches its native jump directly without awaiting haptics or a timer. The cause of the device's remaining tap latency is not established from source inspection alone.

No physical HONOR/Samsung/iPhone measurement or authenticated web interaction has been performed for this patch. Native profiling is needed before claiming the reported latency is resolved. No build, OTA publication or web deployment was performed for this patch.
