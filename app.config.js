const isDevelopmentVariant = process.env.APP_VARIANT === 'development';
const terminalBuildEnabled = process.env.STRIPE_TERMINAL_BUILD === 'true';
const metaAppConfig = require('./config/meta-app-events');
const appVersion = '1.0.22';
const appName = isDevelopmentVariant ? 'SalonPro DEV' : 'SalonPro';
const appScheme = isDevelopmentVariant ? 'salonmanager-dev' : 'salonmanager';
const iosBundleIdentifier = isDevelopmentVariant
  ? 'com.marzix91.salonmanager.dev'
  : 'com.marzix91.salonmanager';
const androidPackage = isDevelopmentVariant
  ? 'com.marzix91.salonmanager.dev'
  : 'com.marzix91.salonmanager';
const iosAssociatedDomains = isDevelopmentVariant
  ? []
  : [
      'applinks:salon-manager-puce.vercel.app',
      'applinks:salonpro.dev',
    ];

const baseConfig = {
  expo: {
    name: appName,
    slug: 'salon-manager',
    version: appVersion,
    orientation: 'portrait',
    icon: './assets/icon-light.png',
    scheme: appScheme,
    userInterfaceStyle: 'automatic',
    updates: {
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 5000,
      url: 'https://u.expo.dev/cde34c38-a843-4af6-a402-0631fb9f5779',
    },
    ios: {
      icon: './assets/ios-icon-light-no-alpha.png',
      supportsTablet: true,
      bundleIdentifier: iosBundleIdentifier,
      runtimeVersion: appVersion,
      associatedDomains: iosAssociatedDomains,
      infoPlist: {
        CFBundleDisplayName: appName,
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          'Usiamo la fotocamera per inquadrare il QR del salone e aprire subito la pagina cliente corretta.',
      },
    },
    android: {
      icon: './assets/icon-light.png',
      runtimeVersion: {
        policy: 'appVersion',
      },
      adaptiveIcon: {
        backgroundColor: '#D7D7D7',
        foregroundImage: './assets/android-home-icon-safe.png',
      },
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: false,
      package: androidPackage,
      googleServicesFile: './google-services.json',
      permissions: ['CAMERA'],
      edgeToEdgeEnabled: false,
    },
    androidNavigationBar: {
      backgroundColor: '#F3F6FA',
      barStyle: 'dark-content',
      enforceContrast: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      ['expo-location', { isIosBackgroundLocationEnabled: true, isAndroidBackgroundLocationEnabled: true, isAndroidForegroundServiceEnabled: true, locationAlwaysAndWhenInUsePermission: 'Solo con il tuo consenso, SalonPro usa la posizione anche in background per i promemoria dei tuoi appuntamenti. Non conserviamo una cronologia degli spostamenti. Puoi disattivarla in qualsiasi momento.', locationWhenInUsePermission: 'SalonPro usa la posizione per trovare saloni vicini o impostare la sede del salone e, solo se attivi l’opzione dedicata, per i promemoria degli appuntamenti. Il consenso è facoltativo.' }],
      [
        'expo-router',
        {
          // Web static export only: load each route on demand instead of
          // shipping Agenda, Clienti and Servizi in the landing bundle.
          asyncRoutes: { web: process.env.NODE_ENV === 'production', default: false },
        },
      ],
      [
        'expo-camera',
        {
          cameraPermission:
            'Usiamo la fotocamera per inquadrare il QR del salone e aprire subito la pagina cliente corretta.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/icon-light.png',
          color: '#181818',
        },
      ],
      [
        'expo-local-authentication',
        {
          faceIDPermission:
            "Usiamo Face ID per consentirti l'accesso sicuro al backoffice del salone.",
        },
      ],
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon-rounded.png',
          imageWidth: 240,
          resizeMode: 'contain',
          backgroundColor: '#D7D7D7',
          ios: {
            enableFullScreenImage_legacy: false,
          },
          dark: {
            image: './assets/splash-icon-rounded.png',
            backgroundColor: '#D7D7D7',
          },
          android: {
            image: './assets/splash-icon-rounded.png',
          },
        },
      ],
      '@react-native-community/datetimepicker',
    ],
    experiments: {
      typedRoutes: false,
      reactCompiler: false,
    },
    extra: {
      router: {},
      appVariant: isDevelopmentVariant ? 'development' : 'production',
      publicClientBaseUrl: 'https://salon-manager-puce.vercel.app',
      eas: {
        projectId: 'cde34c38-a843-4af6-a402-0631fb9f5779',
      },
    },
  },
};

