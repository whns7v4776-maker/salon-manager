import React, { createContext, useContext } from 'react';

type TabSwipeLockContextValue = {
  disableParentSwipe: boolean;
  setDisableParentSwipe: (value: boolean) => void;
  isAndroidTabSwipeLocked: boolean;
  setIsAndroidTabSwipeLocked: (value: boolean) => void;
};

const TabSwipeLockContext = createContext<TabSwipeLockContextValue | null>(null);

export function TabSwipeLockProvider({
  value,
  children,
}: {
  value: TabSwipeLockContextValue;
  children: React.ReactNode;
}) {
  return <TabSwipeLockContext.Provider value={value}>{children}</TabSwipeLockContext.Provider>;
}

export function useTabSwipeLock() {
  const context = useContext(TabSwipeLockContext);

  if (!context) {
    return {
      disableParentSwipe: false,
      setDisableParentSwipe: (_value: boolean) => undefined,
      isAndroidTabSwipeLocked: false,
      setIsAndroidTabSwipeLocked: (_value: boolean) => undefined,
    };
  }

  return context;
}
