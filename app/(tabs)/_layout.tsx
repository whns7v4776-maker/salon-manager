import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBarProps,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { ParamListBase, TabActions, TabNavigationState } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeIn,
  interpolate,
  runOnJS,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useAppContext } from '../../src/context/AppContext';
import { TabSwipeLockProvider } from '../../src/context/TabSwipeLockContext';
import { tApp } from '../../src/lib/i18n';
import { SALON_MODULES, SalonModuleKey } from '../../src/lib/salon-modules';

const MaterialTopTabs = createMaterialTopTabNavigator();

const ExpoRouterMaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof MaterialTopTabs.Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(MaterialTopTabs.Navigator);

const IS_ANDROID = Platform.OS === 'android';
const TAB_BAR_OUTER_BOTTOM_IOS = 26;
const ANDROID_TAB_BAR_EXTRA_LIFT = 15;
const ANDROID_TEXT_BREATHING_ROOM = IS_ANDROID ? 8 : 0;

type TabBarItemVisualProps = {
  index: number;
  isPressed: boolean;
  label: string;
  activeIconName: React.ComponentProps<typeof Ionicons>['name'];
  inactiveIconName: React.ComponentProps<typeof Ionicons>['name'];
  tabIconSize: number;
  tabLabelFontSize: number;
  tabLabelMinScale: number;
  badgeCount?: number;
  pagerPositionSV: SharedValue<number>;
  isBarDraggingSV: SharedValue<number>;
  previewIndexSV: SharedValue<number>;
};

function TabBarItemVisual({
  index,
  isPressed,
  label,
  activeIconName,
  inactiveIconName,
  tabIconSize,
  tabLabelFontSize,
  tabLabelMinScale,
  badgeCount = 0,
  pagerPositionSV,
  isBarDraggingSV,
  previewIndexSV,
}: TabBarItemVisualProps) {
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    pressScale.value = withSpring(isPressed ? 0.985 : 1, {
      stiffness: 700,
      damping: 32,
      mass: 0.45,
      overshootClamping: true,
    });
  }, [isPressed, pressScale]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.value }],
  }));

  const activeLayerStyle = useAnimatedStyle(() => {
    const progress = isBarDraggingSV.value
      ? previewIndexSV.value === index
        ? 1
        : 0
      : interpolate(
          pagerPositionSV.value,
          [index - 1, index, index + 1],
          [0, 1, 0],
          Extrapolation.CLAMP
        );

    return {
      opacity: progress,
      transform: [{ scale: 1.03 }],
    };
  });

  const inactiveLayerStyle = useAnimatedStyle(() => {
    const progress = isBarDraggingSV.value
      ? previewIndexSV.value === index
        ? 0
        : 1
      : interpolate(
          pagerPositionSV.value,
          [index - 1, index, index + 1],
          [1, 0, 1],
          Extrapolation.CLAMP
        );

    return {
      opacity: progress,
    };
  });

  return (
    <View style={styles.tabBarItemInner}>
      <Animated.View style={[styles.tabBarItemContent, contentAnimatedStyle]}>
        <View style={styles.tabBarIconStack}>
          <Animated.View style={[styles.tabBarIconLayer, inactiveLayerStyle]}>
            <Ionicons
              name={inactiveIconName}
              size={tabIconSize}
              color="#C0CADB"
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.tabBarIconLayer,
              styles.tabBarIconLayerAbsolute,
              activeLayerStyle,
            ]}
          >
            <Ionicons
              name={activeIconName}
              size={tabIconSize}
              color="#FFFFFF"
            />
          </Animated.View>
        </View>

        {badgeCount > 0 ? (
          <Animated.View entering={FadeIn.duration(140)} style={styles.notificationBadge}>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={styles.notificationBadgeText}
            >
              {badgeCount > 99 ? '99+' : badgeCount}
            </Text>
          </Animated.View>
        ) : null}

        <View style={styles.tabBarLabelStack}>
          <Animated.View style={[styles.tabBarLabelLayer, inactiveLayerStyle]}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={tabLabelMinScale}
              style={[
                styles.tabBarLabel,
                { fontSize: tabLabelFontSize },
                styles.tabBarLabelInactive,
              ]}
            >
              {label}
            </Text>
          </Animated.View>

          <Animated.View
            style={[
              styles.tabBarLabelLayer,
              styles.tabBarLabelLayerAbsolute,
              activeLayerStyle,
            ]}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={tabLabelMinScale}
              style={[
                styles.tabBarLabel,
                { fontSize: tabLabelFontSize },
                styles.tabBarLabelActive,
              ]}
            >
              {label}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

