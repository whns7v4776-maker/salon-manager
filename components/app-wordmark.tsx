import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

const salonProLogo = require('../assets/images/salon-pro-logo-ui.png');

export function AppWordmark() {
  const { width } = useWindowDimensions();
  const isCompact = width < 430;
  const wordmarkWidth = Math.min(width * (isCompact ? 1.22 : 1.08), 760);
  const wordmarkHeight = wordmarkWidth / 3.82;

  return (
    <View style={[styles.wrap, isCompact && styles.wrapCompact]}>
      <Image
        source={salonProLogo}
        style={[
          styles.wordmark,
          isCompact && styles.wordmarkCompact,
          { width: wordmarkWidth, height: wordmarkHeight },
        ]}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginBottom: -10,
  },
  wrapCompact: {
    marginTop: -6,
    marginBottom: -18,
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
