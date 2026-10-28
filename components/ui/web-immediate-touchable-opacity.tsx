import React from 'react';
import {
    Platform,
    Pressable,
    type PressableProps,
    type StyleProp,
    type TouchableOpacityProps,
    type GestureResponderEvent,
    type ViewStyle,
} from 'react-native';
import { HapticTouchable } from './haptic-touchable';

type WebImmediateTouchableOpacityProps = TouchableOpacityProps & {
  onTouchStart?: (event: GestureResponderEvent) => void;
  children?: React.ReactNode;
  androidNativePressable?: boolean;
  webTouchAction?: 'auto' | 'manipulation' | 'pan-x' | 'pan-y' | 'none';
};

// `pan-x pan-y` claims both axes and can block horizontal scrolling of an ancestor
// ScrollView on web; `manipulation` keeps taps responsive without stealing pan gestures.
const WEB_TOUCHABLE_STYLE = {
  cursor: 'pointer',
  touchAction: 'manipulation',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTapHighlightColor: 'transparent',
} as const;
const WebPressable = Pressable as unknown as React.ComponentType<Record<string, unknown>>;

export function WebImmediateTouchableOpacity({
  activeOpacity = 0.9,
  style,
  disabled,
  children,
  webTouchAction = 'manipulation',
  androidNativePressable = false,
  ...props
}: WebImmediateTouchableOpacityProps) {
  if (Platform.OS === 'android' && androidNativePressable) {
    return <Pressable {...(props as PressableProps)} disabled={disabled}
      style={({ pressed }) => [style, pressed && { opacity: activeOpacity }]}>
      {children}
    </Pressable>;
  }
  if (Platform.OS !== 'web') {
    return (
      // Stesso responder del TouchableOpacity, con micro-pressione sul thread
      // UI. Feedback al tap riconosciuto su entrambe le app; il dispatcher
      // elimina i duplicati del chiamante senza attendere la vibrazione.
      <HapticTouchable
        activeOpacity={1}
        pressScale={0.985}
        pressOpacity={activeOpacity}
        pressInDuration={45}
        pressOutDuration={75}
        hapticType="light"
        pressInHapticType="none"
        style={style}
        disabled={disabled}
        {...props}
        onTouchStart={props.onTouchStart ? event => props.onTouchStart?.(event as GestureResponderEvent) : undefined}
      >
        {children}
      </HapticTouchable>
    );
  }

  const pressableProps = props as PressableProps & {
    onClick?: (event: unknown) => void;
    onMouseDown?: (event: unknown) => void;
    onMouseDownCapture?: (event: unknown) => void;
    onPointerDown?: (event: unknown) => void;
    onPointerDownCapture?: (event: unknown) => void;
    onTouchStart?: (event: unknown) => void;
    onTouchStartCapture?: (event: unknown) => void;
    onClickCapture?: (event: unknown) => void;
  };
  const {
    onPress,
    onClick,
    onMouseDown,
    onMouseDownCapture,
    onPointerDown,
    onPointerDownCapture,
    onTouchStart,
    onTouchStartCapture,
    onClickCapture,
    ...restProps
  } = pressableProps;

  const handlePress = (event: unknown) => {
    if (disabled) return;
    onPress?.(event as never);
  };

  const preventBrowserFocusScroll = (event: unknown) => {
    if (disabled) return;
    const maybeEvent = event as {
      preventDefault?: () => void;
      stopPropagation?: () => void;
    };
    maybeEvent.preventDefault?.();
  };

  return (
    <WebPressable
      {...restProps}
      dataSet={{ webClickable: 'true', ...(restProps as unknown as { dataSet?: Record<string, string> }).dataSet }}
      accessibilityRole={restProps.accessibilityRole ?? 'button'}
      data-salon-press-feedback="true"
      disabled={disabled}
      focusable={false}
      tabIndex={-1}
      onPress={handlePress}
      onMouseDownCapture={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onMouseDownCapture?.(event);
      }}
      onMouseDown={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onMouseDown?.(event);
      }}
      onPointerDownCapture={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onPointerDownCapture?.(event);
      }}
      onPointerDown={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onPointerDown?.(event);
      }}
      onTouchStartCapture={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onTouchStartCapture?.(event);
      }}
      onTouchStart={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onTouchStart?.(event);
      }}
      onClickCapture={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onClickCapture?.(event);
      }}
      onClick={(event: unknown) => {
        preventBrowserFocusScroll(event);
        onClick?.(event);
      }}
      style={({ pressed }: { pressed: boolean }) =>
        [
          {
            ...(WEB_TOUCHABLE_STYLE as unknown as ViewStyle),
            touchAction: webTouchAction,
          } as unknown as StyleProp<ViewStyle>,
          style,
          pressed && !disabled ? ({ opacity: activeOpacity } as ViewStyle) : null,
          disabled ? ({ cursor: 'default' } as unknown as ViewStyle) : null,
        ] as StyleProp<ViewStyle>
      }
    >
      {children}
    </WebPressable>
  );
}
