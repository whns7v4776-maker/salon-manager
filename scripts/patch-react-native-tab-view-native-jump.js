/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(
  __dirname,
  '..',
  'node_modules',
  'react-native-tab-view',
);
const packageJsonPath = path.join(packageRoot, 'package.json');
const supportedVersions = new Set(['4.3.0']);

if (!fs.existsSync(packageJsonPath)) {
  throw new Error(
    'react-native-tab-view non trovato: impossibile applicare la correzione del tap nativo.',
  );
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!supportedVersions.has(packageJson.version)) {
  throw new Error(
    `react-native-tab-view@${packageJson.version}: versione non verificata; aggiorna consapevolmente la patch del tap nativo.`,
  );
}

const sourcePath = path.join(packageRoot, 'src', 'PagerViewAdapter.tsx');
const modulePath = path.join(packageRoot, 'lib', 'module', 'PagerViewAdapter.js');
const tabViewSourcePath = path.join(packageRoot, 'src', 'TabView.tsx');
const tabViewModulePath = path.join(packageRoot, 'lib', 'module', 'TabView.js');

const sourceReplacements = [
  [
    `  const navigationStateRef = React.useRef(navigationState);

  const position = useAnimatedValue(index);`,
    `  const navigationStateRef = React.useRef(navigationState);
  const pendingJumpIndexRef = React.useRef<number | null>(null);
  const pendingJumpTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const fallbackCommittedIndexRef = React.useRef<number | null>(null);

  const position = useAnimatedValue(index);`,
  ],
  [
    `  React.useEffect(() => {
    navigationStateRef.current = navigationState;
  });

  const jumpTo = useLatestCallback((key: string) => {`,
    `  React.useEffect(() => {
    navigationStateRef.current = navigationState;
  });

  React.useEffect(
    () => () => {
      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
    },
    []
  );

  const jumpTo = useLatestCallback((key: string) => {`,
  ],
  [
    `    if (animationEnabled) {
      pagerRef.current?.setPage(index);
    } else {
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
    }

    onIndexChange(index);`,
    `    if (index < 0) {
      return;
    }

    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }

    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    pendingJumpTimeoutRef.current = setTimeout(() => {
      if (pendingJumpIndexRef.current !== index) {
        return;
      }

      pendingJumpIndexRef.current = null;
      pendingJumpTimeoutRef.current = null;
      fallbackCommittedIndexRef.current = index;

      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      onIndexChange(index);
      onTabSelect?.({ index });
    }, 180);

    if (animationEnabled) {
      pagerRef.current?.setPage(index);
    } else {
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
    }`,
  ],
  [
    `      case 'dragging': {
        const subscription = offset.addListener(({ value }) => {`,
    `      case 'dragging': {
        if (pendingJumpTimeoutRef.current) {
          clearTimeout(pendingJumpTimeoutRef.current);
        }
        pendingJumpTimeoutRef.current = null;
        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;

        const subscription = offset.addListener(({ value }) => {`,
  ],
  [
    `        onPageSelected={(e) => {
          const index = e.nativeEvent.position;
          indexRef.current = index;
          onIndexChange(index);
          onTabSelect?.({ index });
        }}`,
    `        onPageSelected={(e) => {
          const index = e.nativeEvent.position;
          const pendingIndex = pendingJumpIndexRef.current;
          const fallbackIndex = fallbackCommittedIndexRef.current;

          if (
            (pendingIndex !== null && pendingIndex !== index) ||
            (fallbackIndex !== null && fallbackIndex !== index)
          ) {
            return;
          }

          if (pendingJumpTimeoutRef.current) {
            clearTimeout(pendingJumpTimeoutRef.current);
          }
          pendingJumpTimeoutRef.current = null;
          pendingJumpIndexRef.current = null;

          const fallbackAlreadyCommitted = fallbackIndex === index;
          fallbackCommittedIndexRef.current = null;
          indexRef.current = index;

          if (!fallbackAlreadyCommitted) {
            onIndexChange(index);
            onTabSelect?.({ index });
          }
        }}`,
  ],
];

const moduleReplacements = [
  [
    `  const navigationStateRef = React.useRef(navigationState);
  const position = useAnimatedValue(index);`,
    `  const navigationStateRef = React.useRef(navigationState);
  const pendingJumpIndexRef = React.useRef(null);
  const pendingJumpTimeoutRef = React.useRef(null);
  const fallbackCommittedIndexRef = React.useRef(null);
  const position = useAnimatedValue(index);`,
  ],
  [
    `  React.useEffect(() => {
    navigationStateRef.current = navigationState;
  });
  const jumpTo = useLatestCallback(key => {`,
    `  React.useEffect(() => {
    navigationStateRef.current = navigationState;
  });
  React.useEffect(() => () => {
    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
  }, []);
  const jumpTo = useLatestCallback(key => {`,
  ],
  [
    `    if (animationEnabled) {
      pagerRef.current?.setPage(index);
    } else {
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
    }
    onIndexChange(index);`,
    `    if (index < 0) {
      return;
    }
    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    pendingJumpTimeoutRef.current = setTimeout(() => {
      if (pendingJumpIndexRef.current !== index) {
        return;
      }
      pendingJumpIndexRef.current = null;
      pendingJumpTimeoutRef.current = null;
      fallbackCommittedIndexRef.current = index;
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      onIndexChange(index);
      onTabSelect?.({
        index
      });
    }, 180);
    if (animationEnabled) {
      pagerRef.current?.setPage(index);
    } else {
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
    }`,
  ],
  [
    `      case 'dragging':
        {
          const subscription = offset.addListener(({`,
    `      case 'dragging':
        {
          if (pendingJumpTimeoutRef.current) {
            clearTimeout(pendingJumpTimeoutRef.current);
          }
          pendingJumpTimeoutRef.current = null;
          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;
          const subscription = offset.addListener(({`,
  ],
  [
    `      onPageSelected: e => {
        const index = e.nativeEvent.position;
        indexRef.current = index;
        onIndexChange(index);
        onTabSelect?.({
          index
        });
      },`,
    `      onPageSelected: e => {
        const index = e.nativeEvent.position;
        const pendingIndex = pendingJumpIndexRef.current;
        const fallbackIndex = fallbackCommittedIndexRef.current;
        if (
          pendingIndex !== null && pendingIndex !== index ||
          fallbackIndex !== null && fallbackIndex !== index
        ) {
          return;
        }
        if (pendingJumpTimeoutRef.current) {
          clearTimeout(pendingJumpTimeoutRef.current);
        }
        pendingJumpTimeoutRef.current = null;
        pendingJumpIndexRef.current = null;
        const fallbackAlreadyCommitted = fallbackIndex === index;
        fallbackCommittedIndexRef.current = null;
        indexRef.current = index;
        if (!fallbackAlreadyCommitted) {
          onIndexChange(index);
          onTabSelect?.({
            index
          });
        }
      },`,
  ],
];

const sourceUpgradeReplacements = [
  [
    `      fallbackCommittedIndexRef.current = index;
      indexRef.current = index;
      onIndexChange(index);`,
    `      fallbackCommittedIndexRef.current = index;

      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      onIndexChange(index);`,
  ],
  [
    `          const pendingIndex = pendingJumpIndexRef.current;

          if (pendingIndex !== null && pendingIndex !== index) {
            return;
          }`,
    `          const pendingIndex = pendingJumpIndexRef.current;
          const fallbackIndex = fallbackCommittedIndexRef.current;

          if (
            (pendingIndex !== null && pendingIndex !== index) ||
            (fallbackIndex !== null && fallbackIndex !== index)
          ) {
            return;
          }`,
  ],
  [
    `          const fallbackAlreadyCommitted =
            fallbackCommittedIndexRef.current === index;`,
    `          const fallbackAlreadyCommitted = fallbackIndex === index;`,
  ],
];

