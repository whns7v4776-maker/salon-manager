export type CompositionDragRow = {top: number; height: number};

/** Destination of the dragged row after removing it from its original slot. */
export function compositionDragOffset(rows: CompositionDragRow[], from: number, to: number): number {
  'worklet';
  const source = rows[from], target = rows[to];
  if (!source || !target) return 0;
  return to > from ? target.top + target.height - source.height - source.top : target.top - source.top;
}

export function compositionDragTarget(rows: CompositionDragRow[], from: number, translation: number): number {
  'worklet';
  let target = from, distance = Math.abs(translation);
  for (let index = 0; index < rows.length; index++) {
    const nextDistance = Math.abs(translation - compositionDragOffset(rows, from, index));
    if (nextDistance < distance) { target = index; distance = nextDistance; }
  }
  return target;
}

/** A neighbour makes room for the dragged row, including its attached pause. */
export function compositionSiblingOffset(rows: CompositionDragRow[], from: number, to: number, index: number): number {
  'worklet';
  const source = rows[from];
  if (!source || index === from || from === to) return 0;
  const next = rows[from + 1], previous = rows[from - 1];
  const gap = Math.max(0, next ? next.top - source.top - source.height : previous ? source.top - previous.top - previous.height : 0);
  const span = source.height + gap;
  return from < to && index > from && index <= to ? -span : from > to && index >= to && index < from ? span : 0;
}

export function moveCompositionItem(ids: string[], id: string, target: number): string[] {
  const from = ids.indexOf(id), to = Math.max(0, Math.min(ids.length - 1, target));
  if (from < 0 || from === to) return ids;
  const next = [...ids];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}
