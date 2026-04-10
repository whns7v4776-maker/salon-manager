import DateTimePicker, {
    DateTimePickerAndroid,
    type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../../src/lib/haptics';
import { HapticTouchable } from './haptic-touchable';

const IS_ANDROID = Platform.OS === 'android';
const ANDROID_SHEET_EXTRA_LIFT = 25;
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const ANDROID_MINUTE_INTERVALS = new Set([1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30]);

const buildMinuteOptions = (step: number) => {
  const safeStep = Math.max(1, Math.min(30, step));
  const values: string[] = [];
  for (let minute = 0; minute < 60; minute += safeStep) {
    values.push(String(minute).padStart(2, '0'));
  }
  return values;
};

const parseTimeValue = (value?: string | null) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0, 0);

  if (value && /^\d{2}:\d{2}$/.test(value)) {
    const [hours, minutes] = value.split(':').map(Number);
    date.setHours(hours || 0, minutes || 0, 0, 0);
  }

  return date;
};

const toTimeValue = (value: Date) =>
  `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;

const TimePickerComponent = DateTimePicker as React.ComponentType<any>;

export function NativeTimePickerModal({
  visible,
  title,
  initialValue,
  onClose,
  onConfirm,
  minuteStep = 5,
  gridMinuteStep = 1,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
  minuteStep?: number;
  gridMinuteStep?: number;
}) {
  const initialTime = useMemo(() => parseTimeValue(initialValue), [initialValue]);
  const [draftTime, setDraftTime] = useState(initialTime);
  const [showGrid, setShowGrid] = useState(false);
  const androidPickerOpenedRef = useRef(false);
  const minuteOptions = useMemo(() => {
    const options = buildMinuteOptions(gridMinuteStep);
    const currentMinute = String(draftTime.getMinutes()).padStart(2, '0');
    return options.includes(currentMinute) ? options : [...options, currentMinute].sort();
  }, [draftTime, gridMinuteStep]);

  useEffect(() => {
    if (!visible) return;
    setDraftTime(parseTimeValue(initialValue));
    setShowGrid(false);
  }, [initialValue, visible]);

  const handleChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        onClose();
        return;
      }

      if (nextDate) {
        haptic.light().catch(() => null);
        onConfirm(toTimeValue(nextDate));
      }
      onClose();
      return;
    }

    if (nextDate) {
      haptic.light().catch(() => null);
      setDraftTime(nextDate);
    }
  };

  const updateGridValue = ({ hours, minutes }: { hours?: string; minutes?: string }) => {
    const nextDate = new Date(draftTime);
    if (hours !== undefined) nextDate.setHours(Number(hours));
    if (minutes !== undefined) nextDate.setMinutes(Number(minutes));
    haptic.light().catch(() => null);
    setDraftTime(nextDate);
  };

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <HapticTouchable style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
          <View style={styles.sheet}>
            <View style={styles.headerRow}>
              <Text
                numberOfLines={2}
                ellipsizeMode="clip"
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={styles.title}
              >
                {title}
              </Text>
            </View>

            <View style={styles.valueSummary}>
              <View style={styles.valueChip}>
                <Text style={styles.valueChipText}>{String(draftTime.getHours()).padStart(2, '0')}</Text>
              </View>
              <Text style={styles.valueSeparator}>:</Text>
              <View style={styles.valueChip}>
                <Text style={styles.valueChipText}>
                  {String(draftTime.getMinutes()).padStart(2, '0')}
                </Text>
              </View>
            </View>

            <View style={styles.gridWrap}>
              <View style={styles.gridSection}>
                <Text style={styles.gridTitle}>Ore</Text>
                <View style={styles.gridValues}>
                  {HOURS.map((hour) => {
                    const selected = hour === String(draftTime.getHours()).padStart(2, '0');
                    return (
                      <HapticTouchable
                        key={`android-hour-${hour}`}
                        style={[styles.gridChip, selected && styles.gridChipActive]}
                        onPress={() => updateGridValue({ hours: hour })}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.gridChipText, selected && styles.gridChipTextActive]}>
                          {hour}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.gridSection}>
                <Text style={styles.gridTitle}>Minuti</Text>
                <View style={styles.gridValues}>
                  {minuteOptions.map((minute) => {
                    const selected = minute === String(draftTime.getMinutes()).padStart(2, '0');
                    return (
                      <HapticTouchable
                        key={`android-minute-${minute}`}
                        style={[styles.gridChip, selected && styles.gridChipActive]}
                        onPress={() => updateGridValue({ minutes: minute })}
                        activeOpacity={0.9}
                      >
                        <Text style={[styles.gridChipText, selected && styles.gridChipTextActive]}>
                          {minute}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={styles.actions}>
              <HapticTouchable style={styles.lightButton} onPress={onClose} activeOpacity={0.9}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.lightButtonText}>Annulla</Text>
              </HapticTouchable>
              <HapticTouchable
                style={styles.darkButton}
                onPress={() => onConfirm(toTimeValue(draftTime))}
                hapticType="success"
                activeOpacity={0.9}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.darkButtonText}>Conferma</Text>
              </HapticTouchable>
            </View>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <HapticTouchable style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text
              numberOfLines={2}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={styles.title}
            >
              {title}
            </Text>
            <HapticTouchable
              style={styles.toggleButton}
              onPress={() => setShowGrid((current) => !current)}
              activeOpacity={0.9}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.toggleButtonText}>{showGrid ? 'Rotella' : 'Griglia'}</Text>
            </HapticTouchable>
          </View>

          <View style={styles.valueSummary}>
            <View style={styles.valueChip}>
              <Text style={styles.valueChipText}>{String(draftTime.getHours()).padStart(2, '0')}</Text>
            </View>
            <Text style={styles.valueSeparator}>:</Text>
            <View style={styles.valueChip}>
              <Text style={styles.valueChipText}>
                {String(draftTime.getMinutes()).padStart(2, '0')}
              </Text>
            </View>
          </View>

          {showGrid ? (
            <View style={styles.gridWrap}>
              <View style={styles.gridSection}>
                <Text style={styles.gridTitle}>Ore</Text>
                <View style={styles.gridValues}>
                  {HOURS.map((hour) => {
                    const selected = hour === String(draftTime.getHours()).padStart(2, '0');
                    return (
                      <HapticTouchable
                        key={`hour-${hour}`}
                        style={[styles.gridChip, selected && styles.gridChipActive]}
                        onPress={() => updateGridValue({ hours: hour })}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[styles.gridChipText, selected && styles.gridChipTextActive]}
                        >
                          {hour}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.gridSection}>
                <Text style={styles.gridTitle}>Minuti</Text>
                <View style={styles.gridValues}>
                  {minuteOptions.map((minute) => {
                    const selected = minute === String(draftTime.getMinutes()).padStart(2, '0');
                    return (
                      <HapticTouchable
                        key={`minute-${minute}`}
                        style={[styles.gridChip, selected && styles.gridChipActive]}
                        onPress={() => updateGridValue({ minutes: minute })}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[styles.gridChipText, selected && styles.gridChipTextActive]}
                        >
                          {minute}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.pickerWrap}>
              <TimePickerComponent
                value={draftTime}
                mode="time"
                display="spinner"
                is24Hour
                minuteInterval={minuteStep}
                onChange={handleChange}
                themeVariant="light"
                style={styles.picker}
              />
            </View>
          )}

          <View style={styles.actions}>
            <HapticTouchable style={styles.lightButton} onPress={onClose} activeOpacity={0.9}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.lightButtonText}>Annulla</Text>
            </HapticTouchable>
            <HapticTouchable
              style={styles.darkButton}
              onPress={() => onConfirm(toTimeValue(draftTime))}
              hapticType="success"
              activeOpacity={0.9}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.darkButtonText}>Conferma</Text>
            </HapticTouchable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.28)',
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginBottom: IS_ANDROID ? ANDROID_SHEET_EXTRA_LIFT : 0,
    paddingHorizontal: IS_ANDROID ? 22 : 18,
    paddingTop: 16,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 10,
    minHeight: 28,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    textAlign: 'center',
    flex: 1,
    paddingRight: IS_ANDROID ? 12 : 0,
    includeFontPadding: IS_ANDROID,
  },
  toggleButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    backgroundColor: '#eef2f7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  toggleButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  valueSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  valueChip: {
    minWidth: 92,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: 'center',
  },
  valueChipText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111111',
  },
  valueSeparator: {
    fontSize: 24,
    fontWeight: '800',
    color: '#334155',
  },
  pickerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  picker: {
    width: '100%',
  },
  gridWrap: {
    marginBottom: 16,
    gap: 14,
  },
  gridSection: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    padding: 14,
  },
  gridTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
    marginBottom: 12,
  },
  gridValues: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  gridChip: {
    minWidth: 62,
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginBottom: 8,
    alignItems: 'center',
  },
  gridChipActive: {
    backgroundColor: '#161616',
    borderColor: '#161616',
  },
  gridChipText: {
    color: '#334155',
    fontSize: 15,
    fontWeight: '800',
  },
  gridChipTextActive: {
    color: '#ffffff',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  lightButton: {
    flex: 1,
    backgroundColor: '#ececec',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightButtonText: {
    color: '#111111',
    fontSize: 14,
    fontWeight: '800',
    width: '100%',
    textAlign: 'center',
    includeFontPadding: IS_ANDROID,
  },
  darkButton: {
    flex: 1,
    backgroundColor: '#161616',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    width: '100%',
    textAlign: 'center',
    includeFontPadding: IS_ANDROID,
  },
});
