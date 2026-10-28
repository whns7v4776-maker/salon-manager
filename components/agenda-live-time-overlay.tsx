import React, { useEffect, useRef } from 'react';
import { AppState, Platform, type StyleProp, type View, type ViewStyle } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { agendaLivePosition } from '../src/lib/agenda-live-position';
import { useWebSleepOffscreen } from './agenda-live-glow';

/** The line advances about 1px every 20s: one update per second is already smooth. */
const LIVE_LINE_TICK_MS = 1000;

export function AgendaLiveTimeOverlay({ clockEpoch, clockMinutes, rows, end, rowStep, gridOffset, enabled, style, children }: {
  clockEpoch: number; clockMinutes: number; rows: number[]; end: number;
  rowStep: number; gridOffset: number; enabled: boolean;
  style: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const top = useSharedValue(agendaLivePosition(clockMinutes, rows, end, rowStep, gridOffset));
  const node = useRef<View>(null);
  const onScreen = useRef(true);
  const reschedule = useRef<() => void>(() => undefined);
  // Scrolling the line out of view puts it (and its CSS sweep) to sleep.
  useWebSleepOffscreen(node, visible => {
    onScreen.current = visible;
    reschedule.current();
  });

  useEffect(() => {
    const place = () => {
      const minutes = clockMinutes + (Date.now() - clockEpoch) / 60000;
      top.value = agendaLivePosition(minutes, rows, end, rowStep, gridOffset);
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    const apply = () => {
      const browserVisible = Platform.OS !== 'web' || typeof document === 'undefined' || (
        document.visibilityState !== 'hidden' &&
        document.documentElement.getAttribute('data-salon-agenda-visible') !== 'false'
      );
      const run = enabled && AppState.currentState === 'active' && browserVisible && onScreen.current;
      if (run && timer === null) {
        place(); // catch up immediately after waking
        timer = setInterval(place, LIVE_LINE_TICK_MS);
      } else if (!run && timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    reschedule.current = apply;
    place();
    apply();
    const appState = AppState.addEventListener('change', apply);
    // Web: react to tab and section changes instead of polling for them.
    let observer: MutationObserver | null = null;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', apply);
      if (typeof MutationObserver !== 'undefined') {
        observer = new MutationObserver(apply);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-salon-agenda-visible'] });
      }
    }
    return () => {
      reschedule.current = () => undefined;
      if (timer !== null) clearInterval(timer);
      appState.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') document.removeEventListener('visibilitychange', apply);
      observer?.disconnect();
    };
  }, [enabled, clockEpoch, clockMinutes, rows, end, rowStep, gridOffset, top]);

  const position = useAnimatedStyle(() => ({ top: 0, transform: [{ translateY: top.value }] }));
  return <Reanimated.View ref={node} pointerEvents="none" style={[style, position]}>{children}</Reanimated.View>;
}
