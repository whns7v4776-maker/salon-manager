import {Appearance,day,night,type Palette,type AppearanceMode,type AppearanceChangeListener} from './access-appearance-context';
import {PremiumWebInteractions} from './ui/premium-web-interactions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useColorScheme, View, type ViewStyle } from 'react-native';
import Svg, { Defs, FeColorMatrix, Filter, Image as SvgImage, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

let sessionNightOverride: boolean | null = null;

/** Access-only presentation. Stores only the visual preference; never owns credentials or navigation. */
export function AccessAppearanceProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<boolean | null>(sessionNightOverride);
  const touched = useRef(false);
  const changeListeners = useRef(new Set<AppearanceChangeListener>());
  const subscribeModeChanges = useCallback((listener: AppearanceChangeListener) => {
    changeListeners.current.add(listener);
    return () => { changeListeners.current.delete(listener); };
  }, []);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem('salonpro_premium_access_appearance').then(value => {
      if (active && !touched.current && (value === 'night' || value === 'day' || value === 'system')) {
        sessionNightOverride = value === 'system' ? null : value === 'night';
        setOverride(sessionNightOverride);
      }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const isNight = override ?? system === 'dark';
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-premium-appearance', isNight ? 'night' : 'day');
    }
  }, [isNight]);
  const value = useMemo(() => ({ palette: isNight ? night : day, mode: (override === null ? 'system' : override ? 'night' : 'day') as AppearanceMode, subscribeModeChanges, setMode: (mode: AppearanceMode, options?: { localOnly?: boolean }) => { touched.current = true; sessionNightOverride = mode === 'system' ? null : mode === 'night'; setOverride(sessionNightOverride); void AsyncStorage.setItem('salonpro_premium_access_appearance', mode).catch(() => undefined); if (!options?.localOnly) changeListeners.current.forEach(listener => listener(mode)); }, toggle: () => { touched.current = true; sessionNightOverride = !isNight; setOverride(!isNight); void AsyncStorage.setItem('salonpro_premium_access_appearance', !isNight ? 'night' : 'day').catch(() => undefined); changeListeners.current.forEach(listener => listener(!isNight ? 'night' : 'day')); } }), [isNight, override, subscribeModeChanges]);
  return <Appearance.Provider value={value}><PremiumWebInteractions night={isNight}/>{children}</Appearance.Provider>;
}
export const useAccessAppearance = () => useContext(Appearance);

export function AccessThemeControl({ inline = false }: { inline?: boolean } = {}) {
  const { palette: p, toggle } = useAccessAppearance();
  return <Pressable accessibilityRole="button" accessibilityLabel={p.night ? 'Attiva aspetto giorno' : 'Attiva aspetto night'} onPress={toggle}
    {...(Platform.OS === 'web' ? { dataSet: { accessTheme: 'true' } } : {})}
    style={({ pressed }) => ({ alignSelf: inline ? 'center' : 'flex-end', flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 13, marginBottom: inline ? 0 : 6, borderRadius: 16, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, opacity: pressed ? 0.7 : 1 })}>
    <Ionicons name={p.night ? 'sunny-outline' : 'moon-outline'} size={17} color={p.ink} />
    <Text style={{ color: p.ink, fontSize: 12 }}>{p.night ? 'Giorno' : 'Night'}</Text>
  </Pressable>;
}

export function AccessWordmark({compact=false}:{compact?:boolean}={}) {
  const { palette: p } = useAccessAppearance();
  const id = `wordmark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return <View style={{ width: '100%', maxWidth: compact ? 154 : Platform.OS === 'web' ? 340 : 260, height: compact ? 64 : Platform.OS === 'web' ? 140 : 104, alignSelf: 'center' }} accessible accessibilityLabel="SalonPro" accessibilityRole="image">
    <Svg width="100%" height="100%" viewBox="0 0 1944 809" preserveAspectRatio="xMidYMid meet" accessible={false}>
      <Defs>
        <Filter {...{ colorInterpolationFilters: 'sRGB' }} id={id} x="0%" y="0%" width="100%" height="100%">
          <FeColorMatrix type="matrix" values="1.45 0 0 0 -0.62  0 1.45 0 0 -0.62  0 0 1.45 0 -0.62  0 0 0 1 0" />
        </Filter>
      </Defs>
      <SvgImage href={require('../assets/images/salonpro-logo-argento-trasparente.png')} width="1944" height="809" filter={p.night ? undefined : `url(#${id})`} />
    </Svg>
  </View>;
}

export function AccessBackdrop() {
  const { palette: p } = useAccessAppearance();
  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}>
    <Image source={p.night ? require('../assets/images/access-night-satin-v1.png') : require('../assets/images/access-day-satin-v1.png')}
      contentFit="cover" contentPosition="center" style={StyleSheet.absoluteFill} />
  </View>;
}

