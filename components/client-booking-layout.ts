import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const CLIENT_NAVIGATION_HEIGHT = 58;

/** Shared geometry keeps the dock and customer bar clear of the real safe area and keyboard. */
function useMeasuredClientLayout() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Platform.OS !== 'web' && Keyboard.isVisible());
  const [webHeight, setWebHeight] = useState<number>();
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return;
      const update = () => {
        const visual = window.visualViewport;
        setWebHeight(visual?.height || window.innerHeight);
        setKeyboardVisible(Boolean(visual && window.innerHeight - visual.height > 120));
      };
      update();
      window.addEventListener('resize', update);
      window.visualViewport?.addEventListener('resize', update);
      return () => { window.removeEventListener('resize', update); window.visualViewport?.removeEventListener('resize', update); };
    }
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const desktop = Platform.OS === 'web' && width >= 1000;
  const navigationBottom = Math.max(insets.bottom, 8);
  return { width, height: Platform.OS === 'web' ? webHeight || height : height, insets, desktop, keyboardVisible, navigationBottom,
    navigationSpace: desktop || keyboardVisible ? 8 : CLIENT_NAVIGATION_HEIGHT + navigationBottom + 12 };
}

const ClientLayout = createContext<ReturnType<typeof useMeasuredClientLayout> | null>(null);
export function ClientBookingLayoutProvider({ children }: { children: ReactNode }) {
  const value = useMeasuredClientLayout();
  return React.createElement(ClientLayout.Provider, { value }, children);
}
export function useClientBookingLayout() {
  const layout = useContext(ClientLayout);
  if (!layout) throw new Error('ClientBookingLayoutProvider is required for the customer portal');
  return layout;
}
