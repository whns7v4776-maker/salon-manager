import React from 'react';
import {
    TouchableOpacity as NativeTouchableOpacity,
    Platform,
    Pressable,
    type PressableProps,
    type StyleProp,
    type TouchableOpacityProps,
    type ViewStyle,
} from 'react-native';

type WebImmediateTouchableOpacityProps = TouchableOpacityProps & {
  children?: React.ReactNode;
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
  ...props
}: WebImmediateTouchableOpacityProps) {
  if (Platform.OS !== 'web') {
    return (
      <NativeTouchableOpacity activeOpacity={activeOpacity} style={style} disabled={disabled} {...props}>
        {children}
      </NativeTouchableOpacity>
    );
  }

  const pressableProps = props as PressableProps & {
    onClick?: (event: unknown) => void;
    onMouseDown?: (event: unknown) => void;
    onPointerCancel?: (event: unknown) => void;
  };
  const { onPress, onClick, onMouseDown, onPointerCancel, ...restProps } =
    pressableProps;
  const pointerDownStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = React.useRef(false);
  const suppressClickUntilRef = React.useRef(0);

  const resetPointerState = () => {
    pointerDownStartRef.current = null;
    pointerMovedRef.current = false;
  };

  const handlePress = (event: unknown) => {
    if (disabled) return;
    onPress?.(event as never);
  };

  const handlePointerDown = (event: unknown) => {
    onMouseDown?.(event);
    const mouseEvent = event as { clientX?: number; clientY?: number; touches?: Array<{ clientX: number; clientY: number }> };
    const x = mouseEvent.clientX ?? mouseEvent.touches?.[0]?.clientX;
    const y = mouseEvent.clientY ?? mouseEvent.touches?.[0]?.clientY;
    if (typeof x === 'number' && typeof y === 'number') {
      pointerDownStartRef.current = { x, y };
      pointerMovedRef.current = false;
    } else {
      resetPointerState();
    }
  };

  const handlePointerMove = (event: unknown) => {
    const start = pointerDownStartRef.current;
    if (!start) return;
    const mouseEvent = event as { clientX?: number; clientY?: number; touches?: Array<{ clientX: number; clientY: number }> };
    const x = mouseEvent.clientX ?? mouseEvent.touches?.[0]?.clientX;
    const y = mouseEvent.clientY ?? mouseEvent.touches?.[0]?.clientY;
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (Math.abs(x - start.x) > 8 || Math.abs(y - start.y) > 8) {
      pointerMovedRef.current = true;
    }
  };

  const handlePointerUp = (event: unknown) => {
    const pointerEvent = event as { pointerType?: string };
    const pointerType = pointerEvent.pointerType ?? '';
    if ((pointerType === 'touch' || pointerType === 'pen' || pointerType === 'mouse') && !pointerMovedRef.current) {
      suppressClickUntilRef.current = Date.now() + 500;
      handlePress(event);
    }
    resetPointerState();
  };

  return (
    <WebPressable
      {...restProps}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={(event: unknown) => {
        onPointerCancel?.(event);
        resetPointerState();
      }}
      onClick={(event: unknown) => {
        onClick?.(event);
        if (Date.now() < suppressClickUntilRef.current) {
          resetPointerState();
          return;
        }
        if (pointerMovedRef.current) {
          resetPointerState();
          return;
        }

        handlePress(event);
        resetPointerState();
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
