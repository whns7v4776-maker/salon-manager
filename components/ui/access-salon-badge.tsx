import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { normalizeSalonCode } from '../../src/lib/platform';
import { plaqueUrl, useSalonPlaque } from '../../src/lib/salon-logo-plaque';
import { publicSupabase } from '../../src/lib/supabase';

const METADATA_TTL_MS = 5 * 60_000;
const metadataCache = new Map<string, { workspaceId: string | null; expiresAt: number }>();
const pendingMetadata = new Map<string, Promise<string | null>>();
const photoAspectCache = new Map<string, number>();
const validWorkspaceId = (value: unknown) => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
  ? value.trim().toLowerCase() : undefined;

function cachedWorkspaceId(code: string) {
  const saved = metadataCache.get(code);
  return saved && saved.expiresAt > Date.now() ? saved.workspaceId : undefined;
}

function resolvePublicWorkspaceId(code: string): Promise<string | null> {
  const cached = cachedWorkspaceId(code);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = pendingMetadata.get(code);
  if (pending) return pending;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const task = Promise.resolve().then(async () => {
    try {
      const result = await Promise.race([
        publicSupabase.rpc('get_client_portal_catalog', { p_salon_code: code }).abortSignal(controller.signal),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => { controller.abort(); resolve(null); }, 6_000);
        }),
      ]);
      if (!result || result.error) return null;
      if (result.data === null) {
        metadataCache.set(code, { workspaceId: null, expiresAt: Date.now() + METADATA_TTL_MS });
        return null;
      }
      const workspace = result.data?.workspace;
      const workspaceId = validWorkspaceId(workspace?.id);
      if (!workspaceId || normalizeSalonCode(String(workspace?.salonCode ?? '')) !== code) return null;
      // Keep only the public identity. No customer or appointment payload is retained.
      metadataCache.set(code, { workspaceId, expiresAt: Date.now() + METADATA_TTL_MS });
      return workspaceId;
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
      pendingMetadata.delete(code);
    }
  });
  pendingMetadata.set(code, task);
  return task;
}

function usePublicBadgeWorkspaceId(workspaceId?: string, salonCode?: string) {
  const directId = validWorkspaceId(workspaceId);
  const code = normalizeSalonCode(salonCode ?? '');
  const [resolved, setResolved] = useState(() => ({ code, id: cachedWorkspaceId(code) }));
  useEffect(() => {
    if (directId || !code) return;
    let cancelled = false;
    void resolvePublicWorkspaceId(code).then(id => {
      if (!cancelled) setResolved({ code, id });
    });
    return () => { cancelled = true; };
  }, [directId, code]);
  // Reject the previous salon during render, before the old effect is cleaned up.
  return directId ?? (resolved.code === code ? resolved.id ?? undefined : cachedWorkspaceId(code) ?? undefined);
}

/** Compact public branding for a saved salon. Never delays or handles access. */
export function AccessSalonBadge({
  workspaceId,
  salonCode,
  name,
  selected = false,
  size = 36,
  maxImageWidth = 65,
}: {
  workspaceId?: string;
  salonCode?: string;
  name: string;
  selected?: boolean;
  size?: number;
  maxImageWidth?: number;
}) {
  const { width: viewportWidth } = useWindowDimensions();
  const resolvedWorkspaceId = usePublicBadgeWorkspaceId(workspaceId, salonCode);
  const plaque = useSalonPlaque(resolvedWorkspaceId);
  const path = plaque?.mode !== 'text' ? plaque?.path?.trim() : undefined;
  const imageKey = resolvedWorkspaceId && path ? `${resolvedWorkspaceId}:${path}` : '';
  const activeImageKey = useRef(imageKey);
  activeImageKey.current = imageKey;
  const [failedImageKey, setFailedImageKey] = useState('');
  const [photoAspect, setPhotoAspect] = useState<{ key: string; value?: number }>({ key: '' });
  const showImage = !!imageKey && failedImageKey !== imageKey;
  const edge = Number.isFinite(size) ? Math.max(28, Math.min(64, size)) : 36;
  const imageWidthLimit = Number.isFinite(maxImageWidth) ? Math.max(28, Math.min(140, maxImageWidth)) : 65;
  const photoFrameWidth = Math.round(Math.min(imageWidthLimit, Math.max(edge, viewportWidth * 0.3), edge * 3));
  const aspect = (photoAspect.key === imageKey ? photoAspect.value : undefined) ?? photoAspectCache.get(imageKey);
  const photoWidth = aspect ? Math.min(photoFrameWidth, edge * aspect) : photoFrameWidth;
  const photoHeight = aspect ? photoWidth / aspect : edge;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, !showImage && styles.fallback, !showImage && selected && styles.selected, { width: showImage ? photoFrameWidth : edge, height: edge }]}
    >
      {showImage ? (
        <Image
          key={imageKey}
          source={{ uri: plaqueUrl(path!) }}
          accessibilityLabel={`Logo ${name}`}
          contentFit="contain"
          transition={0}
          cachePolicy="memory-disk"
          recyclingKey={imageKey}
          style={[styles.image, { width: photoWidth, height: photoHeight }]}
          onLoad={({ source }) => {
            // Size only the photo, never the surrounding row, and keep its entire content.
            if (activeImageKey.current !== imageKey || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0) return;
            const ratio = source.width / source.height;
            if (!Number.isFinite(ratio) || ratio <= 0) return;
            photoAspectCache.set(imageKey, ratio);
            if (photoAspectCache.size > 100) photoAspectCache.delete(photoAspectCache.keys().next().value!);
            setPhotoAspect({ key: imageKey, value: ratio });
          }}
          onError={() => {
            // A late event from a previous salon/image cannot hide its replacement.
            if (activeImageKey.current === imageKey) setFailedImageKey(imageKey);
          }}
        />
      ) : (
        <Ionicons name="storefront-outline" size={Math.round(edge * 0.55)} color={selected ? '#2854A0' : '#58708F'} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    flexShrink: 0,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallback: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D7E1EF',
    backgroundColor: '#F1F5FA',
    padding: 3,
  },
  selected: { borderColor: '#B9CFF0', backgroundColor: '#EAF2FF' },
  image: { borderRadius: 8 },
});