/** Static specular layer: no pointer handlers, timers or layout measurements. */
/** `subtle`: popups and sheets. A soft top glow and a crisp top edge only; the diagonal crest and
 *  the arc are dropped because on tall sheets they stretch into a streak that splits the cards. */
export function AccessGlassReflection({ subtle = false }: { subtle?: boolean } = {}) {
  const { palette: p } = useAccessAppearance();
  const id = `glass-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return <View pointerEvents="none" accessible={false} style={{ ...StyleSheet.absoluteFillObject, borderRadius: 22, overflow: 'hidden' }}>
    <Svg width="100%" height="100%" viewBox="0 0 1000 500" preserveAspectRatio="none" pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop stopColor="#FFFFFF" stopOpacity={p.night ? 0.22 : 0.62} />
          <Stop offset="0.25" stopColor="#FFFFFF" stopOpacity={p.night ? 0.035 : 0.12} />
          <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.76" stopColor="#F3DDB2" stopOpacity={p.night ? 0.025 : 0.08} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={p.night ? 0.11 : 0.3} />
        </LinearGradient>
        <LinearGradient id={`${id}-crest`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop stopColor="#FFFFFF" stopOpacity="0" />
          <Stop offset="0.35" stopColor="#FFF2D9" stopOpacity="0" />
          <Stop offset="0.49" stopColor="#FFFFFF" stopOpacity={p.night ? 0.2 : 0.65} />
          <Stop offset="0.53" stopColor="#F5DEB4" stopOpacity={p.night ? 0.07 : 0.16} />
          <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect width="1000" height="500" fill={`url(#${id})`} />
      {subtle ? null : <Rect width="1000" height="500" fill={`url(#${id}-crest)`} />}
      {subtle ? null : <Path d="M-100 430 Q440 310 1100 500" fill="none" stroke="#F5E8D0" strokeOpacity={p.night ? 0.09 : 0.32} strokeWidth="1" />}
      <Path d="M22 1 H978" stroke="#FFFFFF" strokeOpacity={p.night ? 0.36 : 0.9} strokeWidth="1.5" />
      <Path d="M1 22 V478" stroke="#FFFFFF" strokeOpacity={p.night ? 0.12 : 0.45} strokeWidth="1" />
    </Svg>
  </View>;
}

/** Reuse existing layout and event handlers; replace only access presentation. */
export function accessPremiumStyles<T extends Record<string, object>>(base: T, p: Palette): T {
  const result: Record<string, Record<string, unknown>> = {};
  for (const [key, original] of Object.entries(base)) {
    const style = { ...original } as Record<string, unknown>;
    const semantic = /error|success|warning|danger|invalid|verified/i.test(key);
    if (!semantic) {
      if (typeof style.color === 'string') style.color = /hint|subtitle|description|footnote|caption|helper/i.test(key) ? p.muted : p.ink;
      if (typeof style.backgroundColor === 'string' && style.backgroundColor !== 'transparent') style.backgroundColor = p.surface;
      if (typeof style.borderColor === 'string' && style.borderColor !== 'transparent') style.borderColor = p.line;
    }
    if (style.shadowOpacity) { style.shadowColor = '#171A18'; style.shadowOpacity = p.night ? 0.18 : 0.06; style.shadowRadius = 20; style.shadowOffset = { width: 0, height: 8 }; }
    result[key] = style;
  }
  const glass: ViewStyle = { backgroundColor: p.surface, borderColor: p.border, borderWidth: 1, shadowColor: '#171A18', shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 3,
    ...(Platform.OS === 'web' ? { backdropFilter: 'blur(24px) saturate(115%)', WebkitBackdropFilter: 'blur(24px) saturate(115%)', backgroundImage: p.night ? 'linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.012))' : 'linear-gradient(145deg, rgba(255,255,255,.65), rgba(255,255,255,.12))', boxShadow: p.night ? 'inset 0 1px 0 rgba(255,255,255,.14), 0 16px 45px rgba(0,0,0,.18)' : 'inset 0 1px 0 rgba(255,255,255,.95), 0 16px 45px rgba(61,51,34,.08)' } as ViewStyle : {}) };
  const patch = (keys: string[], value: object) => keys.forEach(k => { if (result[k]) Object.assign(result[k], value); });
  patch(['container'], { backgroundColor: p.canvas });
  patch(['content'], { flexGrow: 1, justifyContent: 'center' });
  patch(['landingPagerTrack', 'landingPagerPage', 'landingPagerPageInner', 'embeddedContainer'], { backgroundColor: 'transparent' });
  patch(['backgroundGlowTop', 'backgroundGlowBottom'], { display: 'none' });
  patch(['audienceChoicePanel'], { maxWidth: 520, backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0, paddingHorizontal: 8, paddingTop: 8, gap: 16 });
  patch(['audienceChoiceBrandRow'], { height: 150, marginBottom: 12 });
  patch(['audienceChoiceTitle'], { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 31, lineHeight: 38, fontWeight: '400', letterSpacing: -0.7 });
  patch(['audienceChoiceCard'], { ...glass, borderRadius: 22, paddingVertical: 18, paddingHorizontal: 18, minHeight: 98 });
  patch(['audienceChoiceClient', 'audienceChoiceOwner'], { backgroundColor: p.surface, borderColor: p.border });
  patch(['audienceChoiceClientIcon', 'audienceChoiceOwnerIcon'], { backgroundColor: p.night ? 'rgba(216,194,155,0.09)' : '#ECE6DA', borderWidth: 1, borderColor: p.border, borderRadius: 14 });
  patch(['audienceChoiceClientIcon'], { backgroundColor: p.night ? 'rgba(214,218,220,.09)' : 'rgba(70,76,79,.07)', borderColor: p.night ? 'rgba(220,223,222,.24)' : 'rgba(70,76,79,.16)' });
  patch(['audienceChoiceOwnerIcon'], { backgroundColor: p.night ? 'rgba(216,194,155,.1)' : 'rgba(177,133,71,.1)', borderColor: p.night ? 'rgba(216,194,155,.3)' : 'rgba(155,113,57,.22)' });
  patch(['audienceChoiceCardTitle'], { fontWeight: '600', fontSize: 18 });
  patch(['card'], { ...glass, borderRadius: 28, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 20 });
  patch(['clientSectionCard', 'clientSectionCardCompact', 'clientSectionCardWide'], { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0, paddingHorizontal: 0, paddingTop: 4, paddingBottom: 12 });
  patch(['accessCard', 'accessCardWide'], { ...glass, maxWidth: 440, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 22 });
  patch(['accessCardCompact'], { marginTop: 0 });
  patch(['heroCard', 'heroCardCompact'], { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0, paddingHorizontal: 0, paddingTop: 4, paddingBottom: 0, marginBottom: 0 });
  patch(['accessAudienceControl'], { left: 0, top: 0, width: 44 });
  patch(['accessBrandRow'], { height: 140, marginBottom: 8 });
  patch(['accessAreaTitle'], { color: p.muted, fontSize: 11, lineHeight: 16, fontWeight: '600', letterSpacing: 2.2, textTransform: 'uppercase' });
  patch(['accessAreaSubtitle'], { color: p.ink, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 30, lineHeight: 36, fontWeight: '400', letterSpacing: -0.5 });
  patch(['accessAreaHeader'], { marginBottom: 24 });
  patch(['ownerInlineAccessWrap', 'ownerInlineAccessWrapCompact'], { maxWidth: 440, alignSelf: 'center' });
  patch(['ownerInlineAccessWrapWide'], { maxWidth: 440 });
  patch(['cardTitleCompact'], { fontSize: 21, fontWeight: '500' });
  patch(['linkButtonText'], { color: p.muted, fontWeight: '500' });
  patch(['embeddedCard', 'embeddedCardCompact'], { ...glass, borderRadius: 24, padding: 24, marginBottom: 12 });
  patch(['modeSwitch', 'embeddedModeSwitch', 'clientModeSwitch'], { backgroundColor: p.field, borderColor: p.border, borderRadius: 16, padding: 4, columnGap: 4 });
  patch(['modeSwitchButton', 'embeddedModeSwitchButton', 'clientModeSwitchButton'], { backgroundColor: 'transparent', borderColor: 'transparent', borderRadius: 12, shadowOpacity: 0, elevation: 0 });
  patch(['modeSwitchButtonActive', 'clientModeSwitchButtonActive', 'landingSwitchChipActive', 'landingSwitchChipOwnerActive', 'landingSwitchChipClientActive'], { backgroundColor: p.action, borderColor: p.action });
  patch(['modeSwitchButtonTextActive', 'clientModeSwitchButtonTextActive', 'landingSwitchChipTextActive'], { color: p.actionText });
  patch(['input', 'embeddedInput', 'quickAccessInput', 'androidVisibleQuickAccessInput', 'codeInput'], { color: p.ink, backgroundColor: p.field, borderColor: p.line, borderWidth: 1, borderRadius: 13, minHeight: 50, textAlign: 'left', paddingHorizontal: 14 });
  patch(['embeddedPrimaryButton'], { minHeight: 50, marginTop: 8 });
  patch(['inputLabel', 'embeddedInputLabel'], { color: p.muted, textAlign: 'left', fontWeight: '500', alignSelf: 'stretch' });
  patch(['cardTitle', 'embeddedCardTitle'], { fontSize: 21, fontWeight: '500', color: p.ink });
  patch(['primaryButton', 'quickAccessButton'], { backgroundColor: p.action, borderColor: p.night ? '#E8D8BB' : '#50534F', borderWidth: 1, borderRadius: 14, minHeight: 50 });
  patch(['primaryButton', 'quickAccessButton'], Platform.OS === 'web' ? { backgroundImage: p.night ? 'linear-gradient(145deg, #E7D4B4, #BCA37A)' : 'linear-gradient(145deg, #51544F, #292C29)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22), 0 4px 12px rgba(0,0,0,.12)' } : {});
  patch(['primaryButtonText', 'embeddedPrimaryButtonText', 'quickAccessButtonText'], { color: p.actionText, fontSize: 15, fontWeight: '600' });
  patch(['primaryButtonDisabled', 'loginPrimaryDisabled', 'clientAccessPrimaryDisabled'], { backgroundColor: p.action, opacity: 0.5, borderColor: p.line, ...(Platform.OS === 'web' ? { backgroundImage: 'none', boxShadow: 'none' } : {}) });
  patch(['loginPrimaryTextDisabled', 'clientAccessPrimaryTextDisabled'], { color: p.actionText });
  patch(['quickAccessPasswordLinkText', 'linkText', 'inlineLinkText'], { color: p.muted, fontWeight: '500' });
  patch(['benefitCard', 'reassuranceCard', 'salonAssociationCard'], { ...glass, borderRadius: 20 });
  patch(['sectionTitle'], { color: p.ink, fontWeight: '500', fontSize: 22 });
  patch(['quickAccessCard', 'quickAccessCardCompact', 'quickAccessCardWide', 'associatedSalonCompactCard'], { backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0, padding: 0, marginBottom: 14, ...(Platform.OS === 'web' ? { boxShadow: 'none', backgroundImage: 'none', backdropFilter: 'none' } : {}) });
  patch(['qrQuickAccessButton'], { backgroundColor: p.field, borderColor: p.line, minHeight: 50, ...(Platform.OS === 'web' ? { backgroundImage: 'none', boxShadow: 'none' } : {}) });
  patch(['qrQuickAccessButtonText'], { color: p.ink });
  patch(['inlineLinkText', 'salonAssociationSelectorChevron'], { color: p.muted });
  patch(['audienceChoiceCard'], { minHeight: 108, paddingHorizontal: 22, paddingVertical: 20, gap: 16, borderRadius: 22 });
  patch(['audienceChoiceIcon'], { width: 52, height: 52, borderRadius: 16 });
  patch(['audienceChoiceCardTitle'], { fontSize: 18, fontWeight: '500', letterSpacing: -0.15 });
  patch(['audienceChoiceCardDescription'], { fontSize: 13, lineHeight: 19, color: p.muted });
  patch(['alternateSalonSearch'], { marginBottom: 4 });
  patch(['salonAssociationSelector'], { backgroundColor: p.field, borderColor: p.line, borderRadius: 14 });
  patch(['associatedSalonManageButton'], { borderColor: p.line, backgroundColor: p.field, minHeight: 36, height: 36, paddingHorizontal: 10 });
  if (Platform.OS === 'web') {
    patch(['audienceChoiceCard', 'accessCard', 'embeddedCard', 'embeddedCardCompact'], {
      borderColor: p.night ? 'rgba(239,234,223,.28)' : 'rgba(255,255,255,.98)',
      boxShadow: p.night ? 'inset 0 1px 0 rgba(255,255,255,.24), inset 1px 0 0 rgba(255,255,255,.07), inset 0 -1px 0 rgba(255,255,255,.04), 0 16px 40px rgba(0,0,0,.2)' : 'inset 0 1px 0 #fff, inset 1px 0 0 rgba(255,255,255,.9), 0 12px 35px rgba(55,45,28,.1)',
    });
  }
  if (Platform.OS === 'web' && p.night) {
    patch(['primaryButton', 'quickAccessButton', 'modeSwitchButtonActive', 'clientModeSwitchButtonActive', 'landingSwitchChipActive', 'landingSwitchChipOwnerActive', 'landingSwitchChipClientActive'], {
      backgroundColor: '#BA9562',
      backgroundImage: 'linear-gradient(115deg, transparent 4%, rgba(255,252,234,.08) 18%, rgba(255,252,234,.72) 29%, rgba(255,252,234,.12) 38%, transparent 52%), linear-gradient(175deg, #F6E3C6 0%, #DFC199 19%, #C3A074 49%, #B38B5C 66%, #DCC09A 91%, #F5E4C9 100%)',
      borderColor: '#EAD3AE', borderWidth: 1,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), inset 1px 0 0 rgba(255,244,216,.55), inset 0 -1px 0 rgba(102,67,29,.5), 0 4px 12px rgba(0,0,0,.24)',
    });
    patch(['primaryButtonDisabled', 'loginPrimaryDisabled', 'clientAccessPrimaryDisabled'], { backgroundImage: 'none', boxShadow: 'none', opacity: 0.5 });
  }
  if (Platform.OS === 'web' && !p.night) {
    patch(['primaryButton', 'quickAccessButton', 'modeSwitchButtonActive', 'clientModeSwitchButtonActive', 'landingSwitchChipActive', 'landingSwitchChipOwnerActive', 'landingSwitchChipClientActive'], {
      backgroundImage: 'linear-gradient(115deg, transparent 7%, rgba(255,255,255,.26) 29%, transparent 48%), linear-gradient(175deg, #62645F 0%, #3E423E 36%, #252A27 67%, #424741 100%)',
      borderColor: '#777A71', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.55), inset 0 -1px 0 rgba(0,0,0,.3), 0 4px 12px rgba(38,33,24,.17)',
    });
    patch(['primaryButtonDisabled', 'loginPrimaryDisabled', 'clientAccessPrimaryDisabled'], { backgroundImage: 'none', boxShadow: 'none', opacity: 0.5 });
  }
  patch(['benefitCard', 'reassuranceCard', 'clientSectionCard', 'clientSectionCardCompact', 'clientSectionCardWide', 'landingPagerTrack', 'landingPagerPage', 'landingPagerPageInner'], {
    shadowOpacity: 0, shadowRadius: 0, shadowOffset: { width: 0, height: 0 }, elevation: 0,
    ...(Platform.OS === 'web' ? { boxShadow: 'none' } : {}),
  });
  // Shared presentation for the access-only Face ID control and disclosures.
  patch(['biometricButton', 'embeddedBiometricButton', 'quickAccessBiometricButton'], {
    backgroundColor: p.field, borderColor: p.border, borderWidth: 1, borderRadius: 13,
    minHeight: 46, height: undefined, paddingVertical: 7, paddingHorizontal: 12,
    marginTop: 4, marginBottom: 10, shadowOpacity: 0, elevation: 0,
  });
  patch(['biometricButtonDisabled', 'quickAccessBiometricButtonDisabled'], { backgroundColor: p.field, borderColor: p.line, opacity: 0.6 });
  patch(['biometricIconBadge', 'quickAccessBiometricIconBadge', 'biometricIconBadgeDisabled', 'quickAccessBiometricIconBadgeDisabled'], {
    width: 26, height: 26, marginLeft: 0, backgroundColor: 'transparent', borderWidth: 0, shadowOpacity: 0, elevation: 0,
  });
  patch(['biometricButtonText', 'biometricButtonTextCompact', 'embeddedBiometricButtonText', 'quickAccessBiometricButtonText'], { color: p.ink, fontSize: 13, lineHeight: 17, fontWeight: '600' });
  patch(['biometricButtonCaption', 'quickAccessBiometricButtonCaption'], { color: p.muted, fontSize: 10, lineHeight: 14 });
  patch(['benefitCard'], { borderRadius: 18, paddingHorizontal: 14, paddingTop: 13, paddingBottom: 13, gap: 12 });
  patch(['benefitsGrid'], { gap: 10 });
  patch(['benefitIconWrap'], { width: 34, height: 34, borderRadius: 11, backgroundColor: p.field, borderColor: p.border, shadowOpacity: 0, elevation: 0 });
  patch(['benefitTitle'], { fontSize: 15, lineHeight: 20, fontWeight: '600', marginBottom: 3 });
  patch(['benefitText'], { fontSize: 13, lineHeight: 19, color: p.muted });
  patch(['reassuranceCard'], { paddingHorizontal: 18, paddingVertical: 17, borderRadius: 18 });
  patch(['reassuranceTitle'], { fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 21, lineHeight: 27, fontWeight: '400', marginBottom: 6 });
  patch(['reassuranceText'], { fontSize: 13, lineHeight: 20, color: p.muted });
  if (Platform.OS !== 'web') {
    patch(['accessBrandRow', 'audienceChoiceBrandRow'], { height: 104, marginBottom: 4 });
    patch(['accessAreaHeader'], { marginBottom: 14 });
    patch(['accessAreaSubtitle', 'audienceChoiceTitle'], { fontSize: 25, lineHeight: 31, letterSpacing: -0.4 });
    patch(['accessAreaTitle'], { fontSize: 10, lineHeight: 14, letterSpacing: 1.8 });
    patch(['accessCard', 'accessCardWide', 'embeddedCard', 'embeddedCardCompact'], { paddingHorizontal: 16, paddingVertical: 16, borderRadius: 22 });
    patch(['input', 'inputCompact', 'embeddedInput', 'quickAccessInput', 'androidVisibleQuickAccessInput'], {
      minHeight: 44, height: 44, fontSize: 14, paddingTop: 0, paddingBottom: 0, paddingVertical: 0,
      textAlign: 'center', textAlignVertical: 'center', marginBottom: 7,
    });
    patch(['primaryButton', 'embeddedPrimaryButton', 'quickAccessButton'], { minHeight: 46, paddingVertical: 10 });
    patch(['modeSwitchButton', 'embeddedModeSwitchButton', 'clientModeSwitchButton'], { minHeight: 44, paddingVertical: 8 });
    patch(['quickAccessHeader'], { gap: 5, marginBottom: 8 });
    patch(['quickAccessTitle', 'compactIdentityTitle'], { fontSize: 17, lineHeight: 22 });
    patch(['quickAccessSubtitle', 'compactIdentitySubtitle'], { fontSize: 12, lineHeight: 17 });
    patch(['audienceChoiceCard'], { minHeight: 88, paddingVertical: 14, paddingHorizontal: 16 });
    patch(['audienceChoiceIcon'], { width: 44, height: 44 });
    patch(['audienceChoiceCardTitle'], { fontSize: 16 });
  }
  return result as T;
}
