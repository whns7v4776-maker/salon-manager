import * as ExpoHaptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

export type HapticFeedbackType = 'light' | 'medium' | 'success' | 'error';

const vibrateFallback = (pattern: number | number[]) => {
  if (Platform.OS !== 'android') return;
  Vibration.vibrate(pattern);
};

let lastLightFeedbackAt = -Infinity;
const runHaptic = async (type: HapticFeedbackType) => {
  if (Platform.OS === 'web') return;
  // A shared button and its action can both request selection feedback.
  // Coalesce that single tap without suppressing success/error notifications.
  if (type === 'light') {
    const now = Date.now();
    if (now - lastLightFeedbackAt < 60) return;
    lastLightFeedbackAt = now;
  }
  try {
    switch (type) {
      case 'medium':
        await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
        return;
      case 'success':
        await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Success);
        return;
      case 'error':
        await ExpoHaptics.notificationAsync(ExpoHaptics.NotificationFeedbackType.Error);
        return;
      default:
        await ExpoHaptics.selectionAsync();
    }
  } catch {
    switch (type) {
      case 'medium':
        vibrateFallback(18);
        break;
      case 'success':
        vibrateFallback([0, 20, 24, 28]);
        break;
      case 'error':
        vibrateFallback([0, 16, 28, 16]);
        break;
      default:
        vibrateFallback(12);
    }
  }
};

export const haptic = {
  light: () => runHaptic('light'),
  medium: () => runHaptic('medium'),
  success: () => runHaptic('success'),
  error: () => runHaptic('error'),
};
