import React, { forwardRef } from 'react';
import { Platform, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

// Keep Android's hint outside the native EditText drawing layer. Focus and
// scroll cannot hide it; the overlay never consumes touches or edits values.
export const AndroidStablePlaceholderInput = forwardRef<TextInput, TextInputProps>((props, ref) => {
  if (Platform.OS !== 'android') return <TextInput {...props} ref={ref} />;
  const s = StyleSheet.flatten(props.style) ?? {};
  const { margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical,
    width, maxWidth, minWidth, alignSelf, ...inputStyle } = s;
  return <View style={{ margin, marginTop, marginBottom, marginLeft, marginRight, marginHorizontal, marginVertical,
    width: width ?? '100%', maxWidth, minWidth, alignSelf, position: 'relative' }}>
    <TextInput {...props} ref={ref} accessibilityLabel={props.accessibilityLabel ?? props.placeholder} placeholder="" style={[inputStyle, { width: '100%' }]} />
    {!props.value && !!props.placeholder && <View pointerEvents="none" accessible={false}
      importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFillObject, { justifyContent: 'center',
        paddingLeft: s.paddingLeft ?? s.paddingHorizontal ?? s.padding ?? 0,
        paddingRight: s.paddingRight ?? s.paddingHorizontal ?? s.padding ?? 0 }]}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} allowFontScaling={props.allowFontScaling} maxFontSizeMultiplier={props.maxFontSizeMultiplier} style={{ color: props.placeholderTextColor ?? '#8f8f8f',
        fontFamily: s.fontFamily, fontSize: s.fontSize, fontWeight: s.fontWeight,
        textAlign: s.textAlign, letterSpacing: s.letterSpacing, includeFontPadding: false }}>{props.placeholder}</Text>
    </View>}
  </View>;
});
AndroidStablePlaceholderInput.displayName = 'AndroidStablePlaceholderInput';
