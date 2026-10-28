/** Unlock controls progressively within one draft; edits never relock visited steps. */
export function quickBookingUnlockedStep(previous: number, input: {
  mode: boolean; customer: boolean; service: boolean; operatorRequired: boolean; operator: boolean;
}): number {
  if (!input.mode) return 1;
  const current = !input.customer ? 2 : !input.service ? 3
    : input.operatorRequired && !input.operator ? 4 : 5;
  return Math.max(previous, current);
}
