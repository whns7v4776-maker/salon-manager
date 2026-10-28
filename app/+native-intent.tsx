const ROOT_FALLBACK_ROUTE = '/';

const normalizeIncomingSystemPath = (path: string) => {
  const normalized = String(path ?? '').trim();

  if (!normalized) {
    return ROOT_FALLBACK_ROUTE;
  }

  const lowercased = normalized.toLowerCase();

  if (
    lowercased === 'salonpro://' ||
    lowercased === 'salonpro:///' ||
    lowercased === 'salonmanager://' ||
    lowercased === 'salonmanager:///' ||
    lowercased === '/' ||
    lowercased === '//' ||
    lowercased === '///'
  ) {
    return ROOT_FALLBACK_ROUTE;
  }

  if (lowercased.startsWith('salonpro://') || lowercased.startsWith('salonmanager://')) {
    const withoutScheme = normalized.replace(/^salonpro:\/\//i, '').replace(/^salonmanager:\/\//i, '');
    const normalizedPath = withoutScheme.startsWith('/')
      ? withoutScheme
      : `/${withoutScheme}`;

    return normalizedPath === '/' ? ROOT_FALLBACK_ROUTE : normalizedPath;
  }

  return normalized;
};

export const redirectSystemPath = async ({ path }: { path: string; initial: boolean }) => {
  try {
    return normalizeIncomingSystemPath(path);
  } catch {
    return ROOT_FALLBACK_ROUTE;
  }
};
