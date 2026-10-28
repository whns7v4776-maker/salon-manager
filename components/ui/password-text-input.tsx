import { AndroidStablePlaceholderInput } from './android-stable-placeholder-input';
import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useMemo, useState } from 'react';
import { Platform, type StyleProp, StyleSheet, TextInput, type TextInputProps, type TextStyle, View } from 'react-native';
import { HapticNativeTouchableOpacity } from './haptic-native-controls';
import { IosSimpleTouchable as TouchableOpacity } from "./ios-simple-touchable";

export const BIOMETRIC_CREDENTIAL_MASK = '••••••••';

type PasswordTextInputProps = TextInputProps & {
  manualIosEntry?: boolean;
  useNativeIosToggle?: boolean;
  stableAndroidPlaceholder?: boolean;
  visibilityToggleColor?: string;
  visibilityToggleDisabledColor?: string;
  compactHorizontalPadding?: boolean;
  secureValueStyle?: StyleProp<TextStyle>;
};

const numericStyleValue = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

export const PasswordTextInput = forwardRef<TextInput, PasswordTextInputProps>(
  function PasswordTextInput(
    {
      style,
      manualIosEntry = false,
      editable = true,
      useNativeIosToggle = false,
      stableAndroidPlaceholder = false,
      visibilityToggleColor = '#334155',
      visibilityToggleDisabledColor = '#94A3B8',
      compactHorizontalPadding = false,
      secureValueStyle,
      ...props
    },
    ref,
  ) {
    const InputComponent = stableAndroidPlaceholder && Platform.OS === 'android' ? AndroidStablePlaceholderInput : TextInput;
    const ToggleTouchable = useNativeIosToggle && Platform.OS === 'ios' ? HapticNativeTouchableOpacity : TouchableOpacity;
    const [passwordVisible, setPasswordVisible] = useState(false);
    const flattenedStyle = useMemo(() => StyleSheet.flatten(style) ?? {}, [style]);
    const verticalMargin = numericStyleValue(flattenedStyle.marginVertical);
    const toggleTop =
      numericStyleValue(flattenedStyle.marginTop) || verticalMargin;
    const toggleBottom =
      numericStyleValue(flattenedStyle.marginBottom) || verticalMargin;
    const hasSecureValue =
      typeof props.value === 'string'
        ? props.value.length > 0
        : typeof props.defaultValue === 'string' && props.defaultValue.length > 0;

    return (
      <View style={styles.shell}>
        <InputComponent
          {...props}
          {...(manualIosEntry && Platform.OS === 'ios'
            ? { autoComplete: 'off' as const, textContentType: 'none' as const, importantForAutofill: 'no' as const }
            : {})}
          ref={ref}
          editable={editable}
          secureTextEntry={!passwordVisible}
          style={[
            style,
            styles.inputWithToggle,
            compactHorizontalPadding && styles.inputWithToggleCompact,
            !passwordVisible && hasSecureValue && secureValueStyle,
          ]}
        />
        <ToggleTouchable
          accessibilityRole="button"
          accessibilityLabel={
            passwordVisible ? 'Nascondi password' : 'Mostra password'
          }
          accessibilityState={{ disabled: !editable }}
          activeOpacity={0.68}
          disabled={!editable}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => setPasswordVisible((current) => !current)}
          style={[
            styles.toggle,
            {
              top: toggleTop,
              bottom: toggleBottom,
            },
          ]}
        >
          <Ionicons
            name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={
              editable
                ? visibilityToggleColor
                : visibilityToggleDisabledColor
            }
          />
        </ToggleTouchable>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  shell: {
    position: 'relative',
    width: '100%',
    alignSelf: 'stretch',
  },
  inputWithToggle: {
    paddingLeft: 52,
    paddingRight: 52,
  },
  inputWithToggleCompact: {
    paddingLeft: 16,
    paddingRight: 48,
  },
  toggle: {
    position: 'absolute',
    right: 8,
    width: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
