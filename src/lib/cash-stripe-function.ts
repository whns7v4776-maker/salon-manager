/**
 * Owner-side Stripe function. Normal builds always use `cash-stripe`.
 * Only the Apple Tap to Pay review build sets EXPO_PUBLIC_CASH_STRIPE_FUNCTION to the
 * TEST-mode copy (`cash-stripe-ttp-review`), so the physical Stripe test card can be used.
 */
export const CASH_STRIPE_FUNCTION =
  process.env.EXPO_PUBLIC_CASH_STRIPE_FUNCTION === 'cash-stripe-ttp-review' ? 'cash-stripe-ttp-review' : 'cash-stripe';
