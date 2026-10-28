import React, { useId } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** Decorative surface: preserves the card's layout, gestures and accessibility. */
export function CustomerCardSurface({ unread = false }: { unread?: boolean }) {
  const id = `customerSurface${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View pointerEvents="none" accessible={false} style={styles.surface}>
      <Svg width="100%" height="100%" pointerEvents="none" accessible={false}>
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0" stopColor="#FFFFFF" />
            <Stop offset="0.42" stopColor="#F3F7FC" />
            <Stop offset="1" stopColor={unread ? '#DCE9FB' : '#D8E5F5'} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <View style={styles.highlight} />
    </View>
  );
}
const styles = StyleSheet.create({
  surface: { ...StyleSheet.absoluteFillObject, borderRadius: 18, overflow: 'hidden' },
  highlight: { position: 'absolute', left: 18, right: 18, top: 0, height: 2, borderRadius: 2, backgroundColor: '#A9C3E7' },
});