module.exports = () => {
  const existingExtra = baseConfig.expo.extra ?? {};
  // Opt-in build flag: never silently ship a partially configured advertising SDK.
  const metaEnabled = process.env.META_APP_EVENTS_ENABLED === 'true' && !isDevelopmentVariant;
  const metaClientToken = process.env.META_CLIENT_TOKEN?.trim() || metaAppConfig.clientToken;
  if (metaEnabled && !metaClientToken) {
    throw new Error('META_CLIENT_TOKEN is required when META_APP_EVENTS_ENABLED=true');
  }

  return {
    ...baseConfig.expo,
    ios: {
      ...baseConfig.expo.ios,
      runtimeVersion: terminalBuildEnabled ? `${appVersion}-terminal2${metaEnabled ? '-meta1' : ''}` : metaEnabled ? `${appVersion}-meta1` : baseConfig.expo.ios.runtimeVersion,
      ...(terminalBuildEnabled ? {entitlements:{'com.apple.developer.proximity-reader.payment.acceptance':true}} : {}),
    },
    android: {
      ...baseConfig.expo.android,
      runtimeVersion: terminalBuildEnabled ? `${appVersion}-terminal2${metaEnabled ? '-meta1' : ''}` : metaEnabled ? `${appVersion}-meta1` : baseConfig.expo.android.runtimeVersion,
    },
    plugins: [
      ...baseConfig.expo.plugins,
      ...(terminalBuildEnabled ? [['@stripe/stripe-terminal-react-native', {
        appDelegate:true, tapToPayCheck:true, bluetoothBackgroundMode:false,
        locationWhenInUsePermission:'SalonPro usa la posizione per i saloni vicini e, quando incassi contactless, per la sicurezza del pagamento Stripe.',
        bluetoothAlwaysUsagePermission:'SalonPro usa Bluetooth per collegarsi ai lettori di pagamento compatibili.',
      }], './plugins/with-android-terminal'] : []),
      './plugins/with-android-release-optimization',
      './plugins/with-tablet-orientation',
      './plugins/with-ios-scene-lifecycle',
      './plugins/with-ios-build-compat',
      // Native dependency autolinks even when runtime measurement is off.
      // Always supply the app ID and explicit privacy defaults to its native adapter.
      ...[[
        'react-native-fbsdk-next',
        {
          appID: metaAppConfig.appId,
          clientToken: metaClientToken,
          displayName: 'SalonPro',
          scheme: 'fb3228220230705821',
          isAutoInitEnabled: false,
          autoLogAppEventsEnabled: false,
          advertiserIDCollectionEnabled: false,
          iosUserTrackingPermission: 'Con il tuo consenso, usiamo gli identificativi del dispositivo per misurare quali pubblicità Meta portano a usare SalonPro.',
        },
      ], 'expo-tracking-transparency'],
    ],
    extra: {
      ...existingExtra,
      terminalBuildEnabled,
      metaAppEventsEnabled: metaEnabled,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? existingExtra.supabaseUrl ?? '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? existingExtra.supabaseAnonKey ?? '',
      revenueCatAppleApiKey:
        process.env.EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY ??
        existingExtra.revenueCatAppleApiKey ??
        '',
      revenueCatGoogleApiKey:
        process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ??
        existingExtra.revenueCatGoogleApiKey ??
        '',
    },
  };
};
