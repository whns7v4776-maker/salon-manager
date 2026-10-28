import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, Platform, type GestureResponderEvent, type ScrollView, type TextInput } from 'react-native';

/** Only the booking note requests extra keyboard clearance and a reversible scroll. */
export function useNativeBookingNote(scroll: RefObject<ScrollView | null>, scrollY: RefObject<number>) {
  const input = useRef<TextInput | null>(null);
  const origin = useRef<number | null>(null);
  const keyboardTop = useRef<number | null>(null);
  const bounds = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);
  const [clearance, setClearance] = useState(0);
  const reveal = useCallback(() => {
    const node = input.current;
    if (!node || origin.current === null) return;
    node.measureInWindow((x, y, width, height) => {
      if (input.current !== node || origin.current === null) return;
      bounds.current = { x, y, width, height };
      const top = keyboardTop.current;
      if (top === null) return;
      const delta = Math.max(0, y + height - (top - 24));
      if (delta > 1) scroll.current?.scrollTo({ y: scrollY.current + delta, animated: true });
    });
  }, [scroll, scrollY]);
  const restore = useCallback(() => {
    const originalY = origin.current;
    origin.current = null;
    const previousInput = input.current;
    input.current = null;
    previousInput?.blur();
    bounds.current = null;
    keyboardTop.current = null;
    setActive(false);
    setClearance(0);
    if (timer.current) clearTimeout(timer.current);
    // Wait for KeyboardAvoidingView to release its padding before restoring.
    timer.current = setTimeout(() => {
      timer.current = null;
      if (originalY !== null) scroll.current?.scrollTo({ y: originalY, animated: true });
    }, 80);
  }, [scroll]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showNote = (event: import('react-native').KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      if (origin.current === null) return;
      setClearance(event.endCoordinates.height + 32);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { timer.current = null; reveal(); }, 80);
    };
    const show = Keyboard.addListener('keyboardDidShow', showNote);
    const frame = Keyboard.addListener('keyboardDidChangeFrame', showNote);
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      if (origin.current !== null) restore();
      else keyboardTop.current = null;
    });
    return () => { show.remove(); frame.remove(); hide.remove(); if (timer.current) clearTimeout(timer.current); };
  }, [restore, reveal]);
  const onFocus = useCallback((node: TextInput) => {
    if (Platform.OS === 'web') return;
    if (timer.current) clearTimeout(timer.current);
    if (origin.current === null) origin.current = scrollY.current;
    input.current = node;
    setActive(true);
    const metrics = Keyboard.metrics();
    if (metrics) { keyboardTop.current = metrics.screenY; setClearance(metrics.height + 32); }
    reveal();
  }, [reveal, scrollY]);
  const onBlur = useCallback(() => {
    if (Platform.OS === 'web' || origin.current === null) return;
    Keyboard.dismiss();
    if (!Keyboard.isVisible()) restore();
  }, [restore]);
  const onTouchStart = useCallback((event: GestureResponderEvent) => {
    const box = bounds.current;
    if (Platform.OS === 'web' || origin.current === null || !box) return;
    const { pageX, pageY } = event.nativeEvent;
    // Refresh the measurement because scrolling can move the input.
    input.current?.measureInWindow((x, y, width, height) => {
      if (pageX < x || pageX > x + width || pageY < y || pageY > y + height) {
        input.current?.blur();
        Keyboard.dismiss();
      }
    });
  }, []);
  return { active, clearance, onFocus, onBlur, onTouchStart, reveal };
}
