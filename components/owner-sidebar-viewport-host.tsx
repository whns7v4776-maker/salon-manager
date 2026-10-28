import React from 'react';

/** Native fallback: the desktop sidebar is only rendered on web. */
export function OwnerSidebarViewportHost({children}: React.PropsWithChildren) {
  return <>{children}</>;
}
