import React from 'react';
import { useRouter, usePathname } from 'expo-router';
import {
  BackHandler,
  InteractionManager,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import {
  AndroidOwnerToolsContext,
  type AndroidOwnerToolsController,
} from './android-owner-tools-context';

type HostedCashScreen = React.ComponentType<{ onClose?: () => void; active?: boolean }>;

type ActiveOwnerTool = 'cash' | null;

export function AndroidOwnerSettingsHost({
  children,
  prepare = false,
}: React.PropsWithChildren<{ prepare?: boolean }>) {
  const [activeTool, setActiveTool] = React.useState<ActiveOwnerTool>(null);
  const router = useRouter();
  const pathname = usePathname();
  const openingSettingsRef = React.useRef(0);
  React.useEffect(() => { openingSettingsRef.current = 0; }, [pathname]);
  const [CashScreen, setCashScreen] = React.useState<HostedCashScreen | null>(null);
  const [cashPrepared, setCashPrepared] = React.useState(false);
  const activeToolRef = React.useRef<ActiveOwnerTool>(null);
  const cashOverlayRef = React.useRef<View | null>(null);
  const openedAtRef = React.useRef(0);
  const openedFromRef = React.useRef('');

  const revealOverlay = React.useCallback((overlay: View | null) => {
    overlay?.setNativeProps({
      pointerEvents: 'auto',
      style: { opacity: 1, zIndex: 5000, elevation: 5000 },
    });
  }, []);

  const hideOverlay = React.useCallback((overlay: View | null) => {
    overlay?.setNativeProps({
      pointerEvents: 'none',
      style: { opacity: 0, zIndex: -1, elevation: -1 },
    });
  }, []);

  const openSettings = React.useCallback((_from: string) => {
    if (pathname === '/impostazioni') return;
    const now = Date.now();
    if (openingSettingsRef.current && now - openingSettingsRef.current < 1200) return;
    openingSettingsRef.current = now;
    // A real stack entry lets Android's system Back gesture restore the
    // originating owner page, including its selected tab and scroll position.
    try {
      router.push('/impostazioni');
    } catch (error) {
      openingSettingsRef.current = 0;
      throw error;
    }
  }, [pathname, router]);

  React.useEffect(() => {
    if (Platform.OS !== 'android' || !prepare) return;
    const task = InteractionManager.runAfterInteractions(() => {
      // Native-stack preload keeps the screen ready without changing history.
      router.prefetch('/impostazioni');
    });
    return () => task.cancel();
  }, [prepare, router]);

  const openCash = React.useCallback((from: string) => {
    if (activeToolRef.current === 'cash') {
      return;
    }

    activeToolRef.current = 'cash';
    openedAtRef.current = globalThis.performance?.now?.() ?? Date.now();
    openedFromRef.current = from;
    setCashPrepared(true);
    revealOverlay(cashOverlayRef.current);
    setActiveTool('cash');
  }, [revealOverlay]);

  const closeActiveTool = React.useCallback(() => {
    if (activeToolRef.current === 'cash') {
      hideOverlay(cashOverlayRef.current);
    }
    activeToolRef.current = null;
    setActiveTool(null);
  }, [hideOverlay]);

  const controller = React.useMemo<AndroidOwnerToolsController>(
    () => ({ openSettings, openCash }),
    [openCash, openSettings],
  );

  React.useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    // Route modules must not be imported while the web/iOS router is being
    // assembled. Android loads the reusable screens only after its root is
    // mounted, keeping the other platforms on their original route graph.
    const cashModule = require('../app/cassa-screen') as typeof import('../app/cassa-screen');
    setCashScreen(() => React.memo(cashModule.CassaScreen));
  }, []);

  React.useEffect(() => {
    if (
      Platform.OS !== 'android' ||
      !prepare ||
      !CashScreen ||
      cashPrepared
    ) {
      return;
    }

    const timeoutId = setTimeout(() => {
      setCashPrepared(true);
    }, 32);
    return () => clearTimeout(timeoutId);
  }, [CashScreen, cashPrepared, prepare]);

  React.useEffect(() => {
    if (Platform.OS !== 'android' || activeTool === null) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        closeActiveTool();
        return true;
      },
    );
    return () => subscription.remove();
  }, [activeTool, closeActiveTool]);

  React.useLayoutEffect(() => {
    if (Platform.OS !== 'android' || activeTool === null || !__DEV__) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const renderedAt = globalThis.performance?.now?.() ?? Date.now();
      console.warn('[SETTINGS_NAV_PERF]', {
        tool: activeTool,
        from: openedFromRef.current,
        elapsedMs: Math.max(0, Math.round(renderedAt - openedAtRef.current)),
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTool]);

  if (Platform.OS !== 'android') {
    return <>{children}</>;
  }

  return (
    <AndroidOwnerToolsContext.Provider value={controller}>
      {children}
      {cashPrepared && CashScreen ? (
        <View
          ref={cashOverlayRef}
          collapsable={false}
          pointerEvents={activeTool === 'cash' ? 'auto' : 'none'}
          accessible={activeTool === 'cash'}
          accessibilityElementsHidden={activeTool !== 'cash'}
          importantForAccessibility={activeTool === 'cash' ? 'auto' : 'no-hide-descendants'}
          style={[styles.overlay, activeTool !== 'cash' && styles.overlayHidden]}
        >
          <CashScreen
            active={activeTool === 'cash'}
            onClose={closeActiveTool}
          />
        </View>
      ) : null}
    </AndroidOwnerToolsContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5000,
    elevation: 5000,
    backgroundColor: '#F3F6FA',
  },
  overlayHidden: {
    opacity: 0,
    zIndex: -1,
    elevation: -1,
  },
});
