import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';

/** Keep fixed desktop navigation outside the pager's clipping ancestors. */
export function OwnerSidebarViewportHost({children}: React.PropsWithChildren) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted && typeof document !== 'undefined'
    ? createPortal(children, document.body)
    : null;
}
