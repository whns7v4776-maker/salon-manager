// Reuse Android's collation engine instead of constructing it for every
// comparison. Preserve the device's default locale and Unicode ordering.
let collator: Intl.Collator | undefined;
export const compareDefaultStrings = (left: string, right: string) => {
  collator ??= new Intl.Collator();
  return collator.compare(left, right);
};
