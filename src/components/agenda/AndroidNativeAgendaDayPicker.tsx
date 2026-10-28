import {
  requireNativeViewManager,
  requireOptionalNativeModule,
} from 'expo-modules-core';
import type { ComponentType } from 'react';
import type {
  NativeSyntheticEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Platform } from 'react-native';

export type AndroidNativeAgendaDay = {
  value: string;
  weekdayShort: string;
  dayNumber: string;
  monthShort: string;
  statusLabel?: string | null;
  footerLabel: string;
  selectedLabel: string;
  isClosed: boolean;
  isFull?: boolean;
  isPast: boolean;
  pendingCount: number;
};

type SelectionEvent = NativeSyntheticEvent<{
  index: number;
  value: string;
}>;

type InteractionEvent = NativeSyntheticEvent<Record<string, never>>;

type NativeAgendaDayPickerProps = {
  style?: StyleProp<ViewStyle>;
  daysJson: string;
  selectedIndex: number;
  onSelectionChange?: (event: SelectionEvent) => void;
  onSelectionDeep?: (event: SelectionEvent) => void;
  onDayLongPress?: (event: SelectionEvent) => void;
  onInteractionStart?: (event: InteractionEvent) => void;
  onInteractionEnd?: (event: InteractionEvent) => void;
};

type NativeCapabilityModule = {
  supportsNativeAgendaDayPicker?: () => boolean;
};

const capabilityModule =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeCapabilityModule>(
        'ExpoWheelPickerHaptics',
      )
    : null;

export const supportsAndroidNativeAgendaDayPicker =
  Platform.OS === 'android' &&
  capabilityModule?.supportsNativeAgendaDayPicker?.() === true;

let NativeAgendaDayPicker: ComponentType<NativeAgendaDayPickerProps> | null =
  null;

if (supportsAndroidNativeAgendaDayPicker) {
  NativeAgendaDayPicker =
    requireNativeViewManager<NativeAgendaDayPickerProps>(
      'ExpoWheelPickerHaptics',
      'AgendaDayPicker',
    );
}

export default NativeAgendaDayPicker;
