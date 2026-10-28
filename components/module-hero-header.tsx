import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
import { SalonNameDisplayStyle, SalonNameFontVariant } from '../src/lib/platform';
import { AppWordmark } from './app-wordmark';
import { useAndroidOwnerTools } from './android-owner-tools-context';

type ModuleHeroHeaderProps = {
  moduleKey: string;
  title: string;
  salonName: string;
  salonNameDisplayStyle?: SalonNameDisplayStyle;
  salonNameFontVariant?: SalonNameFontVariant;
  iconOffsetY?: number;
  rightAccessory?: React.ReactNode;
  showSettingsButton?: boolean;
  onTitleLongPress?: () => void;
  subtitle?: string;
  onNativeCashBackPress?: () => void;
};

function NativeCashCardIcon() {
  return (
    <View style={styles.cashCardIcon}>
      <View style={styles.cashCardIconStripe} />
      <View style={styles.cashCardIconChip} />
    </View>
  );
}

function SettingsIcon() {
  return (
    <ExpoImage
      source={require('../assets/header-impostazioni-icon.png')}
      style={styles.settingsIconImage}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

function StandardSettingsButton() {
  const router = useRouter();
  const pathname = usePathname();
  const navigationLockedRef = React.useRef(false);

  const handleOpenSettings = React.useCallback(() => {
    if (
      navigationLockedRef.current ||
      pathname === '/impostazioni' ||
      pathname === '/impostazioni-open'
    ) {
      return;
    }

    navigationLockedRef.current = true;
    router.push(Platform.OS === 'web' ? '/impostazioni-open' : '/impostazioni');
    setTimeout(() => {
      navigationLockedRef.current = false;
    }, 900);
  }, [pathname, router]);

  return (
    <HapticTouchable
      style={styles.settingsButton}
      onPress={handleOpenSettings}
      pressScale={0.98}
      pressOpacity={0.98}
    >
      <SettingsIcon />
    </HapticTouchable>
  );
}

function AndroidSettingsButton({ moduleKey }: { moduleKey: string }) {
  const ownerTools = useAndroidOwnerTools();

  const handleOpenSettings = React.useCallback(() => {
    if (!ownerTools) {
      return;
    }

    ownerTools.openSettings(moduleKey);
  }, [moduleKey, ownerTools]);

  return (
    <Pressable
      style={({ pressed }) => [styles.settingsButton, pressed && { opacity: 0.75 }]}
      onPress={handleOpenSettings}
      accessibilityLabel="Apri impostazioni"
      accessibilityRole="button"
      testID="android-owner-settings-button"
      hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
    >
      <SettingsIcon />
    </Pressable>
  );
}

export function ModuleHeroHeader({
  moduleKey: _moduleKey,
  title: _title,
  salonName: _salonName,
  salonNameDisplayStyle: _salonNameDisplayStyle = 'corsivo',
  salonNameFontVariant: _salonNameFontVariant = 'neon',
  iconOffsetY: _iconOffsetY = 0,
  rightAccessory,
  showSettingsButton = true,
  onTitleLongPress: _onTitleLongPress,
  subtitle,
  onNativeCashBackPress,
}: ModuleHeroHeaderProps) {
  const router = useRouter();
  const ownerTools = useAndroidOwnerTools();
  const isCompact = false;
  const cashNavigationLockedRef = React.useRef(false);
  const shouldShowNativeCashBackButton =
    false;
  const shouldShowNativeCashButton =
    false;
  const shouldShowSettingsButton = false;
  const androidSettingsEdgeStyle =
    Platform.OS !== 'android'
      ? null
      : _moduleKey === 'prenotazioni' || _moduleKey === 'clienti'
        ? styles.rightAccessoryAndroidWideInset
        : _moduleKey === 'agenda' || _moduleKey === 'servizi'
          ? styles.rightAccessoryAndroidMediumInset
          : styles.rightAccessoryAndroidStandardInset;
  const androidCashEdgeStyle =
    Platform.OS !== 'android'
      ? null
      : _moduleKey === 'prenotazioni' || _moduleKey === 'clienti'
        ? styles.leftAccessoryAndroidWideInset
        : _moduleKey === 'agenda' || _moduleKey === 'servizi'
          ? styles.leftAccessoryAndroidMediumInset
          : styles.leftAccessoryAndroidStandardInset;

  const handleOpenCash = React.useCallback(() => {
    if (Platform.OS === 'android' && ownerTools) {
      ownerTools.openCash(_moduleKey);
      return;
    }

    if (cashNavigationLockedRef.current) {
      return;
    }

    cashNavigationLockedRef.current = true;
    router.push('/cassa-open');

    setTimeout(() => {
      cashNavigationLockedRef.current = false;
    }, 900);
  }, [_moduleKey, ownerTools, router]);

  const handleBackFromCash = React.useCallback(() => {
    if (Platform.OS === 'android' && onNativeCashBackPress) {
      onNativeCashBackPress();
      return;
    }

    if (Platform.OS === 'android') {
      router.replace('/(tabs)');
      return;
    }

    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace('/(tabs)');
  }, [onNativeCashBackPress, router]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.brandBand, isCompact && styles.brandBandCompact]}>
        {shouldShowNativeCashBackButton ? (
          <View
            style={[
              styles.leftAccessory,
              Platform.OS === 'android' &&
                (_moduleKey === 'cassa'
                  ? styles.leftAccessoryAndroidCashBack
                  : styles.leftAccessoryAndroidCash),
              isCompact && styles.leftAccessoryCompact,
            ]}
          >
            <HapticTouchable
              style={styles.settingsButton}
              onPress={handleBackFromCash}
              pressScale={0.98}
              pressOpacity={0.98}
            >
              <Ionicons name="chevron-back" size={28} color="#111827" />
            </HapticTouchable>
          </View>
        ) : shouldShowNativeCashButton ? (
          <View
            style={[
              styles.leftAccessory,
              Platform.OS === 'android' && styles.leftAccessoryAndroidCash,
              androidCashEdgeStyle,
              isCompact && styles.leftAccessoryCompact,
            ]}
          >
            <HapticTouchable
              style={styles.settingsButton}
              onPress={handleOpenCash}
              accessibilityLabel={Platform.OS === 'android' ? 'Apri cassa' : undefined}
              accessibilityRole="button"
              testID={Platform.OS === 'android' ? 'android-owner-cash-button' : undefined}
              hitSlop={Platform.OS === 'android' ? { top: 8, right: 8, bottom: 8, left: 8 } : undefined}
              immediatePress={Platform.OS === 'android'}
              pressScale={0.98}
              pressOpacity={0.98}
            >
              <NativeCashCardIcon />
            </HapticTouchable>
          </View>
        ) : rightAccessory || shouldShowSettingsButton ? (
          <View
            pointerEvents="none"
            style={[styles.leftAccessoryMirror, isCompact && styles.leftAccessoryMirrorCompact]}
          />
        ) : null}

        <AppWordmark compact />

        {rightAccessory ? (
          <View style={[styles.rightAccessory, isCompact && styles.rightAccessoryCompact]}>
            {rightAccessory}
          </View>
        ) : shouldShowSettingsButton ? (
          <View
            style={[
              styles.rightAccessory,
              Platform.OS === 'android' && styles.rightAccessoryAndroidControl,
              androidSettingsEdgeStyle,
              isCompact && styles.rightAccessoryCompact,
            ]}
          >
            {Platform.OS === 'android' ? (
              <AndroidSettingsButton moduleKey={_moduleKey} />
            ) : (
              <StandardSettingsButton />
            )}
          </View>
        ) : null}
      </View>

      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: '100%',
    overflow: 'visible',
  },
  brandBand: {
    width: '100%',
    minHeight: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    paddingHorizontal: 12,
    overflow: 'visible',
    position: 'relative',
  },
  brandBandCompact: {
    minHeight: 50,
    marginBottom: -10,
    paddingHorizontal: 4,
  },
  leftAccessoryMirror: {
    position: 'absolute',
    left: -10,
    top: 8,
    width: 82,
    height: 82,
  },
  leftAccessoryMirrorCompact: {
    top: 6,
    left: -6,
    width: 70,
    height: 70,
  },
  leftAccessory: {
    position: 'absolute',
    left: -10,
    top: 8,
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    elevation: 4,
  },
  leftAccessoryAndroidCash: {
    left: -18,
    top: 6,
    zIndex: 30,
    elevation: 30,
  },
  leftAccessoryAndroidCashBack: {
    left: -18,
    top: 6,
    zIndex: 30,
    elevation: 30,
  },
  leftAccessoryAndroidStandardInset: {
    left: -13,
  },
  leftAccessoryAndroidMediumInset: {
    left: -19,
  },
  leftAccessoryAndroidWideInset: {
    left: -25,
  },
  leftAccessoryCompact: {
    top: 6,
    left: -6,
    width: 70,
    height: 70,
  },
  rightAccessory: {
    position: 'absolute',
    right: -10,
    top: 8,
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    elevation: 4,
  },
  rightAccessoryCompact: {
    top: 6,
    right: -6,
    width: 70,
    height: 70,
  },
  rightAccessoryAndroidControl: {
    top: 6,
  },
  // The native owner cards use three different horizontal paddings. Keep the
  // Settings control at the same visual distance from the card edge instead
  // of letting the wider cards push it toward the SalonPro wordmark.
  rightAccessoryAndroidStandardInset: {
    right: -13,
  },
  rightAccessoryAndroidMediumInset: {
    right: -19,
  },
  rightAccessoryAndroidWideInset: {
    right: -25,
  },
  settingsButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
  },
  cashCardIcon: {
    width: 29,
    height: 21,
    borderRadius: 6,
    borderWidth: 2.2,
    borderColor: '#111827',
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  cashCardIconStripe: {
    height: 5,
    marginTop: 4,
    backgroundColor: '#111827',
  },
  cashCardIconChip: {
    position: 'absolute',
    left: 4,
    bottom: 4,
    width: 7,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  settingsIconImage: {
    width: 38,
    height: 38,
  },
  subtitle: {
    maxWidth: 360,
    marginTop: -2,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
    includeFontPadding: true,
    paddingHorizontal: Platform.OS === 'android' ? 6 : 0,
  },
});
