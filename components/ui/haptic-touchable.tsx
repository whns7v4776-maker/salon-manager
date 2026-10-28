import React from 'react';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  Platform,
  TouchableOpacity,
  type TouchableOpacityProps,
  type GestureResponderEvent,
  type ViewProps,
} from 'react-native';
import { beginStationaryTap, moveStationaryTap, claimStationaryTap, type StationaryTap } from '../../src/lib/stationary-tap';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { haptic, type HapticFeedbackType } from '../../src/lib/haptics';

type OptionalHapticFeedbackType = HapticFeedbackType | 'none';
const AnimatedTouchableOpacity = Animated.createAnimatedComponent(TouchableOpacity);
const HapticTouchableFastRegionContext = React.createContext(false);

export function HapticTouchableFastRegion({
  children,
  enabled = true,
}: React.PropsWithChildren<{ enabled?: boolean }>) {
  return (
    <HapticTouchableFastRegionContext.Provider value={enabled}>
      {children}
    </HapticTouchableFastRegionContext.Provider>
  );
}

const triggerHapticSafely = (type?: OptionalHapticFeedbackType) => {
  if (!type || type === 'none') return;
  const feedback = haptic[type];
  if (typeof feedback !== 'function') return;
  feedback().catch(() => null);
};

type HapticTouchableProps = TouchableOpacityProps & {
  dataSet?: Record<string, string | number | boolean>;
  webHoverLift?: boolean;
  hapticType?: OptionalHapticFeedbackType;
  pressInHapticType?: OptionalHapticFeedbackType;
  longPressHapticType?: OptionalHapticFeedbackType;
  pressScale?: number;
  pressOpacity?: number;
  pressInDuration?: number;
  pressOutDuration?: number;
  suppressWebFocus?: boolean;
  immediatePress?: boolean;
  recoverStationaryTap?: boolean;
  webContextMenuAction?: () => void;
  suppressWebContextMenu?: boolean;
  onTouchStart?: (event: unknown) => void;
  onTouchMove?: (event: unknown) => void;
  onTouchCancel?: (event: unknown) => void;
  onTouchEnd?: (event: unknown) => void;
};

