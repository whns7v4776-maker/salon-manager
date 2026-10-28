/** A contact in the owner's address book is not a completed frontend access.
 * Call only after the customer session is registered; permissions do not gate welcome.
 * Legacy missing/pending markers are recoverable; only a displayed welcome is final.
 */
export const shouldShowCustomerWelcome = (state: string | null, enabled: boolean | undefined): boolean =>
  state !== 'shown' && enabled !== false;
