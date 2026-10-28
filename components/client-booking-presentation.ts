/** Presentation only. Availability always comes from the existing booking authority. */
export const bookingMonthKey = (value: string) => value.slice(0, 7);

export function bookingAvailableDates<T extends { disabled: boolean; pending: boolean; status: string }>(days: T[]) {
  return days.filter(day => !day.disabled && !day.pending && day.status === 'Disponibile');
}

/** Native date tiles fit the safe content width and retain room for enlarged text. */
export function bookingNativeDateLayout(contentWidth: number, fontScale: number) {
  const gap = 8;
  const columns = Math.max(1, Math.min(4, Math.floor((contentWidth + gap) / (90 * Math.max(1, fontScale) + gap))));
  return { columns, gap, cardWidth: Math.max(0, (contentWidth - gap * (columns - 1)) / columns), batchSize: columns * 3 };
}

export function bookingMonthShift(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(year, number - 1 + offset, 1, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function bookingCalendarCells<T extends { value: string }>(days: T[], month: string) {
  const [year, number] = month.split('-').map(Number);
  const offset = (new Date(year, number - 1, 1, 12).getDay() + 6) % 7;
  const count = new Date(year, number, 0, 12).getDate();
  const byDate = new Map(days.map(day => [day.value, day]));
  return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => {
    const dayNumber = index - offset + 1;
    if (dayNumber < 1 || dayNumber > count) return null;
    const value = `${month}-${String(dayNumber).padStart(2, '0')}`;
    return { value, number: dayNumber, day: byDate.get(value) };
  });
}

export function bookingTimePeriods<T extends { value: string; disabled: boolean; hint?: string }>(recommended: T[], additional: T[]) {
  const values = new Map<string, T>();
  for (const item of [...recommended, ...additional]) {
    const existing = values.get(item.value);
    values.set(item.value, existing ? { ...existing, disabled: existing.disabled || item.disabled, hint: existing.hint || item.hint } : item);
  }
  const sorted = [...values.values()].sort((a, b) => a.value.localeCompare(b.value));
  return [
    { key: 'morning', label: 'Mattina', items: sorted.filter(item => Number(item.value.slice(0, 2)) < 12) },
    { key: 'afternoon', label: 'Pomeriggio', items: sorted.filter(item => Number(item.value.slice(0, 2)) >= 12 && Number(item.value.slice(0, 2)) < 18) },
    { key: 'evening', label: 'Sera', items: sorted.filter(item => Number(item.value.slice(0, 2)) >= 18) },
  ].filter(period => period.items.length);
}
