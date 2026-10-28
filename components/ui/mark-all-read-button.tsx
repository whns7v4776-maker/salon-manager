import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { HapticTouchable } from './haptic-touchable';

type MarkAllReadButtonProps = {
  tone?: {ink:string;fill:string;border:string};
  count: number;
  understated?: boolean;
  iconOnly?: boolean;
  onPress: () => void | Promise<void>;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function MarkAllReadButton({
  count,
  tone,
  understated = false,
  iconOnly = false,
  onPress,
  label = 'Segna letti',
  style,
}: MarkAllReadButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const normalizedCount = Math.max(0, Math.trunc(count));

  const handlePress = useCallback(async () => {
    if (submitting || normalizedCount === 0) return;

    setSubmitting(true);
    try {
      await onPress();
    } catch (error) {
      console.log('Errore durante la lettura multipla:', error);
    } finally {
      setSubmitting(false);
    }
  }, [normalizedCount, onPress, submitting]);

  if (normalizedCount === 0) return null;

  const visibleCount = normalizedCount > 99 ? '99+' : String(normalizedCount);

  return (
    <HapticTouchable
      immediatePress
      hapticType="light"
      disabled={submitting}
      onPress={() => void handlePress()}
      style={[styles.button, understated && styles.understated, submitting && styles.buttonSubmitting, iconOnly && styles.iconOnly, style, tone && {backgroundColor:tone.fill,borderColor:tone.border,shadowOpacity:0}]}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${normalizedCount} notifiche`}
      accessibilityState={{ disabled: submitting, busy: submitting }}
    >
      {submitting ? (
        <ActivityIndicator size="small" color={tone?.ink ?? "#2563EB"} />
      ) : (
        <Ionicons name="checkmark-done-outline" size={17} color={tone?.ink ?? "#2563EB"} />
      )}
      {!iconOnly ? <Text style={[styles.label, understated && styles.understatedLabel, tone && {color:tone.ink}]} numberOfLines={1}>
        {label}
      </Text> : null}
      {!understated && !iconOnly ? <Text style={styles.count}>{visibleCount}</Text> : null}
    </HapticTouchable>
  );
}

const styles = StyleSheet.create({
  iconOnly: { width: 40, height: 40, minHeight: 40, paddingLeft: 0, paddingRight: 0, borderRadius: 12, flexShrink: 0, elevation: 0 },
  button: {
    minHeight: 34,
    paddingLeft: 10,
    paddingRight: 6,
    borderRadius: 17,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  understated: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#F4F7FB',
    borderColor: '#E5EBF3',
    shadowOpacity: 0,
    elevation: 0,
    gap: 8,
    maxWidth: '100%',
  },
  understatedLabel: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  buttonSubmitting: {
    opacity: 0.72,
  },
  label: {
    color: '#1D4ED8',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
  },
  count: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 5,
    borderRadius: 11,
    overflow: 'hidden',
    textAlign: 'center',
    textAlignVertical: 'center',
    color: '#FFFFFF',
    backgroundColor: '#2563EB',
    fontSize: 10,
    lineHeight: 22,
    fontWeight: '900',
  },
});
