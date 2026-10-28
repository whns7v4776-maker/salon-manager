import { useEffect, useState } from 'react';
import { publicSupabase, supabase } from './supabase';

export async function resolveManualSalonCode(code: string): Promise<string> {
  if (!/^[1-9][0-9]{5}$/.test(code)) return code;
  const { data, error } = await publicSupabase.rpc('resolve_salon_short_code', { p_code: code });
  if (error || typeof data !== 'string' || !data) return code;
  return data;
}

export function useSalonShortCode(salonCode: string) {
  const [result, setResult] = useState<{ salon: string; code: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (salonCode) {
      void supabase.rpc('get_owner_salon_short_code', { p_salon_code: salonCode })
        .then(({ data, error }) => {
          if (active && !error && typeof data === 'string' && /^[1-9][0-9]{5}$/.test(data)) {
            setResult({ salon: salonCode, code: data });
          }
        }, () => {});
    }
    return () => { active = false; };
  }, [salonCode]);
  return result?.salon === salonCode ? result.code : salonCode;
}
