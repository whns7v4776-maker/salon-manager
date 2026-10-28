import React, { useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAccessAppearance } from '../access-premium';

/** Pixels a web sheet must travel down before release closes it. */
const CLOSE_DISTANCE = 90;

/**
 * Web counterpart of the native sheet handle: drag the grabber down to close.
 * Sheets that do not receive onClose on web fall back to Escape, which every
 * web Modal already maps to its own close action.
 */
export function useWebSheetDrag(onClose?: () => void, disabled = false) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(0);
  const offsetRef = useRef(0);
  const close = () => {
    if (onClose) return onClose();
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true } as KeyboardEventInit);
      document.dispatchEvent(event);
      window.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27 } as KeyboardEventInit));
    }
  };
  const handlers = Platform.OS !== 'web' || disabled ? {} : {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      startRef.current = event.clientY;
      offsetRef.current = 0;
      setDragging(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      offsetRef.current = Math.max(0, event.clientY - startRef.current);
      setOffset(offsetRef.current);
    },
    onPointerUp: () => {
      setDragging(false);
      const shouldClose = offsetRef.current > CLOSE_DISTANCE;
      offsetRef.current = 0;
      setOffset(0);
      if (shouldClose) close();
    },
    onPointerCancel: () => {
      setDragging(false);
      offsetRef.current = 0;
      setOffset(0);
    },
  };
  const sheetStyle = Platform.OS === 'web'
    ? ({ transform: [{ translateY: offset }], transition: dragging ? 'none' : 'transform 200ms cubic-bezier(.2,.8,.2,1)' } as object)
    : {};
  return { handlers, sheetStyle };
}

export function WebSheetGrabber({ handlers }: { handlers: ReturnType<typeof useWebSheetDrag>['handlers'] }) {
  const { palette: p } = useAccessAppearance();
  if (Platform.OS !== 'web') return null;
  return React.createElement(
    'div',
    {
      ...handlers,
      role: 'presentation',
      title: 'Trascina in basso per chiudere',
      style: { position: 'sticky', top: 0, zIndex: 5, alignSelf: 'stretch', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 26, marginBottom: 2, cursor: 'grab', touchAction: 'none', flexShrink: 0 },
    },
    React.createElement('div', { style: { width: 34, height: 4, borderRadius: 2, backgroundColor: p.muted, opacity: 0.55 } }),
  );
}
