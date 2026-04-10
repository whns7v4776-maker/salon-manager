import { Picker } from '@react-native-picker/picker';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { haptic } from '../../src/lib/haptics';
import { HapticTouchable } from './haptic-touchable';

const IS_ANDROID = Platform.OS === 'android';
const ANDROID_SHEET_EXTRA_LIFT = 25;
const roundToPrecision = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const formatDisplayValue = ({
  value,
  decimals,
  prefix,
  suffix,
}: {
  value: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
}) => `${prefix ?? ''}${value.toFixed(decimals)}${suffix ?? ''}`;

const buildOptionValues = ({
  min,
  max,
  step,
  decimals,
}: {
  min: number;
  max: number;
  step: number;
  decimals: number;
}) => {
  const safeStep = Math.max(step, 10 ** -decimals);
  const values: number[] = [];
  let current = min;
  let guard = 0;

  while (current <= max + safeStep / 2 && guard < 10000) {
    values.push(roundToPrecision(current, decimals));
    current += safeStep;
    guard += 1;
  }

  if (values.length === 0) {
    values.push(roundToPrecision(min, decimals));
  }

  return values;
};

export function NumberPickerModal({
  visible,
  title,
  initialValue,
  onClose,
  onConfirm,
  step = 1,
  gridStep,
  min = 0,
  max = 999,
  decimals = 0,
  prefix,
  suffix,
  presets = [],
}: {
  visible: boolean;
  title: string;
  initialValue?: number;
  onClose: () => void;
  onConfirm: (value: string) => void;
  step?: number;
  gridStep?: number;
  min?: number;
  max?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  presets?: number[];
}) {
  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const safeStep = Math.max(toFiniteNumber(step, 1), 10 ** -safeDecimals);
  const sanitize = (value: unknown, fallback: number) =>
    roundToPrecision(clamp(toFiniteNumber(value, fallback), safeMin, safeMax), safeDecimals);

  const safeInitialValue = useMemo(
    () => sanitize(initialValue, safeMin),
    [initialValue, safeMin, sanitize]
  );
  const [draftValue, setDraftValue] = useState(safeInitialValue);
  const [showGrid, setShowGrid] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDraftValue(safeInitialValue);
    setShowGrid(Platform.OS === 'android');
  }, [safeInitialValue, visible]);

  const wheelValues = useMemo(
    () =>
      buildOptionValues({
        min: safeMin,
        max: safeMax,
        step: safeStep,
        decimals: safeDecimals,
      }),
    [safeDecimals, safeMax, safeMin, safeStep]
  );

  const findClosestWheelValue = (value: number) => {
    if (wheelValues.length === 0) {
      return sanitize(value, safeMin);
    }

    let closest = wheelValues[0];
    let bestDistance = Math.abs(closest - value);

    for (let index = 1; index < wheelValues.length; index += 1) {
      const current = wheelValues[index];
      const distance = Math.abs(current - value);
      if (distance < bestDistance) {
        closest = current;
        bestDistance = distance;
      }
    }

    return closest;
  };

  const safeDraftValue = useMemo(
    () => findClosestWheelValue(sanitize(draftValue, safeInitialValue)),
    [draftValue, safeInitialValue, sanitize, wheelValues]
  );

  const safeGridStep = Math.max(toFiniteNumber(gridStep ?? safeStep, safeStep), 10 ** -safeDecimals);
  const selectionHint = `${formatDisplayValue({
    value: safeMin,
    decimals: safeDecimals,
    prefix,
    suffix,
  })} - ${formatDisplayValue({
    value: safeMax,
    decimals: safeDecimals,
    prefix,
    suffix,
  })} · step ${formatDisplayValue({
    value: safeStep,
    decimals: safeDecimals,
    prefix,
    suffix,
  })}`;

  const updateValue = (nextValue: unknown) => {
    const bounded = findClosestWheelValue(sanitize(nextValue, safeDraftValue));
    haptic.light().catch(() => null);
    setDraftValue(bounded);
  };

  if (!visible) return null;

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
            {!IS_ANDROID ? (
              <HapticTouchable
                style={styles.toggleButton}
                onPress={() => setShowGrid((current) => !current)}
                activeOpacity={0.9}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.toggleButtonText}>{showGrid ? 'Rotella' : 'Griglia'}</Text>
              </HapticTouchable>
            ) : null}
          </View>

          <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.selectionHint}>{selectionHint}</Text>

          <View style={styles.valueWrap}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.valueText}>
              {formatDisplayValue({ value: safeDraftValue, decimals: safeDecimals, prefix, suffix })}
            </Text>
          </View>

          {showGrid ? (
            <>
              <View style={styles.stepperRow}>
                <HapticTouchable
                  style={styles.stepperButton}
                  onPress={() => updateValue(safeDraftValue - safeGridStep)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.stepperButtonText}>-</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={styles.stepperButton}
                  onPress={() => updateValue(safeDraftValue + safeGridStep)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.stepperButtonText}>+</Text>
                </HapticTouchable>
              </View>

              {presets.length > 0 ? (
                <View style={styles.presetsWrap}>
                  {presets.map((item) => {
                    const selected =
                      roundToPrecision(item, safeDecimals) === roundToPrecision(safeDraftValue, safeDecimals);

                    return (
                      <HapticTouchable
                        key={`${title}-${item}`}
                        style={[styles.presetChip, selected && styles.presetChipActive]}
                        onPress={() => updateValue(item)}
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[styles.presetChipText, selected && styles.presetChipTextActive]}
                        >
                          {formatDisplayValue({ value: item, decimals: safeDecimals, prefix, suffix })}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.nativePickerWrap}>
              <View style={styles.nativePickerFrame}>
                <View style={[styles.nativePickerFade, styles.nativePickerFadeTop]} pointerEvents="none" />
                <View
                  style={[styles.nativePickerFade, styles.nativePickerFadeBottom]}
                  pointerEvents="none"
                />
                <Picker
                  selectedValue={safeDraftValue}
                  onValueChange={(value) => updateValue(value)}
                  itemStyle={styles.nativePickerItem}
                  style={styles.nativePicker}
                >
                  {wheelValues.map((value) => (
                    <Picker.Item
                      key={`${title}-${value}`}
                      label={formatDisplayValue({ value, decimals: safeDecimals, prefix, suffix })}
                      value={value}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          )}

          <View style={styles.actions}>
            <HapticTouchable style={styles.lightButton} onPress={onClose} activeOpacity={0.9}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.lightButtonText}>Annulla</Text>
            </HapticTouchable>
            <HapticTouchable
              style={styles.darkButton}
              onPress={() => onConfirm(safeDraftValue.toFixed(safeDecimals))}
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
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    textAlign: 'left',
    flex: 1,
    includeFontPadding: IS_ANDROID,
  },
  selectionHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 10,
  },
  toggleButton: {
    backgroundColor: '#dcecff',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#c9defa',
  },
  toggleButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  valueWrap: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingVertical: 18,
    marginBottom: 12,
  },
  valueText: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111111',
    textAlign: 'center',
    width: '100%',
    includeFontPadding: IS_ANDROID,
  },
  nativePickerWrap: {
    minHeight: 220,
    justifyContent: 'center',
    marginBottom: 16,
  },
  nativePickerFrame: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    overflow: 'hidden',
    position: 'relative',
  },
  nativePicker: {
    width: '100%',
    ...(Platform.OS === 'android' ? { backgroundColor: '#ffffff', borderRadius: 20 } : null),
  },
  nativePickerItem: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111111',
  },
  nativePickerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 34,
    zIndex: 2,
    backgroundColor: 'rgba(248,250,252,0.92)',
  },
  nativePickerFadeTop: {
    top: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  nativePickerFadeBottom: {
    bottom: 0,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  stepperButton: {
    flex: 1,
    backgroundColor: '#eef2f7',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: '#334155',
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 24,
  },
  presetsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 12,
  },
  presetChip: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  presetChipActive: {
    backgroundColor: '#161616',
    borderColor: '#161616',
  },
  presetChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '800',
  },
  presetChipTextActive: {
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
