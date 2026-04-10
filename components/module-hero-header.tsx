import React from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  onTitleLongPress: _onTitleLongPress,
  subtitle,
}: ModuleHeroHeaderProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 430;

  return (
    <View style={styles.wrap}>
      <View style={[styles.brandBand, isCompact && styles.brandBandCompact]}>
        <AppWordmark />

        {rightAccessory ? (
          <View style={[styles.rightAccessory, isCompact && styles.rightAccessoryCompact]}>
            {rightAccessory}
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
    top: 2,
    width: 82,
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightAccessoryCompact: {
    top: 0,
    right: -6,
    width: 70,
    height: 70,
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
