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
const pad2 = (value: number) => String(value).padStart(2, '0');
const MONTH_LABELS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const WEEKDAY_LABELS = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

type CalendarCell = {
  key: string;
  value: Date | null;
  label: string;
  isDisabled: boolean;
};

const parseIsoDateValue = (value?: string | null) => {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, (month ?? 1) - 1, day ?? 1);
  }

  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
};

const toIsoDate = (value: Date) =>
  `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;

const sameDay = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const formatMonthYear = (value: Date) =>
  `${MONTH_LABELS[value.getMonth()]} ${value.getFullYear()}`;

const buildMonthCells = (monthDate: Date, minimumDate?: string): CalendarCell[] => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let index = 0; index < startWeekday; index += 1) {
    cells.push({
      key: `empty-${month}-${index}`,
      value: null,
      label: '',
      isDisabled: true,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const value = new Date(year, month, day);
    const minDate = minimumDate ? parseIsoDateValue(minimumDate) : null;
    const isDisabled = minDate ? value < minDate : false;
    cells.push({
      key: `${year}-${month}-${day}`,
      value,
      label: String(day),
      isDisabled,
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({
      key: `tail-${month}-${cells.length}`,
      value: null,
      label: '',
      isDisabled: true,
    });
  }

  return cells;
};

export function NativeDatePickerModal({
  visible,
  title,
  initialValue,
  minimumDate,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  minimumDate?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const initialDate = useMemo(() => parseIsoDateValue(initialValue), [initialValue]);
  const [draftDate, setDraftDate] = useState(initialDate);
  const [showCalendarGrid, setShowCalendarGrid] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );
  const androidPickerOpenedRef = useRef(false);

  useEffect(() => {
    if (!visible) return;
    const next = parseIsoDateValue(initialValue);
    setDraftDate(next);
    setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    setShowCalendarGrid(false);
  }, [initialValue, visible]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (!visible) {
      androidPickerOpenedRef.current = false;
      return;
    }

    if (androidPickerOpenedRef.current) return;

    androidPickerOpenedRef.current = true;
    DateTimePickerAndroid.open({
      value: parseIsoDateValue(initialValue),
      mode: 'date',
      display: 'calendar',
      minimumDate: minimumDate ? parseIsoDateValue(minimumDate) : undefined,
      onChange: (event, nextDate) => {
        androidPickerOpenedRef.current = false;
        handleChange(event, nextDate);
      },
    });
  }, [initialValue, minimumDate, visible]);

  const handleChange = (event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        onClose();
        return;
      }

      if (nextDate) {
        haptic.light().catch(() => null);
        onConfirm(toIsoDate(nextDate));
      }
      onClose();
      return;
    }

    if (nextDate) {
      haptic.light().catch(() => null);
      setDraftDate(nextDate);
      setCalendarMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  };

  const confirmIosSelection = () => {
    onConfirm(toIsoDate(draftDate));
  };

  const calendarCells = useMemo(() => buildMonthCells(calendarMonth, minimumDate), [calendarMonth, minimumDate]);

  const selectCalendarDate = (value: Date) => {
    haptic.light().catch(() => null);
    setDraftDate(value);
    setCalendarMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  };

  if (!visible) return null;

  if (Platform.OS === 'android') {
    return null;
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
              style={styles.toggleViewButton}
              onPress={() => setShowCalendarGrid((current) => !current)}
              activeOpacity={0.9}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={styles.toggleViewButtonText}
              >
                {showCalendarGrid ? 'Rotella' : 'Calendario'}
              </Text>
            </HapticTouchable>
          </View>

          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={styles.monthYearLabel}
          >
            {formatMonthYear(draftDate)}
          </Text>

          {showCalendarGrid ? (
            <View style={styles.calendarWrap}>
              <View style={styles.calendarHeader}>
                <HapticTouchable
                  style={styles.calendarNavButton}
                  onPress={() =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                    )
                  }
                  activeOpacity={0.9}
                >
                  <Text style={styles.calendarNavButtonText}>‹</Text>
                </HapticTouchable>
                <Text style={styles.calendarHeaderText}>{formatMonthYear(calendarMonth)}</Text>
                <HapticTouchable
                  style={styles.calendarNavButton}
                  onPress={() =>
                    setCalendarMonth(
                      new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                    )
                  }
                  activeOpacity={0.9}
                >
                  <Text style={styles.calendarNavButtonText}>›</Text>
                </HapticTouchable>
              </View>

              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((label) => (
                  <Text key={label} style={styles.weekdayText}>
                    {label}
                  </Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarCells.map((cell) => {
                  const selected = cell.value ? sameDay(cell.value, draftDate) : false;

                  return (
                    <HapticTouchable
                      key={cell.key}
                      style={[
                        styles.calendarDay,
                        selected && styles.calendarDayActive,
                        cell.isDisabled && styles.calendarDayDisabled,
                      ]}
                      onPress={() => cell.value && selectCalendarDate(cell.value)}
                      activeOpacity={cell.value ? 0.9 : 1}
                      disabled={!cell.value}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          selected && styles.calendarDayTextActive,
                          cell.isDisabled && styles.calendarDayTextDisabled,
                        ]}
                      >
                        {cell.label}
                      </Text>
                    </HapticTouchable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={styles.pickerWrap}>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                minimumDate={minimumDate ? parseIsoDateValue(minimumDate) : undefined}
                onChange={handleChange}
                locale="it-IT"
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
              onPress={confirmIosSelection}
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
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    textAlign: 'left',
    flex: 1,
    includeFontPadding: IS_ANDROID,
    paddingRight: IS_ANDROID ? 12 : 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  toggleViewButton: {
    backgroundColor: '#dcecff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#c9defa',
  },
  toggleViewButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  monthYearLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 10,
  },
  pickerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  picker: {
    width: '100%',
  },
  calendarWrap: {
    marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: '#eef2f7',
    borderWidth: 1,
    borderColor: '#dbe4ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavButtonText: {
    color: '#334155',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 26,
  },
  calendarHeaderText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1a1816',
    textAlign: 'center',
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekdayText: {
    width: '14.2857%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDay: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    marginBottom: 6,
  },
  calendarDayActive: {
    backgroundColor: '#161616',
  },
  calendarDayDisabled: {
    opacity: 0.25,
  },
  calendarDayText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  calendarDayTextActive: {
    color: '#ffffff',
  },
  calendarDayTextDisabled: {
    color: '#94a3b8',
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
