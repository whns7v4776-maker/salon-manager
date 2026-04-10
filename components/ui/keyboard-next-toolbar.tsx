import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type KeyboardNextToolbarProps = {
  onNext: () => void;
  label?: string;
};

export function KeyboardNextToolbar({ onNext, label = 'Next' }: KeyboardNextToolbarProps) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates?.height ?? 0);
      setVisible(true);
    });

    const hideSub = Keyboard.addListener(hideEvent, () => {
      setVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const bottomOffset = useMemo(() => {
    if (!visible) return -100;
    return Math.max(12, keyboardHeight + 8);
  }, [keyboardHeight, visible]);

  if (Platform.OS === 'web') return null;

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
