import { normalizeSalonCode } from './platform';

export function extractSalonCodeFromScan(value: string): string {
  const raw = value.trim();
  if (!raw) return '';
  // Accept the printed short code and legacy salon slug without mistaking a
  // URL for a slug (normalization would otherwise remove its punctuation).
  if (/^[a-z0-9][a-z0-9-]{3,35}$/i.test(raw)) return normalizeSalonCode(raw);
  try {
    const url = new URL(raw);
    const code = url.searchParams.get('salon') || url.searchParams.get('code');
    if (code) return normalizeSalonCode(code);
    const pathname = url.hostname === 'join' && !/^https?:$/.test(url.protocol) ? `/join${url.pathname}` : url.pathname;
    const match = pathname.match(/\/join\/([^/?#]+)/i);
    return match ? normalizeSalonCode(decodeURIComponent(match[1])) : '';
  } catch {
    return '';
  }
}
