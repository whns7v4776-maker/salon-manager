import React, { useState } from 'react';
import { Platform, ScrollView } from 'react-native';

// Popup message box: on native it takes exactly the height of its text (Yoga used to squeeze it
// to two clipped lines) and only scrolls when the text is longer than `max`.
export function FitMessageScroll({ max = 340, style, onContentSizeChange, ...props }: React.ComponentProps<typeof ScrollView> & { max?: number }) {
  const [height, setHeight] = useState(0);
  if (Platform.OS === 'web') return <ScrollView {...props} style={style} onContentSizeChange={onContentSizeChange} />;
  return <ScrollView {...props}
    style={[style, { flexGrow: 0, flexShrink: 0, minHeight: 0, maxHeight: max }, height ? { height: Math.min(height, max) } : null]}
    scrollEnabled={height > max}
    onContentSizeChange={(w, h) => { setHeight(Math.ceil(h)); onContentSizeChange?.(w, h); }} />;
}
