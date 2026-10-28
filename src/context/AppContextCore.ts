import { createContext, useContext } from 'react';
import type { AppContextType } from './AppContext';

// Keep the context identity independent of state-module and copy refreshes.
export const AppContext = createContext<AppContextType | undefined>(undefined);

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext deve essere usato dentro AppProvider');
  }
  return context;
}
