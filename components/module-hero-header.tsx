import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
import { SalonNameDisplayStyle, SalonNameFontVariant } from '../src/lib/platform';
import { AppWordmark } from './app-wordmark';

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
};

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
}: ModuleHeroHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isCompact = false;
  const settingsNavigationLockedRef = React.useRef(false);

  const handleOpenSettings = React.useCallback(() => {
    if (settingsNavigationLockedRef.current || pathname === '/impostazioni') {
      return;
    }

    settingsNavigationLockedRef.current = true;
    router.push('/impostazioni');

    setTimeout(() => {
      settingsNavigationLockedRef.current = false;
    }, 900);
  }, [pathname, router]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.brandBand, isCompact && styles.brandBandCompact]}>
        <AppWordmark />

        {rightAccessory ? (
          <View style={[styles.rightAccessory, isCompact && styles.rightAccessoryCompact]}>
            {rightAccessory}
          </View>
        ) : showSettingsButton ? (
          <View style={[styles.rightAccessory, isCompact && styles.rightAccessoryCompact]}>
            <HapticTouchable
              style={styles.settingsButton}
              onPress={handleOpenSettings}
              pressScale={0.98}
              pressOpacity={0.98}
            >
              <Image
                source={require('../assets/header-impostazioni-icon.png')}
                style={styles.settingsIconImage}
                resizeMode="contain"
              />
            </HapticTouchable>
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
    marginBottom: -6,
    paddingHorizontal: 12,
    overflow: 'visible',
    position: 'relative',
  },
  brandBandCompact: {
    minHeight: 50,
    marginBottom: -10,
    paddingHorizontal: 4,
  },
  rightAccessory: {
    position: 'absolute',
    right: -10,
    top: 8,
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightAccessoryCompact: {
    top: 6,
    right: -6,
    width: 70,
    height: 70,
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
