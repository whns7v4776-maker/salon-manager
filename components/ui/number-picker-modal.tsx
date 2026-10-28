import {NativeSheetClose} from './native-sheet-close';
import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {NativeReadableText as Text} from '../owner-native-premium';
import { useSettingsWebStyles } from '../settings-web-styles';
import { useAccessAppearance } from '../access-premium';
import { nativeRequestsStyles } from '../owner-premium-requests-style';
import { useWebPickerStyles } from './web-picker-styles';
import { DockedSheetSurface } from './docked-sheet-surface';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, TextInput, Modal, ScrollView, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HapticNativePressable as Pressable } from './haptic-native-controls';
import { haptic } from '../../src/lib/haptics';
import { HapticTouchable } from './haptic-touchable';

const IS_ANDROID = Platform.OS === 'android';
const IS_WEB = Platform.OS === 'web';
const USE_CUSTOM_WHEEL = IS_ANDROID;
const ANDROID_WHEEL_HEIGHT = 178;
const ANDROID_WHEEL_ITEM_HEIGHT = 52;
const ANDROID_WHEEL_VERTICAL_PADDING =
  (ANDROID_WHEEL_HEIGHT - ANDROID_WHEEL_ITEM_HEIGHT) / 2;
const WEB_PRICE_GRID_VALUES = [
  0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
  95, 100, 110, 120, 130, 140, 150, 180, 200, 250, 300, 400, 500,
];
const WEB_DURATION_GRID_VALUES = [
  5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 75, 90, 105, 120, 135,
  150, 180, 210, 240, 270, 300, 330, 360,
];
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
  singularSuffix,
}: {
  value: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
  singularSuffix?: string;
}) =>
  `${prefix ?? ''}${IS_WEB ? value.toFixed(decimals).replace('.', ',') : value.toFixed(decimals)}${
    singularSuffix !== undefined && Math.abs(value) === 1 ? singularSuffix : suffix ?? ''
  }`;

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
  premiumNative=false,
  title,
  contextLabel,
  initialValue,
  onClose,
  onConfirm,
  onDismiss,
  onLiveChange,
  liveOnChange = false,
  step = 1,
  gridStep,
  min = 0,
  max = 999,
  decimals = 0,
  prefix,
  suffix,
  singularSuffix,
  presets = [],
  selectionHintOverride,
  selectionSummary,
  cancelLabel,
  confirmLabel,
  showValuePreview = false,
  transparentBackdrop = false,
  changeHaptics = true,
  initialMode,
  showModeToggle = true,
  showStepper = true,
  bottomAnchored = true,
  embedded = false,
  embeddedPanel = false,
  lazyContent = false,
  fitScreen = true,
}: {
  premiumNative?:boolean;
  visible: boolean;
  title: string;
  contextLabel?: string;
  initialValue?: number;
  onClose: () => void;
  onConfirm: (value: string) => void;
  onDismiss?: () => void;
  onLiveChange?: (value: string) => void;
  liveOnChange?: boolean;
  step?: number;
  gridStep?: number;
  min?: number;
  max?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  singularSuffix?: string;
  presets?: number[];
  selectionHintOverride?: string;
  selectionSummary?: {
    currentLabel: string;
    currentValue: string;
    nextLabel: string;
    nextValue: string;
    detailLabel?: string;
    detailValue?: string;
  };
  cancelLabel?: string;
  confirmLabel?: string;
  showValuePreview?: boolean;
  transparentBackdrop?: boolean;
  changeHaptics?: boolean;
  initialMode?: 'grid' | 'wheel';
  showModeToggle?: boolean;
  showStepper?: boolean;
  bottomAnchored?: boolean;
  embedded?: boolean;
  embeddedPanel?: boolean;
  lazyContent?: boolean;
  fitScreen?: boolean;
}) {
  const {palette:pickerPalette}=useAccessAppearance();
  const webBaseStyles=useSettingsWebStyles(baseNumberPickerStyles);
  const webPickerStyles=useWebPickerStyles();
  const styles=useMemo(()=>(premiumNative || !IS_WEB)?nativeRequestsStyles(baseNumberPickerStyles,pickerPalette):webBaseStyles,[premiumNative,pickerPalette,webBaseStyles]);
  const { height: screenHeight } = useWindowDimensions();
  const safeInsets = useSafeAreaInsets();
  const bounded = fitScreen;
  const ContentContainer = bounded ? ScrollView : React.Fragment;
  const useEmbeddedPanel = embedded && embeddedPanel;
  const PickerSurface = useEmbeddedPanel ? View : DockedSheetSurface;
  const isCurrency = `${prefix ?? ''}${suffix ?? ''}`.includes('€');
  const safeDecimals = isCurrency ? Math.max(2, decimals) : Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
  const safeMin = Math.min(min, max);
  const safeMax = Math.max(min, max);
  const safeStep = Math.max(toFiniteNumber(step, 1), 10 ** -safeDecimals);
  const sanitize = useCallback(
    (value: unknown, fallback: number) =>
      roundToPrecision(clamp(toFiniteNumber(value, fallback), safeMin, safeMax), safeDecimals),
    [safeDecimals, safeMax, safeMin]
  );

  const safeInitialValue = useMemo(
    () => sanitize(initialValue, safeMin),
    [initialValue, safeMin, sanitize]
  );
  const [draftValue, setDraftValue] = useState(safeInitialValue);
  const [webPriceDropdownOpen, setWebPriceDropdownOpen] = useState(false);
  const webPriceListRef = useRef<ScrollView | null>(null);
  const [webAmountFocused, setWebAmountFocused] = useState(false);
  const [amountText, setAmountText] = useState(safeInitialValue.toFixed(safeDecimals).replace('.', ','));
  const amountNumber = Number(amountText.replace(',', '.'));
  const amountValid = /^\d+(?:[.,]\d{0,2})?$/.test(amountText) && Number.isFinite(amountNumber) && amountNumber >= safeMin && amountNumber <= safeMax;
  const [showGrid, setShowGrid] = useState(false);
  const customWheelRef = useRef<FlatList<number> | null>(null);
  const wasVisibleRef = useRef(false);

  useEffect(() => {
    const isOpening = visible && !wasVisibleRef.current;
    if (isOpening) {
      setDraftValue(safeInitialValue);
      setWebPriceDropdownOpen(false);
      setAmountText(safeInitialValue.toFixed(safeDecimals).replace('.', ','));
      setShowGrid(
        IS_ANDROID || IS_WEB
          ? false
          : initialMode
            ? initialMode === 'grid'
            : Platform.OS !== 'ios'
      );
    }
    wasVisibleRef.current = visible;
  }, [initialMode, safeInitialValue, safeDecimals, visible]);

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

  const findClosestWheelValue = useCallback((value: number) => {
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
  }, [safeMin, sanitize, wheelValues]);

  const safeDraftValue = useMemo(
    () => isCurrency ? sanitize(draftValue, safeInitialValue) : findClosestWheelValue(sanitize(draftValue, safeInitialValue)),
    [isCurrency, draftValue, findClosestWheelValue, safeInitialValue, sanitize]
  );
  const selectedWheelIndex = useMemo(() => {
    const exactIndex = wheelValues.findIndex(
      (value) =>
        roundToPrecision(value, safeDecimals) ===
        roundToPrecision(safeDraftValue, safeDecimals)
    );
    return Math.max(0, exactIndex);
  }, [safeDecimals, safeDraftValue, wheelValues]);

  const safeGridStep = Math.max(toFiniteNumber(gridStep ?? safeStep, safeStep), 10 ** -safeDecimals);
  const gridValues = useMemo(() => {
    const webDefaults = !IS_WEB
      ? []
      : isCurrency
        ? WEB_PRICE_GRID_VALUES
        : suffix?.toLowerCase().includes('min')
          ? WEB_DURATION_GRID_VALUES
          : [];

    return Array.from(new Set([...presets, ...webDefaults, safeDraftValue]))
      .map((value) => sanitize(value, safeDraftValue))
      .filter((value) => value >= safeMin && value <= safeMax)
      .sort((left, right) => left - right);
  }, [presets, safeDraftValue, safeMax, safeMin, sanitize, suffix, isCurrency]);
  const selectionHint =
    selectionHintOverride ??
    `${formatDisplayValue({
      value: safeMin,
      decimals: safeDecimals,
      prefix,
      suffix,
      singularSuffix,
    })} - ${formatDisplayValue({
      value: safeMax,
      decimals: safeDecimals,
      prefix,
      suffix,
      singularSuffix,
    })} · step ${formatDisplayValue({
      value: safeStep,
      decimals: safeDecimals,
      prefix,
      suffix,
      singularSuffix,
    })}`;

  const updateValue = useCallback(
    (nextValue: unknown, triggerHaptic = true) => {
      const bounded = isCurrency ? sanitize(nextValue, safeDraftValue) : findClosestWheelValue(sanitize(nextValue, safeDraftValue));
      setDraftValue(bounded);
      if (isCurrency) setAmountText(bounded.toFixed(safeDecimals).replace('.', ','));
      if (liveOnChange) {
        onLiveChange?.(bounded.toFixed(safeDecimals));
      }
      if (changeHaptics && triggerHaptic) {
        requestAnimationFrame(() => {
          haptic.light().catch(() => null);
        });
      }
    },
    [
      changeHaptics,
      isCurrency,
      findClosestWheelValue,
      liveOnChange,
      onLiveChange,
      safeDecimals,
      safeDraftValue,
      sanitize,
    ]
  );
  const updateCustomWheelFromScroll = useCallback(
    (
      event: NativeSyntheticEvent<NativeScrollEvent>,
      triggerHaptic: boolean
    ) => {
      const rawIndex = Math.round(
        event.nativeEvent.contentOffset.y / ANDROID_WHEEL_ITEM_HEIGHT
      );
      const boundedIndex = Math.max(0, Math.min(rawIndex, wheelValues.length - 1));
      const nextValue = wheelValues[boundedIndex];
      if (typeof nextValue !== 'number') {
        return;
      }

      if (
        !triggerHaptic &&
        roundToPrecision(nextValue, safeDecimals) ===
          roundToPrecision(safeDraftValue, safeDecimals)
      ) {
        return;
      }

      updateValue(nextValue, triggerHaptic);
    },
    [safeDecimals, safeDraftValue, updateValue, wheelValues]
  );

  const nativeOptions = useMemo(() => {
    if (USE_CUSTOM_WHEEL || (lazyContent && !visible)) return null;
    return wheelValues.map(value => (
      <Picker.Item key={`${title}-${value}`}
        label={formatDisplayValue({ value, decimals: safeDecimals, prefix, suffix, singularSuffix })}
        value={value}
        color={roundToPrecision(value, safeDecimals) === roundToPrecision(safeDraftValue, safeDecimals) ? '#155EEF' : '#7C8594'} />
    ));
  }, [lazyContent, visible, wheelValues, title, safeDecimals, prefix, suffix, singularSuffix, safeDraftValue]);

  // Android mantiene il componente montato per conservare lo stato, ma non
  // deve costruire FlatList, rotella e nodi animati dei numerosi picker chiusi
  // dell'Agenda. Il contenuto viene materializzato solo quando serve; iOS e
  // web conservano esattamente il ciclo di rendering precedente.
  if (IS_ANDROID && !visible) {
    return null;
  }

  const pickerContent = lazyContent && !visible ? null : (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.backdrop,
        IS_WEB && webPickerStyles.backdrop,
        bottomAnchored && !IS_WEB && { justifyContent: 'flex-end', paddingBottom: 0, paddingHorizontal: 0 },
        transparentBackdrop && styles.backdropTransparent,
        useEmbeddedPanel && styles.backdropEmbeddedPanel,
        bounded && { paddingTop: safeInsets.top + 12, paddingBottom: bottomAnchored ? 0 : safeInsets.bottom + 12, paddingHorizontal: bottomAnchored ? 0 : 12 },
      ]}
    >
        {!useEmbeddedPanel ? (
          <HapticTouchable style={styles.dismissArea} activeOpacity={1} onPress={onClose} immediatePress />
        ) : null}
        <PickerSurface {...(!IS_WEB && !useEmbeddedPanel ? {onClose} : {})}
          style={[
            styles.sheet,
            IS_WEB && webPickerStyles.sheet,
            bottomAnchored && !IS_WEB && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
            embedded && styles.sheetEmbedded,
            useEmbeddedPanel && styles.sheetEmbeddedPanel,
            bounded && { maxHeight: Math.max(120, screenHeight - safeInsets.top - safeInsets.bottom - 24), flexShrink: 1, borderRadius: 28 },
            bottomAnchored && !IS_WEB && { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, marginBottom: 0 },
          ]}
        >
          <ContentContainer {...(bounded ? { style: { flexShrink: 1 }, keyboardShouldPersistTaps: 'handled' as const, nestedScrollEnabled: true } : {})}>
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
            {showModeToggle && (IS_WEB || !isCurrency) ? (
              <HapticTouchable
                style={[styles.toggleButton, IS_WEB && webPickerStyles.toggle]}
                onPress={() => { setWebPriceDropdownOpen(false); setShowGrid((current) => !current); }}
                immediatePress
                accessibilityRole="button" accessibilityLabel={showGrid ? 'Inserisci valore' : 'Apri griglia valori'}
                accessibilityState={{ expanded: showGrid }}
                activeOpacity={0.9}
              >
                <Text style={[styles.toggleButtonText, IS_WEB && webPickerStyles.toggleText]}>
                  {showGrid ? (IS_WEB ? 'Inserisci valore' : IS_ANDROID ? 'Picker' : 'Rotella') : 'Griglia'}
                </Text>
              </HapticTouchable>
            ) : null}
            {!IS_WEB && !useEmbeddedPanel ? <NativeSheetClose onClose={onClose}/> : null}
          </View>

          {contextLabel ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 10, backgroundColor: '#EEF4FF' }}>
            <Ionicons name="person-circle-outline" size={18} color="#365D91" />
            <Text style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#365D91' }}>Cliente · {contextLabel}</Text>
          </View> : null}

          {selectionSummary ? (
            <View style={styles.selectionSummary}>
              <View style={styles.selectionSummaryTimes}>
                <View style={styles.selectionSummaryCard}>
                  <Text style={styles.selectionSummaryLabel}>{selectionSummary.currentLabel}</Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.selectionSummaryCurrentValue}
                  >
                    {selectionSummary.currentValue}
                  </Text>
                </View>
                <Text style={styles.selectionSummaryArrow}>→</Text>
                <View style={[styles.selectionSummaryCard, styles.selectionSummaryCardActive]}>
                  <Text
                    style={[
                      styles.selectionSummaryLabel,
                      styles.selectionSummaryLabelActive,
                    ]}
                  >
                    {selectionSummary.nextLabel}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                    style={styles.selectionSummaryNextValue}
                  >
                    {selectionSummary.nextValue}
                  </Text>
                </View>
              </View>
              {selectionSummary.detailLabel && selectionSummary.detailValue ? (
                <View style={styles.selectionSummaryDetail}>
                  <Text style={styles.selectionSummaryDetailLabel}>
                    {selectionSummary.detailLabel}
                  </Text>
                  <Text style={styles.selectionSummaryDetailValue}>
                    {selectionSummary.detailValue}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.82}
              style={styles.selectionHint}
            >
              {selectionHint}
            </Text>
          )}

          {IS_WEB && isCurrency ? <View style={{ marginVertical: 8 }}>
            <Text style={{ color: pickerPalette.muted, fontSize: 13, marginBottom: 8 }}>Importo in euro</Text>
            <View style={[webPickerStyles.amount, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 0, borderWidth: 2, borderColor: webAmountFocused||webPriceDropdownOpen?pickerPalette.muted:pickerPalette.line, backgroundColor: pickerPalette.field }, !amountValid && { borderColor: '#B4233A' }]}>
              <TextInput accessibilityLabel={title + ' · importo in euro'} value={amountText}
                keyboardType="decimal-pad" inputMode="decimal" selectTextOnFocus
                onFocus={() => { setWebAmountFocused(true); setWebPriceDropdownOpen(false); }} onBlur={() => setWebAmountFocused(false)}
                onChangeText={(value) => {
                  setAmountText(value);
                  const parsed = Number(value.replace(',', '.'));
                  if (/^\d+(?:[.,]\d{0,2})?$/.test(value) && Number.isFinite(parsed) && parsed >= safeMin && parsed <= safeMax) {
                    setDraftValue(parsed);
                    if (liveOnChange) onLiveChange?.(parsed.toFixed(safeDecimals));
                  }
                }}
                style={{ flex: 1, minWidth: 0, paddingHorizontal: 14, paddingVertical: 14, fontSize: 28, fontWeight: '700', textAlign: 'center', color: pickerPalette.ink, outlineStyle: 'none', boxShadow: 'none' } as any} />
              <Pressable accessibilityRole="button" accessibilityLabel={webPriceDropdownOpen ? 'Chiudi selezione prezzi' : 'Apri selezione prezzi'}
                accessibilityState={{ expanded: webPriceDropdownOpen }}
                onPress={() => { setShowGrid(false); setWebPriceDropdownOpen(open => !open); }}
                style={{ width: 48, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: pickerPalette.line }}>
                <Ionicons name={webPriceDropdownOpen ? 'chevron-up' : 'chevron-down'} size={19} color={pickerPalette.ink} />
              </Pressable>
            </View>
            {webPriceDropdownOpen ? <View style={{ marginTop: 4, borderWidth: 1, borderColor: pickerPalette.line, borderRadius: 14, backgroundColor: pickerPalette.field, overflow: 'hidden' }}>
              <ScrollView ref={webPriceListRef} style={{ maxHeight: 176 }} keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator nestedScrollEnabled
                onContentSizeChange={() => webPriceListRef.current?.scrollTo({ y: Math.max(0, gridValues.indexOf(safeDraftValue) * 44 - 44), animated: false })}>
                {gridValues.map(value => {
                  const selected = roundToPrecision(value, safeDecimals) === roundToPrecision(safeDraftValue, safeDecimals);
                  return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }}
                    accessibilityLabel={formatDisplayValue({ value, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                    onPress={() => { updateValue(value, false); setWebPriceDropdownOpen(false); }}
                    style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: selected?pickerPalette.action:pickerPalette.field })}>
                    <Text style={{ fontSize: 16, fontWeight: selected ? '700' : '500', color: selected?pickerPalette.actionText:pickerPalette.ink }}>
                      {formatDisplayValue({ value, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                    </Text>
                    {selected && <Ionicons name="checkmark" size={18} color={pickerPalette.actionText} />}
                  </Pressable>;
                })}
              </ScrollView>
            </View> : null}
            {!amountValid && <Text accessibilityLiveRegion="polite" style={webPickerStyles.error}>Inserisci un importo tra {safeMin} e {safeMax} €.</Text>}
          </View> : null}

          {showValuePreview || (IS_ANDROID && showGrid) ? (
            <View style={styles.valueWrap}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.valueText}>
                {formatDisplayValue({ value: safeDraftValue, decimals: safeDecimals, prefix, suffix, singularSuffix })}
              </Text>
            </View>
          ) : null}

          {showGrid ? (
            <>
              {showStepper && !(IS_WEB && isCurrency) ? (
                <View style={styles.stepperRow}>
                  <HapticTouchable
                    style={styles.stepperButton}
                    onPress={() => updateValue(safeDraftValue - safeGridStep)}
                    immediatePress
                    activeOpacity={0.9}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </HapticTouchable>
                  <View style={styles.stepperValueCard}>
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.72}
                      style={styles.stepperValueText}
                    >
                      {formatDisplayValue({
                        value: safeDraftValue,
                        decimals: safeDecimals,
                        prefix,
                        suffix,
                        singularSuffix,
                      })}
                    </Text>
                  </View>
                  <HapticTouchable
                    style={styles.stepperButton}
                    onPress={() => updateValue(safeDraftValue + safeGridStep)}
                    immediatePress
                    activeOpacity={0.9}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </HapticTouchable>
                </View>
              ) : null}

              {gridValues.length > 0 ? (
                <View style={styles.presetsWrap}>
                  {gridValues.map((item) => {
                    const selected =
                      roundToPrecision(item, safeDecimals) === roundToPrecision(safeDraftValue, safeDecimals);

                    return (
                      <HapticTouchable
                        key={`${title}-${item}`}
                        style={[styles.presetChip, IS_WEB && webPickerStyles.chip, selected && styles.presetChipActive, IS_WEB && selected && webPickerStyles.chipSelected]}
                        onPress={() => updateValue(item)}
                        accessibilityRole="button" accessibilityState={{ selected }}
                        accessibilityLabel={formatDisplayValue({ value: item, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                        immediatePress
                        activeOpacity={0.9}
                      >
                        <Text
                          style={[styles.presetChipText, IS_WEB && webPickerStyles.chipText, selected && styles.presetChipTextActive, IS_WEB && selected && webPickerStyles.chipTextSelected]}
                        >
                          {formatDisplayValue({ value: item, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                        </Text>
                      </HapticTouchable>
                    );
                  })}
                </View>
              ) : null}
            </>
          ) : IS_WEB && isCurrency ? null : IS_WEB ? (
            <View style={{ marginVertical: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Seleziona ${title}`}
                accessibilityState={{ expanded: webPriceDropdownOpen }}
                onPress={() => setWebPriceDropdownOpen(open => !open)}
                style={{ minHeight: 64, borderWidth: 2, borderColor: webPriceDropdownOpen?pickerPalette.muted:pickerPalette.line, borderRadius: 16, backgroundColor: pickerPalette.field, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 48 }}>
                <Text style={{ fontSize: 28, fontWeight: '700', color: pickerPalette.ink, textAlign: 'center' }}>
                  {formatDisplayValue({ value: safeDraftValue, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                </Text>
                <Ionicons name={webPriceDropdownOpen ? 'chevron-up' : 'chevron-down'} size={19} color={pickerPalette.ink} style={{ position: 'absolute', right: 16 }} />
              </Pressable>
              {webPriceDropdownOpen ? <View style={{ marginTop: 4, height: 176, borderWidth: 1, borderColor: pickerPalette.line, borderRadius: 14, backgroundColor: pickerPalette.field, overflow: 'hidden' }}>
                <FlatList data={wheelValues} keyExtractor={value => String(value)}
                  initialNumToRender={8} maxToRenderPerBatch={12} windowSize={3}
                  initialScrollIndex={Math.max(0, selectedWheelIndex - 1)}
                  getItemLayout={(_, index) => ({ length: 44, offset: index * 44, index })}
                  keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator
                  renderItem={({ item }) => {
                    const selected = roundToPrecision(item, safeDecimals) === roundToPrecision(safeDraftValue, safeDecimals);
                    return <Pressable accessibilityRole="button" accessibilityState={{ selected }}
                      accessibilityLabel={formatDisplayValue({ value: item, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                      onPress={() => { updateValue(item, false); setWebPriceDropdownOpen(false); }}
                      style={({ pressed }) => ({ height: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: selected?pickerPalette.action:pickerPalette.field })}>
                      <Text style={{ fontSize: 16, fontWeight: selected ? '700' : '500', color: selected?pickerPalette.actionText:pickerPalette.ink }}>
                        {formatDisplayValue({ value: item, decimals: safeDecimals, prefix, suffix, singularSuffix })}
                      </Text>
                      {selected && <Ionicons name="checkmark" size={18} color={pickerPalette.actionText} />}
                    </Pressable>;
                  }} />
              </View> : null}
            </View>
          ) : (
            <View
              style={[
                styles.nativePickerWrap,
                IS_ANDROID && styles.nativePickerWrapAndroid,
                IS_WEB && styles.nativePickerWrapWeb,
              ]}
            >
              <View
                style={[
                  styles.nativePickerFrame,
                  IS_ANDROID && styles.nativePickerFrameAndroid,
                  IS_WEB && styles.nativePickerFrameWeb,
                ]}
              >
                {USE_CUSTOM_WHEEL ? (
                  <View style={styles.androidWheelHost}>
                    <View
                      pointerEvents="none"
                      style={styles.androidWheelSelectionBand}
                    />
                    <FlatList
                      key={`custom-wheel-${title}-${visible ? 'open' : 'closed'}`}
                      ref={customWheelRef}
                      data={wheelValues}
                      keyExtractor={(value) => `${title}-custom-wheel-${value}`}
                      contentOffset={{
                        x: 0,
                        y: selectedWheelIndex * ANDROID_WHEEL_ITEM_HEIGHT,
                      }}
                      getItemLayout={(_data, index) => ({
                        length: ANDROID_WHEEL_ITEM_HEIGHT,
                        offset: ANDROID_WHEEL_ITEM_HEIGHT * index,
                        index,
                      })}
                      style={styles.androidWheelList}
                      renderItem={({ item, index }) => {
                        const selected =
                          roundToPrecision(item, safeDecimals) ===
                          roundToPrecision(safeDraftValue, safeDecimals);

                        return (
                          <Pressable
                            style={({ pressed }) => [
                              styles.androidWheelItem,
                              pressed && styles.androidWheelItemPressed,
                            ]}
                            onPress={() => {
                              customWheelRef.current?.scrollToOffset({
                                offset: index * ANDROID_WHEEL_ITEM_HEIGHT,
                                animated: true,
                              });
                              updateValue(item);
                            }}
                            hitSlop={{ left: 12, right: 12 }}
                          >
                            <Text
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.78}
                              style={[
                                styles.androidWheelItemText,
                                selected && styles.androidWheelItemTextSelected,
                              ]}
                            >
                              {formatDisplayValue({
                                value: item,
                                decimals: safeDecimals,
                                prefix,
                                suffix,
                                singularSuffix,
                              })}
                            </Text>
                          </Pressable>
                        );
                      }}
                      contentContainerStyle={styles.androidWheelContent}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled
                      bounces={false}
                      decelerationRate="fast"
                      snapToInterval={ANDROID_WHEEL_ITEM_HEIGHT}
                      snapToAlignment="start"
                      scrollEventThrottle={16}
                      onScroll={(event) => {
                        updateCustomWheelFromScroll(event, false);
                      }}
                      onMomentumScrollEnd={(event) => {
                        updateCustomWheelFromScroll(event, true);
                      }}
                    />
                    <View
                      pointerEvents="none"
                      style={[styles.androidWheelFade, styles.androidWheelFadeTop]}
                    />
                    <View
                      pointerEvents="none"
                      style={[styles.androidWheelFade, styles.androidWheelFadeBottom]}
                    />
                  </View>
                ) : (
                  <>
                    {!IS_WEB ? (
                      <>
                        <View style={styles.nativePickerSelectionBand} pointerEvents="none" />
                        <View style={[styles.nativePickerFade, styles.nativePickerFadeTop]} pointerEvents="none" />
                        <View
                          style={[styles.nativePickerFade, styles.nativePickerFadeBottom]}
                          pointerEvents="none"
                        />
                      </>
                    ) : null}
                    <Picker
                      testID={IS_WEB ? 'salon-native-number-picker' : undefined}
                      selectedValue={safeDraftValue}
                      onValueChange={(value) => updateValue(value)}
                      itemStyle={styles.nativePickerItem}
                      style={styles.nativePicker}
                    >
                      {nativeOptions}
                    </Picker>
                    {IS_WEB ? (
                      <View pointerEvents="none" style={styles.nativePickerWebDisplay}>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.72}
                          style={styles.nativePickerWebDisplayValue}
                        >
                          {formatDisplayValue({
                            value: safeDraftValue,
                            decimals: safeDecimals,
                            prefix,
                            suffix,
                            singularSuffix,
                          })}
                        </Text>
                        <View style={styles.nativePickerWebDisplayArrow}>
                          <Ionicons
                            name="chevron-down"
                            size={18}
                            color="#155EEF"
                          />
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </View>
          )}

          </ContentContainer>
          <View style={[styles.actions, embedded && styles.actionsEmbedded, IS_WEB && webPickerStyles.actions]}>
            <HapticTouchable style={[styles.lightButton, IS_WEB && webPickerStyles.cancel]} accessibilityRole="button" onPress={onClose} immediatePress activeOpacity={0.9}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.lightButtonText, IS_WEB && webPickerStyles.cancelText]}>
                {cancelLabel ?? (liveOnChange ? 'Chiudi' : 'Annulla')}
              </Text>
            </HapticTouchable>
            <HapticTouchable
              style={[styles.darkButton, IS_WEB && webPickerStyles.confirm, IS_WEB && isCurrency && !amountValid && { opacity: 0.45 }]}
              accessibilityRole="button"
              disabled={isCurrency && !amountValid}
              onPress={() => {
                const value = isCurrency ? amountNumber.toFixed(safeDecimals) : safeDraftValue.toFixed(safeDecimals);
                if (isCurrency && liveOnChange) onLiveChange?.(value);
                onConfirm(value);
              }}
              hapticType="success"
              immediatePress
              activeOpacity={0.9}
            >
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.darkButtonText, IS_WEB && webPickerStyles.confirmText]}>
                {confirmLabel ?? (liveOnChange ? 'Fine' : 'Conferma')}
              </Text>
            </HapticTouchable>
          </View>
        </PickerSurface>
    </KeyboardAvoidingView>
  );

  if (embedded) {
    if (!visible) return null;
    return <View style={styles.embeddedHost}>{pickerContent}</View>;
  }

  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
      visible={visible}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={onDismiss}
    >
      {pickerContent}
    </Modal>
  );
}

const baseNumberPickerStyles = StyleSheet.create({
  embeddedHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.46)',
    justifyContent: IS_WEB ? 'center' : 'flex-end',
    alignItems: IS_WEB ? 'center' : undefined,
    paddingHorizontal: IS_WEB ? 20 : 0,
    paddingVertical: IS_WEB ? 20 : 0, paddingBottom: 0 },
  backdropTransparent: {
    backgroundColor: 'transparent',
  },
  backdropEmbeddedPanel: {
    backgroundColor: '#FFFFFF',
    justifyContent: 'flex-start',
    alignItems: undefined,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  dismissArea: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    borderBottomLeftRadius: IS_WEB ? 34 : 0,
    borderBottomRightRadius: IS_WEB ? 34 : 0,
    marginBottom: 0,
    paddingHorizontal: IS_ANDROID ? 24 : 20,
    paddingTop: 18,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#020617',
    shadowOpacity: 0.24,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: -18 },
    elevation: 18,
    width: '100%',
    maxWidth: IS_WEB ? 560 : undefined,
    maxHeight: IS_WEB ? '94%' : undefined,
    alignSelf: 'center',
  },
  sheetEmbedded: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    borderWidth: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: -12 },
  },
  sheetEmbeddedPanel: {
    flex: 1,
    maxHeight: '100%',
    marginBottom: 0,
    borderWidth: 0,
    borderTopWidth: 0,
    borderRadius: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'left',
    flex: 1,
    includeFontPadding: IS_ANDROID,
  },
  selectionHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#7C8594',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  selectionSummary: {
    marginBottom: 12,
  },
  selectionSummaryTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  selectionSummaryCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#F1F3F6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  selectionSummaryCardActive: {
    backgroundColor: '#EEF4FF',
    borderColor: '#9FC0FF',
  },
  selectionSummaryLabel: {
    color: '#7C8594',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  selectionSummaryLabelActive: {
    color: '#155EEF',
  },
  selectionSummaryCurrentValue: {
    color: '#475569',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  selectionSummaryNextValue: {
    color: '#155EEF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  selectionSummaryArrow: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: '900',
  },
  selectionSummaryDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  selectionSummaryDetailLabel: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '800',
  },
  selectionSummaryDetailValue: {
    color: '#155EEF',
    fontSize: 13,
    fontWeight: '900',
  },
  toggleButton: {
    backgroundColor: '#EEF4FF',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#C9DAF7',
  },
  toggleButtonText: {
    color: '#1d4ed8',
    fontSize: 12,
    fontWeight: '800',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  valueWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.09)',
    paddingVertical: 18,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  valueText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#0B1220',
    textAlign: 'center',
    width: '100%',
    includeFontPadding: IS_ANDROID,
  },
  nativePickerWrap: {
    minHeight: 220,
    justifyContent: 'center',
    marginBottom: 16,
  },
  nativePickerWrapAndroid: {
    minHeight: ANDROID_WHEEL_HEIGHT,
    marginBottom: 14,
  },
  nativePickerWrapWeb: {
    minHeight: 76,
    marginBottom: 14,
  },
  nativePickerFrame: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.09)',
    overflow: 'hidden',
    position: 'relative',
  },
  nativePickerFrameAndroid: {
    borderRadius: 22,
    borderColor: 'rgba(21, 94, 239, 0.22)',
    backgroundColor: '#F8FAFF',
    shadowColor: '#155EEF',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  nativePickerFrameWeb: {
    minHeight: 72,
    justifyContent: 'center',
    borderRadius: 22,
    borderColor: 'rgba(21, 94, 239, 0.22)',
    backgroundColor: '#F8FAFF',
    shadowColor: '#155EEF',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  nativePickerSelectionBand: {
    position: 'absolute',
    zIndex: 1,
    left: 10,
    right: 10,
    top: '50%',
    height: 48,
    marginTop: -24,
    borderRadius: 18,
    backgroundColor: 'rgba(21, 94, 239, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(21, 94, 239, 0.28)',
  },
  nativePicker: {
    width: '100%',
    ...(IS_WEB
      ? {
          height: 72,
          color: '#155EEF',
          backgroundColor: 'transparent',
          borderWidth: 0,
          fontSize: 28,
          fontWeight: '900',
          textAlign: 'center',
          paddingLeft: 54,
          paddingRight: 54,
        }
      : null),
  },
  nativePickerItem: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111111',
  },
  nativePickerWebDisplay: {
    position: 'absolute',
    zIndex: 3,
    top: 1,
    right: 1,
    bottom: 1,
    left: 1,
    borderRadius: 20,
    backgroundColor: '#F8FAFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 58,
  },
  nativePickerWebDisplayValue: {
    width: '100%',
    color: '#155EEF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  nativePickerWebDisplayArrow: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF1FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  nativePickerFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 34,
    zIndex: 2,
    backgroundColor: 'rgba(251,250,247,0.92)',
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
  androidWheelHost: {
    height: ANDROID_WHEEL_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
  },
  androidWheelContent: {
    paddingVertical: ANDROID_WHEEL_VERTICAL_PADDING,
  },
  androidWheelList: {
    zIndex: 1,
    flex: 1,
    width: '100%',
  },
  androidWheelItem: {
    height: ANDROID_WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  androidWheelItemPressed: {
    opacity: 0.72,
  },
  androidWheelItemText: {
    color: '#8B95A5',
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '700',
    textAlign: 'center',
    includeFontPadding: false,
  },
  androidWheelItemTextSelected: {
    color: '#155EEF',
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  androidWheelSelectionBand: {
    position: 'absolute',
    zIndex: 0,
    left: 10,
    right: 10,
    top: ANDROID_WHEEL_VERTICAL_PADDING,
    height: ANDROID_WHEEL_ITEM_HEIGHT,
    borderRadius: 18,
    backgroundColor: 'rgba(21, 94, 239, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(21, 94, 239, 0.28)',
  },
  androidWheelFade: {
    position: 'absolute',
    zIndex: 2,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: 'rgba(248, 250, 255, 0.16)',
  },
  androidWheelFadeTop: {
    top: 0,
  },
  androidWheelFadeBottom: {
    bottom: 0,
  },
  stepperRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  stepperButton: {
    width: 64,
    minHeight: 56,
    backgroundColor: '#F3F0EA',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValueCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#B9CDF2',
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#155EEF',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  stepperValueText: {
    width: '100%',
    color: '#0F172A',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: IS_ANDROID,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.10)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 4,
    marginBottom: 8,
  },
  presetChipActive: {
    backgroundColor: '#155EEF',
    borderColor: '#155EEF',
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
    gap: 12,
    marginTop: 2,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E8EDF4',
  },
  actionsEmbedded: {
    marginHorizontal: -4,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  lightButton: {
    flex: 1,
    minHeight: 56,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D8E1EC',
    paddingHorizontal: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lightButtonText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
    width: '100%',
    textAlign: 'center',
    includeFontPadding: IS_ANDROID,
  },
  darkButton: {
    flex: 1,
    minHeight: 56,
    backgroundColor: '#0F172A',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#0F172A',
    paddingHorizontal: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
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
