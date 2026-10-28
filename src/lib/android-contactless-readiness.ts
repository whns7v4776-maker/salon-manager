// Native SDK discovery/attestation remains authoritative. These checks only
// explain prerequisites before requesting permissions or creating a payment.
export function androidContactlessPrerequisite(version: number | string, development: boolean): string | null {
  if (Number(version) < 33) return 'Tap to Pay richiede Android 13 o successivo. Puoi continuare con QR / link.';
  if (development) return 'La versione DEV non può leggere carte reali. Usa la versione SalonPro con Tap to Pay e disattiva le opzioni sviluppatore del telefono.';
  return null;
}

export function androidContactlessError(code: string | undefined, fallback: string): string {
  const normalized = (code ?? '').replace(/[^a-z]/gi, '').toLowerCase();
  if (normalized.includes('insecureenvironment')) return 'Per usare Tap to Pay disattiva le opzioni sviluppatore e il debug USB nelle impostazioni Android, poi riapri SalonPro.';
  if (normalized.includes('nfcdisa')) return 'Attiva NFC nelle impostazioni del telefono e riprova.';
  if (normalized.includes('nfc') || normalized.includes('devicenotsupported') || normalized.includes('unsupportedandroidversion')) return 'Questo telefono non supporta Tap to Pay. Puoi usare QR / link.';
  return fallback;
}
