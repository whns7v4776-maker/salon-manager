// Italian uses Unicode's default case mapping. Avoid constructing Android's
// locale machinery for every name/key while hydrating or comparing bookings.
// Metro selects this implementation only on Android; web/iOS keep theirs.
export const lowerItalian = (value: string) => value.toLowerCase();
export const upperItalian = (value: string) => value.toUpperCase();
