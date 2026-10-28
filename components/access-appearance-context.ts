import {createContext} from 'react';

// Keep context identity outside the component/asset module: Fast Refresh of
// presentation must not leave mounted consumers attached to a previous context.
export const day = { night: false, canvas: '#F1EEE9', surface: 'rgba(255,255,255,0.66)', field: 'rgba(255,255,255,0.54)', border: 'rgba(255,255,255,0.88)', ink: '#262725', muted: '#6D6C68', action: '#343735', actionText: '#FFFFFF', line: '#DAD6CE' };
export const night = { night: true, canvas: '#141719', surface: 'rgba(25,29,32,0.72)', field: 'rgba(255,255,255,0.045)', border: 'rgba(237,230,215,0.18)', ink: '#F1EEE7', muted: '#B2B3AE', action: '#D8C29B', actionText: '#25251F', line: '#494B49' };
export type Palette = typeof day;
export type AppearanceMode = 'day' | 'night' | 'system';
export type AppearanceChangeListener = (mode: AppearanceMode) => void;
export const Appearance = createContext({ palette: day as Palette, mode: 'system' as AppearanceMode, setMode: (_mode: AppearanceMode, _options?: { localOnly?: boolean }) => {}, subscribeModeChanges: (_listener: AppearanceChangeListener): (() => void) => () => {}, toggle: () => {} });
