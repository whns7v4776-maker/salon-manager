export type ReminderConsent = { salonCode: string; instanceId: string };
export type ReminderWindow = { enabled: boolean; startsAt?: string | null; endsAt?: string | null };
type Subscription = { remove(): void };

/** Foreground-only, server-authorized location window. No background wake promise. */
export function createClientGpsReminderController<Point>(deps: {
  now(): number;
  consent(): Promise<ReminderConsent | null>;
  window(consent: ReminderConsent): Promise<ReminderWindow>;
  watch(onPoint: (point: Point) => void): Promise<Subscription | null>;
  report(consent: ReminderConsent, point: Point): Promise<void>;
  setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}) {
  let active = false;
  let generation = 0;
  let subscription: Subscription | null = null;
  let poll: ReturnType<typeof setTimeout> | null = null;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let windowEnd = 0;
  let lastReportAt = -Infinity;
  let reportQueue = Promise.resolve();

  function stopWatch() {
    subscription?.remove();
    subscription = null;
    if (deadline !== null) deps.clearTimer(deadline);
    deadline = null;
    windowEnd = 0;
    lastReportAt = -Infinity;
  }
  function pause() {
    active = false;
    ++generation;
    if (poll !== null) deps.clearTimer(poll);
    poll = null;
    stopWatch();
  }
  function schedule(epoch: number) {
    if (!active || epoch !== generation) return;
    poll = deps.setTimer(() => { poll = null; void sync(epoch); }, 60_000);
  }
  async function sync(epoch: number) {
    try {
      const consent = await deps.consent();
      if (!active || epoch !== generation) return;
      if (!consent) { stopWatch(); return; }
      const window = await deps.window(consent);
      if (!active || epoch !== generation) return;
      const starts = Date.parse(window.startsAt ?? '');
      const ends = Date.parse(window.endsAt ?? '');
      // Never trust malformed or overly broad server windows to keep GPS alive.
      if (!window.enabled || !Number.isFinite(starts) || !Number.isFinite(ends) ||
          ends <= starts || ends - starts > 10 * 60_000 || deps.now() < starts || deps.now() >= ends) {
        stopWatch(); return;
      }
      if (subscription && windowEnd === ends) return;
      stopWatch();
      const watched = await deps.watch(point => {
        if (!active || epoch !== generation || deps.now() >= ends || deps.now() < starts) return;
        if (deps.now() - lastReportAt < 60_000) return;
        lastReportAt = deps.now();
        reportQueue = reportQueue.catch(() => undefined).then(async () => {
          if (!active || epoch !== generation || deps.now() >= ends) return;
          const current = await deps.consent();
          if (!active || epoch !== generation || deps.now() >= ends ||
              current?.salonCode !== consent.salonCode || current?.instanceId !== consent.instanceId) return;
          await deps.report(consent, point);
        }).catch(() => undefined);
      });
      if (!active || epoch !== generation || deps.now() >= ends) { watched?.remove(); return; }
      subscription = watched;
      if (!watched) return;
      windowEnd = ends;
      deadline = deps.setTimer(() => { deadline = null; stopWatch(); }, ends - deps.now());
    } catch {
      // Offline, denied permission, missing RPC or stale session: stop collecting.
      if (active && epoch === generation) stopWatch();
    } finally { schedule(epoch); }
  }
  function refresh() {
    pause();
    active = true;
    const epoch = generation;
    void sync(epoch);
  }
  return { refresh, pause, drainReports: () => reportQueue };
}
