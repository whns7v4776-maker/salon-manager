const fs = require('node:fs/promises');
const { AndroidConfig, withAppBuildGradle, withFinalizedMod, withGradleProperties } = require('expo/config-plugins');

const TERMINAL_PROPERTIES = {
  // Terminal's core SDK needs API 26. Tap to Pay itself is checked at runtime
  // (Android 13+, NFC, hardware keystore and Stripe's device attestation).
  'android.minSdkVersion': '26',
  'StripeTerminalReactNative_terminalSdkVersion': '5.8.2',
  'StripeTerminalReactNative_taptopay.enabled': 'true',
};

function configureTerminalProperties(properties) {
  const existingMin = properties.find(p => p.type === 'property' && p.key === 'android.minSdkVersion');
  const existingJvm = properties.find(p => p.type === 'property' && p.key === 'org.gradle.jvmargs');
  const existingMerges = properties.find(p => p.type === 'property' && p.key === 'android.packagingOptions.merges');
  // Both HTTP libraries include this notice. Merge it without dropping either
  // dependency or changing the SDK's code/keep rules.
  const resourceMerges = [...new Set([...(existingMerges?.value || '').split(',').map(s => s.trim()).filter(Boolean), 'META-INF/DEPENDENCIES'])].join(',');
  const minSdk = Math.max(26, Number(existingMin?.value) || 26);
  // The SDK and R8 exceeded Expo's default 2 GiB heap in a real release build.
  // Raise the build tools' budget, retaining any larger user setting and flags.
  let jvmArgs = existingJvm?.value || '-Dfile.encoding=UTF-8';
  for (const [pattern, option, minimumMb] of [
    [/-Xmx(\d+)([gmk])?(?=\s|$)/i, '-Xmx', 6144],
    [/-XX:MaxMetaspaceSize=(\d+)([gmk])?(?=\s|$)/i, '-XX:MaxMetaspaceSize=', 1024],
  ]) {
    const match = jvmArgs.match(pattern);
    const multiplier = { g: 1024, m: 1, k: 1 / 1024 }[match?.[2]?.toLowerCase()] || 1 / (1024 * 1024);
    if (!match) jvmArgs += ` ${option}${minimumMb}m`;
    else if (Number(match[1]) * multiplier < minimumMb) jvmArgs = jvmArgs.replace(pattern, `${option}${minimumMb}m`);
  }
  return [
    ...properties.filter(p => p.type !== 'property' || (!(p.key in TERMINAL_PROPERTIES) && p.key !== 'org.gradle.jvmargs' && p.key !== 'android.packagingOptions.merges')),
    ...Object.entries({ ...TERMINAL_PROPERTIES, 'android.minSdkVersion': String(minSdk), 'org.gradle.jvmargs': jvmArgs, 'android.packagingOptions.merges': resourceMerges })
      .map(([key, value]) => ({ type: 'property', key, value })),
  ];
}

function configureTerminalApplication(contents) {
  if (!contents.includes('super.onCreate()') ||
      !contents.includes('import com.stripeterminalreactnative.TapToPay') ||
      !contents.includes('TerminalApplicationDelegate.onCreate(this)')) {
    throw new Error('Android Terminal initialization changed: review MainApplication before building.');
  }
  // Expo runs dangerous mods before MainApplication mods. The SDK plugin's
  // delegate can otherwise land ahead of its separate-process guard.
  const guard = '    if (TapToPay.isInTapToPayProcess()) { return }';
  return contents.replace(/\n[ \t]*if \(TapToPay\.isInTapToPayProcess\(\)\) \{ return \}/g, '')
    .replace('super.onCreate()', `super.onCreate()\n${guard}`);
}

function configureTerminalProguard(contents) {
  // Remove the intermediate preflight workaround. Stripe keeps all Tink
  // classes, so provide their missing libraries instead of suppressing warnings
  // or modifying the payment SDK's consumer rules.
  const pattern = /# SalonPro Terminal: unused Tink desktop downloader[\s\S]*?# End SalonPro Terminal downloader\n?/g;
  return contents.replace(pattern, '');
}

function configureTerminalDependencies(contents) {
  const marker = '// SalonPro Terminal: Tink optional runtime dependencies';
  const end = '// End SalonPro Terminal dependencies';
  const dependencies = `${marker}\n` +
    '    implementation("com.google.http-client:google-http-client:1.47.1")\n' +
    '    implementation("joda-time:joda-time:2.14.0")\n' +
    '    implementation("org.joda:joda-convert:2.2.3")\n' + `    ${end}\n`;
  const pattern = /\/\/ SalonPro Terminal: Tink optional runtime dependencies[\s\S]*?\/\/ End SalonPro Terminal dependencies\n?/g;
  if (contents.includes(marker)) return contents.replace(pattern, dependencies);
  if (!/dependencies\s*\{/.test(contents)) throw new Error('Android dependency block changed: review Terminal dependencies before building.');
  return contents.replace(/dependencies\s*\{/, block => `${block}\n    ${dependencies}`);
}

module.exports = config => {
  config = withGradleProperties(config, mod => {
    mod.modResults = configureTerminalProperties(mod.modResults);
    return mod;
  });
  config = withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Review Terminal dependency configuration for non-Groovy Gradle.');
    mod.modResults.contents = configureTerminalDependencies(mod.modResults.contents);
    return mod;
  });
  return withFinalizedMod(config, ['android', async mod => {
    const { path } = await AndroidConfig.Paths.getMainApplicationAsync(mod.modRequest.projectRoot);
    const contents = await fs.readFile(path, 'utf8');
    await fs.writeFile(path, configureTerminalApplication(contents), 'utf8');
    const rulesPath = require('node:path').join(mod.modRequest.platformProjectRoot, 'app', 'proguard-rules.pro');
    await fs.writeFile(rulesPath, configureTerminalProguard(await fs.readFile(rulesPath, 'utf8')), 'utf8');
    return mod;
  }]);
};
module.exports.configureTerminalProperties = configureTerminalProperties;
module.exports.configureTerminalApplication = configureTerminalApplication;
module.exports.configureTerminalProguard = configureTerminalProguard;
module.exports.configureTerminalDependencies = configureTerminalDependencies;
