import React, { useEffect, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { layoutServiceTitle } from '../src/lib/service-title-lines';

type Props = { name: string; availableWidth: number; longestWordWidth?: number;
  onMeasure: (name: string, height: number, wordWidth: number) => void };
const typography = { fontSize: 16, lineHeight: 22, fontWeight: '700' as const,
  color: '#111111', includeFontPadding: false };

export function ServiceCardReadableTitle({ name, availableWidth, onMeasure }: Props) {
  const { fontScale } = useWindowDimensions();
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  const words = normalizedName.split(' ').filter(Boolean);
  const [measurements, setMeasurements] = useState<Record<string, number>>({});
  const widths = words.map(word => measurements[`${fontScale}:${word}`] ?? word.length * 21);
  const layout = layoutServiceTitle(words, widths, availableWidth);
  const rowHeight = Math.ceil(22 * Math.min(1.3, Math.max(1, fontScale)));
  const height = rowHeight * 3;
  useEffect(() => { onMeasure(name, height, 0); }, [height, name, onMeasure]);
  const titleScale = Math.min(1, Math.max(1, availableWidth - 2) / layout.width);
  const content = <View accessible accessibilityLabel={normalizedName}
    style={{ width: availableWidth, height, justifyContent: 'center' }}>
    {layout.rows.map((row, index) => <View key={index}
      style={{ height: rowHeight, flexDirection: 'row', columnGap: 4 * titleScale, justifyContent: 'center', alignItems: 'center' }}>
      {row.map((word, wordIndex) => <Text key={`${wordIndex}:${word}`} accessible={false}
        maxFontSizeMultiplier={1.3} android_hyphenationFrequency="none" textBreakStrategy="simple"
        numberOfLines={1}
        style={[typography, { fontSize: typography.fontSize * titleScale,
          lineHeight: typography.lineHeight * titleScale, flexShrink: 0 }]}>{word}</Text>)}
    </View>)}
  </View>;
  return <View style={{ width: availableWidth, height, alignSelf: 'center' }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', width: 10000, opacity: 0 }}>
      {[...new Set(words)].map(word => <Text key={`${fontScale}:${word}`} accessible={false} maxFontSizeMultiplier={1.3}
        style={[typography, { alignSelf: 'flex-start', flexShrink: 0 }]}
        onLayout={event => {
          const measured = Math.ceil(event.nativeEvent.layout.width) + 2;
          const key = `${fontScale}:${word}`;
          setMeasurements(old => old[key] === measured ? old : { ...old, [key]: measured });
        }}>{word}</Text>)}
    </View>
    {content}
  </View>;
}
