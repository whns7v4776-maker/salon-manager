/** Interpolates clock time across the displayed rows, including irregular boundaries. */
export function agendaLivePosition(minutes: number, rows: number[], end: number, rowStep: number, gridOffset: number) {
  'worklet';
  if (!rows.length) return gridOffset - 3;
  const clamped = Math.max(rows[0], Math.min(end, minutes));
  let index = rows.length - 1;
  for (let i = 0; i < rows.length - 1; i++) {
    if (clamped < rows[i + 1]) { index = i; break; }
  }
  const boundary = index === rows.length - 1 ? end : rows[index + 1];
  const progress = (clamped - rows[index]) / Math.max(1, boundary - rows[index]);
  return gridOffset + (index + progress) * rowStep - 3;
}
