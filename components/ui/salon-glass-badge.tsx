import React, { useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export function SalonGlassBadge({ children }: { children: React.ReactNode }) {
  const isAndroid = Platform.OS === 'android';
  const gradientId = `salonGlass${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  if (Platform.OS !== 'web') {
    // Keep the face opaque and rounded. The outer shell casts a short shadow
    // without clipping it or introducing an SVG rectangle behind the name.
    return (
      <View style={styles.nativePlaqueShadow}>
        <View style={styles.nativeSurface}>
          <View pointerEvents="none" style={styles.nativeTopLight} />
          {children}
        </View>
      </View>
    );
  }
  return (
    <View style={[styles.shadow, isAndroid && styles.androidShadow]}>
      <View style={styles.surface}>
        <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradientId} x1="0%" y1="0%" x2="30%" y2="100%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={isAndroid ? 1 : 0.96} />
              <Stop offset="0.48" stopColor="#EFF6FF" stopOpacity={isAndroid ? 1 : 0.7} />
              <Stop offset="1" stopColor={isAndroid ? '#E5EFFA' : '#DCE9F8'} stopOpacity={isAndroid ? 1 : 0.8} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
        {!isAndroid && <View pointerEvents="none" style={styles.reflection} />}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nativePlaqueShadow: {
    maxWidth: '100%',
    borderRadius: 17,
    backgroundColor: '#DCE2E8',
    shadowColor: '#526174',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 5,
    elevation: 3,
  },
  nativeSurface: {
    maxWidth: '100%',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#AEBAC7',
    borderTopColor: '#FFFFFF',
    borderLeftColor: '#EEF2F6',
    borderBottomColor: '#8C9BAA',
    backgroundColor: '#DCE2E8',
    paddingHorizontal: 12,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  nativeTopLight: {
    position: 'absolute',
    top: 1,
    left: 16,
    right: 16,
    height: 1,
    borderRadius: 1,
    backgroundColor: '#FFFFFF',
  },
  // A single painted surface avoids translucent layers showing through on Android.
  androidShadow: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  androidSurface: {
    backgroundColor: 'rgba(229,239,250,0.48)',
    borderColor: 'rgba(156,183,216,0.36)',
  },
  shadow: {
    maxWidth: '100%', borderRadius: 17, backgroundColor: 'rgba(235,243,253,0.4)',
    shadowColor: '#45658C', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 9,
  },
  surface: {
    overflow: 'hidden', borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 18, paddingVertical: 5,
  },
  reflection: {
    position: 'absolute', top: 1, left: 14, right: 14, height: 1,
    backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 1,
  },
});
