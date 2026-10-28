import type { SalonWorkspace } from './platform';

// Only a branding revision can replace a confirmed branding revision.
// A snapshot's generic updatedAt may reflect unrelated appointments/settings.
export function pickSalonBrandingSource(
  local: Partial<SalonWorkspace> | null | undefined,
  remote: Partial<SalonWorkspace> | null | undefined,
) {
  if ((local?.id && remote?.id && local.id !== remote.id) ||
      (local?.ownerEmail && remote?.ownerEmail && local.ownerEmail.toLowerCase() !== remote.ownerEmail.toLowerCase())) {
    return remote;
  }
  const localRevision = Date.parse(local?.salonBrandingUpdatedAt ?? '') || 0;
  const remoteRevision = Date.parse(remote?.salonBrandingUpdatedAt ?? '') || 0;
  if (localRevision || remoteRevision) return remoteRevision > localRevision ? remote : local;
  return undefined;
}
