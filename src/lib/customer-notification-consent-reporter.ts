import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { publicSupabase } from './supabase';

export type CustomerNotificationPermission = 'granted' | 'denied' | 'undetermined';

type PermissionCallback = (permission: CustomerNotificationPermission) => void | Promise<void>;
type ReporterOptions = {
  salonCode: string;
  appInstanceId: string;
  platform: 'ios' | 'android' | 'web';
  onPermission?: PermissionCallback;
  onConfirmed?: PermissionCallback;
};

const ATTEMPT_TIMEOUT_MS = 10000;
const RETRY_DELAYS_MS = [1500, 4000, 10000, 30000, 60000] as const;

/** Reports fresh phone permission for one claimed customer installation. */
export function createCustomerNotificationConsentReporter(options: ReporterOptions): {
  refresh: () => Promise<boolean>;
  stop: () => void;
} {
  const salonCode = options.salonCode.trim();
  const appInstanceId = options.appInstanceId.trim();
  const native = (Platform.OS === 'ios' || Platform.OS === 'android') && options.platform === Platform.OS;
  let stopped = false;
  let foreground = AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
  let generation = 0;
  let failures = 0;
  let followup = false;
  let flight: Promise<boolean> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelAttempt: (() => void) | null = null;

  const active = () => !stopped && foreground && native && !!salonCode && !!appInstanceId;
  const clearRetry = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  };
  const notify = (callback: PermissionCallback | undefined, permission: CustomerNotificationPermission) => {
    try {
      // A consumer failure must never turn a successfully persisted report into a retry.
      void Promise.resolve(callback?.(permission)).catch(() => undefined);
    } catch { /* Keep reporting independent of optional UI/push callbacks. */ }
  };

  const attempt = async (): Promise<boolean> => {
    const currentGeneration = ++generation;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let cancelled = false;
    let release: (value: boolean) => void = () => undefined;
    const cancellation = new Promise<boolean>(resolve => { release = resolve; });
    const cancel = () => {
      cancelled = true;
      controller?.abort();
      release(false);
    };
    cancelAttempt = cancel;
    const valid = () => active() && !cancelled && generation === currentGeneration;
    const timeout = setTimeout(cancel, ATTEMPT_TIMEOUT_MS);
    const work = (async () => {
      try {
        const response = await Notifications.getPermissionsAsync();
        if (!valid()) return false;
        const permission = response.status;
        if (permission !== 'granted' && permission !== 'denied' && permission !== 'undetermined') return false;
        notify(options.onPermission, permission);
        if (!valid()) return false;
        let request = publicSupabase.rpc('report_customer_notification_permission_v1', {
          p_salon_code: salonCode,
          p_app_instance_id: appInstanceId,
          p_permission: permission,
          p_platform: options.platform,
        });
        if (controller && typeof request.abortSignal === 'function') request = request.abortSignal(controller.signal);
        const { data, error } = await request;
        if (!valid() || error !== null || data !== true) return false;
        // An explicit refresh during this request may represent a newer OS choice.
        // Confirm the following fresh read instead of notifying with the older one.
        if (!followup) notify(options.onConfirmed, permission);
        return true;
      } catch {
        // Never manufacture a denial when the OS read or network request fails.
        return false;
      }
    })();
    try {
      return await Promise.race([work, cancellation]);
    } finally {
      clearTimeout(timeout);
      if (cancelAttempt === cancel) cancelAttempt = null;
    }
  };

  const scheduleRetry = () => {
    if (!active()) return;
    const delay = RETRY_DELAYS_MS[Math.min(failures++, RETRY_DELAYS_MS.length - 1)];
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void refresh();
    }, delay);
  };

  const refresh = (): Promise<boolean> => {
    if (!active()) return Promise.resolve(false);
    clearRetry();
    if (flight) {
      followup = true;
      return flight;
    }
    flight = (async () => {
      let confirmed = false;
      do {
        followup = false;
        confirmed = await attempt();
      } while (followup && active());
      return confirmed;
    })().then(confirmed => {
      flight = null;
      if (confirmed) failures = 0;
      else scheduleRetry();
      return confirmed && active();
    }, () => {
      flight = null;
      scheduleRetry();
      return false;
    });
    return flight;
  };

  const subscription = native && salonCode && appInstanceId ? AppState.addEventListener('change', state => {
    const wasForeground = foreground;
    foreground = state === 'active';
    if (!foreground) {
      clearRetry();
      followup = false;
      ++generation;
      cancelAttempt?.();
    } else if (!wasForeground) {
      failures = 0;
      void refresh();
    }
  }) : null;

  return {
    refresh,
    stop: () => {
      if (stopped) return;
      stopped = true;
      ++generation;
      followup = false;
      clearRetry();
      subscription?.remove();
      cancelAttempt?.();
    },
  };
}
