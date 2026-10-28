import * as ExpoHaptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type WheelPickerHapticsNativeModule = {
  prepareSelection?: () => void;
  selectionChanged?: () => void;
  selectionChangedBurst?: (crossedItems: number) => void;
  endSelection?: () => void;
};

const nativeModule =
  requireOptionalNativeModule<WheelPickerHapticsNativeModule>('ExpoWheelPickerHaptics');

const noop = async () => {};
const LEGACY_BURST_INTERVAL_MS = 14;
const LEGACY_BURST_MAX_PULSES = 8;
let legacyBurstTimers: ReturnType<typeof setTimeout>[] = [];

const cancelLegacyBurst = () => {
  legacyBurstTimers.forEach(clearTimeout);
  legacyBurstTimers = [];
};

export const wheelPickerHaptics = {
  prepareSelection: () => {
    if (Platform.OS !== 'ios') return noop();
    cancelLegacyBurst();
    if (nativeModule?.prepareSelection) {
      nativeModule.prepareSelection();
      return noop();
    }
    return ExpoHaptics.selectionAsync().then(() => {});
  },
  selectionChanged: (crossedItems = 1) => {
    if (Platform.OS !== 'ios') return noop();
    if (nativeModule?.selectionChangedBurst) {
      nativeModule.selectionChangedBurst(
        Math.max(1, Math.round(crossedItems)),
      );
      return noop();
    }
    if (nativeModule?.selectionChanged) {
      cancelLegacyBurst();
      nativeModule.selectionChanged();
      const pulseCount = Math.min(
        LEGACY_BURST_MAX_PULSES,
        Math.max(1, Math.round(crossedItems)),
      );
      for (let pulseIndex = 1; pulseIndex < pulseCount; pulseIndex += 1) {
        legacyBurstTimers.push(
          setTimeout(() => {
            nativeModule.selectionChanged?.();
          }, pulseIndex * LEGACY_BURST_INTERVAL_MS),
        );
      }
      return noop();
    }
    return ExpoHaptics.selectionAsync();
  },
  endSelection: () => {
    if (Platform.OS !== 'ios') return noop();
    cancelLegacyBurst();
    if (nativeModule?.endSelection) {
      nativeModule.endSelection();
      return noop();
    }
    return noop();
  },
};
