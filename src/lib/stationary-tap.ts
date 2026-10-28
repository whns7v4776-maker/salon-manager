export type StationaryTap = { x: number; y: number; startedAt: number; moved: boolean; handled: boolean };
export const beginStationaryTap = (x: number, y: number, now: number): StationaryTap =>
  ({ x, y, startedAt: now, moved: false, handled: false });
export function moveStationaryTap(tap: StationaryTap, x: number, y: number) {
  if (Math.hypot(x - tap.x, y - tap.y) > 8) tap.moved = true;
}
export function claimStationaryTap(tap: StationaryTap, now: number) {
  if (tap.handled || tap.moved || now - tap.startedAt > 350 || now < tap.startedAt) return false;
  tap.handled = true;
  return true;
}
