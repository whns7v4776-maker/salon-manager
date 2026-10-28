import { Alert, Platform, type AlertButton } from 'react-native';

export type OwnerRequestDialog = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  onDismiss: () => void;
};

// Web Alert.alert is a no-op. Present an app dialog without blocking the browser;
// native callers retain the original Alert behavior and button callbacks.
export const createOwnerRequestAlert = (
  presentDialog: (dialog: OwnerRequestDialog) => void,
): typeof Alert.alert => (title, message, buttons, options) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    Alert.alert(title, message, buttons, options);
    return;
  }

  let settled = false;
  const once = (action?: () => void) => () => {
    if (settled) return;
    settled = true;
    action?.();
  };
  presentDialog({
    title,
    message,
    buttons: (buttons?.length ? buttons : [{ text: 'OK' }]).map((button) => ({
      ...button,
      onPress: once(button.onPress),
    })),
    onDismiss: once(options?.onDismiss),
  });
};
