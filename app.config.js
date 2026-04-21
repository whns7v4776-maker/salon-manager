const baseConfig = {
  expo: {
    name: 'SalonPro',
    slug: 'salon-manager',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/app-icons/salonpro-final/light_ios_1024_final.png',
    scheme: 'salonmanager',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: {
        light: './assets/images/app-icons/salonpro-final/light_ios_1024_final.png',
        dark: './assets/images/app-icons/salonpro-final/dark_ios_1024_final.png',
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
      icon: './assets/images/app-icons/salonpro-final/light_android_512_final.png',
      adaptiveIcon: {
        backgroundColor: '#ffffff',
        foregroundImage: './assets/images/app-icons/salonpro-final/light_android_512_final.png',
        monochromeImage: './assets/images/app-icons/salonpro-final/dark_android_512_final.png',
      },
      softwareKeyboardLayoutMode: 'resize',
      predictiveBackGestureEnabled: false,
      package: 'com.marzix91.salonmanager',
      googleServicesFile: './google-services.json',
      permissions: ['CAMERA'],
    },
    web: {
      output: 'static',
      favicon: './assets/images/app-icons/salonpro-final/light_ios_1024_final.png',
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
          icon: './assets/images/app-icons/salonpro-final/notification_android_96_final.png',
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
          image: './assets/images/app-icons/salonpro-final/light_ios_1024_final.png',
          imageWidth: 240,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            image: './assets/images/app-icons/salonpro-final/dark_ios_1024_final.png',
            backgroundColor: '#060816',
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
