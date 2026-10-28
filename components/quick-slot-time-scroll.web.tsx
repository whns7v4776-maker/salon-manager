import React, { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';

// A draggable rail in the picker's existing right gutter, outside the slot
// buttons. It does not depend on the operating system's scrollbar preference.
export const QuickSlotTimeScroll = forwardRef<ScrollView, ScrollViewProps & { railWidth?: number; railLabel?: string; integrated?: boolean }>(function QuickSlotTimeScroll({ style, children, railWidth = 10, railLabel = 'Scorri gli orari', integrated = false, ...props }, forwardedRef) {
  const scroll = useRef<ScrollView>(null);
  const setScrollRef = useCallback((node: ScrollView | null) => {
    scroll.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  }, [forwardedRef]);
  const host = useRef<HTMLElement | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; offset: number; travel: number } | null>(null);
  const id = useId();
  const [metrics, setMetrics] = useState({ height: 0, content: 0, offset: 0 });
  useEffect(() => {
    const node = scroll.current?.getScrollableNode() as HTMLElement | undefined;
    if (!node) return;
    host.current = node;
    const read = () => setMetrics(previous => {
      const next = { height: node.clientHeight, content: node.scrollHeight, offset: node.scrollTop };
      return previous.height === next.height && previous.content === next.content && previous.offset === next.offset ? previous : next;
    });
    const resize = new ResizeObserver(read);
    const observe = () => {
      resize.disconnect(); resize.observe(node);
      Array.from(node.children).forEach(child => resize.observe(child)); read();
    };
    let frame: number | null = null;
    const scheduleRead = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; read(); });
    };
    const mutations = new MutationObserver(observe);
    // ResizeObserver already measures the content wrapper. Deep mutations
    // must not rebuild all observations while scrolling or updating fields.
    mutations.observe(node, { childList: true });
    node.addEventListener('scroll', scheduleRead, { passive: true }); observe();
    return () => { if (frame !== null) cancelAnimationFrame(frame); resize.disconnect(); mutations.disconnect(); node.removeEventListener('scroll', scheduleRead); host.current = null; };
  }, []);
  const max = Math.max(0, metrics.content - metrics.height);
  const trackHeight = Math.max(0, metrics.height - (integrated ? 12 : 0));
  const thumb = Math.min(trackHeight, Math.max(36, trackHeight * metrics.height / Math.max(1, metrics.content)));
  const travel = Math.max(0, trackHeight - thumb);
  const offset = Math.max(0, Math.min(metrics.offset, max));
  const moveTo = (value: number) => { if (host.current) host.current.scrollTop = Math.max(0, Math.min(value, max)); };
  return <View style={[style, { position: 'relative', minHeight: 0, flexShrink: 1 }]}>
    <ScrollView {...props} ref={setScrollRef} nativeID={`quick-slot-times-${id}`}
      style={{ minHeight: 0, flexShrink: 1, marginRight: integrated ? railWidth + 4 : 0 }} showsVerticalScrollIndicator={false}>{children}</ScrollView>
    {max > 1 && <div ref={rail} role="scrollbar" aria-label={railLabel}
      aria-controls={`quick-slot-times-${id}`} aria-orientation="vertical"
      aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(offset)}
      aria-valuetext={offset >= max - 2 ? 'Fine del contenuto' : offset <= 2 ? 'Inizio del contenuto' : undefined}
      tabIndex={0} title="Trascina la barra per scorrere"
      style={{ position: 'absolute', right: integrated ? 0 : -railWidth - 2, top: integrated ? 6 : 0, bottom: integrated ? 6 : 0, width: railWidth, borderRadius: 7,
        background: '#EDF1F6', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const top = offset / max * travel;
        const next = y >= top && y <= top + thumb ? offset : (y - thumb / 2) / Math.max(1, travel) * max;
        const clamped = Math.max(0, Math.min(next, max));
        drag.current = { id: event.pointerId, y: event.clientY, offset: clamped, travel };
        event.currentTarget.setPointerCapture(event.pointerId); moveTo(clamped);
      }}
      onPointerMove={event => {
        if (!drag.current || drag.current.id !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        moveTo(drag.current.offset + (event.clientY - drag.current.y) / Math.max(1, drag.current.travel) * max);
      }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const target = event.key === 'ArrowDown' ? offset + 48 : event.key === 'ArrowUp' ? offset - 48
          : event.key === 'PageDown' ? offset + metrics.height * 0.85 : event.key === 'PageUp' ? offset - metrics.height * 0.85
            : event.key === 'Home' ? 0 : event.key === 'End' ? max : null;
        if (target === null) return;
        event.preventDefault(); event.stopPropagation(); moveTo(target);
      }}>
      <div style={{ position: 'absolute', left: 2, width: railWidth - 4, top: offset / max * travel, height: thumb,
        borderRadius: 4, background: '#8997A9', pointerEvents: 'none' }} />
    </div>}
  </View>;
});
