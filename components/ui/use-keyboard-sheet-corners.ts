import { useEffect, useState } from 'react';
import { Keyboard, Platform, type ViewStyle } from 'react-native';

/** Only the exposed lower edge changes; keyboard avoidance and sizing stay with the sheet. */
export function useKeyboardSheetCorners(): ViewStyle | undefined {
  const [raised, setRaised] = useState(() => Platform.OS !== 'web' && Keyboard.isVisible());
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setRaised(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setRaised(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return Platform.OS !== 'web' && raised
    ? { borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' }
    : undefined;
}
