import React, { useEffect } from 'react';
import { AppState, Platform, type StyleProp, type ViewStyle } from 'react-native';
import Reanimated, { useAnimatedStyle, useFrameCallback, useSharedValue } from 'react-native-reanimated';
import { agendaLivePosition } from '../src/lib/agenda-live-position';

export function AgendaLiveTimeOverlay({ clockEpoch, clockMinutes, rows, end, rowStep, gridOffset, enabled, style, children }: {
  clockEpoch: number; clockMinutes: number; rows: number[]; end: number;
  rowStep: number; gridOffset: number; enabled: boolean;
  style: StyleProp<ViewStyle>; children: React.ReactNode;
}) {
  const top = useSharedValue(agendaLivePosition(clockMinutes, rows, end, rowStep, gridOffset));
  const lastFrame = useSharedValue(0);
  // The UI clock moves only this overlay; the agenda does not render each frame.
  const frame = useFrameCallback(info => {
    'worklet';
    if (!enabled || info.timestamp - lastFrame.value < 32) return;
    lastFrame.value = info.timestamp;
    const minutes = clockMinutes + (Date.now() - clockEpoch) / 60000;
    top.value = agendaLivePosition(minutes, rows, end, rowStep, gridOffset);
  }, false);
  useEffect(() => {
    let running: boolean | undefined;
    const applyFrameState = (state = AppState.currentState) => {
      const browserVisible = Platform.OS !== 'web' || typeof document === 'undefined' || (
        document.visibilityState !== 'hidden' &&
        document.documentElement.getAttribute('data-salon-agenda-visible') !== 'false'
      );
      const next = enabled && state === 'active' && browserVisible;
      if (next !== running) { running = next; frame.setActive(next); }
    };
    applyFrameState();
    const subscription = AppState.addEventListener('change', applyFrameState);
    // This callback lives outside the frozen screen render. It therefore also
    // stops a kept-alive web Agenda when another tab becomes visible.
    const visibilityTimer = Platform.OS === 'web' ? setInterval(applyFrameState, 250) : null;
    return () => {
      if (visibilityTimer !== null) clearInterval(visibilityTimer);
      frame.setActive(false);
      subscription.remove();
    };
  }, [enabled, frame]);
  const position = useAnimatedStyle(() => ({ top: 0, transform: [{ translateY: top.value }] }));
  return <Reanimated.View pointerEvents="none" style={[style, position]}>{children}</Reanimated.View>;
}
