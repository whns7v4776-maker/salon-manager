/** Pack whole words into at most three rows, widening only the text reader. */
export function layoutServiceTitle(words: string[], widths: number[], availableWidth: number) {
  const gap = 4;
  const pack = (width: number) => {
    const rows: string[][] = [[]];
    let used = 0;
    words.forEach((word, index) => {
      const size = widths[index];
      if (rows[rows.length - 1].length && used + gap + size > width) {
        rows.push([]);
        used = 0;
      }
      const row = rows[rows.length - 1];
      used += (row.length ? gap : 0) + size;
      row.push(word);
    });
    return rows;
  };
  let low = Math.max(1, availableWidth, ...widths);
  let high = Math.max(low, widths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, words.length - 1));
  if (pack(low).length <= 3) high = low;
  while (high - low > 0.5) {
    const middle = (low + high) / 2;
    if (pack(middle).length > 3) low = middle;
    else high = middle;
  }
  const width = Math.ceil(high);
  return { width, rows: pack(width), scroll: width > availableWidth + 1 };
}
