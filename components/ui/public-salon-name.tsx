import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { normalizeSalonCode } from '../../src/lib/platform';
import { publicSupabase } from '../../src/lib/supabase';

const names = new Map<string, { name: string; canonicalCode: string; expiresAt: number }>();
const pending = new Map<string, Promise<string | null>>();

function cachedName(code: string) {
  const item = names.get(code);
  return item && item.expiresAt > Date.now() ? item.name : null;
}

/** Public branding only; resolving a name never changes the selected salon or access. */
function resolveName(code: string): Promise<string | null> {
  const cached = cachedName(code);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(code);
  if (existing) return existing;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const task = Promise.resolve().then(async () => {
    try {
      let canonicalCode = code;
      if (/^[1-9][0-9]{5}$/.test(code)) {
        const shortCode = await publicSupabase.rpc('resolve_salon_short_code', { p_code: code })
          .abortSignal(controller.signal);
        if (shortCode.error || typeof shortCode.data !== 'string') return null;
        canonicalCode = normalizeSalonCode(shortCode.data);
      }
      if (!canonicalCode || controller.signal.aborted) return null;
      const result = await publicSupabase.rpc('get_client_portal_catalog', { p_salon_code: canonicalCode })
        .abortSignal(controller.signal);
      const workspace = result.data?.workspace;
      if (result.error || normalizeSalonCode(String(workspace?.salonCode ?? '')) !== canonicalCode) return null;
      const name = typeof workspace?.salonName === 'string' ? workspace.salonName.trim() : '';
      if (!name) return null;
      names.set(code, { name, canonicalCode, expiresAt: Date.now() + 5 * 60_000 });
      if (names.size > 100) names.delete(names.keys().next().value!);
      return name;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      pending.delete(code);
    }
  });
  pending.set(code, task);
  return task;
}

export function PublicSalonName({ salonCode }: { salonCode: string }) {
  const code = normalizeSalonCode(salonCode);
  const [resolved, setResolved] = useState(() => ({ code, name: cachedName(code) }));
  useEffect(() => {
    if (!code) return;
    let mounted = true;
    void resolveName(code).then(name => { if (mounted) setResolved({ code, name }); });
    return () => { mounted = false; };
  }, [code]);
  const name = resolved.code === code ? resolved.name : cachedName(code);
  return <Text>{name || 'Salone associato'}</Text>;
}

/** Compare public identities, never salon names: different salons may share a name. */
export function usePublicSalonAliases(codes: readonly string[]) {
  const signature = JSON.stringify(codes.map(normalizeSalonCode));
  const [resolved, setResolved] = useState<Record<string, string>>({});
  useEffect(() => {
    const currentCodes: string[] = JSON.parse(signature);
    if (!currentCodes.length) return;
    let mounted = true;
    void Promise.all(currentCodes.map(async code => {
      await resolveName(code);
      const cached = names.get(code);
      return [code, cached && cached.expiresAt > Date.now() ? cached.canonicalCode : code] as const;
    })).then(entries => { if (mounted) setResolved(Object.fromEntries(entries)); });
    return () => { mounted = false; };
  }, [signature]);
  return resolved;
}
