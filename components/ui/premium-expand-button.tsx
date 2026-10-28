import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Platform,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  View,
} from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { HapticTouchable } from './haptic-touchable';

type PremiumExpandButtonProps = {
  tone?: {ink:string;fill:string;border:string};
  expanded: boolean;
  editIcon?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  compact?: boolean;
  delicate?: boolean;
  salon?: boolean;
  style?: StyleProp<ViewStyle>;
  onTouchStart?: (event: unknown) => void;
};

export function PremiumExpandButton({
  expanded,
  tone,
  editIcon = false,
  onPress,
  accessibilityLabel,
  disabled = false,
  compact = false,
  delicate = false,
  salon = false,
  style,
  onTouchStart,
}: PremiumExpandButtonProps) {
  const progress = useSharedValue(expanded ? 1 : 0);
  const optimisticPressRef = React.useRef(false);

  React.useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: 105,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${progress.value * 180}deg` },
      { scale: 1 + progress.value * 0.04 },
    ],
  }));

  const handlePressIn = React.useCallback(() => {
    if (disabled) return;
    optimisticPressRef.current = true;
    progress.value = withTiming(expanded ? 0 : 1, {
      duration: 48,
      easing: Easing.out(Easing.cubic),
    });
  }, [disabled, expanded, progress]);

  const handlePressOut = React.useCallback(() => {
    if (disabled) return;
    requestAnimationFrame(() => {
      if (!optimisticPressRef.current) return;
      optimisticPressRef.current = false;
      progress.value = withTiming(expanded ? 1 : 0, {
        duration: 62,
        easing: Easing.out(Easing.cubic),
      });
    });
  }, [disabled, expanded, progress]);

  const handlePress = React.useCallback(() => {
    optimisticPressRef.current = false;
    onPress();
  }, [onPress]);

  return (
    <HapticTouchable
      style={[
        styles.button,
        compact && styles.buttonCompact,
        expanded && styles.buttonExpanded,
        Platform.OS === 'web' && styles.buttonWeb,
        Platform.OS === 'web' && compact && styles.buttonCompactWeb,
        Platform.OS === 'web' && expanded && styles.buttonExpandedWeb,
        disabled && styles.buttonDisabled,
        style,
        delicate && styles.buttonDelicate,
        salon && styles.buttonSalon,
        salon && expanded && styles.buttonSalonExpanded,
        tone && {backgroundColor:tone.fill,borderColor:tone.border,borderWidth:1,shadowOpacity:0},
        {borderRadius:10,backgroundColor:"transparent",borderWidth:0,shadowOpacity:0,elevation:0},
      ]}
      onTouchStart={onTouchStart}
      onTouchCancel={handlePressOut}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
      immediatePress
      recoverStationaryTap={salon}
      delayPressIn={0}
      hapticType="light"
      pressScale={0.94}
      pressOpacity={0.92}
      pressInDuration={42}
      pressOutDuration={62}
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
      accessibilityRole="button"
      accessibilityState={{ expanded, disabled }}
      accessibilityLabel={accessibilityLabel}
    >
      {!delicate && !salon ? <View pointerEvents="none" style={styles.topLight} /> : null}
      <Reanimated.View pointerEvents="none" style={editIcon ? undefined : arrowStyle}>
        <Ionicons
          name={editIcon ? "create-outline" : "chevron-down"}
          size={Platform.OS === 'web' ? (compact ? 15 : 17) : compact ? 17 : 19}
          color={
            tone ? tone.ink : salon ? (expanded ? '#245E9A' : '#375472') : Platform.OS === 'web'
              ? expanded
                ? '#3B5F8F'
                : '#64748B'
              : expanded
                ? '#1D4ED8'
                : '#334155'
          }
        />
      </Reanimated.View>
    </HapticTouchable>
  );
}

const styles = StyleSheet.create({
  buttonSalon: {
    borderRadius: 999,
    borderWidth: 0,
    backgroundColor: '#F0F4F8',
    shadowOpacity: 0,
    elevation: 0,
    ...Platform.select({ web: { boxShadow: 'none' }, default: {} }),
  },
  buttonSalonExpanded: {
    backgroundColor: '#E4EFFB',
    borderWidth: 1,
    borderColor: '#C6DCF2',
    shadowColor: '#5E9CD6',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    ...Platform.select({ web: { boxShadow: '0 0 10px rgba(94,156,214,0.14)' }, default: {} }),
  },
  buttonDelicate: {
    width: 30,
    height: 30,
    minWidth: 30,
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#DBEAFE',
    backgroundColor: '#EFF6FF',
    shadowOpacity: 0,
    elevation: 0,
    ...Platform.select({ web: { boxShadow: 'none' }, default: {} }),
  },
  button: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    shadowColor: '#0F172A',
    shadowOpacity: 0.12,
    shadowRadius: 11,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    ...Platform.select({
      web: {
        boxShadow: '0 8px 18px rgba(15, 23, 42, 0.10)',
      },
      default: {},
    }),
  },
  buttonCompact: {
    width: 40,
    height: 40,
    minWidth: 40,
    minHeight: 40,
    borderRadius: 14,
  },
  buttonExpanded: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
    shadowColor: '#2563EB',
    shadowOpacity: 0.17,
  },
  buttonWeb: {
    backgroundColor: 'rgba(241, 245, 249, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.32)',
    shadowOpacity: 0,
    elevation: 0,
    boxShadow: 'none',
  },
  buttonCompactWeb: {
    width: 36,
    height: 36,
    minWidth: 36,
    minHeight: 36,
    borderRadius: 12,
  },
  buttonExpandedWeb: {
    backgroundColor: 'rgba(219, 234, 254, 0.58)',
    borderColor: 'rgba(96, 165, 250, 0.36)',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  topLight: {
    position: 'absolute',
    top: 3,
    left: 8,
    right: 8,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
});
