export type OwnerForegroundBannerPushEvent = {
  eventKey: string;
  title: string;
  body: string;
  requestId: string;
  appointmentDate: string | null;
  appointmentTime: string | null;
  status: string | null;
  cancellationSource: string | null;
  receivedAt: number;
};

type OwnerForegroundBannerPushListener = (
  event: OwnerForegroundBannerPushEvent,
) => void;

const listeners = new Set<OwnerForegroundBannerPushListener>();

export const publishOwnerForegroundBannerPush = (
  event: OwnerForegroundBannerPushEvent,
) => {
  listeners.forEach((listener) => listener(event));
};

export const subscribeOwnerForegroundBannerPush = (
  listener: OwnerForegroundBannerPushListener,
) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
