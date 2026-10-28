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
  keepClearControlMounted?: boolean;
  reserveSymmetricClearSpace?: boolean;
};

const IOS_KEYBOARD_TYPES_WITHOUT_RETURN = new Set<TextInputProps['keyboardType']>([
  'decimal-pad',
  'number-pad',
  'phone-pad',
]);

export const ClearableTextInput = forwardRef<TextInput, ClearableTextInputProps>(
  (
    {
      containerStyle,
      style,
      editable = true,
      onChangeText,
      value,
      submitBehavior,
      keyboardType,
      keepClearControlMounted = false,
      reserveSymmetricClearSpace = false,
      ...props
    },
    ref
  ) => {
    const hasValue = typeof value === 'string' && value.length > 0;
    const clearControlEnabled = editable && hasValue;
    const reservesClearSpace = keepClearControlMounted || clearControlEnabled;
    const rendersClearControl = keepClearControlMounted || clearControlEnabled;
    const flattenedStyle = StyleSheet.flatten(style as StyleProp<TextStyle | ViewStyle>) ?? {};
    const containerLayoutStyle: StyleProp<ViewStyle> = {
      width: (flattenedStyle as ViewStyle).width,
      maxWidth: (flattenedStyle as ViewStyle).maxWidth,
      minWidth: (flattenedStyle as ViewStyle).minWidth,
      alignSelf: (flattenedStyle as ViewStyle).alignSelf,
      margin: (flattenedStyle as ViewStyle).margin,
      marginTop: (flattenedStyle as ViewStyle).marginTop,
      marginBottom: (flattenedStyle as ViewStyle).marginBottom,
      marginLeft: (flattenedStyle as ViewStyle).marginLeft,
      marginRight: (flattenedStyle as ViewStyle).marginRight,
      marginHorizontal: (flattenedStyle as ViewStyle).marginHorizontal,
      marginVertical: (flattenedStyle as ViewStyle).marginVertical,
      flexBasis: (flattenedStyle as ViewStyle).flexBasis,
      flexGrow: (flattenedStyle as ViewStyle).flexGrow,
      flexShrink: (flattenedStyle as ViewStyle).flexShrink,
      flex: (flattenedStyle as ViewStyle).flex,
    };
    const resolvedKeyboardType =
      Platform.OS === 'ios' && IOS_KEYBOARD_TYPES_WITHOUT_RETURN.has(keyboardType)
        ? 'numbers-and-punctuation'
        : keyboardType;

    return (
      <View
        style={[
          styles.container,
          Platform.OS === 'web' ? styles.webContainer : null,
          containerLayoutStyle,
          containerStyle,
        ]}
      >
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
            // Outer spacing belongs to the wrapper, not the input: otherwise
            // the clear control is centered over the field plus its margins.
            styles.inputWithoutOuterMargins,
            reservesClearSpace ? styles.inputPadding : undefined,
            reservesClearSpace && reserveSymmetricClearSpace
              ? styles.inputPaddingSymmetric
              : undefined,
          ]}
        />
        {rendersClearControl ? (
          <View
            pointerEvents={clearControlEnabled ? 'box-none' : 'none'}
            style={[
              styles.clearButtonSlot,
              !hasValue && styles.clearButtonSlotHidden,
            ]}
            accessibilityElementsHidden={!clearControlEnabled}
            importantForAccessibility={
              clearControlEnabled ? 'auto' : 'no-hide-descendants'
            }
          >
            <HapticTouchable
              style={styles.clearButton}
              onPress={() => onChangeText?.('')}
              disabled={!clearControlEnabled}
              accessibilityRole="button"
              accessibilityLabel="Svuota campo"
              hapticType="error"
              activeOpacity={0.85}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-outline" size={16} color={(flattenedStyle as TextStyle).color || '#777B77'} style={styles.clearIcon} />
            </HapticTouchable>
          </View>
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
  webContainer: {
    alignSelf: 'center',
  },
  inputPadding: {
    paddingRight:
      Platform.OS === 'android' ? 56 : Platform.OS === 'web' ? 58 : 52,
  },
  inputWithoutOuterMargins: {
    margin: 0,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    marginHorizontal: 0,
    marginVertical: 0,
  },
  inputPaddingSymmetric: {
    paddingLeft:
      Platform.OS === 'android' ? 56 : Platform.OS === 'web' ? 58 : 52,
  },
  clearButtonSlot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 8,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  clearButtonSlotHidden: {
    opacity: 0,
  },
  androidInputSafety: {
    includeFontPadding: true,
    textAlignVertical: 'center',
    paddingTop: 12,
    paddingBottom: 12,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#923C50',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  clearIcon: {
    width: 16,
    height: 16,
    lineHeight: 16,
    textAlign: 'center',
    includeFontPadding: false,
  },
});
