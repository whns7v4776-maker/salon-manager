import React from 'react';
import { createPortal } from 'react-dom';

/**
 * Web: lift full-screen overlays to the document body so they cover the fixed
 * sidebar, which lives outside the page's stacking context.
 */
export function WebPagePortal({ children }: { children: React.ReactNode }) {
  if (typeof document === 'undefined') return <>{children}</>;
  return createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>{children}</div>, document.body);
}
