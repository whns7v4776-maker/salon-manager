/**
 * Preserve references on equal JSON snapshots, without caching old results.
 * Call only with normalized, JSON-serializable server data.
 */
export const reuseUnchangedJsonValue = <T>(current: T, incoming: T): T =>
  current === incoming || JSON.stringify(current) === JSON.stringify(incoming)
    ? current
    : incoming;

export const reuseUnchangedJsonFields = <T extends object>(current: T, incoming: T): T => {
  const result = { ...incoming };
  for (const key of Object.keys(incoming) as (keyof T)[]) {
    result[key] = reuseUnchangedJsonValue(current[key], incoming[key]);
  }
  return result;
};
