const { withGradleProperties, withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
};

function configureProperties(properties) {
  const retained = properties.filter(
    (item) => item.type !== 'property' || !(item.key in RELEASE_PROPERTIES),
  );
  return [
    ...retained,
    ...Object.entries(RELEASE_PROPERTIES).map(([key, value]) => ({
      type: 'property', key, value,
    })),
  ];
}

function configureBuildGradle(contents) {
  // Keep the Expo/RN template's release-only switches and all library keep rules.
  // Fail explicitly if a future template changes instead of silently disabling R8.
  if (!/minifyEnabled\s+enableMinifyInReleaseBuilds/.test(contents) ||
      !/shrinkResources\s+enableShrinkResources\.toBoolean\(\)/.test(contents)) {
    throw new Error('Android release optimization: review the changed Expo release template.');
  }
  if (!/getDefaultProguardFile\(["']proguard-android(?:-optimize)?\.txt["']\)/.test(contents)) {
    throw new Error('Android release optimization: default ProGuard configuration not found.');
  }
  return contents.replace(
    /getDefaultProguardFile\((["'])proguard-android\.txt\1\)/g,
    'getDefaultProguardFile("proguard-android-optimize.txt")',
  );
}

function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (mod) => {
    mod.modResults = configureProperties(mod.modResults);
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      throw new Error('Android release optimization: the plugin expects Expo’s Groovy template.');
    }
    mod.modResults.contents = configureBuildGradle(mod.modResults.contents);
    return mod;
  });
}

module.exports = withAndroidReleaseOptimization;
module.exports.configureProperties = configureProperties;
module.exports.configureBuildGradle = configureBuildGradle;
