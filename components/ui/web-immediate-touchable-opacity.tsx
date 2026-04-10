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
};

const WEB_TOUCHABLE_STYLE = {
  cursor: 'pointer',
  touchAction: 'pan-x pan-y',
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
    onMouseUp?: (event: unknown) => void;
    onPointerUp?: (event: unknown) => void;
    onTouchEnd?: (event: unknown) => void;
  };
  const { onPress, onClick, onMouseDown, onMouseUp, onPointerUp, onTouchEnd, ...restProps } =
    pressableProps;
  const lastTouchEndAtRef = React.useRef(0);
  const lastMouseUpAtRef = React.useRef(0);
  const pointerDownStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = React.useRef(false);

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

  return (
    <WebPressable
      {...restProps}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onMouseUp={(event: unknown) => {
        onMouseUp?.(event);
        if (disabled) return;
        if (pointerMovedRef.current) {
          resetPointerState();
          return;
        }
        lastMouseUpAtRef.current = Date.now();
        handlePress(event);
      }}
      onPointerUp={(event: unknown) => {
        onPointerUp?.(event);
      }}
      onTouchEnd={(event: unknown) => {
        onTouchEnd?.(event);
        lastTouchEndAtRef.current = Date.now();
        if (pointerMovedRef.current) {
          resetPointerState();
          return;
        }
        handlePress(event);
      }}
      onClick={(event: unknown) => {
        onClick?.(event);

        // iOS Safari/WebView often fires a synthetic click after touchend:
        // handle the touch immediately and swallow the trailing click.
        if (Date.now() - lastTouchEndAtRef.current < 700) {
          const maybePreventDefault = (event as { preventDefault?: () => void }).preventDefault;
          maybePreventDefault?.();
          return;
        }

        // Safari desktop can dispatch click after mouseup on custom Pressables.
        if (Date.now() - lastMouseUpAtRef.current < 700) {
          const maybePreventDefault = (event as { preventDefault?: () => void }).preventDefault;
          maybePreventDefault?.();
          return;
        }

        handlePress(event);
      }}
      style={({ pressed }: { pressed: boolean }) =>
        [
          WEB_TOUCHABLE_STYLE as unknown as StyleProp<ViewStyle>,
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
