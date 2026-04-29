const baseConfig = {
  expo: {
    name: 'SalonPro',
    slug: 'salon-manager',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'salonmanager',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: {
        light: './assets/ios-icon-no-alpha.png',
        dark: './assets/ios-icon-dark-no-alpha.png',
      },
      supportsTablet: true,
      bundleIdentifier: 'com.marzix91.salonmanager',
      infoPlist: {
        CFBundleDisplayName: 'SalonPro',
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          'Usiamo la fotocamera per inquadrare il QR del salone e aprire subito la pagina cliente corretta.',
      },
    },
    android: {
      icon: './assets/icon.png',
      adaptiveIcon: {
        backgroundColor: '#FAF6EE',
        foregroundImage: './assets/adaptive-icon.png',
      },
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: false,
      package: 'com.marzix91.salonmanager',
      googleServicesFile: './google-services.json',
      permissions: ['CAMERA'],
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
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
          icon: './assets/images/android-icon-monochrome.png',
          color: '#C89B3C',
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
          image: './assets/icon-light.png',
          imageWidth: 240,
          resizeMode: 'contain',
          backgroundColor: '#FAF6EE',
          dark: {
            image: './assets/icon-night.png',
            backgroundColor: '#111111',
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
      publicClientBaseUrl: 'https://salon-manager-puce.vercel.app',
      eas: {
        projectId: 'cde34c38-a843-4af6-a402-0631fb9f5779',
      },
    },
  },
};

module.exports = () => {
  const existingExtra = baseConfig.expo.extra ?? {};

  return {
    ...baseConfig.expo,
    extra: {
      ...existingExtra,
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? existingExtra.supabaseUrl ?? '',
      supabaseAnonKey:
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? existingExtra.supabaseAnonKey ?? '',
    },
  };
};
