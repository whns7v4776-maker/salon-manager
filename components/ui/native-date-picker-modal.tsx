import {useAgendaPopupStyles} from '../agenda-popup-theme';
import {NativeSheetClose} from './native-sheet-close';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {useAccessAppearance} from '../access-premium';
import {useNativePremium, NativeReadableText as Text} from '../owner-native-premium';

import { useSettingsWebStyles } from '../settings-web-styles';
import { useWebPickerStyles } from './web-picker-styles';
import { BrowserDateTimeInput } from './browser-date-time-input';
import { DockedSheetSurface } from './docked-sheet-surface';
import { WheelDatePickerModal } from './wheel-date-picker-modal';
import DateTimePicker, {
    DateTimePickerAndroid,
    type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { haptic } from '../../src/lib/haptics';
import { HapticTouchable } from './haptic-touchable';

const IS_ANDROID = Platform.OS === 'android';
const IS_WEB = Platform.OS === 'web';
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

const normalizePickerDateToLocalDay = (value: Date) => {
  const shouldUseUtcCalendarDay = value.getUTCHours() === 0 && value.getHours() !== 0;
  const year = shouldUseUtcCalendarDay ? value.getUTCFullYear() : value.getFullYear();
  const month = shouldUseUtcCalendarDay ? value.getUTCMonth() : value.getMonth();
  const day = shouldUseUtcCalendarDay ? value.getUTCDate() : value.getDate();

  return new Date(year, month, day);
};

const sameDay = (first: Date, second: Date) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const formatMonthYear = (value: Date) =>
  `${MONTH_LABELS[value.getMonth()]} ${value.getFullYear()}`;

const buildMonthCells = (
  monthDate: Date,
  minimumDate?: string,
  isDateDisabled?: (value: string) => boolean,
): CalendarCell[] => {
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
    const isDisabled =
      (minDate ? value < minDate : false) ||
      !!isDateDisabled?.(toIsoDate(value));
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
  bottomAnchored = true,
  embedded = false,
  embeddedPanel = false,
  calendarOnly = false,
  allowQuickPicker = false,
  isDateDisabled,
  disabledDateHint,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  minimumDate?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
  bottomAnchored?: boolean;
  embedded?: boolean;
  embeddedPanel?: boolean;
  calendarOnly?: boolean;
  allowQuickPicker?: boolean;
  isDateDisabled?: (value: string) => boolean;
  disabledDateHint?: string;
}) {
  const [showQuickPicker, setShowQuickPicker] = useState(false);
  const {palette:nativePickerPalette}=useAccessAppearance();
  const nativePickerPremium=useNativePremium() || !IS_WEB;
  const legacyStyles=useSettingsWebStyles(baseDatePickerStyles);
  const nativeStyles=useAgendaPopupStyles(baseDatePickerStyles);
  const styles=IS_WEB?legacyStyles:nativeStyles;
  const webPickerStyles=useWebPickerStyles();
  const useEmbeddedPanel = embedded && embeddedPanel;
  const inlineWeb = IS_WEB && useEmbeddedPanel;
  const PickerSurface = useEmbeddedPanel ? View : DockedSheetSurface;
  const initialDate = useMemo(() => parseIsoDateValue(initialValue), [initialValue]);
  const [draftDate, setDraftDate] = useState(initialDate);
  const [showCalendarGrid, setShowCalendarGrid] = useState(
    IS_WEB || calendarOnly,
  );
  const [calendarMonth, setCalendarMonth] = useState(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );
  const androidPickerOpenedRef = useRef(false);
  const latestOnCloseRef = useRef(onClose);
  const latestOnConfirmRef = useRef(onConfirm);
  const latestIsDateDisabledRef = useRef(isDateDisabled);
  latestOnCloseRef.current = onClose;
  latestOnConfirmRef.current = onConfirm;
  latestIsDateDisabledRef.current = isDateDisabled;

  useEffect(() => {
    if (!visible) return;
    setShowQuickPicker(false);
    const next = parseIsoDateValue(initialValue);
    setDraftDate(next);
    setCalendarMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    setShowCalendarGrid(IS_WEB || calendarOnly);
  }, [calendarOnly, initialValue, visible]);

  const handleChange = useCallback((event: DateTimePickerEvent, nextDate?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        latestOnCloseRef.current();
        return;
      }

      if (nextDate) {
        const nextValue = toIsoDate(normalizePickerDateToLocalDay(nextDate));
        if (latestIsDateDisabledRef.current?.(nextValue)) {
          haptic.error().catch(() => null);
          latestOnCloseRef.current();
          return;
        }
        haptic.light().catch(() => null);
        latestOnConfirmRef.current(nextValue);
      }
      latestOnCloseRef.current();
      return;
    }

    if (nextDate) {
      haptic.light().catch(() => null);
      const normalizedDate = normalizePickerDateToLocalDay(nextDate);
      setDraftDate(normalizedDate);
      setCalendarMonth(new Date(normalizedDate.getFullYear(), normalizedDate.getMonth(), 1));
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android' || calendarOnly || allowQuickPicker) return;

    if (!visible) {
      if (androidPickerOpenedRef.current) {
        androidPickerOpenedRef.current = false;
        void DateTimePickerAndroid.dismiss('date');
      }
      return;
    }

    if (androidPickerOpenedRef.current) return;

    androidPickerOpenedRef.current = true;
    DateTimePickerAndroid.open({
      value: parseIsoDateValue(initialValue),
      mode: 'date',
      display: 'spinner',
      minimumDate: minimumDate ? parseIsoDateValue(minimumDate) : undefined,
      onChange: (event, nextDate) => {
        if (!androidPickerOpenedRef.current) return;
        androidPickerOpenedRef.current = false;
        handleChange(event, nextDate);
      },
    });
  }, [allowQuickPicker, calendarOnly, handleChange, initialValue, minimumDate, visible]);

  useEffect(() => () => {
    if (IS_ANDROID && androidPickerOpenedRef.current) {
      androidPickerOpenedRef.current = false;
      void DateTimePickerAndroid.dismiss('date');
    }
  }, []);

  const confirmIosSelection = () => {
    const value = toIsoDate(draftDate);
    if ((minimumDate && value < minimumDate) || isDateDisabled?.(value)) {
      haptic.error().catch(() => null);
      return;
    }
    onConfirm(value);
  };

  const calendarCells = useMemo(
    () => buildMonthCells(calendarMonth, minimumDate, isDateDisabled),
    [calendarMonth, isDateDisabled, minimumDate],
  );

  const selectCalendarDate = (value: Date) => {
    haptic.light().catch(() => null);
    setDraftDate(value);
    setCalendarMonth(new Date(value.getFullYear(), value.getMonth(), 1));
  };

  if (!visible) return null;

  if (Platform.OS === 'android' && !calendarOnly && !allowQuickPicker) {
    return null;
  }

  if (allowQuickPicker && showQuickPicker) return <WheelDatePickerModal visible={visible} embedded={embedded} title={title} initialValue={toIsoDate(draftDate)} onClose={() => setShowQuickPicker(false)} onConfirm={(value) => { if ((!minimumDate || value >= minimumDate) && !isDateDisabled?.(value)) onConfirm(value); }} />;

  const pickerContent = (
    <View style={[styles.backdrop, IS_WEB && webPickerStyles.backdrop, bottomAnchored && !IS_WEB && { justifyContent: 'flex-end', paddingBottom: 0, paddingHorizontal: 0 }, useEmbeddedPanel && styles.backdropEmbeddedPanel, inlineWeb && {backgroundColor:'transparent',padding:0,flex:0,alignItems:'stretch',justifyContent:'flex-start'}]}>
        {!useEmbeddedPanel ? (
          <HapticTouchable style={styles.dismissArea} activeOpacity={1} onPress={(event) => { event.stopPropagation(); onClose(); }} />
        ) : null}
        <PickerSurface {...(!IS_WEB && !useEmbeddedPanel ? {onClose} : {})} style={[styles.sheet, IS_WEB && webPickerStyles.sheet, bottomAnchored && !IS_WEB && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 }, useEmbeddedPanel && styles.sheetEmbeddedPanel, inlineWeb && {flex:0,width:'100%',maxWidth:'100%',backgroundColor:'transparent',borderWidth:0,borderRadius:0,padding:0,shadowOpacity:0,boxShadow:'none',backdropFilter:'none'} as any]}>
          <View style={[styles.headerRow, IS_WEB && webPickerStyles.header]}>
            <Text
              numberOfLines={2}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={[styles.title, IS_WEB && webPickerStyles.title, inlineWeb && {color:nativePickerPalette.ink}]}
            >
              {title}
            </Text>
            {allowQuickPicker ? <HapticTouchable style={styles.toggleViewButton} onPress={() => setShowQuickPicker(true)}><Text style={styles.toggleViewButtonText}>Scelta rapida</Text></HapticTouchable> : null}
            {!IS_WEB && !calendarOnly && !allowQuickPicker ? (
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
            ) : null}
            {!IS_WEB && !useEmbeddedPanel ? <NativeSheetClose onClose={onClose}/> : null}
          </View>

          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
            style={[styles.monthYearLabel,inlineWeb && {color:nativePickerPalette.muted}]}
          >
            {formatMonthYear(draftDate)}
          </Text>

          {IS_WEB && !calendarOnly && !isDateDisabled ? (
            <BrowserDateTimeInput mode="date" label={title} value={toIsoDate(draftDate)} minimum={minimumDate} onChange={(value) => setDraftDate(parseIsoDateValue(value))} />
          ) : calendarOnly || showCalendarGrid || allowQuickPicker ? (
            <View style={styles.calendarWrap}>
              <View style={styles.calendarHeader}>
                {IS_WEB ? (
                  <HapticTouchable
                    style={[styles.calendarNavButton, styles.calendarYearNavButton]}
                    onPress={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear() - 1, calendarMonth.getMonth(), 1)
                      )
                    }
                    activeOpacity={0.9}
                  >
                    <Text style={styles.calendarYearNavButtonText}>−1</Text>
                  </HapticTouchable>
                ) : null}
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
                {IS_WEB ? (
                  <HapticTouchable
                    style={[styles.calendarNavButton, styles.calendarYearNavButton]}
                    onPress={() =>
                      setCalendarMonth(
                        new Date(calendarMonth.getFullYear() + 1, calendarMonth.getMonth(), 1)
                      )
                    }
                    activeOpacity={0.9}
                  >
                    <Text style={styles.calendarYearNavButtonText}>+1</Text>
                  </HapticTouchable>
                ) : null}
              </View>

              <View style={styles.weekdayRow}>
                {WEEKDAY_LABELS.map((label, index) => (
                  <Text key={`weekday-${label}-${index}`} style={styles.weekdayText}>
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
                      activeOpacity={cell.value && !cell.isDisabled ? 0.9 : 1}
                      disabled={!cell.value || cell.isDisabled}
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
              {disabledDateHint ? (
                <Text style={styles.disabledDateHint}>{disabledDateHint}</Text>
              ) : null}
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
                themeVariant={nativePickerPremium&&nativePickerPalette.night?'dark':'light'}
                style={styles.picker}
              />
            </View>
          )}

          <View style={[styles.actions, IS_WEB && webPickerStyles.actions]}>
            <HapticTouchable style={[styles.lightButton, IS_WEB && webPickerStyles.cancel, inlineWeb && {backgroundColor:nativePickerPalette.field,borderColor:nativePickerPalette.border}]} onPress={(event) => { event.stopPropagation(); onClose(); }} activeOpacity={0.9}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.lightButtonText, IS_WEB && webPickerStyles.cancelText, inlineWeb && {color:nativePickerPalette.ink}]}>Annulla</Text>
            </HapticTouchable>
            <HapticTouchable
              style={[
                styles.darkButton, IS_WEB && webPickerStyles.confirm,
                inlineWeb && {backgroundColor:nativePickerPalette.action},
                isDateDisabled?.(toIsoDate(draftDate)) &&
                  styles.darkButtonDisabled,
              ]}
              onPress={(event) => { event.stopPropagation(); confirmIosSelection(); }}
              hapticType="success"
              activeOpacity={0.9}
              disabled={!!isDateDisabled?.(toIsoDate(draftDate))}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.darkButtonText, IS_WEB && webPickerStyles.confirmText, inlineWeb && {color:nativePickerPalette.actionText}]}>Conferma</Text>
            </HapticTouchable>
          </View>
        </PickerSurface>
    </View>
  );

  if (embedded) {
    return <View style={[styles.embeddedHost, inlineWeb && {position:'relative',top:'auto',bottom:'auto',left:'auto',right:'auto',zIndex:0,elevation:0}]}>{pickerContent}</View>;
  }

  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible transparent animationType="fade" onRequestClose={onClose}>
      {pickerContent}
    </Modal>
  );
}

