const baseConfig = {
  expo: {
    name: 'SalonPro',
    slug: 'salon-manager',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'salonmanager',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/images/icon.png',
      supportsTablet: true,
      bundleIdentifier: 'com.marzix91.salonmanager',
      infoPlist: {
        CFBundleDisplayName: 'SalonPro',
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      icon: './assets/images/icon.png',
      adaptiveIcon: {
        backgroundColor: '#ffffff',
        foregroundImage: './assets/images/android-icon-foreground.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: false,
      package: 'com.marzix91.salonmanager',
      googleServicesFile: './google-services.json',
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      'expo-notifications',
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
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
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