const moduleUpgradeReplacements = [
  [
    `      fallbackCommittedIndexRef.current = index;
      indexRef.current = index;
      onIndexChange(index);`,
    `      fallbackCommittedIndexRef.current = index;
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      onIndexChange(index);`,
  ],
  [
    `        const pendingIndex = pendingJumpIndexRef.current;
        if (pendingIndex !== null && pendingIndex !== index) {
          return;
        }`,
    `        const pendingIndex = pendingJumpIndexRef.current;
        const fallbackIndex = fallbackCommittedIndexRef.current;
        if (
          pendingIndex !== null && pendingIndex !== index ||
          fallbackIndex !== null && fallbackIndex !== index
        ) {
          return;
        }`,
  ],
  [
    `        const fallbackAlreadyCommitted = fallbackCommittedIndexRef.current === index;`,
    `        const fallbackAlreadyCommitted = fallbackIndex === index;`,
  ],
];

const sourceAndroidReplacements = [
  [
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    pendingJumpTimeoutRef.current = setTimeout(() => {`,
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;

    if (Platform.OS === 'android') {
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      indexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({ index });
      return;
    }

    pendingJumpTimeoutRef.current = setTimeout(() => {`,
  ],
  [
    `          const fallbackIndex = fallbackCommittedIndexRef.current;

          if (
            (pendingIndex !== null && pendingIndex !== index) ||`,
    `          const fallbackIndex = fallbackCommittedIndexRef.current;

          if (Platform.OS === 'android' && pendingIndex !== null) {
            if (pendingIndex !== index) {
              return;
            }
            pendingJumpIndexRef.current = null;
            indexRef.current = index;
            return;
          }

          if (
            (pendingIndex !== null && pendingIndex !== index) ||`,
  ],
];

const moduleAndroidReplacements = [
  [
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    pendingJumpTimeoutRef.current = setTimeout(() => {`,
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    if (Platform.OS === 'android') {
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      indexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({
        index
      });
      return;
    }
    pendingJumpTimeoutRef.current = setTimeout(() => {`,
  ],
  [
    `        const fallbackIndex = fallbackCommittedIndexRef.current;
        if (
          pendingIndex !== null && pendingIndex !== index ||`,
    `        const fallbackIndex = fallbackCommittedIndexRef.current;
        if (Platform.OS === 'android' && pendingIndex !== null) {
          if (pendingIndex !== index) {
            return;
          }
          pendingJumpIndexRef.current = null;
          indexRef.current = index;
          return;
        }
        if (
          pendingIndex !== null && pendingIndex !== index ||`,
  ],
];

const sourceAndroidSwipeReplacements = [
  [
    `  const fallbackCommittedIndexRef = React.useRef<number | null>(null);`,
    `  const fallbackCommittedIndexRef = React.useRef<number | null>(null);
  const pendingAndroidSwipeIndexRef = React.useRef<number | null>(null);`,
  ],
  [
    `      case 'idle':
        onSwipeEnd?.();`,
    `      case 'idle':
        if (
          Platform.OS === 'android' &&
          pendingAndroidSwipeIndexRef.current !== null
        ) {
          const settledIndex = pendingAndroidSwipeIndexRef.current;
          pendingAndroidSwipeIndexRef.current = null;
          onIndexChange(settledIndex);
          onTabSelect?.({ index: settledIndex });
        }
        onSwipeEnd?.();`,
  ],
  [
    `            return;
          }

          if (
            (pendingIndex !== null && pendingIndex !== index) ||`,
    `            return;
          }

          if (Platform.OS === 'android') {
            indexRef.current = index;
            pendingAndroidSwipeIndexRef.current = index;
            return;
          }

          if (
            (pendingIndex !== null && pendingIndex !== index) ||`,
  ],
];

const moduleAndroidSwipeReplacements = [
  [
    `  const fallbackCommittedIndexRef = React.useRef(null);`,
    `  const fallbackCommittedIndexRef = React.useRef(null);
  const pendingAndroidSwipeIndexRef = React.useRef(null);`,
  ],
  [
    `      case 'idle':
        onSwipeEnd?.();`,
    `      case 'idle':
        if (Platform.OS === 'android' && pendingAndroidSwipeIndexRef.current !== null) {
          const settledIndex = pendingAndroidSwipeIndexRef.current;
          pendingAndroidSwipeIndexRef.current = null;
          onIndexChange(settledIndex);
          onTabSelect?.({
            index: settledIndex
          });
        }
        onSwipeEnd?.();`,
  ],
  [
    `          return;
        }
        if (
          pendingIndex !== null && pendingIndex !== index ||`,
    `          return;
        }
        if (Platform.OS === 'android') {
          indexRef.current = index;
          pendingAndroidSwipeIndexRef.current = index;
          return;
        }
        if (
          pendingIndex !== null && pendingIndex !== index ||`,
  ],
];

const sourceAndroidAuthorityUpgradeReplacements = [
  [
    `  const pendingAndroidSwipeIndexRef = React.useRef<number | null>(null);`,
    `  const androidNativeSwipeAuthorityRef = React.useRef(false);
  const androidSwipeAuthorityReleaseTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);`,
  ],
  [
    `      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
    },
    []
  );

  const jumpTo = useLatestCallback((key: string) => {`,
    `      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
      if (androidSwipeAuthorityReleaseTimeoutRef.current) {
        clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
      }
    },
    []
  );

  const scheduleAndroidSwipeAuthorityRelease = useLatestCallback(() => {
    if (androidSwipeAuthorityReleaseTimeoutRef.current) {
      clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
    }
    androidSwipeAuthorityReleaseTimeoutRef.current = setTimeout(() => {
      androidNativeSwipeAuthorityRef.current = false;
      androidSwipeAuthorityReleaseTimeoutRef.current = null;
    }, 120);
  });

  const jumpTo = useLatestCallback((key: string) => {`,
  ],
  [
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }

    pendingJumpIndexRef.current = index;`,
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    if (Platform.OS === 'android') {
      androidNativeSwipeAuthorityRef.current = false;
      if (androidSwipeAuthorityReleaseTimeoutRef.current) {
        clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
        androidSwipeAuthorityReleaseTimeoutRef.current = null;
      }
    }

    pendingJumpIndexRef.current = index;`,
  ],
  [
    `    if (indexRef.current !== index) {`,
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {
      indexRef.current = index;
    } else if (indexRef.current !== index) {`,
  ],
  [
    `      case 'idle':
        if (
          Platform.OS === 'android' &&
          pendingAndroidSwipeIndexRef.current !== null
        ) {
          const settledIndex = pendingAndroidSwipeIndexRef.current;
          pendingAndroidSwipeIndexRef.current = null;
          onIndexChange(settledIndex);
          onTabSelect?.({ index: settledIndex });
        }`,
    `      case 'idle':
        if (Platform.OS === 'android') {
          scheduleAndroidSwipeAuthorityRelease();
        }`,
  ],
  [
    `      case 'dragging': {
        if (pendingJumpTimeoutRef.current) {`,
    `      case 'dragging': {
        if (Platform.OS === 'android') {
          androidNativeSwipeAuthorityRef.current = true;
          if (androidSwipeAuthorityReleaseTimeoutRef.current) {
            clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
            androidSwipeAuthorityReleaseTimeoutRef.current = null;
          }
        }
        if (pendingJumpTimeoutRef.current) {`,
  ],
  [
    `          if (Platform.OS === 'android') {
            indexRef.current = index;
            pendingAndroidSwipeIndexRef.current = index;
            return;
          }`,
    `          if (Platform.OS === 'android') {
            androidNativeSwipeAuthorityRef.current = true;
            indexRef.current = index;
            onIndexChange(index);
            onTabSelect?.({ index });
            scheduleAndroidSwipeAuthorityRelease();
            return;
          }`,
  ],
];

const moduleAndroidAuthorityUpgradeReplacements = [
  [
    `  const pendingAndroidSwipeIndexRef = React.useRef(null);`,
    `  const androidNativeSwipeAuthorityRef = React.useRef(false);
  const androidSwipeAuthorityReleaseTimeoutRef = React.useRef(null);`,
  ],
  [
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
  }, []);
  const jumpTo = useLatestCallback(key => {`,
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    if (androidSwipeAuthorityReleaseTimeoutRef.current) {
      clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
    }
  }, []);
  const scheduleAndroidSwipeAuthorityRelease = useLatestCallback(() => {
    if (androidSwipeAuthorityReleaseTimeoutRef.current) {
      clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
    }
    androidSwipeAuthorityReleaseTimeoutRef.current = setTimeout(() => {
      androidNativeSwipeAuthorityRef.current = false;
      androidSwipeAuthorityReleaseTimeoutRef.current = null;
    }, 120);
  });
  const jumpTo = useLatestCallback(key => {`,
  ],
  [
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    pendingJumpIndexRef.current = index;`,
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    if (Platform.OS === 'android') {
      androidNativeSwipeAuthorityRef.current = false;
      if (androidSwipeAuthorityReleaseTimeoutRef.current) {
        clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
        androidSwipeAuthorityReleaseTimeoutRef.current = null;
      }
    }
    pendingJumpIndexRef.current = index;`,
  ],
  [
    `    if (indexRef.current !== index) {`,
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {
      indexRef.current = index;
    } else if (indexRef.current !== index) {`,
  ],
  [
    `      case 'idle':
        if (Platform.OS === 'android' && pendingAndroidSwipeIndexRef.current !== null) {
          const settledIndex = pendingAndroidSwipeIndexRef.current;
          pendingAndroidSwipeIndexRef.current = null;
          onIndexChange(settledIndex);
          onTabSelect?.({
            index: settledIndex
          });
        }`,
    `      case 'idle':
        if (Platform.OS === 'android') {
          scheduleAndroidSwipeAuthorityRelease();
        }`,
  ],
  [
    `      case 'dragging':
        {
          if (pendingJumpTimeoutRef.current) {`,
    `      case 'dragging':
        {
          if (Platform.OS === 'android') {
            androidNativeSwipeAuthorityRef.current = true;
            if (androidSwipeAuthorityReleaseTimeoutRef.current) {
              clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
              androidSwipeAuthorityReleaseTimeoutRef.current = null;
            }
          }
          if (pendingJumpTimeoutRef.current) {`,
  ],
  [
    `        if (Platform.OS === 'android') {
          indexRef.current = index;
          pendingAndroidSwipeIndexRef.current = index;
          return;
        }`,
    `        if (Platform.OS === 'android') {
          androidNativeSwipeAuthorityRef.current = true;
          indexRef.current = index;
          onIndexChange(index);
          onTabSelect?.({
            index
          });
          scheduleAndroidSwipeAuthorityRelease();
          return;
        }`,
  ],
];

const sourceAndroidFinalAuthorityReplacements = [
  [
    `  const androidSwipeAuthorityReleaseTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);`,
    `  const androidPagerIdleRef = React.useRef(true);`,
  ],
  [
    `      if (androidSwipeAuthorityReleaseTimeoutRef.current) {
        clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
      }
`,
    ``,
  ],
  [
    `  const scheduleAndroidSwipeAuthorityRelease = useLatestCallback(() => {
    if (androidSwipeAuthorityReleaseTimeoutRef.current) {
      clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
    }
    androidSwipeAuthorityReleaseTimeoutRef.current = setTimeout(() => {
      androidNativeSwipeAuthorityRef.current = false;
      androidSwipeAuthorityReleaseTimeoutRef.current = null;
    }, 120);
  });

`,
    ``,
  ],
  [
    `      androidNativeSwipeAuthorityRef.current = false;
      if (androidSwipeAuthorityReleaseTimeoutRef.current) {
        clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
        androidSwipeAuthorityReleaseTimeoutRef.current = null;
      }`,
    `      androidNativeSwipeAuthorityRef.current = false;
      androidPagerIdleRef.current = true;`,
  ],
  [
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {
      indexRef.current = index;`,
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {
      if (androidPagerIdleRef.current && indexRef.current === index) {
        androidNativeSwipeAuthorityRef.current = false;
      }`,
  ],
  [
    `          scheduleAndroidSwipeAuthorityRelease();`,
    `          androidPagerIdleRef.current = true;`,
  ],
  [
    `          androidNativeSwipeAuthorityRef.current = true;
          if (androidSwipeAuthorityReleaseTimeoutRef.current) {
            clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
            androidSwipeAuthorityReleaseTimeoutRef.current = null;
          }`,
    `          androidNativeSwipeAuthorityRef.current = true;
          androidPagerIdleRef.current = false;`,
  ],
  [
    `            onTabSelect?.({ index });
            scheduleAndroidSwipeAuthorityRelease();`,
    `            onTabSelect?.({ index });`,
  ],
];

const moduleAndroidFinalAuthorityReplacements = [
  [
    `  const androidSwipeAuthorityReleaseTimeoutRef = React.useRef(null);`,
    `  const androidPagerIdleRef = React.useRef(true);`,
  ],
  [
    `    if (androidSwipeAuthorityReleaseTimeoutRef.current) {
      clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
    }
`,
    ``,
  ],
  [
    `  const scheduleAndroidSwipeAuthorityRelease = useLatestCallback(() => {
    if (androidSwipeAuthorityReleaseTimeoutRef.current) {
      clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
    }
    androidSwipeAuthorityReleaseTimeoutRef.current = setTimeout(() => {
      androidNativeSwipeAuthorityRef.current = false;
      androidSwipeAuthorityReleaseTimeoutRef.current = null;
    }, 120);
  });
`,
    ``,
  ],
  [
    `      androidNativeSwipeAuthorityRef.current = false;
      if (androidSwipeAuthorityReleaseTimeoutRef.current) {
        clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
        androidSwipeAuthorityReleaseTimeoutRef.current = null;
      }`,
    `      androidNativeSwipeAuthorityRef.current = false;
      androidPagerIdleRef.current = true;`,
  ],
  [
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {
      indexRef.current = index;`,
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {
      if (androidPagerIdleRef.current && indexRef.current === index) {
        androidNativeSwipeAuthorityRef.current = false;
      }`,
  ],
  [
    `          scheduleAndroidSwipeAuthorityRelease();`,
    `          androidPagerIdleRef.current = true;`,
  ],
  [
    `            androidNativeSwipeAuthorityRef.current = true;
            if (androidSwipeAuthorityReleaseTimeoutRef.current) {
              clearTimeout(androidSwipeAuthorityReleaseTimeoutRef.current);
              androidSwipeAuthorityReleaseTimeoutRef.current = null;
            }`,
    `            androidNativeSwipeAuthorityRef.current = true;
            androidPagerIdleRef.current = false;`,
  ],
  [
    `          });
          scheduleAndroidSwipeAuthorityRelease();
          return;`,
    `          });
          return;`,
  ],
];

const sourceAndroidPagerValueSyncReplacements = [
  [
    `        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      indexRef.current = index;`,
    `        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      }
      indexRef.current = index;`,
  ],
  [
    `            androidNativeSwipeAuthorityRef.current = true;
            indexRef.current = index;
            onIndexChange(index);`,
    `            androidNativeSwipeAuthorityRef.current = true;
            indexRef.current = index;
            // onPageScroll usa il driver nativo: su Android il valore JS puo
            // restare indietro anche se la pagina visibile e gia cambiata.
            // Riallinea entrambi i nodi sull'unica pagina confermata dal pager,
            // cosi un render React tardivo non puo riportare indietro la barra.
            position.setValue(index);
            offset.setValue(0);
            onIndexChange(index);`,
  ],
];

const moduleAndroidPagerValueSyncReplacements = [
  [
    `        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
      }
      indexRef.current = index;`,
    `        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      }
      indexRef.current = index;`,
  ],
  [
    `          androidNativeSwipeAuthorityRef.current = true;
          indexRef.current = index;
          onIndexChange(index);`,
    `          androidNativeSwipeAuthorityRef.current = true;
          indexRef.current = index;
          // onPageScroll uses the native driver: on Android the JS value can
          // lag behind even after the visible page has changed. Realign both
          // nodes to the page confirmed by the pager so a late React render
          // cannot move the custom bar backwards.
          position.setValue(index);
          offset.setValue(0);
          onIndexChange(index);`,
  ],
];

const sourceAndroidProgrammaticJumpAckReplacements = [
  [
    `  const androidPagerIdleRef = React.useRef(true);`,
    `  const androidPagerIdleRef = React.useRef(true);
  // Un comando setPage puo essere temporaneamente ignorato da PagerView
  // mentre Fabric sta montando o riattivando una scena pesante. Manteniamo il
  // target autorevole finche il pager nativo non lo conferma, senza lasciare
  // che il render React della nuova route ritardi il primo frame visibile.
  const androidProgrammaticJumpAckRef = React.useRef<number | null>(null);
  const androidProgrammaticJumpFallbackRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const androidProgrammaticJumpRetryRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);`,
  ],
  [
    `      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
    },`,
    `      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
      if (androidProgrammaticJumpFallbackRef.current) {
        clearTimeout(androidProgrammaticJumpFallbackRef.current);
      }
      if (androidProgrammaticJumpRetryRef.current) {
        clearTimeout(androidProgrammaticJumpRetryRef.current);
      }
    },`,
  ],
  [
    `    if (Platform.OS === 'android') {
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      }
      indexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({ index });
      return;
    }`,
    `    if (Platform.OS === 'android') {
      const movePagerToTarget = () => {
        if (animationEnabled) {
          pagerRef.current?.setPage(index);
        } else {
          pagerRef.current?.setPageWithoutAnimation(index);
          position.setValue(index);
          offset.setValue(0);
        }
      };

      if (androidProgrammaticJumpFallbackRef.current) {
        clearTimeout(androidProgrammaticJumpFallbackRef.current);
      }
      if (androidProgrammaticJumpRetryRef.current) {
        clearTimeout(androidProgrammaticJumpRetryRef.current);
      }
      androidProgrammaticJumpAckRef.current = index;
      movePagerToTarget();

      // Se il comando e' arrivato durante un mount nativo, lo ripetiamo una
      // sola volta. onPageSelected azzera questo timer appena la pagina e'
      // realmente visibile.
      androidProgrammaticJumpRetryRef.current = setTimeout(() => {
        androidProgrammaticJumpRetryRef.current = null;
        if (androidProgrammaticJumpAckRef.current === index) {
          movePagerToTarget();
        }
      }, 90);

      // Normalmente onPageSelected arriva prima e la pagina e' gia visibile
      // quando React aggiorna lo stato. Questo fallback interviene soltanto
      // se PagerView non conferma neppure il retry.
      androidProgrammaticJumpFallbackRef.current = setTimeout(() => {
        androidProgrammaticJumpFallbackRef.current = null;
        if (androidProgrammaticJumpAckRef.current !== index) {
          return;
        }
        fallbackCommittedIndexRef.current = index;
        onIndexChange(index);
        onTabSelect?.({ index });
      }, 360);
      return;
    }`,
  ],
  [
    `          if (Platform.OS === 'android' && pendingIndex !== null) {
            if (pendingIndex !== index) {
              return;
            }
            pendingJumpIndexRef.current = null;
            indexRef.current = index;
            return;
          }`,
    `          if (Platform.OS === 'android' && pendingIndex !== null) {
            if (pendingIndex !== index) {
              return;
            }
            pendingJumpIndexRef.current = null;
            androidProgrammaticJumpAckRef.current = null;
            if (androidProgrammaticJumpFallbackRef.current) {
              clearTimeout(androidProgrammaticJumpFallbackRef.current);
              androidProgrammaticJumpFallbackRef.current = null;
            }
            if (androidProgrammaticJumpRetryRef.current) {
              clearTimeout(androidProgrammaticJumpRetryRef.current);
              androidProgrammaticJumpRetryRef.current = null;
            }
            const fallbackAlreadyCommitted = fallbackIndex === index;
            fallbackCommittedIndexRef.current = null;
            indexRef.current = index;
            position.setValue(index);
            offset.setValue(0);
            if (!fallbackAlreadyCommitted) {
              onIndexChange(index);
              onTabSelect?.({ index });
            }
            return;
          }`,
  ],
  [
    `        pendingJumpTimeoutRef.current = null;
        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;`,
    `        pendingJumpTimeoutRef.current = null;
        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;
        androidProgrammaticJumpAckRef.current = null;
        if (androidProgrammaticJumpFallbackRef.current) {
          clearTimeout(androidProgrammaticJumpFallbackRef.current);
          androidProgrammaticJumpFallbackRef.current = null;
        }
        if (androidProgrammaticJumpRetryRef.current) {
          clearTimeout(androidProgrammaticJumpRetryRef.current);
          androidProgrammaticJumpRetryRef.current = null;
        }`,
  ],
];

const moduleAndroidProgrammaticJumpAckReplacements = [
  [
    `  const androidPagerIdleRef = React.useRef(true);`,
    `  const androidPagerIdleRef = React.useRef(true);
  // Keep the programmatic target authoritative until native PagerView
  // confirms that the destination page is actually visible.
  const androidProgrammaticJumpAckRef = React.useRef(null);
  const androidProgrammaticJumpFallbackRef = React.useRef(null);
  const androidProgrammaticJumpRetryRef = React.useRef(null);`,
  ],
  [
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
  }, []);`,
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    if (androidProgrammaticJumpFallbackRef.current) {
      clearTimeout(androidProgrammaticJumpFallbackRef.current);
    }
    if (androidProgrammaticJumpRetryRef.current) {
      clearTimeout(androidProgrammaticJumpRetryRef.current);
    }
  }, []);`,
  ],
  [
    `    if (Platform.OS === 'android') {
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      }
      indexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({
        index
      });
      return;
    }`,
    `    if (Platform.OS === 'android') {
      const movePagerToTarget = () => {
        if (animationEnabled) {
          pagerRef.current?.setPage(index);
        } else {
          pagerRef.current?.setPageWithoutAnimation(index);
          position.setValue(index);
          offset.setValue(0);
        }
      };
      if (androidProgrammaticJumpFallbackRef.current) {
        clearTimeout(androidProgrammaticJumpFallbackRef.current);
      }
      if (androidProgrammaticJumpRetryRef.current) {
        clearTimeout(androidProgrammaticJumpRetryRef.current);
      }
      androidProgrammaticJumpAckRef.current = index;
      movePagerToTarget();
      androidProgrammaticJumpRetryRef.current = setTimeout(() => {
        androidProgrammaticJumpRetryRef.current = null;
        if (androidProgrammaticJumpAckRef.current === index) {
          movePagerToTarget();
        }
      }, 90);
      androidProgrammaticJumpFallbackRef.current = setTimeout(() => {
        androidProgrammaticJumpFallbackRef.current = null;
        if (androidProgrammaticJumpAckRef.current !== index) {
          return;
        }
        fallbackCommittedIndexRef.current = index;
        onIndexChange(index);
        onTabSelect?.({
          index
        });
      }, 360);
      return;
    }`,
  ],
  [
    `        if (Platform.OS === 'android' && pendingIndex !== null) {
          if (pendingIndex !== index) {
            return;
          }
          pendingJumpIndexRef.current = null;
          indexRef.current = index;
          return;
        }`,
    `        if (Platform.OS === 'android' && pendingIndex !== null) {
          if (pendingIndex !== index) {
            return;
          }
          pendingJumpIndexRef.current = null;
          androidProgrammaticJumpAckRef.current = null;
          if (androidProgrammaticJumpFallbackRef.current) {
            clearTimeout(androidProgrammaticJumpFallbackRef.current);
            androidProgrammaticJumpFallbackRef.current = null;
          }
          if (androidProgrammaticJumpRetryRef.current) {
            clearTimeout(androidProgrammaticJumpRetryRef.current);
            androidProgrammaticJumpRetryRef.current = null;
          }
          const fallbackAlreadyCommitted = fallbackIndex === index;
          fallbackCommittedIndexRef.current = null;
          indexRef.current = index;
          position.setValue(index);
          offset.setValue(0);
          if (!fallbackAlreadyCommitted) {
            onIndexChange(index);
            onTabSelect?.({
              index
            });
          }
          return;
        }`,
  ],
  [
    `          pendingJumpTimeoutRef.current = null;
          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;`,
    `          pendingJumpTimeoutRef.current = null;
          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;
          androidProgrammaticJumpAckRef.current = null;
          if (androidProgrammaticJumpFallbackRef.current) {
            clearTimeout(androidProgrammaticJumpFallbackRef.current);
            androidProgrammaticJumpFallbackRef.current = null;
          }
          if (androidProgrammaticJumpRetryRef.current) {
            clearTimeout(androidProgrammaticJumpRetryRef.current);
            androidProgrammaticJumpRetryRef.current = null;
          }`,
  ],
];

const sourceAndroidPageCommitRetryReplacements = [
  [
    `  const androidPagerIdleRef = React.useRef(true);`,
    `  const androidPagerIdleRef = React.useRef(true);
  const androidPageCommitFrameRef = React.useRef<number | null>(null);`,
  ],
  [
    `      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
    },`,
    `      if (pendingJumpTimeoutRef.current) {
        clearTimeout(pendingJumpTimeoutRef.current);
      }
      if (androidPageCommitFrameRef.current !== null) {
        cancelAnimationFrame(androidPageCommitFrameRef.current);
      }
    },`,
  ],
  [
    `    if (Platform.OS === 'android') {
      if (animationEnabled) {`,
    `    if (Platform.OS === 'android') {
      if (androidPageCommitFrameRef.current !== null) {
        cancelAnimationFrame(androidPageCommitFrameRef.current);
        androidPageCommitFrameRef.current = null;
      }
      if (animationEnabled) {`,
  ],
  [
    `      indexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({ index });
      return;`,
    `      indexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({ index });
      androidPageCommitFrameRef.current = requestAnimationFrame(() => {
        androidPageCommitFrameRef.current = null;
        if (pendingJumpIndexRef.current !== index) {
          return;
        }
        if (animationEnabled) {
          pagerRef.current?.setPage(index);
        } else {
          pagerRef.current?.setPageWithoutAnimation(index);
          position.setValue(index);
          offset.setValue(0);
        }
      });
      return;`,
  ],
  [
    `        pendingJumpTimeoutRef.current = null;
        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;

        const subscription`,
    `        pendingJumpTimeoutRef.current = null;
        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;
        if (androidPageCommitFrameRef.current !== null) {
          cancelAnimationFrame(androidPageCommitFrameRef.current);
          androidPageCommitFrameRef.current = null;
        }

        const subscription`,
  ],
  [
    `            pendingJumpIndexRef.current = null;
            indexRef.current = index;`,
    `            pendingJumpIndexRef.current = null;
            if (androidPageCommitFrameRef.current !== null) {
              cancelAnimationFrame(androidPageCommitFrameRef.current);
              androidPageCommitFrameRef.current = null;
            }
            indexRef.current = index;`,
  ],
];

const moduleAndroidPageCommitRetryReplacements = [
  [
    `  const androidPagerIdleRef = React.useRef(true);`,
    `  const androidPagerIdleRef = React.useRef(true);
  const androidPageCommitFrameRef = React.useRef(null);`,
  ],
  [
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
  }, []);`,
    `    if (pendingJumpTimeoutRef.current) {
      clearTimeout(pendingJumpTimeoutRef.current);
    }
    if (androidPageCommitFrameRef.current !== null) {
      cancelAnimationFrame(androidPageCommitFrameRef.current);
    }
  }, []);`,
  ],
  [
    `    if (Platform.OS === 'android') {
      if (animationEnabled) {`,
    `    if (Platform.OS === 'android') {
      if (androidPageCommitFrameRef.current !== null) {
        cancelAnimationFrame(androidPageCommitFrameRef.current);
        androidPageCommitFrameRef.current = null;
      }
      if (animationEnabled) {`,
  ],
  [
    `      onTabSelect?.({
        index
      });
      return;`,
    `      onTabSelect?.({
        index
      });
      androidPageCommitFrameRef.current = requestAnimationFrame(() => {
        androidPageCommitFrameRef.current = null;
        if (pendingJumpIndexRef.current !== index) {
          return;
        }
        if (animationEnabled) {
          pagerRef.current?.setPage(index);
        } else {
          pagerRef.current?.setPageWithoutAnimation(index);
          position.setValue(index);
          offset.setValue(0);
        }
      });
      return;`,
  ],
  [
    `          pendingJumpTimeoutRef.current = null;
          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;
          const subscription`,
    `          pendingJumpTimeoutRef.current = null;
          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;
          if (androidPageCommitFrameRef.current !== null) {
            cancelAnimationFrame(androidPageCommitFrameRef.current);
            androidPageCommitFrameRef.current = null;
          }
          const subscription`,
  ],
  [
    `          pendingJumpIndexRef.current = null;
          indexRef.current = index;`,
    `          pendingJumpIndexRef.current = null;
          if (androidPageCommitFrameRef.current !== null) {
            cancelAnimationFrame(androidPageCommitFrameRef.current);
            androidPageCommitFrameRef.current = null;
          }
          indexRef.current = index;`,
  ],
];

const sourceAndroidDirectPageJumpReplacements = [
  [
    `      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      }
      indexRef.current = index;`,
    `      // A programmatic tab press must not animate through every intermediate
      // page on Android. Those pages are intentionally substantial in the
      // owner app; traversing them stalls the JS thread and can deliver stale
      // page-selected events after the requested tab is already active.
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
      offset.setValue(0);
      indexRef.current = index;`,
  ],
  [
    `        if (animationEnabled) {
          pagerRef.current?.setPage(index);
        } else {
          pagerRef.current?.setPageWithoutAnimation(index);
          position.setValue(index);
          offset.setValue(0);
        }
      });`,
    `        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      });`,
  ],
  [
    `    } else if (indexRef.current !== index) {
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {`,
    `    } else if (indexRef.current !== index) {
      if (Platform.OS === 'android') {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      } else if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {`,
  ],
];

const moduleAndroidDirectPageJumpReplacements = [
  [
    `      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      }
      indexRef.current = index;`,
    `      // A programmatic tab press must not animate through every intermediate
      // page on Android. Those pages are intentionally substantial in the
      // owner app; traversing them stalls the JS thread and can deliver stale
      // page-selected events after the requested tab is already active.
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
      offset.setValue(0);
      indexRef.current = index;`,
  ],
  [
    `        if (animationEnabled) {
          pagerRef.current?.setPage(index);
        } else {
          pagerRef.current?.setPageWithoutAnimation(index);
          position.setValue(index);
          offset.setValue(0);
        }
      });`,
    `        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      });`,
  ],
  [
    `    } else if (indexRef.current !== index) {
      if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {`,
    `    } else if (indexRef.current !== index) {
      if (Platform.OS === 'android') {
        pagerRef.current?.setPageWithoutAnimation(index);
        position.setValue(index);
        offset.setValue(0);
      } else if (animationEnabled) {
        pagerRef.current?.setPage(index);
      } else {`,
  ],
];

const sourceAndroidProgrammaticRouteAuthorityReplacements = [
  [
    `  const androidPageCommitFrameRef = React.useRef<number | null>(null);`,
    `  const androidPageCommitFrameRef = React.useRef<number | null>(null);
  const androidProgrammaticRouteAckRef = React.useRef(false);`,
  ],
  [
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;

    if (Platform.OS === 'android') {`,
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    androidProgrammaticRouteAckRef.current = false;

    if (Platform.OS === 'android') {`,
  ],
  [
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {`,
    `    if (Platform.OS === 'android' && pendingJumpIndexRef.current !== null) {
      const pendingIndex = pendingJumpIndexRef.current;
      if (
        index === pendingIndex &&
        indexRef.current === pendingIndex &&
        androidProgrammaticRouteAckRef.current
      ) {
        pendingJumpIndexRef.current = null;
        androidProgrammaticRouteAckRef.current = false;
      } else {
        // The navigation prop can still expose the previous index while the
        // programmatic target is already in flight. Never send that stale
        // index back to the native pager.
        return;
      }
    }

    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {`,
  ],
  [
    `        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;
        if (androidPageCommitFrameRef.current !== null) {`,
    `        pendingJumpIndexRef.current = null;
        fallbackCommittedIndexRef.current = null;
        androidProgrammaticRouteAckRef.current = false;
        if (androidPageCommitFrameRef.current !== null) {`,
  ],
  [
    `            pendingJumpIndexRef.current = null;
            if (androidPageCommitFrameRef.current !== null) {`,
    `            androidProgrammaticRouteAckRef.current = true;
            if (navigationStateRef.current.index === index) {
              pendingJumpIndexRef.current = null;
              androidProgrammaticRouteAckRef.current = false;
            }
            if (androidPageCommitFrameRef.current !== null) {`,
  ],
];

const moduleAndroidProgrammaticRouteAuthorityReplacements = [
  [
    `  const androidPageCommitFrameRef = React.useRef(null);`,
    `  const androidPageCommitFrameRef = React.useRef(null);
  const androidProgrammaticRouteAckRef = React.useRef(false);`,
  ],
  [
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    if (Platform.OS === 'android') {`,
    `    pendingJumpIndexRef.current = index;
    fallbackCommittedIndexRef.current = null;
    androidProgrammaticRouteAckRef.current = false;
    if (Platform.OS === 'android') {`,
  ],
  [
    `    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {`,
    `    if (Platform.OS === 'android' && pendingJumpIndexRef.current !== null) {
      const pendingIndex = pendingJumpIndexRef.current;
      if (index === pendingIndex && indexRef.current === pendingIndex && androidProgrammaticRouteAckRef.current) {
        pendingJumpIndexRef.current = null;
        androidProgrammaticRouteAckRef.current = false;
      } else {
        // The navigation prop can still expose the previous index while the
        // programmatic target is already in flight. Never send that stale
        // index back to the native pager.
        return;
      }
    }
    if (Platform.OS === 'android' && androidNativeSwipeAuthorityRef.current) {`,
  ],
  [
    `          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;
          if (androidPageCommitFrameRef.current !== null) {`,
    `          pendingJumpIndexRef.current = null;
          fallbackCommittedIndexRef.current = null;
          androidProgrammaticRouteAckRef.current = false;
          if (androidPageCommitFrameRef.current !== null) {`,
  ],
  [
    `          pendingJumpIndexRef.current = null;
          if (androidPageCommitFrameRef.current !== null) {`,
    `          androidProgrammaticRouteAckRef.current = true;
          if (navigationStateRef.current.index === index) {
            pendingJumpIndexRef.current = null;
            androidProgrammaticRouteAckRef.current = false;
          }
          if (androidPageCommitFrameRef.current !== null) {`,
  ],
];

const sourceAndroidIdleSwipeStabilizationReplacements = [
  [
    `      case 'idle':
        if (Platform.OS === 'android') {
          androidPagerIdleRef.current = true;
        }
        onSwipeEnd?.();`,
    `      case 'idle':
        if (Platform.OS === 'android') {
          androidPagerIdleRef.current = true;
          const settledIndex = indexRef.current;
          position.setValue(settledIndex);
          offset.setValue(0);
          if (pendingJumpIndexRef.current === null) {
            if (androidPageCommitFrameRef.current !== null) {
              cancelAnimationFrame(androidPageCommitFrameRef.current);
            }
            androidPageCommitFrameRef.current = requestAnimationFrame(() => {
              androidPageCommitFrameRef.current = null;
              if (
                !androidPagerIdleRef.current ||
                pendingJumpIndexRef.current !== null ||
                indexRef.current !== settledIndex
              ) {
                return;
              }
              position.setValue(settledIndex);
              offset.setValue(0);
            });
          }
        }
        onSwipeEnd?.();`,
  ],
  [
    `          if (Platform.OS === 'android') {
            androidNativeSwipeAuthorityRef.current = true;`,
    `          if (Platform.OS === 'android') {
            // ViewPager2 puo consegnare in ritardo un onPageSelected di uno
            // swipe precedente. A pager fermo non esiste un nuovo gesto che
            // autorizzi un cambio pagina: conserva l'ultimo indice realmente
            // confermato ed evita il rimbalzo visivo della CustomBar.
            if (androidPagerIdleRef.current) {
              position.setValue(indexRef.current);
              offset.setValue(0);
              return;
            }
            androidNativeSwipeAuthorityRef.current = true;`,
  ],
  [
    `    } else if (indexRef.current !== index) {
      if (Platform.OS === 'android') {
        pagerRef.current?.setPageWithoutAnimation(index);`,
    `    } else if (indexRef.current !== index) {
      if (Platform.OS === 'android') {
        indexRef.current = index;
        pagerRef.current?.setPageWithoutAnimation(index);`,
  ],
];

const moduleAndroidIdleSwipeStabilizationReplacements = [
  [
    `      case 'idle':
        if (Platform.OS === 'android') {
          androidPagerIdleRef.current = true;
        }
        onSwipeEnd?.();`,
    `      case 'idle':
        if (Platform.OS === 'android') {
          androidPagerIdleRef.current = true;
          const settledIndex = indexRef.current;
          position.setValue(settledIndex);
          offset.setValue(0);
          if (pendingJumpIndexRef.current === null) {
            if (androidPageCommitFrameRef.current !== null) {
              cancelAnimationFrame(androidPageCommitFrameRef.current);
            }
            androidPageCommitFrameRef.current = requestAnimationFrame(() => {
              androidPageCommitFrameRef.current = null;
              if (!androidPagerIdleRef.current || pendingJumpIndexRef.current !== null || indexRef.current !== settledIndex) {
                return;
              }
              position.setValue(settledIndex);
              offset.setValue(0);
            });
          }
        }
        onSwipeEnd?.();`,
  ],
  [
    `        if (Platform.OS === 'android') {
          androidNativeSwipeAuthorityRef.current = true;`,
    `        if (Platform.OS === 'android') {
          // ViewPager2 can deliver a stale onPageSelected from a previous
          // swipe. Once idle, no new gesture authorizes a different page.
          if (androidPagerIdleRef.current) {
            position.setValue(indexRef.current);
            offset.setValue(0);
            return;
          }
          androidNativeSwipeAuthorityRef.current = true;`,
  ],
  [
    `    } else if (indexRef.current !== index) {
      if (Platform.OS === 'android') {
        pagerRef.current?.setPageWithoutAnimation(index);`,
    `    } else if (indexRef.current !== index) {
      if (Platform.OS === 'android') {
        indexRef.current = index;
        pagerRef.current?.setPageWithoutAnimation(index);`,
  ],
];

const legacyProtectedMarkers = [
  'pendingJumpIndexRef',
  'fallbackCommittedIndexRef',
  'pendingIndex !== null && pendingIndex !== index',
  'fallbackAlreadyCommitted',
  '}, 180)',
];

const protectedMarkers = [
  ...legacyProtectedMarkers,
  'const fallbackIndex = fallbackCommittedIndexRef.current',
  'fallbackIndex !== null && fallbackIndex !== index',
];

function applyReplacements(content, replacements, filePath) {
  let nextContent = content;
  for (const [original, replacement] of replacements) {
    if (!nextContent.includes(original)) {
      throw new Error(
        `react-native-tab-view@${packageJson.version}: sorgente inattesa in ${path.relative(
          packageRoot,
          filePath,
        )}; patch del tap nativo non applicata. Blocco mancante: ${JSON.stringify(
          original.slice(0, 120),
        )}`,
      );
    }
    nextContent = nextContent.replace(original, replacement);
  }
  return nextContent;
}

function patchFile(filePath, replacements, upgradeReplacements) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isSource = filePath.endsWith('.tsx');
  const androidReplacements = isSource
    ? sourceAndroidReplacements
    : moduleAndroidReplacements;
  const swipeReplacements = isSource
    ? sourceAndroidSwipeReplacements
    : moduleAndroidSwipeReplacements;
  const authorityReplacements = isSource
    ? sourceAndroidAuthorityUpgradeReplacements
    : moduleAndroidAuthorityUpgradeReplacements;
  const finalAuthorityReplacements = isSource
    ? sourceAndroidFinalAuthorityReplacements
    : moduleAndroidFinalAuthorityReplacements;
  const pagerValueSyncReplacements = isSource
    ? sourceAndroidPagerValueSyncReplacements
    : moduleAndroidPagerValueSyncReplacements;
  const programmaticJumpAckReplacements = isSource
    ? sourceAndroidProgrammaticJumpAckReplacements
    : moduleAndroidProgrammaticJumpAckReplacements;
  const pageCommitRetryReplacements = isSource
    ? sourceAndroidPageCommitRetryReplacements
    : moduleAndroidPageCommitRetryReplacements;
  const directPageJumpReplacements = isSource
    ? sourceAndroidDirectPageJumpReplacements
    : moduleAndroidDirectPageJumpReplacements;
  const programmaticRouteAuthorityReplacements = isSource
    ? sourceAndroidProgrammaticRouteAuthorityReplacements
    : moduleAndroidProgrammaticRouteAuthorityReplacements;
  const idleSwipeStabilizationReplacements = isSource
    ? sourceAndroidIdleSwipeStabilizationReplacements
    : moduleAndroidIdleSwipeStabilizationReplacements;
  const androidJumpCommitsImmediately =
    content.includes("if (Platform.OS === 'android') {") &&
    content.includes('indexRef.current = index;\n      onIndexChange(index);');
  const androidSwipeCommitsOnIdle =
    content.includes('pendingAndroidSwipeIndexRef') &&
    content.includes('const settledIndex = pendingAndroidSwipeIndexRef.current;');
  const androidTimedSwipeAuthority =
    content.includes('androidNativeSwipeAuthorityRef') &&
    content.includes('scheduleAndroidSwipeAuthorityRelease');
  const androidFinalSwipeAuthority =
    content.includes('androidNativeSwipeAuthorityRef') &&
    content.includes('androidPagerIdleRef') &&
    !content.includes('scheduleAndroidSwipeAuthorityRelease');
  const androidPagerValueSynced = isSource
    ? content.includes('Riallinea entrambi i nodi')
    : content.includes('Realign both');
  const androidProgrammaticJumpAcked = content.includes(
    'androidProgrammaticJumpAckRef',
  );
  const androidPageCommitRetried = content.includes(
    'androidPageCommitFrameRef',
  );
  const androidPageJumpIsDirect = content.includes(
    'A programmatic tab press must not animate through every intermediate',
  );
  const androidProgrammaticRouteIsAuthoritative = content.includes(
    'androidProgrammaticRouteAckRef',
  );
  const androidIdleSwipeIsStabilized =
    content.includes('const settledIndex = indexRef.current;') &&
    content.includes('indexRef.current !== settledIndex') &&
    content.includes('if (androidPagerIdleRef.current)') &&
    content.includes(
      "if (Platform.OS === 'android') {\n        indexRef.current = index;\n        pagerRef.current?.setPageWithoutAnimation(index);",
    );

  if (
    androidJumpCommitsImmediately &&
    androidFinalSwipeAuthority &&
    androidPagerValueSynced &&
    androidPageCommitRetried &&
    androidPageJumpIsDirect &&
    androidProgrammaticRouteIsAuthoritative &&
    androidIdleSwipeIsStabilized
  ) {
    return false;
  }

  if (
    androidJumpCommitsImmediately &&
    androidFinalSwipeAuthority &&
    androidPagerValueSynced
  ) {
    // La protezione swipe finale e' gia presente: resta soltanto l'eventuale
    // upgrade di conferma del salto programmatico applicato qui sotto.
  } else if (androidJumpCommitsImmediately && androidTimedSwipeAuthority) {
    content = applyReplacements(content, finalAuthorityReplacements, filePath);
  } else if (androidJumpCommitsImmediately && androidSwipeCommitsOnIdle) {
    content = applyReplacements(content, authorityReplacements, filePath);
    content = applyReplacements(content, finalAuthorityReplacements, filePath);
  } else if (androidJumpCommitsImmediately) {
    content = applyReplacements(content, swipeReplacements, filePath);
    content = applyReplacements(content, authorityReplacements, filePath);
    content = applyReplacements(content, finalAuthorityReplacements, filePath);
  } else {
    const alreadyPatched = protectedMarkers.every((marker) =>
      content.includes(marker),
    );
    const legacyPatched = legacyProtectedMarkers.every((marker) =>
      content.includes(marker),
    );
    if (!alreadyPatched) {
      content = applyReplacements(
        content,
        legacyPatched ? upgradeReplacements : replacements,
        filePath,
      );
    }
    content = applyReplacements(content, androidReplacements, filePath);
    content = applyReplacements(content, swipeReplacements, filePath);
    content = applyReplacements(content, authorityReplacements, filePath);
    content = applyReplacements(content, finalAuthorityReplacements, filePath);
  }

  if (!androidPagerValueSynced) {
    content = applyReplacements(content, pagerValueSyncReplacements, filePath);
  }
  if (!androidPageCommitRetried) {
    content = applyReplacements(content, pageCommitRetryReplacements, filePath);
  }
  if (!androidPageJumpIsDirect) {
    content = applyReplacements(content, directPageJumpReplacements, filePath);
  }
  if (!androidProgrammaticRouteIsAuthoritative) {
    content = applyReplacements(
      content,
      programmaticRouteAuthorityReplacements,
      filePath,
    );
  }
  if (!androidIdleSwipeIsStabilized) {
    content = applyReplacements(
      content,
      idleSwipeStabilizationReplacements,
      filePath,
    );
  }
  if (
    !protectedMarkers.every((marker) => content.includes(marker)) ||
    !content.includes('androidPagerIdleRef') ||
    !content.includes('androidPageCommitFrameRef') ||
    !content.includes(
      'A programmatic tab press must not animate through every intermediate',
    ) ||
    !content.includes('androidProgrammaticRouteAckRef') ||
    !content.includes('const settledIndex = indexRef.current;') ||
    !content.includes('indexRef.current !== settledIndex') ||
    !content.includes('if (androidPagerIdleRef.current)') ||
    !content.includes(
      "if (Platform.OS === 'android') {\n        indexRef.current = index;\n        pagerRef.current?.setPageWithoutAnimation(index);",
    ) ||
    !content.includes("if (Platform.OS === 'android') {") ||
    !content.includes('indexRef.current = index;\n      onIndexChange(index);') ||
    !(isSource
      ? content.includes('Riallinea entrambi i nodi')
      : content.includes('Realign both'))
  ) {
    throw new Error(
      `react-native-tab-view@${packageJson.version}: verifica finale fallita per ${path.relative(
        packageRoot,
        filePath,
      )}.`,
    );
  }

  fs.writeFileSync(filePath, content);
  return true;
}

function patchTabViewPagerRetention(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const isSource = filePath.endsWith('.tsx');
  const propMarker = isSource
    ? 'offscreenPageLimit={offscreenPageLimit}'
    : 'offscreenPageLimit: offscreenPageLimit';

  if (content.includes(propMarker)) {
    return false;
  }

  const replacements = isSource
    ? [
        [
          `  animationEnabled = true,
  overScrollMode,
  options: sceneOptions,`,
          `  animationEnabled = true,
  overScrollMode,
  offscreenPageLimit,
  options: sceneOptions,`,
        ],
        [
          `        animationEnabled={animationEnabled}
        overScrollMode={overScrollMode}
        style={pagerStyle}`,
          `        animationEnabled={animationEnabled}
        overScrollMode={overScrollMode}
        offscreenPageLimit={offscreenPageLimit}
        style={pagerStyle}`,
        ],
      ]
    : [
        [
          `  animationEnabled = true,
  overScrollMode,
  options: sceneOptions,`,
          `  animationEnabled = true,
  overScrollMode,
  offscreenPageLimit,
  options: sceneOptions,`,
        ],
        [
          `      animationEnabled: animationEnabled,
      overScrollMode: overScrollMode,
      style: pagerStyle,`,
          `      animationEnabled: animationEnabled,
      overScrollMode: overScrollMode,
      offscreenPageLimit: offscreenPageLimit,
      style: pagerStyle,`,
        ],
      ];

  content = applyReplacements(content, replacements, filePath);
  if (!content.includes(propMarker)) {
    throw new Error(
      `react-native-tab-view@${packageJson.version}: inoltro offscreenPageLimit non verificato per ${path.relative(
        packageRoot,
        filePath,
      )}.`,
    );
  }

  fs.writeFileSync(filePath, content);
  return true;
}

function patchTabViewEdgeBounce(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const isSource = filePath.endsWith('.tsx');
  const prop = isSource ? 'overdrag={overdrag}' : 'overdrag: overdrag';
  if (content.includes(prop)) return false;

  // TabView declares this PagerView prop but otherwise drops it at runtime.
  // Forward it explicitly; page selection and the web adapter stay unchanged.
  const next = applyReplacements(content, [
    ['  overScrollMode,\n  offscreenPageLimit,',
      '  overScrollMode,\n  overdrag,\n  offscreenPageLimit,'],
    isSource
      ? ['        overScrollMode={overScrollMode}',
          '        overScrollMode={overScrollMode}\n        overdrag={overdrag}']
      : ['      overScrollMode: overScrollMode,',
          '      overScrollMode: overScrollMode,\n      overdrag: overdrag,'],
  ], filePath);
  if (!next.includes(prop)) {
    throw new Error(`Inoltro overdrag non verificato: ${filePath}`);
  }
  fs.writeFileSync(filePath, next);
  return true;
}

// A selected-event acknowledgement may arrive after native scrolling has
// left the animated nodes at a stale offset. Reconcile the visual position
// without committing the route a second time or issuing another pager command.
function patchAndroidConfirmedSelectionSync(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const branch = content.match(/if \(Platform\.OS === 'android' && pendingIndex !== null\) \{[\s\S]*?indexRef\.current = index;\s*(?:position\.setValue\(index\);\s*offset\.setValue\(0\);\s*)?return;/);
  if (!branch) throw new Error('Android selected-event branch changed: ' + filePath);
  if (branch[0].includes('position.setValue(index);') && branch[0].includes('offset.setValue(0);')) return false;
  const indent = branch[0].match(/\n([ \t]*)indexRef\.current = index;/)?.[1];
  if (indent === undefined) throw new Error('Android selected-event indentation changed: ' + filePath);
  const reconciled = branch[0].replace('indexRef.current = index;',
    `indexRef.current = index;\n${indent}position.setValue(index);\n${indent}offset.setValue(0);`);
  fs.writeFileSync(filePath, content.replace(branch[0], reconciled));
  return true;
}

const changed = [
  patchFile(sourcePath, sourceReplacements, sourceUpgradeReplacements),
  patchFile(modulePath, moduleReplacements, moduleUpgradeReplacements),
  patchAndroidConfirmedSelectionSync(sourcePath),
  patchAndroidConfirmedSelectionSync(modulePath),
  patchTabViewPagerRetention(tabViewSourcePath),
  patchTabViewPagerRetention(tabViewModulePath),
  patchTabViewEdgeBounce(tabViewSourcePath),
  patchTabViewEdgeBounce(tabViewModulePath),
].some(Boolean);

// iOS can retain the interactive offset after a non-animated tab jump.
for (const filePath of [sourcePath, modulePath]) {
  let content = fs.readFileSync(filePath, 'utf8');
  const marker = "if (Platform.OS === 'ios') offset.setValue(0);";
  if (!content.includes(marker)) {
    content = content.replace(/position\.setValue\(index\);(?!\s*offset\.setValue\(0\);)/g,
      'position.setValue(index);\n      ' + marker);
    fs.writeFileSync(filePath, content);
  }
}

// Non-animated iOS taps already know the destination. Commit navigation after
// issuing the native command, without waiting for the selected-event round trip.
for (const filePath of [sourcePath, modulePath]) {
  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('// iosImmediateTabCommit')) {
    const anchor = '    pendingJumpTimeoutRef.current = setTimeout(() => {';
    const immediate = `    // iosImmediateTabCommit
    if (Platform.OS === 'ios' && !animationEnabled) {
      pagerRef.current?.setPageWithoutAnimation(index);
      position.setValue(index);
      offset.setValue(0);
      indexRef.current = index;
      fallbackCommittedIndexRef.current = index;
      onIndexChange(index);
      onTabSelect?.({ index });
      return;
    }

`;
    if (!content.includes(anchor)) throw new Error('Missing iOS jump anchor: ' + filePath);
    content = content.replace(anchor, immediate + anchor);
    const effectAnchor = "    if (Platform.OS === 'android' && pendingJumpIndexRef.current !== null) {";
    if (!content.includes(effectAnchor)) throw new Error('Missing iOS pending guard anchor: ' + filePath);
    if (!content.includes("if (Platform.OS === 'ios' && pendingJumpIndexRef.current !== null")) content = content.replace(effectAnchor, `    // Ignore stale navigation props while the immediate iOS target is pending.
    if (Platform.OS === 'ios' && pendingJumpIndexRef.current !== null &&
        index !== pendingJumpIndexRef.current) {
      return;
    }

` + effectAnchor);
    fs.writeFileSync(filePath, content);
  }
}

process.stdout.write(
  `react-native-tab-view@${packageJson.version}: tap nativo ${
    changed ? 'protetto' : 'gia protetto'
  }; pagine Android mantenute calde, selezione stabile e adapter web invariato.\n`,
);
