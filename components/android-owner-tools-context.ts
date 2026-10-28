import React from 'react';

export type AndroidOwnerToolsController = {
  openSettings: (from: string) => void;
  openCash: (from: string) => void;
};

export const AndroidOwnerToolsContext =
  React.createContext<AndroidOwnerToolsController | null>(null);

export function useAndroidOwnerTools() {
  return React.useContext(AndroidOwnerToolsContext);
}
