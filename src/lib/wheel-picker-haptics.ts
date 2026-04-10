import * as ExpoHaptics from 'expo-haptics';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

type WheelPickerHapticsNativeModule = {
  prepareSelection?: () => void;
  selectionChanged?: () => void;
  endSelection?: () => void;
};

const nativeModule =
  requireOptionalNativeModule<WheelPickerHapticsNativeModule>('ExpoWheelPickerHaptics');

const noop = async () => {};

export const wheelPickerHaptics = {
  prepareSelection: () => {
    if (Platform.OS !== 'ios') return noop();
    if (nativeModule?.prepareSelection) {
      nativeModule.prepareSelection();
      return noop();
    }
    return ExpoHaptics.selectionAsync().then(() => {});
  },
  selectionChanged: () => {
    if (Platform.OS !== 'ios') return noop();
    if (nativeModule?.selectionChanged) {
      nativeModule.selectionChanged();
      return noop();
    }
    return ExpoHaptics.selectionAsync();
  },
  endSelection: () => {
    if (Platform.OS !== 'ios') return noop();
    if (nativeModule?.endSelection) {
      nativeModule.endSelection();
      return noop();
    }
    return noop();
  },
};
