import { getPublicBookingWindowEndDate, type AvailabilitySettings } from './booking';

const dayNumber = (iso: string) => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

/** The owner's rail crosses month boundaries without restricting calendar navigation. */
export function getAgendaDateStripRange(
  settings: Partial<AvailabilitySettings>,
  today: string,
  selected: string,
  historyStart: string,
) {
  const start = selected < historyStart ? selected : historyStart;
  const horizonEnd = getPublicBookingWindowEndDate(settings, today);
  const end = selected > horizonEnd ? selected : horizonEnd;
  return { start, end, count: Math.max(1, dayNumber(end) - dayNumber(start) + 1) };
}

/** Keep today's/pending selected day at the leading edge; old dates stay to the left. */
export function getAgendaDateStripMetrics(days: {value:string}[], dayWidth: number, dividerWidth: number) {
  let totalWidth = 0;
  const offsets = days.map((day, index) => {
    if (index > 0 && day.value.slice(0, 7) !== days[index - 1].value.slice(0, 7)) totalWidth += dividerWidth;
    const offset = totalWidth;
    totalWidth += dayWidth;
    return offset;
  });
  return {offsets, totalWidth};
}

export function getAgendaDateStripOffset(index: number, dayWidth: number, count: number, railWidth: number, metrics?: ReturnType<typeof getAgendaDateStripMetrics>) {
  return Math.max(0, Math.min((metrics?.totalWidth ?? count * dayWidth) - railWidth, metrics?.offsets[index] ?? index * dayWidth));
}
