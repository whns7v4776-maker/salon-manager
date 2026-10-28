import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

let installed = false;
let alertOpen = false;
let fallbackReleaseTimer: ReturnType<typeof setTimeout> | null = null;

const releaseAlertLock = () => {
  if (fallbackReleaseTimer) {
    clearTimeout(fallbackReleaseTimer);
    fallbackReleaseTimer = null;
  }

  setTimeout(() => {
    alertOpen = false;
  }, 180);
};

export const installSingleActiveAlertGuard = () => {
  if (installed || Platform.OS === 'web') {
    return;
  }

  installed = true;
  const originalAlert = Alert.alert.bind(Alert);

  Alert.alert = ((title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    if (alertOpen) {
      return;
    }

    alertOpen = true;

    const sourceButtons =
      buttons && buttons.length > 0
        ? buttons
        : [
            {
              text: 'OK',
            },
          ];

    const guardedButtons = sourceButtons.map((button: AlertButton): AlertButton => ({
      ...button,
      onPress: (value?: string) => {
        try {
          return (button.onPress as ((nextValue?: unknown) => void) | undefined)?.(value);
        } finally {
          releaseAlertLock();
        }
      },
    }));

    const guardedOptions = {
      ...options,
      onDismiss: () => {
        try {
          options?.onDismiss?.();
        } finally {
          releaseAlertLock();
        }
      },
    };

    originalAlert(title, message, guardedButtons, guardedOptions);

    fallbackReleaseTimer = setTimeout(() => {
      alertOpen = false;
      fallbackReleaseTimer = null;
    }, 15000);
  }) as typeof Alert.alert;
};
