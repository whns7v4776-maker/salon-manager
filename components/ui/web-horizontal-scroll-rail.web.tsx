import React, { useEffect, useId, useRef, useState } from 'react';
import type { WebHorizontalScrollRailProps } from './web-horizontal-scroll-rail';

type ScrollHost = HTMLElement | { getScrollableNode: () => HTMLElement };

// A separate rail after the viewport. Existing div/ScrollView handlers stay in
// charge of selection, snapping and synchronization with the rest of the page.
export function WebHorizontalScrollRail({ hostRef, label = "Scorri orizzontalmente" }: WebHorizontalScrollRailProps) {
  const generatedId = useId();
  const host = useRef<HTMLElement | null>(null);
  const rail = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ pointerId: number; x: number; offset: number; travel: number } | null>(null);
  const [metrics, setMetrics] = useState({ viewport: 0, content: 0, offset: 0 });
  const [trackWidth, setTrackWidth] = useState(0);
  const [hostId, setHostId] = useState('');
  const max = Math.max(0, metrics.content - metrics.viewport);
  useEffect(() => {
    const raw = hostRef.current as ScrollHost | null;
    const node = raw && 'getScrollableNode' in raw ? raw.getScrollableNode() : raw;
    if (!node?.addEventListener) return;
    host.current = node;
    const previousId = node.id;
    const previousScrollbar = node.style.scrollbarWidth;
    const previousMarker = node.getAttribute('data-horizontal-card-scroll');
    if (!node.id) node.id = `horizontal-card-scroll-${generatedId}`;
    setHostId(node.id);
    node.style.scrollbarWidth = 'none';
    node.setAttribute('data-horizontal-card-scroll', 'true');
    if (!document.getElementById('horizontal-card-scroll-indicators')) {
      const sheet = document.createElement('style');
      sheet.id = 'horizontal-card-scroll-indicators';
      sheet.textContent = '[data-horizontal-card-scroll="true"]::-webkit-scrollbar{display:none;height:0}';
      document.head.appendChild(sheet);
    }
    const read = () => setMetrics(previous => {
      const next = { viewport: node.clientWidth, content: node.scrollWidth, offset: node.scrollLeft };
      return previous.viewport === next.viewport && previous.content === next.content && previous.offset === next.offset ? previous : next;
    });
    const resize = new ResizeObserver(read);
    const observeContent = () => { resize.disconnect(); resize.observe(node); Array.from(node.children).forEach(child => resize.observe(child)); read(); };
    const mutations = new MutationObserver(observeContent);
    mutations.observe(node, { childList: true, subtree: true });
    node.addEventListener('scroll', read, { passive: true });
    observeContent();
    return () => {
      resize.disconnect(); mutations.disconnect(); node.removeEventListener('scroll', read);
      node.style.scrollbarWidth = previousScrollbar;
      if (previousMarker === null) node.removeAttribute('data-horizontal-card-scroll');
      else node.setAttribute('data-horizontal-card-scroll', previousMarker);
      if (!previousId) node.removeAttribute('id');
      host.current = null;
    };
  }, [hostRef, generatedId]);
  useEffect(() => {
    if (!rail.current) return;
    const node = rail.current;
    const read = () => setTrackWidth(node.clientWidth);
    const resize = new ResizeObserver(read); resize.observe(node); read();
    return () => resize.disconnect();
  }, [max > 1]);
  if (max <= 1) return null;
  const thumb = Math.min(trackWidth, Math.max(36, trackWidth * metrics.viewport / Math.max(1, metrics.content)));
  const travel = Math.max(0, trackWidth - thumb);
  const offset = Math.max(0, Math.min(metrics.offset, max));
  const moveTo = (value: number) => { if (host.current) host.current.scrollLeft = Math.max(0, Math.min(value, max)); };
  return <div data-horizontal-rail="true" style={{ flexShrink: 0, width: '100%', boxSizing: 'border-box', paddingTop: 8, paddingBottom: 4 }}>
    <div ref={rail} role="scrollbar" aria-label={label} aria-controls={hostId}
      aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={Math.round(max)} aria-valuenow={Math.round(offset)}
      tabIndex={0} title="Trascina la barra per scorrere"
      style={{ position: 'relative', width: '100%', height: 16, borderRadius: 8, background: '#EDF1F6', cursor: 'grab', touchAction: 'none', userSelect: 'none' }}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault(); event.stopPropagation();
        const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
        const currentLeft = offset / max * travel;
        const next = x >= currentLeft && x <= currentLeft + thumb ? offset : (x - thumb / 2) / Math.max(1, travel) * max;
        const clamped = Math.max(0, Math.min(next, max));
        drag.current = { pointerId: event.pointerId, x: event.clientX, offset: clamped, travel };
        event.currentTarget.setPointerCapture(event.pointerId); moveTo(clamped);
      }}
      onPointerMove={event => {
        if (!drag.current || drag.current.pointerId !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        moveTo(drag.current.offset + (event.clientX - drag.current.x) / Math.max(1, drag.current.travel) * max);
      }}
      onPointerUp={event => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onKeyDown={event => {
        const target = event.key === 'ArrowRight' ? offset + 48 : event.key === 'ArrowLeft' ? offset - 48
          : event.key === 'PageDown' ? offset + metrics.viewport * 0.85 : event.key === 'PageUp' ? offset - metrics.viewport * 0.85
            : event.key === 'Home' ? 0 : event.key === 'End' ? max : null;
        if (target === null) return;
        event.preventDefault(); event.stopPropagation(); moveTo(target);
      }}
    ><div style={{ position: 'absolute', top: 3, left: offset / max * travel, width: thumb, height: 10, borderRadius: 6, background: '#8997A9', pointerEvents: 'none' }} /></div>
  </div>;
}
