import { Image } from 'expo-image';
import React, { useId } from 'react';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

const salonProLogo = require('../assets/images/salon-pro-logo-ui.png');

export function AppWordmark({ maxWidth, compact = false, accessHeader = false, showAtmosphere = true }: { maxWidth?: number; compact?: boolean; accessHeader?: boolean; showAtmosphere?: boolean } = {}) {
  const { width } = useWindowDimensions();
  const gradientId = `wordmark-${useId().replace(/:/g, "")}`;
  const isCompact = width < 430;
  const responsiveMaxWidth = compact ? Math.min(width * 1.08, 580) : Math.min(width * (isCompact ? 1.22 : 1.08), 760);
  const wordmarkWidth =
    typeof maxWidth === 'number' && Number.isFinite(maxWidth)
      ? Math.min(responsiveMaxWidth, Math.max(120, maxWidth))
      : responsiveMaxWidth;
  const wordmarkHeight = wordmarkWidth / (accessHeader ? 720 / 480 : 3.82);

  return (
    <View style={[styles.wrap, isCompact && styles.wrapCompact, compact && { marginTop: -wordmarkHeight * 0.1, marginBottom: -wordmarkHeight * 0.18 - 4 }, accessHeader && styles.accessWrap]}>
      {showAtmosphere ? <View pointerEvents="none" accessible={false} style={styles.brandAtmosphere}>
        <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 1000 200">
          <Defs>
            <RadialGradient id={gradientId} cx="50%" cy={accessHeader ? '50%' : '40%'} rx={accessHeader ? '46%' : '56%'} ry={accessHeader ? '45%' : '40%'}>
              <Stop offset="0" stopColor="#DCE7EF" stopOpacity={0.85} />
              <Stop offset="0.55" stopColor="#EAF0F5" stopOpacity={0.65} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="1000" height="200" fill={`url(#${gradientId})`} />
        </Svg>
      </View> : null}
      <Image
        source={salonProLogo}
        style={[
          styles.wordmark,
          isCompact && styles.wordmarkCompact,
          { width: wordmarkWidth, height: wordmarkHeight },
          accessHeader && { position: 'absolute' },
        ]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  accessWrap: { width: '100%', height: 100, marginTop: 0, marginBottom: 0 },
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginBottom: -14,
  },
  wrapCompact: {
    marginTop: -6,
    marginBottom: -22,
  },
  brandAtmosphere: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: 0,
    bottom: -4,
  },
  wordmark: {
    width: 390,
    height: 102,
  },
  wordmarkCompact: {
    width: 332,
    height: 88,
  },
});
