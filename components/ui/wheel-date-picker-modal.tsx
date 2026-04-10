import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type NativeScrollEvent,
    type NativeSyntheticEvent,
} from 'react-native';
import { haptic } from '../../src/lib/haptics';
import { HapticTouchable } from './haptic-touchable';

const ITEM_HEIGHT = 44;
const IS_ANDROID = Platform.OS === 'android';
const ANDROID_SHEET_EXTRA_LIFT = 25;
const VISIBLE_ROWS = 5;
const PICKER_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PICKER_PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);
const MONTH_LABELS = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];

const pad2 = (value: number) => String(value).padStart(2, '0');

const getDaysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

const parseIsoDateValue = (value?: string | null) => {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return {
      year: year || new Date().getFullYear(),
      month: month || new Date().getMonth() + 1,
      day: day || new Date().getDate(),
    };
  }

  const today = new Date();
  return {
    year: today.getFullYear(),
    month: today.getMonth() + 1,
    day: today.getDate(),
  };
};

const WheelColumn = ({
  values,
  selectedIndex,
  onChange,
  formatter,
}: {
  values: number[];
  selectedIndex: number;
  onChange: (nextIndex: number) => void;
  formatter?: (value: number) => string;
}) => {
  const scrollRef = useRef<ScrollView | null>(null);
  const lastNotifiedIndexRef = useRef(selectedIndex);
  const lastScrollSampleRef = useRef<{ offsetY: number; timestamp: number } | null>(null);
  const visualFrameRef = useRef<number | null>(null);
  const [visualIndex, setVisualIndex] = useState(selectedIndex);

  const commitIndex = (nextIndex: number) => {
    updateVisualIndex(nextIndex);
    onChange(nextIndex);
    haptic.light().catch(() => null);
    scrollRef.current?.scrollTo({ y: nextIndex * ITEM_HEIGHT, animated: true });
  };

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;

    lastNotifiedIndexRef.current = selectedIndex;
    setVisualIndex(selectedIndex);

    requestAnimationFrame(() => {
      node.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
    });

    return () => {
      if (visualFrameRef.current !== null) {
        cancelAnimationFrame(visualFrameRef.current);
      }
    };
  }, [selectedIndex, values]);

  const updateVisualIndex = (nextIndex: number) => {
    if (visualFrameRef.current !== null) {
      cancelAnimationFrame(visualFrameRef.current);
    }

    visualFrameRef.current = requestAnimationFrame(() => {
      setVisualIndex(nextIndex);
      visualFrameRef.current = null;
    });
  };

  const triggerResponsiveHaptic = (steps: number) => {
    const lastSample = lastScrollSampleRef.current;
    const speed =
      lastSample && lastSample.timestamp > 0
        ? Math.abs(lastSample.offsetY) / Math.max(lastSample.timestamp, 1)
        : 0;

    const pulses = Math.max(1, Math.min(steps, speed > 3 ? 8 : speed > 2 ? 6 : 4));

    for (let index = 0; index < pulses; index += 1) {
      haptic.light().catch(() => null);
    }

    if (steps >= 4 || speed > 3.2) {
      haptic.light().catch(() => null);
    }
  };

  const notifyIndexChange = (nextIndex: number, options?: { commit?: boolean }) => {
    const previousIndex = lastNotifiedIndexRef.current;
    if (nextIndex === previousIndex) return;

    lastNotifiedIndexRef.current = nextIndex;
    updateVisualIndex(nextIndex);
    triggerResponsiveHaptic(Math.abs(nextIndex - previousIndex));

    if (options?.commit) {
      onChange(nextIndex);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const now = Date.now();
    const previousSample = lastScrollSampleRef.current;

    if (previousSample) {
      lastScrollSampleRef.current = {
        offsetY: offsetY - previousSample.offsetY,
        timestamp: now - previousSample.timestamp,
      };
    } else {
      lastScrollSampleRef.current = { offsetY: 0, timestamp: 16 };
    }

    const nextIndex = Math.max(0, Math.min(values.length - 1, Math.round(offsetY / ITEM_HEIGHT)));
    notifyIndexChange(nextIndex);
    lastScrollSampleRef.current = { offsetY, timestamp: now };
  };

  const handleMomentumEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const nextIndex = Math.max(0, Math.min(values.length - 1, Math.round(offsetY / ITEM_HEIGHT)));
    notifyIndexChange(nextIndex);
    commitIndex(nextIndex);
  };

  const handleScrollEndDrag = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const velocity = Math.abs(event.nativeEvent.velocity?.y ?? 0);
    if (velocity > 0.12) return;

    const offsetY = event.nativeEvent.contentOffset.y;
    const nextIndex = Math.max(0, Math.min(values.length - 1, Math.round(offsetY / ITEM_HEIGHT)));
    commitIndex(nextIndex);
  };

  return (
    <View style={styles.wheelColumn}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        onScroll={handleScroll}
        scrollEventThrottle={1}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={styles.wheelContent}
      >
        {values.map((value, index) => {
          const distance = Math.abs(index - visualIndex);
          const textStyle =
            distance === 0
              ? styles.wheelItemTextActive
              : distance === 1
                ? styles.wheelItemTextNear
                : distance === 2
                  ? styles.wheelItemTextFar
                  : styles.wheelItemTextFaded;

          return (
          <View key={`${value}`} style={styles.wheelItem}>
            <Text style={[styles.wheelItemText, textStyle]}>
              {formatter ? formatter(value) : String(value)}
            </Text>
          </View>
        );
        })}
      </ScrollView>
    </View>
  );
};

