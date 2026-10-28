import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Dimensions, Keyboard, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { IosSimpleTouchable as TouchableOpacity } from "./ios-simple-touchable";

type KeyboardNextToolbarProps = {
  onNext: () => void;
  label?: string;
  shouldShow?: (focusedInput: TextInput | null) => boolean;
  /** 'keyboard' (default): rely on the keyboard's return key, draw nothing. 'floating': the legacy pill. */
  appearance?: 'keyboard' | 'floating';
};

const MIN_KEYBOARD_HEIGHT = 80;

const getFocusedInput = () => {
  const state = TextInput.State as unknown as {
    currentlyFocusedInput?: () => TextInput | null;
  };

  return state.currentlyFocusedInput?.() ?? null;
};

export function KeyboardNextToolbar({
  onNext,
  label = 'Next',
  shouldShow,
  appearance = 'keyboard',
}: KeyboardNextToolbarProps) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  const canShowForCurrentFocus = useCallback(() => {
    const focusedInput = getFocusedInput();
    return Boolean(focusedInput) && (shouldShow ? shouldShow(focusedInput) : true);
  }, [shouldShow]);

  const hideToolbar = useCallback(() => {
    setVisible(false);
    setKeyboardHeight(0);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      const nextHeight = event.endCoordinates?.height ?? 0;
      const screenHeight = Dimensions.get('screen').height;
      const keyboardLooksClosed =
        nextHeight < MIN_KEYBOARD_HEIGHT ||
        (event.endCoordinates?.screenY ?? screenHeight) >= screenHeight - 2;

      if (keyboardLooksClosed || !canShowForCurrentFocus()) {
        hideToolbar();
        return;
      }

      setKeyboardHeight(nextHeight);
      setVisible(true);
    });

    const changeSub =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillChangeFrame', (event) => {
            const nextHeight = event.endCoordinates?.height ?? 0;
            const screenHeight = Dimensions.get('screen').height;
            const keyboardLooksClosed =
              nextHeight < MIN_KEYBOARD_HEIGHT ||
              (event.endCoordinates?.screenY ?? screenHeight) >= screenHeight - 2;

            if (keyboardLooksClosed || !canShowForCurrentFocus()) {
              hideToolbar();
              return;
            }

            setKeyboardHeight(nextHeight);
            setVisible(true);
          })
        : null;

    const hideWillSub =
      Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillHide', hideToolbar) : null;
    const hideDidSub = Keyboard.addListener('keyboardDidHide', hideToolbar);

    return () => {
      showSub.remove();
      changeSub?.remove();
      hideWillSub?.remove();
      hideDidSub.remove();
    };
  }, [canShowForCurrentFocus, hideToolbar]);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;

    const guard = setInterval(() => {
      if (keyboardHeight < MIN_KEYBOARD_HEIGHT || !canShowForCurrentFocus()) {
        hideToolbar();
      }
    }, 250);

    return () => clearInterval(guard);
  }, [canShowForCurrentFocus, hideToolbar, keyboardHeight, visible]);

  const bottomOffset = useMemo(() => {
    if (!visible) return -100;
    return Math.max(12, keyboardHeight + 8);
  }, [keyboardHeight, visible]);

  if (Platform.OS === 'web' || !visible) return null;

  // Back office: the keyboard's own return key already reads "next" and moves to the next field,
  // so nothing is drawn over the keyboard.
  if (appearance === 'keyboard') return null;



  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <View style={[styles.wrap, { bottom: bottomOffset }]}>
        <TouchableOpacity style={styles.button} onPress={onNext} activeOpacity={0.9}>
          <Text style={styles.text}>{label}</Text>
          <Ionicons name="arrow-forward" size={14} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  wrap: {
    position: 'absolute',
    right: 10,
  },
  button: {
    minHeight: 36,
    borderRadius: 999,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#020617',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
});
