import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { publicSupabase } from './supabase';
export type SalonSearchResult = { salon_code: string; salon_name: string; address: string; city: string; photo_url: string | null; image_kind: 'photo' | 'logo'; distance_km: number | null };
export type DiscoveryPosition = { latitude: number; longitude: number; accuracy?: number };
export async function requestDiscoveryPosition(precise = false): Promise<DiscoveryPosition> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) return reject(new Error('Posizione non disponibile. Cerca per città.'));
      navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }), () => reject(new Error('Posizione non disponibile. Puoi cercare per nome o città.')), { timeout: 12000, maximumAge: 60000, enableHighAccuracy: precise });
    });
  }
  if (!requireOptionalNativeModule('ExpoLocation')) throw new Error('Aggiorna l’app per usare la posizione. Puoi già cercare per nome o città.');
  const Location = await import('expo-location').catch(() => { throw new Error('Aggiorna l’app per usare la posizione. Puoi già cercare per nome o città.'); });
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Puoi continuare cercando per nome o città, senza attivare la posizione.');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: precise ? Location.Accuracy.High : Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Posizione non disponibile. Riprova o cerca per città.')), 12000); }),
    ]);
    return { latitude: result.coords.latitude, longitude: result.coords.longitude, accuracy: result.coords.accuracy ?? undefined };
  } finally { if (timer) clearTimeout(timer); }

}
export async function searchPublicSalons(query: string, position: DiscoveryPosition | null): Promise<SalonSearchResult[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const { data, error } = await publicSupabase.rpc('search_public_salons', { p_query: query.trim(), p_latitude: position?.latitude ?? null, p_longitude: position?.longitude ?? null }).abortSignal(controller.signal);
    if (error) throw error;
    return (data ?? []) as SalonSearchResult[];
  } catch { throw new Error('Ricerca momentaneamente non disponibile. Riprova oppure usa il codice o il QR del salone.'); }
  finally { clearTimeout(timer); }
}

export function formatSalonAddress(address: string, city: string): string {
  const line = address.trim();
  const town = city.trim();
  return !town || line.toLocaleLowerCase().includes(town.toLocaleLowerCase()) ? line : [line, town].filter(Boolean).join(' · ');
}
