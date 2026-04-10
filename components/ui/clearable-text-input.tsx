import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef } from 'react';
import {
    Platform,
    StyleProp,
    StyleSheet,
    TextInput,
    TextInputProps,
    TextStyle,
    View,
    ViewStyle,
} from 'react-native';
import { HapticTouchable } from './haptic-touchable';

type ClearableTextInputProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
};

const IOS_KEYBOARD_TYPES_WITHOUT_RETURN = new Set<TextInputProps['keyboardType']>([
  'decimal-pad',
  'number-pad',
  'phone-pad',
]);

export const ClearableTextInput = forwardRef<TextInput, ClearableTextInputProps>(
  (
    { containerStyle, style, editable = true, onChangeText, value, submitBehavior, keyboardType, ...props },
    ref
  ) => {
    const hasValue = typeof value === 'string' && value.length > 0;
    const resolvedKeyboardType =
      Platform.OS === 'ios' && IOS_KEYBOARD_TYPES_WITHOUT_RETURN.has(keyboardType)
        ? 'numbers-and-punctuation'
        : keyboardType;

    return (
      <View style={[styles.container, containerStyle]}>
        <TextInput
          ref={ref}
          {...props}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          keyboardType={resolvedKeyboardType}
          submitBehavior={submitBehavior ?? 'submit'}
          style={[
            Platform.OS === 'android' ? styles.androidInputSafety : undefined,
            style as StyleProp<TextStyle>,
            editable && hasValue ? styles.inputPadding : undefined,
          ]}
        />
        {editable && hasValue ? (
          <HapticTouchable
            style={styles.clearButton}
            onPress={() => onChangeText?.('')}
            hapticType="error"
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color="#7f1d1d" />
          </HapticTouchable>
        ) : null}
      </View>
    );
  }
);

ClearableTextInput.displayName = 'ClearableTextInput';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  inputPadding: {
    paddingRight: 42,
  },
  androidInputSafety: {
    includeFontPadding: true,
    textAlignVertical: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  clearButton: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(254, 226, 226, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
});