const baseDatePickerStyles = StyleSheet.create({
  embeddedHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 110,
    elevation: 110,
  },
  backdrop: {
    flex: 1,
    backgroundColor: IS_WEB ? 'rgba(15, 23, 42, 0.46)' : 'rgba(15, 23, 42, 0.28)',
    justifyContent: IS_WEB ? 'center' : 'flex-end',
    alignItems: IS_WEB ? 'center' : undefined,
    paddingHorizontal: IS_WEB ? 18 : 0,
    paddingVertical: IS_WEB ? 18 : 0, paddingBottom: 0 },
  dismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropEmbeddedPanel: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'flex-start',
    alignItems: undefined,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  sheet: {
    backgroundColor: IS_WEB ? '#ffffff' : '#f8fafc',
    borderTopLeftRadius: IS_WEB ? 28 : 28,
    borderTopRightRadius: IS_WEB ? 28 : 28,
    borderBottomLeftRadius: IS_WEB ? 28 : 0,
    borderBottomRightRadius: IS_WEB ? 28 : 0,
    marginBottom: 0,
    paddingHorizontal: IS_ANDROID ? 22 : 18,
    paddingTop: 16,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    width: '100%',
    maxWidth: IS_WEB ? 540 : undefined,
    maxHeight: IS_WEB ? '94%' : undefined,
    alignSelf: 'center',
    shadowColor: IS_WEB ? '#020617' : undefined,
    shadowOpacity: IS_WEB ? 0.22 : 0,
    shadowRadius: IS_WEB ? 34 : 0,
    shadowOffset: IS_WEB ? { width: 0, height: 18 } : { width: 0, height: 0 },
  },
  sheetEmbeddedPanel: {
    flex: 1,
    maxHeight: '100%',
    marginBottom: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  title: {
    fontSize: IS_WEB ? 18 : 16,
    fontWeight: '900',
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
    width: '100%',
    maxWidth: IS_WEB ? 420 : undefined,
    alignSelf: 'center',
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: IS_WEB ? 8 : 0,
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
  calendarYearNavButton: {
    width: 44,
    backgroundColor: '#eef4ff',
    borderColor: '#c9daf7',
  },
  calendarYearNavButtonText: {
    color: '#155eef',
    fontSize: 12,
    fontWeight: '900',
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
    flex: 1,
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
  disabledDateHint: {
    marginTop: 6,
    color: '#9a3412',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: IS_WEB ? 500 : undefined,
    alignSelf: 'center',
  },
  lightButton: {
    flex: 1,
    backgroundColor: IS_WEB ? '#f8fafc' : '#ececec',
    borderWidth: IS_WEB ? 1 : 0,
    borderColor: IS_WEB ? '#d8e1ec' : 'transparent',
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
    backgroundColor: IS_WEB ? '#0f172a' : '#161616',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  darkButtonDisabled: {
    opacity: 0.38,
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