export function HapticTouchable({
  webHoverLift = false,
  hapticType = 'light',
  pressInHapticType,
  longPressHapticType,
  pressScale = 0.98,
  pressOpacity = 0.98,
  pressInDuration = 110,
  pressOutDuration = 150,
  suppressWebFocus = false,
  immediatePress = false,
  recoverStationaryTap = false,
  webContextMenuAction,
  suppressWebContextMenu = false,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  onTouchCancel,
  disabled,
  style,
  ...props
}: HapticTouchableProps) {
  const fastRegion = React.useContext(HapticTouchableFastRegionContext);
  const stationaryTapRef = React.useRef<StationaryTap | null>(null);
  const recoverNativeTap = recoverStationaryTap && Platform.OS !== 'web';
  // Only plain actions: keep event-based buttons, drag/swipe handlers and long
  // presses on their existing responder path.
  const nativeLightTap = Platform.OS === 'ios' && !!onPress && onPress.length === 0 &&
    !onLongPress && !webContextMenuAction && !onTouchStart && !onTouchMove &&
    !onTouchEnd && (!onTouchCancel || onTouchCancel.length === 0) && (!onPressIn || onPressIn.length === 0) &&
    (!onPressOut || onPressOut.length === 0) && !(props as ViewProps).onStartShouldSetResponder &&
    !(props as ViewProps).onMoveShouldSetResponder && !(props as ViewProps).onResponderGrant;
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const longPressTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = React.useRef(false);
  const lastWebContextActionAtRef = React.useRef(0);
  const webTouchableRef = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (Platform.OS !== 'web' || !webHoverLift || typeof document === 'undefined') return;
    const raw = webTouchableRef.current as { getNode?: () => unknown } | null;
    const node = (raw?.getNode ? raw.getNode() : raw) as HTMLElement | null;
    if (!node?.setAttribute) return;
    const styleId = 'salonpro-web-hover-lift';
    if (!document.getElementById(styleId)) {
      const sheet = document.createElement('style');
      sheet.id = styleId;
      sheet.textContent = `
        [data-salon-hover-lift="true"] { transition: filter 160ms ease, box-shadow 160ms ease; }
        @media (hover: hover) and (pointer: fine) {
          [data-salon-hover-lift="true"]:hover { translate: none; filter: brightness(1.025); box-shadow: inset 0 0 0 1000px rgba(155,144,125,.12), inset 0 12px 22px rgba(255,255,255,.12) !important; }
          [data-salon-hover-lift="true"]:active { translate: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-salon-hover-lift="true"] { transition: none; }
          [data-salon-hover-lift="true"]:hover { translate: none; }
        }
      `;
      document.head.appendChild(sheet);
    }
    if (!disabled) node.setAttribute('data-salon-hover-lift', 'true');
    else node.removeAttribute('data-salon-hover-lift');
    return () => node.removeAttribute('data-salon-hover-lift');
  }, [webHoverLift, disabled]);

  const longPressDelay = typeof props.delayLongPress === 'number' ? props.delayLongPress : 500;

  const clearWebLongPressTimer = React.useCallback(() => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  }, []);

  const triggerWebContextAction = React.useCallback(() => {
    if (!webContextMenuAction) return;
    const now = Date.now();
    if (now - lastWebContextActionAtRef.current < 300) return;
    lastWebContextActionAtRef.current = now;
    clearWebLongPressTimer();
    webContextMenuAction();
  }, [clearWebLongPressTimer, webContextMenuAction]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  React.useEffect(() => clearWebLongPressTimer, [clearWebLongPressTimer]);

  React.useEffect(() => {
    if (
      Platform.OS !== 'web' ||
      (!webContextMenuAction && !suppressWebContextMenu)
    ) {
      return;
    }

    const rawNode = webTouchableRef.current as {
      getNode?: () => unknown;
      addEventListener?: (type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => void;
      removeEventListener?: (type: string, listener: EventListener, options?: boolean | EventListenerOptions) => void;
    } | null;
    const resolvedNode =
      typeof rawNode?.getNode === 'function' ? rawNode.getNode() : rawNode;
    const targetNode = resolvedNode as {
      addEventListener?: (type: string, listener: EventListener, options?: boolean | AddEventListenerOptions) => void;
      removeEventListener?: (type: string, listener: EventListener, options?: boolean | EventListenerOptions) => void;
    } | null;

    if (typeof targetNode?.addEventListener !== 'function') {
      return;
    }

    const handleNativeContextMenu = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      if (webContextMenuAction) {
        triggerWebContextAction();
      }
    };

    targetNode.addEventListener('contextmenu', handleNativeContextMenu, true);
    return () => {
      targetNode.removeEventListener?.('contextmenu', handleNativeContextMenu, true);
    };
  }, [suppressWebContextMenu, triggerWebContextAction, webContextMenuAction]);

  const nativeTap = React.useMemo(() => Gesture.Tap()
    .enabled(nativeLightTap && !disabled)
    .maxDistance(12)
    .maxDuration(500)
    .shouldCancelWhenOutside(true)
    .cancelsTouchesInView(false)
    .runOnJS(true)
    .onBegin(() => {
      scale.value = withTiming(pressScale, { duration: 42 });
      opacity.value = withTiming(pressOpacity, { duration: 42 });
      onPressIn?.(undefined as never);
    })
    .onEnd((_event, success) => {
      if (!success || disabled) return;
      // Feedback does not gate the action on a haptics promise or animation.
      triggerHapticSafely(hapticType);
      onPress?.(undefined as never);
    })
    .onFinalize((_event, success) => {
      scale.value = withTiming(1, { duration: 85 });
      opacity.value = withTiming(1, { duration: 85 });
      onPressOut?.(undefined as never);
      if (!success) onTouchCancel?.(undefined);
    }), [nativeLightTap, disabled, scale, opacity, pressScale, pressOpacity, onPressIn, onPressOut, onTouchCancel, onPress, hapticType]);

  const content = (
    <AnimatedTouchableOpacity
      ref={webTouchableRef as never}
      {...props}
      {...(Platform.OS === 'web' ? {
        dataSet: { webClickable: 'true', ...props.dataSet },
        accessibilityRole: props.accessibilityRole ?? (onPress ? 'button' : undefined),
      } : {})}
      onAccessibilityTap={nativeLightTap ? () => {
        if (disabled) return;
        triggerHapticSafely(hapticType);
        onPress?.(undefined as never);
      } : props.onAccessibilityTap}
      disabled={disabled}
      focusable={Platform.OS === 'web' && suppressWebFocus ? false : props.focusable}
      delayPressIn={fastRegion ? 0 : props.delayPressIn}
      activeOpacity={1}
      {...{
        onTouchStart: (event: GestureResponderEvent) => {
          const touch = event.nativeEvent;
          stationaryTapRef.current = !nativeLightTap && recoverNativeTap && !disabled && touch.touches?.length === 1
            ? beginStationaryTap(touch.pageX, touch.pageY, Date.now()) : null;
          onTouchStart?.(event);
        },
        onTouchMove: (event: GestureResponderEvent) => {
          const tap = stationaryTapRef.current;
          if (tap) {
            moveStationaryTap(tap, event.nativeEvent.pageX, event.nativeEvent.pageY);
            if (event.nativeEvent.touches?.length !== 1) tap.moved = true;
          }
          onTouchMove?.(event);
        },
        onTouchCancel: (event: GestureResponderEvent) => {
          if (stationaryTapRef.current) stationaryTapRef.current.moved = true;
          onTouchCancel?.(event);
        },
        onTouchEnd: (event: GestureResponderEvent) => {
          const tap = stationaryTapRef.current;
          if (recoverNativeTap && !disabled && tap) {
            moveStationaryTap(tap, event.nativeEvent.pageX, event.nativeEvent.pageY);
            if (claimStationaryTap(tap, Date.now())) {
              onPress?.(event);
              requestAnimationFrame(() => triggerHapticSafely(hapticType));
            }
          }
          onTouchEnd?.(event);
          // Keep the guard for the native press dispatched with this touch end,
          // then release it so accessibility activation has no stale gesture.
          requestAnimationFrame(() => {
            if (stationaryTapRef.current === tap) stationaryTapRef.current = null;
          });
        },
      }}
      style={[
        Platform.OS === 'web'
          ? (({ cursor: disabled ? 'default' : 'pointer' } as unknown) as TouchableOpacityProps['style'])
          : null,
        // Il cursore di base deve restare un fallback. Le superfici con una
        // semantica più precisa (grab, grabbing, resize...) lo dichiarano nel
        // proprio stile e devono poterlo sovrascrivere.
        style,
        animatedStyle,
      ]}
      onPressIn={(event) => {
        if (nativeLightTap) return;
        // A cancelled long press during a scroll must not swallow the next tap.
        longPressTriggeredRef.current = false;
        const shouldTriggerPressInHaptic =
          !disabled && pressInHapticType && pressInHapticType !== 'none';
        if (shouldTriggerPressInHaptic && !fastRegion) {
          triggerHapticSafely(pressInHapticType);
        }
        scale.value = withTiming(pressScale, {
          duration: fastRegion ? Math.min(pressInDuration, 42) : pressInDuration,
          easing: Easing.out(Easing.quad),
        });
        opacity.value = withTiming(pressOpacity, {
          duration: fastRegion ? Math.min(pressInDuration, 42) : pressInDuration,
          easing: Easing.out(Easing.quad),
        });
        if (Platform.OS === 'web' && !disabled && onLongPress) {
          longPressTriggeredRef.current = false;
          clearWebLongPressTimer();
          longPressTimeoutRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            if (longPressHapticType && longPressHapticType !== 'none') {
              triggerHapticSafely(longPressHapticType);
            }
            onLongPress(event);
          }, longPressDelay);
        }
        onPressIn?.(event);
        if (shouldTriggerPressInHaptic && fastRegion) {
          requestAnimationFrame(() => {
            triggerHapticSafely(pressInHapticType);
          });
        }
      }}
      onPressOut={(event) => {
        if (nativeLightTap) return;
        clearWebLongPressTimer();
        scale.value = withTiming(1, {
          duration: fastRegion ? Math.min(pressOutDuration, 58) : pressOutDuration,
          easing: Easing.out(Easing.cubic),
        });
        opacity.value = withTiming(1, {
          duration: fastRegion ? Math.min(pressOutDuration, 58) : pressOutDuration,
          easing: Easing.out(Easing.cubic),
        });
        onPressOut?.(event);
      }}
      onLongPress={(event) => {
        if (Platform.OS === 'web') {
          return;
        }
        longPressTriggeredRef.current = true;
        if (!disabled && longPressHapticType && longPressHapticType !== 'none') {
          triggerHapticSafely(longPressHapticType);
        }
        onLongPress?.(event);
      }}
      onPress={(event) => {
        if (nativeLightTap) return;
        clearWebLongPressTimer();
        if (recoverNativeTap && stationaryTapRef.current) {
          if (stationaryTapRef.current.handled || stationaryTapRef.current.moved) return;
          stationaryTapRef.current.handled = true;
        }
        if (longPressTriggeredRef.current) {
          longPressTriggeredRef.current = false;
          return;
        }
        if (immediatePress || fastRegion) {
          onPress?.(event);
          if (!disabled && hapticType && hapticType !== 'none') {
            requestAnimationFrame(() => {
              triggerHapticSafely(hapticType);
            });
          }
          return;
        }
        if (!disabled && hapticType && hapticType !== 'none') {
          triggerHapticSafely(hapticType);
        }
        onPress?.(event);
      }}
      {...(Platform.OS === 'web'
        ? ({
            tabIndex: suppressWebFocus ? -1 : undefined,
            onMouseDown: (event: MouseEvent) => {
              if (suppressWebFocus) {
                event.preventDefault?.();
              }
              if (event.button === 2 && (webContextMenuAction || suppressWebContextMenu)) {
                event.preventDefault?.();
                event.stopPropagation?.();
              }
            },
            ...(onLongPress || webContextMenuAction || suppressWebContextMenu
              ? {
            // Safari (in particolare con Magic Mouse/control-click) può
            // risolvere il menu nativo prima della fase bubble. Lo blocchiamo
            // anche in capture, lasciando alla fase bubble l'azione SalonPro.
            onContextMenuCapture: (event: Event) => {
              event.preventDefault?.();
            },
            onMouseLeave: () => {
              clearWebLongPressTimer();
            },
            onContextMenu: (event: Event) => {
              event.preventDefault?.();
              event.stopPropagation?.();
              // `contextmenu` è il segnale affidabile anche su Safari e Magic
              // Mouse, che non garantiscono sempre un precedente mouse-down
              // con button 2. Prima blocchiamo il menu nativo, poi apriamo una
              // sola volta l'azione contestuale SalonPro.
              if (webContextMenuAction) {
                triggerWebContextAction();
              }
            },
              }
              : null),
          } as unknown as TouchableOpacityProps)
        : null)}
    />
  );
  return nativeLightTap ? <GestureDetector gesture={nativeTap}>{content}</GestureDetector> : content;
}
