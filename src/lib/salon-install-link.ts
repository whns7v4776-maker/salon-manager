const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.marzix91.salonmanager';

// Only our versioned, code-only payload is accepted. Never use a referrer as
// an arbitrary redirect URL or as authentication credentials.
export function parseSalonInstallReferrer(referrer: string): string | null {
  if (!referrer || referrer.length > 1024) return null;
  const params = new URLSearchParams(referrer);
  if (params.getAll('salonpro_join').length !== 1 || params.get('salonpro_join') !== '1') return null;
  if (params.getAll('salon').length !== 1) return null;
  const code = params.get('salon') ?? '';
  return /^[a-zA-Z0-9_-]{1,120}$/.test(code) ? code : null;
}

export function buildSalonPlayStoreUrl(code: string): string {
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(code)) return PLAY_STORE_URL;
  const referrer = new URLSearchParams({ salonpro_join: '1', salon: code });
  return `${PLAY_STORE_URL}&referrer=${encodeURIComponent(referrer.toString())}`;
}
