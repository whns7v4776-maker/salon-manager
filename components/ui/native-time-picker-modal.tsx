import {useAgendaPopupStyles} from '../agenda-popup-theme';
import {NativeSheetClose} from './native-sheet-close';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {useAccessAppearance} from '../access-premium';
import {useNativePremium, NativeReadableText as Text} from '../owner-native-premium';

import { useSettingsWebStyles } from '../settings-web-styles';
import { useWebPickerStyles } from './web-picker-styles';
import { BrowserDateTimeInput } from './browser-date-time-input';
import { DockedSheetSurface } from './docked-sheet-surface';
import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { haptic } from '../../src/lib/haptics';
import { HapticTouchable } from './haptic-touchable';

const IS_ANDROID = Platform.OS === 'android';
const IS_WEB = Platform.OS === 'web';
const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));

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
  embedded = false,
  embeddedPanel = false,
}: {
  visible: boolean;
  title: string;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (value: string) => void;
  minuteStep?: number;
  gridMinuteStep?: number;
  embedded?: boolean;
  embeddedPanel?: boolean;
}) {
  const {palette:nativePickerPalette}=useAccessAppearance();
  const nativePickerPremium=useNativePremium() || !IS_WEB;
  const legacyStyles=useSettingsWebStyles(baseTimePickerStyles);
  const nativeStyles=useAgendaPopupStyles(baseTimePickerStyles);
  const styles=IS_WEB?legacyStyles:nativeStyles;
  const webPickerStyles=useWebPickerStyles();
  const useEmbeddedPanel = embedded && embeddedPanel;
  const PickerSurface = useEmbeddedPanel ? View : DockedSheetSurface;
  const initialTime = useMemo(() => parseTimeValue(initialValue), [initialValue]);
  const [draftTime, setDraftTime] = useState(initialTime);
  const [showGrid, setShowGrid] = useState(IS_WEB);
  const minuteOptions = useMemo(() => {
    const options = buildMinuteOptions(gridMinuteStep);
    const currentMinute = String(draftTime.getMinutes()).padStart(2, '0');
    return options.includes(currentMinute) ? options : [...options, currentMinute].sort();
  }, [draftTime, gridMinuteStep]);

  useEffect(() => {
    if (!visible) return;
    setDraftTime(parseTimeValue(initialValue));
    setShowGrid(IS_WEB);
  }, [initialValue, visible]);

  const androidOpened = useRef(false);
  const callbacks = useRef({ onClose, onConfirm });
  callbacks.current = { onClose, onConfirm };
  useEffect(() => {
    if (!IS_ANDROID) return;
    if (!visible) {
      if (androidOpened.current) void DateTimePickerAndroid.dismiss('time');
      androidOpened.current = false;
      return;
    }
    if (androidOpened.current) return;
    androidOpened.current = true;
    DateTimePickerAndroid.open({
      value: parseTimeValue(initialValue), mode: 'time', display: 'spinner', is24Hour: true,
      onChange: (event, value) => {
        if (!androidOpened.current) return;
        androidOpened.current = false;
        if (event.type === 'set' && value) callbacks.current.onConfirm(toTimeValue(value));
        callbacks.current.onClose();
      },
    });
  }, [visible, initialValue]);
  useEffect(() => () => {
    if (IS_ANDROID && androidOpened.current) {
      androidOpened.current = false;
      void DateTimePickerAndroid.dismiss('time');
    }
  }, []);

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

  const renderGrid = (keyPrefix = '') => (
    <View style={styles.gridWrap}>
      <View style={styles.gridSection}>
        <Text style={styles.gridTitle}>Ore</Text>
        <View style={styles.gridValues}>
          {HOURS.map((hour) => {
            const selected = hour === String(draftTime.getHours()).padStart(2, '0');
            return (
              <HapticTouchable
                key={`${keyPrefix}hour-${hour}`}
                style={[styles.gridChip, selected && styles.gridChipActive]}
                onPress={() => updateGridValue({ hours: hour })}
                immediatePress
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
                key={`${keyPrefix}minute-${minute}`}
                style={[styles.gridChip, selected && styles.gridChipActive]}
                onPress={() => updateGridValue({ minutes: minute })}
                immediatePress
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
  );

  if (!visible) return null;

  const presentPicker = (content: React.ReactNode) => {
    if (embedded) {
      return <View style={styles.embeddedHost}>{content}</View>;
    }

    return (
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible transparent animationType="fade" onRequestClose={onClose}>
        {content}
      </Modal>
    );
  };

  if (IS_ANDROID) return null;

  return presentPicker(
    <View style={[styles.backdrop, IS_WEB && webPickerStyles.backdrop, useEmbeddedPanel && styles.backdropEmbeddedPanel]}>
        {!useEmbeddedPanel ? (
          <HapticTouchable style={styles.dismissArea} activeOpacity={1} onPress={onClose} immediatePress />
        ) : null}
        <PickerSurface {...(!IS_WEB && !useEmbeddedPanel ? {onClose} : {})} style={[styles.sheet, IS_WEB && webPickerStyles.sheet, useEmbeddedPanel && styles.sheetEmbeddedPanel]}>
          <View style={[styles.headerRow, IS_WEB && webPickerStyles.header]}>
            <Text
              numberOfLines={2}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={[styles.title, IS_WEB && webPickerStyles.title]}
            >
              {title}
            </Text>
            {!IS_WEB ? (
              <HapticTouchable
                style={[styles.toggleButton, IS_WEB && webPickerStyles.toggle]}
                onPress={() => setShowGrid((current) => !current)}
                immediatePress
                activeOpacity={0.9}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.toggleButtonText, IS_WEB && webPickerStyles.toggleText]}>{showGrid ? 'Rotella' : 'Griglia'}</Text>
              </HapticTouchable>
            ) : null}
            {!IS_WEB && !useEmbeddedPanel ? <NativeSheetClose onClose={onClose}/> : null}
          </View>

          {!IS_WEB ? <View style={styles.valueSummary}>
            <View style={styles.valueChip}>
              <Text style={styles.valueChipText}>{String(draftTime.getHours()).padStart(2, '0')}</Text>
            </View>
            <Text style={styles.valueSeparator}>:</Text>
            <View style={styles.valueChip}>
              <Text style={styles.valueChipText}>
                {String(draftTime.getMinutes()).padStart(2, '0')}
              </Text>
            </View>
          </View> : null}

          {showGrid ? (
            IS_WEB ? (
              <BrowserDateTimeInput mode="time" label={title} value={toTimeValue(draftTime)} onChange={(value) => setDraftTime(parseTimeValue(value))} />
            ) : (
              renderGrid()
            )
          ) : (
            <View style={styles.pickerWrap}>
              <TimePickerComponent
                value={draftTime}
                mode="time"
                display="spinner"
                is24Hour
                minuteInterval={minuteStep}
                onChange={handleChange}
                themeVariant={nativePickerPremium&&nativePickerPalette.night?'dark':'light'}
                style={styles.picker}
              />
            </View>
          )}

          <View style={[styles.actions, IS_WEB && webPickerStyles.actions]}>
            <HapticTouchable style={[styles.lightButton, IS_WEB && webPickerStyles.cancel]} onPress={onClose} immediatePress activeOpacity={0.9}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.lightButtonText, IS_WEB && webPickerStyles.cancelText]}>Annulla</Text>
            </HapticTouchable>
            <HapticTouchable
              style={[styles.darkButton, IS_WEB && webPickerStyles.confirm]}
              onPress={() => onConfirm(toTimeValue(draftTime))}
              hapticType="success"
              immediatePress
              activeOpacity={0.9}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.darkButtonText, IS_WEB && webPickerStyles.confirmText]}>Conferma</Text>
            </HapticTouchable>
          </View>
        </PickerSurface>
    </View>
  );
}

const baseTimePickerStyles = StyleSheet.create({
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
    paddingHorizontal: IS_WEB ? 20 : 0,
    paddingVertical: IS_WEB ? 20 : 0, paddingBottom: 0 },
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: IS_WEB ? 28 : 0,
    borderBottomRightRadius: IS_WEB ? 28 : 0,
    marginBottom: 0,
    paddingHorizontal: IS_ANDROID ? 22 : 18,
    paddingTop: 16,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    width: '100%',
    maxWidth: IS_WEB ? 560 : undefined,
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 10,
    minHeight: 28,
  },
  title: {
    fontSize: IS_WEB ? 18 : 16,
    fontWeight: '900',
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
  webGridScroll: {
    maxHeight: 430,
    marginBottom: 16,
  },
  webGridScrollContent: {
    paddingRight: 4,
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
  darkButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
    width: '100%',
    textAlign: 'center',
    includeFontPadding: IS_ANDROID,
  },
});
