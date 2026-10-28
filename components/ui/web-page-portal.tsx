import React from 'react';

/** Native: overlays already sit above the navigation, so render in place. */
export function WebPagePortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