export function WheelDatePickerModal({
  visible,
  title,
  initialValue,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
}) {
  const initialDate = useMemo(() => parseIsoDateValue(initialValue), [initialValue]);
  const [selectedYear, setSelectedYear] = useState(initialDate.year);
  const [selectedMonth, setSelectedMonth] = useState(initialDate.month);
  const [selectedDay, setSelectedDay] = useState(initialDate.day);

  useEffect(() => {
    if (!visible) return;
    const next = parseIsoDateValue(initialValue);
    setSelectedYear(next.year);
    setSelectedMonth(next.month);
    setSelectedDay(next.day);
  }, [initialValue, visible]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - 1940 + 1 }, (_, index) => 1940 + index);
  }, []);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => index + 1), []);
  const days = useMemo(
    () => Array.from({ length: getDaysInMonth(selectedYear, selectedMonth) }, (_, index) => index + 1),
    [selectedMonth, selectedYear]
  );

  useEffect(() => {
    const maxDay = getDaysInMonth(selectedYear, selectedMonth);
    if (selectedDay > maxDay) {
      setSelectedDay(maxDay);
    }
  }, [selectedDay, selectedMonth, selectedYear]);

  const yearIndex = Math.max(0, years.indexOf(selectedYear));
  const monthIndex = Math.max(0, months.indexOf(selectedMonth));
  const dayIndex = Math.max(0, days.indexOf(selectedDay));

  const confirmSelection = () => {
    haptic.success().catch(() => null);
    onConfirm(`${selectedYear}-${pad2(selectedMonth)}-${pad2(selectedDay)}`);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <HapticTouchable style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.wheelWrap}>
            <View style={[styles.wheelFadeMask, styles.wheelFadeMaskTop]} pointerEvents="none" />
            <View
              style={[styles.wheelFadeMask, styles.wheelFadeMaskBottom]}
              pointerEvents="none"
            />
            <View style={styles.selectionOverlay} pointerEvents="none" />

            <WheelColumn
              values={days}
              selectedIndex={dayIndex}
              onChange={(index) => setSelectedDay(days[index] ?? selectedDay)}
              formatter={(value) => pad2(value)}
            />
            <WheelColumn
              values={months}
              selectedIndex={monthIndex}
              onChange={(index) => setSelectedMonth(months[index] ?? selectedMonth)}
              formatter={(value) => MONTH_LABELS[value - 1] ?? pad2(value)}
            />
            <WheelColumn
              values={years}
              selectedIndex={yearIndex}
              onChange={(index) => setSelectedYear(years[index] ?? selectedYear)}
            />
          </View>

          <View style={styles.actions}>
            <HapticTouchable style={styles.lightButton} onPress={onClose} activeOpacity={0.9}>
              <Text style={styles.lightButtonText}>Annulla</Text>
            </HapticTouchable>
            <HapticTouchable style={styles.darkButton} onPress={confirmSelection} activeOpacity={0.9}>
              <Text style={styles.darkButtonText}>Conferma</Text>
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
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    textAlign: 'center',
    marginBottom: 14,
  },
  wheelWrap: {
    height: PICKER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 16,
  },
  selectionOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PICKER_PADDING,
    height: ITEM_HEIGHT,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
  },
  wheelFadeMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 1.45,
    zIndex: 2,
  },
  wheelFadeMaskTop: {
    top: 0,
    backgroundColor: 'rgba(248,250,252,0.82)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  wheelFadeMaskBottom: {
    bottom: 0,
    backgroundColor: 'rgba(248,250,252,0.86)',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  wheelColumn: {
    flex: 1,
    height: PICKER_HEIGHT,
  },
  wheelContent: {
    paddingTop: PICKER_PADDING,
    paddingBottom: PICKER_PADDING,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
  },
  wheelItemTextActive: {
    fontSize: 21,
    fontWeight: '800',
    color: '#111827',
    opacity: 1,
  },
  wheelItemTextNear: {
    fontSize: 19,
    fontWeight: '700',
    color: '#475569',
    opacity: 0.82,
  },
  wheelItemTextFar: {
    fontSize: 17,
    fontWeight: '700',
    color: '#64748b',
    opacity: 0.58,
  },
  wheelItemTextFaded: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94a3b8',
    opacity: 0.3,
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
  },
});
