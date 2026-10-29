/** Fit whole secondary labels beside the client in a genuinely short 15-minute card. */
export function agendaCompactFields(input: {
  width: number; bodyHeight: number; duration: number; client: string;
  service: string; time: string; phase: string; operator: string; pending: boolean;
}) {
  const { width, bodyHeight, duration, client, service, time, phase, operator, pending } = input;
  if (duration > 15 || duration <= 0 || bodyHeight < 12 || bodyHeight > 32 || width < 145) return null;
  const clientSize = Math.min(width < 210 ? 12 : 13, bodyHeight - 2);
  const detailSize = Math.min(10.5, bodyHeight - 2);
  const measure = (value: string, size = detailSize) => [...value].reduce((sum, letter) => {
    const units = /\s/.test(letter) ? .28 : /[ilIjtfr.,:;!'|]/.test(letter) ? .31
      : /[MWmw@%&]/.test(letter) ? .86 : /[A-ZÀ-Ý]/.test(letter) ? .66
      : letter.codePointAt(0)! > 0x2E7F ? 1 : .54;
    return sum + units * size;
  }, 4);
  let remaining = width - Math.min(width, Math.max(60, measure(client, clientSize)));
  const fullTime = measure(time), start = time.split(/[–—]/)[0], shortTime = measure(start);
  const serviceWidth = service ? measure(service) : 0;
  let timeLabel = '', showService = false;
  if (service && remaining >= fullTime + serviceWidth + 16) {
    timeLabel = time; showService = true; remaining -= fullTime + serviceWidth + 16;
  } else if (service && remaining >= shortTime + serviceWidth + 16) {
    timeLabel = start; showService = true; remaining -= shortTime + serviceWidth + 16;
  } else if (remaining >= fullTime + 8) {
    timeLabel = time; remaining -= fullTime + 8;
  } else if (remaining >= shortTime + 8) {
    timeLabel = start; remaining -= shortTime + 8;
  } else return null;
  const detail = pending ? 'Da confermare' : phase;
  const showDetail = !!detail && remaining >= measure(detail) + 8;
  if (showDetail) remaining -= measure(detail) + 8;
  const showOperator = !!operator && remaining >= measure(operator) + 8;
  if (showOperator) remaining -= measure(operator) + 8;
  return { time: timeLabel, service: showService, detail: showDetail ? detail : '',
    operator: showOperator, benefits: remaining >= 48, clientSize, detailSize,
    lineHeight: Math.min(16, bodyHeight) };
}