function BottomTabBar({
  state,
  descriptors,
  navigation,
  position,
}: MaterialTopTabBarProps) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const { richiestePrenotazione, clienti, appLanguage, salonAccountEmail } = useAppContext();

  const [viewedRequestIds, setViewedRequestIds] = React.useState<string[]>([]);
  const [hasLoadedViewedRequestIds, setHasLoadedViewedRequestIds] = React.useState(false);
  const [viewedClientIds, setViewedClientIds] = React.useState<string[]>([]);
  const [viewedClientKeys, setViewedClientKeys] = React.useState<string[]>([]);
  const [hasLoadedViewedClientIds, setHasLoadedViewedClientIds] = React.useState(false);
  const [pressedTabKey, setPressedTabKey] = React.useState<string | null>(null);
  const [isBarDraggingJS, setIsBarDraggingJS] = React.useState(false);
  const dragPressLockRef = React.useRef(false);
  const dragPressUnlockTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildClientViewKey = React.useCallback(
    (item: (typeof clienti)[number]) => {
      const normalizedEmail = (item.email ?? '').trim().toLowerCase();
      if (normalizedEmail) return `email:${normalizedEmail}`;

      const normalizedPhone = (item.telefono ?? '').replace(/\D+/g, '');
      if (normalizedPhone) return `phone:${normalizedPhone}`;

      const normalizedName = (item.nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (normalizedName) return `name:${normalizedName}`;

      return `id:${item.id}`;
    },
    []
  );

  React.useEffect(() => {
    let cancelled = false;
    setHasLoadedViewedRequestIds(false);

    const loadViewedRequestIds = async () => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail) {
        if (!cancelled) {
          setViewedRequestIds([]);
          setHasLoadedViewedRequestIds(true);
        }
        return;
      }

      const storageKey = `salon_manager_viewed_request_ids__${normalizedEmail}`;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const nextIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];

        if (!cancelled) {
          setViewedRequestIds(nextIds);
          setHasLoadedViewedRequestIds(true);
        }
      } catch {
        if (!cancelled) {
          setViewedRequestIds([]);
          setHasLoadedViewedRequestIds(true);
        }
      }
    };

    void loadViewedRequestIds();

    return () => {
      cancelled = true;
    };
  }, [salonAccountEmail]);

  React.useEffect(() => {
    let cancelled = false;
    setHasLoadedViewedClientIds(false);

    const loadViewedClientIds = async () => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail) {
        if (!cancelled) {
          setViewedClientIds([]);
          setViewedClientKeys([]);
          setHasLoadedViewedClientIds(true);
        }
        return;
      }

      const storageKey = `salon_manager_viewed_client_ids__${normalizedEmail}`;
      const storageKeyByFields = `salon_manager_viewed_client_keys__${normalizedEmail}`;

      try {
        const [raw, rawByFields] = await Promise.all([
          AsyncStorage.getItem(storageKey),
          AsyncStorage.getItem(storageKeyByFields),
        ]);

        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const parsedByFields = rawByFields ? (JSON.parse(rawByFields) as unknown) : [];

        const nextIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];

        const nextKeys = Array.isArray(parsedByFields)
          ? parsedByFields.filter((item): item is string => typeof item === 'string')
          : [];

        if (!cancelled) {
          setViewedClientIds(nextIds);
          setViewedClientKeys(nextKeys);
          setHasLoadedViewedClientIds(true);
        }
      } catch {
        if (!cancelled) {
          setViewedClientIds([]);
          setViewedClientKeys([]);
          setHasLoadedViewedClientIds(true);
        }
      }
    };

    void loadViewedClientIds();

    return () => {
      cancelled = true;
    };
  }, [salonAccountEmail]);

  React.useEffect(() => {
    let cancelled = false;

    const hasPotentialUnread = richiestePrenotazione.some(
      (item) =>
        (item.origine ?? 'frontend') === 'frontend' &&
        (item.stato === 'In attesa' || item.stato === 'Annullata')
    );

    if (!hasPotentialUnread) return;

    const loadViewedRequestIds = async () => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail) return;

      const storageKey = `salon_manager_viewed_request_ids__${normalizedEmail}`;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const nextIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];

        if (!cancelled) {
          setViewedRequestIds(nextIds);
        }
      } catch {
        // noop
      }
    };

    void loadViewedRequestIds();

    return () => {
      cancelled = true;
    };
  }, [richiestePrenotazione, salonAccountEmail]);

  React.useEffect(() => {
    let cancelled = false;

    const hasPotentialUnreadClients = clienti.some(
      (item) => item.fonte === 'frontend' && item.viewedBySalon !== true
    );

    if (!hasPotentialUnreadClients) return;

    const loadViewedClientIds = async () => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail) return;

      const storageKey = `salon_manager_viewed_client_ids__${normalizedEmail}`;
      const storageKeyByFields = `salon_manager_viewed_client_keys__${normalizedEmail}`;

      try {
        const [raw, rawByFields] = await Promise.all([
          AsyncStorage.getItem(storageKey),
          AsyncStorage.getItem(storageKeyByFields),
        ]);

        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const parsedByFields = rawByFields ? (JSON.parse(rawByFields) as unknown) : [];

        const nextIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];

        const nextKeys = Array.isArray(parsedByFields)
          ? parsedByFields.filter((item): item is string => typeof item === 'string')
          : [];

        if (!cancelled) {
          setViewedClientIds(nextIds);
          setViewedClientKeys(nextKeys);
        }
      } catch {
        // noop
      }
    };

    void loadViewedClientIds();

    return () => {
      cancelled = true;
    };
  }, [clienti, salonAccountEmail]);

  const richiesteInAttesa = React.useMemo(() => {
    if (!hasLoadedViewedRequestIds) {
      return 0;
    }

    return richiestePrenotazione.filter(
      (item) =>
        (item.origine ?? 'frontend') === 'frontend' &&
        item.viewedBySalon !== true &&
        !viewedRequestIds.includes(item.id) &&
        item.stato === 'In attesa'
    ).length;
  }, [hasLoadedViewedRequestIds, richiestePrenotazione, viewedRequestIds]);

  const clientiNonLetti = React.useMemo(() => {
    if (!hasLoadedViewedClientIds) {
      return 0;
    }

    return clienti.filter(
      (item) =>
        item.fonte === 'frontend' &&
        item.viewedBySalon !== true &&
        !viewedClientIds.includes(item.id) &&
        !viewedClientKeys.includes(buildClientViewKey(item))
    ).length;
  }, [buildClientViewKey, clienti, hasLoadedViewedClientIds, viewedClientIds, viewedClientKeys]);

  const tabTitles = React.useMemo(
    () => ({
      index: tApp(appLanguage, 'tab_home'),
      agenda: tApp(appLanguage, 'tab_agenda'),
      prenotazioni: tApp(appLanguage, 'tab_requests'),
      clienti: tApp(appLanguage, 'tab_clients'),
      cassa: tApp(appLanguage, 'tab_cash'),
      servizi: tApp(appLanguage, 'tab_services'),
    }),
    [appLanguage]
  );

  const tabCount = state.routes.length || 1;
  const tabBarBottomOffset = IS_ANDROID
    ? viewportHeight >= 900
      ? 42 + ANDROID_TAB_BAR_EXTRA_LIFT
      : viewportHeight >= 760
        ? 38 + ANDROID_TAB_BAR_EXTRA_LIFT
        : 35 + ANDROID_TAB_BAR_EXTRA_LIFT
    : TAB_BAR_OUTER_BOTTOM_IOS;
  const tabBarHorizontalPadding = viewportWidth <= 360 ? 12 : viewportWidth <= 390 ? 14 : 16;
  const availableBarWidth = Math.max(320, Math.min(viewportWidth - tabBarHorizontalPadding * 2, 560));
  const tabSpacing = 0;
  const tabRowHorizontalPadding = 8;

  const tabItemWidth = Math.max(
    48,
    Math.floor((availableBarWidth - tabRowHorizontalPadding * 2 - tabSpacing * Math.max(tabCount - 1, 0)) / Math.max(tabCount, 1))
  );

  const theoreticalItemWidth = tabItemWidth;
  const isUltraCompact = theoreticalItemWidth > 0 && theoreticalItemWidth < 56;
  const isCompact = theoreticalItemWidth > 0 && theoreticalItemWidth < 64;

  const tabBarHeight = isUltraCompact ? 58 : isCompact ? 62 : 64;
  const tabBarVerticalPadding = isUltraCompact ? 6 : 6.5;
  const tabIconSize = isUltraCompact ? 22 : 24;
  const tabLabelFontSize = isUltraCompact ? 7.2 : 8;
  const tabLabelMinScale = 0.72;
  const tabItemVerticalPadding = 0;

  const indicatorWidth = Math.max(40, Math.min(52, tabItemWidth - 12));
  const indicatorRenderWidth = indicatorWidth;
  const indicatorInset = (tabItemWidth - indicatorRenderWidth) / 2 + tabRowHorizontalPadding;

  const indicatorTabOffsets = React.useMemo(
    () => state.routes.map((_, index) => index * (tabItemWidth + tabSpacing) + indicatorInset),
    [indicatorInset, state.routes, tabItemWidth, tabSpacing]
  );

  const pagerPositionSV = useSharedValue(state.index);
  const isBarDraggingSV = useSharedValue(0);
  const didBarDragSV = useSharedValue(0);
  const previewIndexSV = useSharedValue(state.index);
  const dragTranslateXSV = useSharedValue(indicatorTabOffsets[state.index] ?? indicatorInset);

  const minTranslateX = indicatorTabOffsets[0] ?? indicatorInset;
  const maxTranslateX = indicatorTabOffsets[indicatorTabOffsets.length - 1] ?? indicatorInset;
  const dragPreviewVelocityThreshold = 850;

  const getNearestTabIndexFromTranslateX = React.useCallback(
    (translateX: number) => {
      'worklet';
      const clamped = Math.max(minTranslateX, Math.min(maxTranslateX, translateX));
      const centerX = clamped + indicatorRenderWidth / 2;

      const rawIndex = Math.round(
        (centerX - tabRowHorizontalPadding - tabItemWidth / 2) / (tabItemWidth + tabSpacing)
      );

      return Math.max(0, Math.min(state.routes.length - 1, rawIndex));
    },
    [
      indicatorRenderWidth,
      maxTranslateX,
      minTranslateX,
      state.routes.length,
      tabItemWidth,
      tabRowHorizontalPadding,
      tabSpacing,
    ]
  );

  React.useEffect(() => {
    const listenerId = position.addListener(({ value }) => {
      const roundedValue = Math.round(value);
      pagerPositionSV.value = value;

      if (!isBarDraggingSV.value) {
        previewIndexSV.value = roundedValue;
      }
    });

    return () => {
      position.removeListener(listenerId);
    };
  }, [isBarDraggingSV, pagerPositionSV, position, previewIndexSV]);

  React.useEffect(() => {
    if (isBarDraggingSV.value) {
      return;
    }

    const syncedOffset = indicatorTabOffsets[state.index] ?? indicatorInset;

    pagerPositionSV.value = state.index;
    previewIndexSV.value = state.index;
    dragTranslateXSV.value = syncedOffset;
  }, [dragTranslateXSV, indicatorInset, indicatorTabOffsets, isBarDraggingSV, previewIndexSV, state.index]);

  const startBarDragJS = React.useCallback(() => {
    if (dragPressUnlockTimeoutRef.current) {
      clearTimeout(dragPressUnlockTimeoutRef.current);
      dragPressUnlockTimeoutRef.current = null;
    }

    dragPressLockRef.current = true;
    setIsBarDraggingJS(true);
  }, []);

  const finishBarDragJS = React.useCallback(() => {
    if (dragPressUnlockTimeoutRef.current) {
      clearTimeout(dragPressUnlockTimeoutRef.current);
    }

    dragPressUnlockTimeoutRef.current = setTimeout(() => {
      dragPressLockRef.current = false;
      setIsBarDraggingJS(false);
      dragPressUnlockTimeoutRef.current = null;
    }, 32);
  }, []);

  React.useEffect(() => {
    return () => {
      if (dragPressUnlockTimeoutRef.current) {
        clearTimeout(dragPressUnlockTimeoutRef.current);
      }
    };
  }, []);

  const navigateToIndex = React.useCallback(
    (nextIndex: number) => {
      if (nextIndex === state.index) {
        return;
      }

      previewIndexSV.value = nextIndex;
      pagerPositionSV.value = nextIndex;
      dragTranslateXSV.value = indicatorTabOffsets[nextIndex] ?? indicatorInset;
      navigation.dispatch(TabActions.jumpTo(state.routes[nextIndex].name));
      Haptics.selectionAsync().catch(() => null);
    },
    [dragTranslateXSV, indicatorInset, indicatorTabOffsets, navigation, pagerPositionSV, previewIndexSV, state.index, state.routes]
  );

  const tabBarDragGesture = React.useMemo(() => {
    return Gesture.Pan()
      .activeOffsetX([-14, 14])
      .failOffsetY([-24, 24])
      .onBegin(() => {
        didBarDragSV.value = 0;
      })
      .onStart((event) => {
        runOnJS(startBarDragJS)();
        didBarDragSV.value = 1;
        isBarDraggingSV.value = 1;

        const clampedTranslateX = Math.max(
          minTranslateX,
          Math.min(maxTranslateX, event.x - indicatorRenderWidth / 2)
        );

        dragTranslateXSV.value = clampedTranslateX;
        previewIndexSV.value = getNearestTabIndexFromTranslateX(clampedTranslateX);
      })
      .onUpdate((event) => {
        const clampedTranslateX = Math.max(
          minTranslateX,
          Math.min(maxTranslateX, event.x - indicatorRenderWidth / 2)
        );

        dragTranslateXSV.value = clampedTranslateX;
        if (Math.abs(event.velocityX) < dragPreviewVelocityThreshold) {
          previewIndexSV.value = getNearestTabIndexFromTranslateX(clampedTranslateX);
        }
      })
      .onEnd(() => {
        const finalIndex = getNearestTabIndexFromTranslateX(dragTranslateXSV.value);
        const snappedTranslateX = indicatorTabOffsets[finalIndex] ?? dragTranslateXSV.value;

        dragTranslateXSV.value = snappedTranslateX;
        previewIndexSV.value = finalIndex;
        pagerPositionSV.value = finalIndex;
        isBarDraggingSV.value = 0;
        didBarDragSV.value = 0;

        runOnJS(navigateToIndex)(finalIndex);
        runOnJS(finishBarDragJS)();
      })
      .onFinalize(() => {
        isBarDraggingSV.value = 0;
        if (didBarDragSV.value) {
          didBarDragSV.value = 0;
          runOnJS(finishBarDragJS)();
        }
      });
  }, [
    didBarDragSV,
    dragTranslateXSV,
    finishBarDragJS,
    getNearestTabIndexFromTranslateX,
    indicatorRenderWidth,
    indicatorTabOffsets,
    isBarDraggingSV,
    maxTranslateX,
    minTranslateX,
    navigateToIndex,
    previewIndexSV,
    startBarDragJS,
    dragPreviewVelocityThreshold,
  ]);

  const indicatorAnimatedStyle = useAnimatedStyle(() => {
    const pagerTranslateX = interpolate(
      pagerPositionSV.value,
      state.routes.map((_, index) => index),
      indicatorTabOffsets,
      Extrapolation.CLAMP
    );

    return {
      transform: [
        {
          translateX: isBarDraggingSV.value ? dragTranslateXSV.value : pagerTranslateX,
        },
      ],
    };
  });

  return (
    <View pointerEvents="box-none" style={styles.tabBarOverlay}>
      <View
        pointerEvents="box-none"
        style={[
          styles.tabBarOuter,
          {
            paddingHorizontal: tabBarHorizontalPadding,
            paddingBottom: tabBarBottomOffset,
          },
        ]}
      >
        <GestureDetector gesture={tabBarDragGesture}>
          <View
            pointerEvents="box-none"
            style={[
              styles.tabBar,
              {
                height: tabBarHeight,
                paddingTop: tabBarVerticalPadding,
                paddingBottom: tabBarVerticalPadding,
              },
            ]}
          >
            <View
              pointerEvents="box-none"
              style={[
                styles.tabBarFixedRow,
                {
                  width: availableBarWidth,
                },
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.animatedIndicator,
                  indicatorAnimatedStyle,
                  {
                    width: indicatorRenderWidth,
                    height: tabBarHeight - tabBarVerticalPadding * 2 + 4,
                    top: -2,
                  },
                ]}
              >
                <View style={styles.animatedIndicatorGlow} />
                <View style={styles.animatedIndicatorGlass} />
                <View style={styles.animatedIndicatorHighlight} />
                <View style={styles.animatedIndicatorLowlight} />
                <View style={styles.animatedIndicatorInnerStroke} />
              </Animated.View>

              {state.routes.map((route, index) => {
                const routeKey = route.name as SalonModuleKey;
                const config = SALON_MODULES[routeKey];
                if (!config) return null;

                const label =
                  descriptors[route.key]?.options.title ??
                  descriptors[route.key]?.options.tabBarLabel ??
                  tabTitles[routeKey];

                const onPress = () => {
                  if (isBarDraggingJS) {
                    return;
                  }
                  navigateToIndex(index);
                };

                const badgeCount =
                  route.name === 'prenotazioni'
                    ? richiesteInAttesa
                    : route.name === 'clienti'
                      ? clientiNonLetti
                      : 0;

                return (
                  <Pressable
                    key={route.key}
                    onPress={onPress}
                    onPressIn={() => {
                      if (isBarDraggingJS) {
                        return;
                      }
                      setPressedTabKey(route.key);
                      previewIndexSV.value = index;
                      pagerPositionSV.value = index;
                      dragTranslateXSV.value = indicatorTabOffsets[index] ?? indicatorInset;
                    }}
                    onPressOut={() =>
                      setPressedTabKey((current) => (current === route.key ? null : current))
                    }
                    onTouchCancel={() =>
                      setPressedTabKey((current) => (current === route.key ? null : current))
                    }
                    style={[
                      styles.tabBarItem,
                      {
                        width: tabItemWidth,
                        paddingVertical: tabItemVerticalPadding,
                        marginRight: index === state.routes.length - 1 ? 0 : tabSpacing,
                      },
                    ]}
                  >
                    <TabBarItemVisual
                      index={index}
                      isPressed={pressedTabKey === route.key}
                      label={typeof label === 'string' ? label : tabTitles[routeKey]}
                      activeIconName={config.icon.active}
                      inactiveIconName={config.icon.inactive}
                      tabIconSize={tabIconSize}
                      tabLabelFontSize={tabLabelFontSize}
                      tabLabelMinScale={tabLabelMinScale}
                      badgeCount={badgeCount}
                      pagerPositionSV={pagerPositionSV}
                      isBarDraggingSV={isBarDraggingSV}
                      previewIndexSV={previewIndexSV}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </GestureDetector>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const [disableParentSwipe, setDisableParentSwipe] = React.useState(false);

  const screenOptions = React.useMemo<MaterialTopTabNavigationOptions>(
    () => ({
      swipeEnabled: !disableParentSwipe,
      animationEnabled: false,
      lazy: false,
      lazyPreloadDistance: 1,
      tabBarScrollEnabled: false,
      tabBarStyle: {
        display: 'none',
      },
      sceneStyle: {
        backgroundColor: 'transparent',
      },
    }),
    [disableParentSwipe]
  );

  return (
    <TabSwipeLockProvider
      value={{
        disableParentSwipe,
        setDisableParentSwipe,
        isAndroidTabSwipeLocked: disableParentSwipe,
        setIsAndroidTabSwipeLocked: setDisableParentSwipe,
      }}
    >
      <ExpoRouterMaterialTopTabs
        tabBar={(props) => <BottomTabBar {...props} />}
        screenOptions={screenOptions}
      >
        <ExpoRouterMaterialTopTabs.Screen
          name="index"
          options={{ title: 'Home' }}
        />
        <ExpoRouterMaterialTopTabs.Screen
          name="agenda"
          options={{ title: 'Agenda' }}
        />
        <ExpoRouterMaterialTopTabs.Screen
          name="prenotazioni"
          options={{ title: 'Richieste' }}
        />
        <ExpoRouterMaterialTopTabs.Screen
          name="clienti"
          options={{ title: 'Clienti' }}
        />
        <ExpoRouterMaterialTopTabs.Screen
          name="cassa"
          options={{ title: 'Cassa' }}
        />
        <ExpoRouterMaterialTopTabs.Screen
          name="servizi"
          options={{ title: 'Servizi' }}
        />
      </ExpoRouterMaterialTopTabs>
    </TabSwipeLockProvider>
  );
}

const styles = StyleSheet.create({
  animatedIndicator: {
    position: 'absolute',
    top: 0,
    borderRadius: 30,
    zIndex: 1,
    marginVertical: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  animatedIndicatorGlow: {
    ...StyleSheet.absoluteFillObject,
    left: -4,
    right: -4,
    top: -4,
    bottom: -4,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.025)',
    shadowColor: '#ffffff',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  animatedIndicatorGlass: {
    width: '100%',
    height: '100%',
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.20)',
    borderWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  animatedIndicatorHighlight: {
    position: 'absolute',
    top: 0,
    left: 2,
    right: 2,
    height: '28%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  animatedIndicatorLowlight: {
    position: 'absolute',
    bottom: 0,
    left: 2,
    right: 2,
    height: '22%',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  animatedIndicatorInnerStroke: {
    position: 'absolute',
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
    borderRadius: 24,
    borderWidth: 0.6,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  tabBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'transparent',
  },
  tabBarOuter: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabBar: {
    width: '100%',
    maxWidth: 560,
    minWidth: 320,
    backgroundColor: 'rgba(18, 22, 30, 0.78)',
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  tabBarFixedRow: {
    paddingHorizontal: 8,
    width: '100%',
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  tabBarItem: {
    minWidth: 0,
    flexShrink: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    zIndex: 2,
    minHeight: 46,
  },
  tabBarItemInner: {
    width: '100%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabBarItemContent: {
    width: '100%',
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  tabBarIconStack: {
    width: '100%',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabBarIconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarIconLayerAbsolute: {
    position: 'absolute',
  },
  tabBarItemActive: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: 4,
    minWidth: IS_ANDROID ? 22 : 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: '#FF3B30',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: IS_ANDROID ? 7 : 5,
    shadowColor: '#FF3B30',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0,
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  tabBarLabel: {
    fontWeight: '700',
    letterSpacing: -0.2,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: ANDROID_TEXT_BREATHING_ROOM,
  },
  tabBarLabelStack: {
    width: '100%',
    minHeight: IS_ANDROID ? 14 : 12,
    marginTop: 2,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabBarLabelLayer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarLabelLayerAbsolute: {
    position: 'absolute',
  },
  tabBarLabelActive: {
    color: '#FFFFFF',
  },
  tabBarLabelInactive: {
    color: '#A8B2C7',
  },
});
