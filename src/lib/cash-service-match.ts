import { lowerItalian } from './italian-case';

/** Resolve legacy cash descriptions without repeatedly normalizing the catalogue. */
export function createCashServiceMatcher<T extends { nome: string }>(services: readonly T[]) {
  const normalize = (value: string) => lowerItalian(value.trim()).replace(/\s+/g, ' ');
  const catalogue = services.map(service => ({ service, name: normalize(service.nome) }));
  const cache = new Map<string, T | undefined>();

  return (title: string): T | undefined => {
    if (cache.has(title)) return cache.get(title);
    const name = normalize(title);
    let match: T | undefined;
    for (const entry of catalogue) {
      if (name !== entry.name && !name.startsWith(`${entry.name} · `)) continue;
      // Historical movements have no service ID. Duplicate/prefix matches must
      // stay ambiguous, even if one of the names is an exact match.
      if (match) {
        match = undefined;
        break;
      }
      match = entry.service;
    }
    // Bound the cache when navigating large cash histories.
    if (cache.size >= 256) cache.clear();
    cache.set(title, match);
    return match;
  };
}
