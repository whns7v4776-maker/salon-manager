import { useNavigation } from '@react-navigation/native';
import { useEffect, useRef, type RefObject } from 'react';
import { Platform } from 'react-native';

type Scrollable = {
  scrollTo?: (options: { x?: number; y: number; animated: boolean }) => void;
  scrollToOffset?: (options: { offset: number; animated: boolean }) => void;
} | null | undefined;

const reselectListeners = new Map<string, Set<() => void>>();
const enabled = Platform.OS !== 'web';

export function scrollToTop(target: Scrollable, animated: boolean) {
  if (!target) return;
  if (typeof target.scrollToOffset === 'function') target.scrollToOffset({ offset: 0, animated });
  else target.scrollTo?.({ x: 0, y: 0, animated });
}

/** The owner tab bar calls this when the already active tab is tapped again. */
export function emitTabReselect(routeName: string) {
  reselectListeners.get(routeName)?.forEach((listener) => listener());
}

function useTabReselect(routeName: string, ref: RefObject<Scrollable>) {
  useEffect(() => {
    if (!enabled) return;
    const listener = () => scrollToTop(ref.current, true);
    const listeners = reselectListeners.get(routeName) ?? new Set();
    listeners.add(listener);
    reselectListeners.set(routeName, listeners);
    return () => { listeners.delete(listener); };
  }, [routeName, ref]);
}

/**
 * Owner tabs stay mounted in the pager, so each one kept its scroll position.
 * Leaving a tab rewinds it while hidden; tapping the active tab glides it to the top.
 */
export function useTabScrollReset(ref: RefObject<Scrollable>, routeName: string) {
  const navigation = useNavigation();
  useEffect(() => {
    if (!enabled) return;
    return navigation.addListener('blur', () => scrollToTop(ref.current, false));
  }, [navigation, ref]);
  useTabReselect(routeName, ref);
}

/** Same behaviour for screens that only know whether their tab is active. */
export function useTabScrollResetWhenInactive(ref: RefObject<Scrollable>, routeName: string, active: boolean | undefined) {
  const wasActive = useRef(active);
  useEffect(() => {
    if (enabled && wasActive.current && active === false) scrollToTop(ref.current, false);
    wasActive.current = active;
  }, [active, ref]);
  useTabReselect(routeName, ref);
}
