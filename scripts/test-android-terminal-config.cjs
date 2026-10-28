const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compileModsAsync } = require('expo/config-plugins');
const stripePlugin = require('@stripe/stripe-terminal-react-native/app.plugin').default;
const withAndroidTerminal = require('../plugins/with-android-terminal');
require('tsx/cjs');
const { androidContactlessPrerequisite, androidContactlessError } = require('../src/lib/android-contactless-readiness.ts');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'salonpro-terminal-preflight-'));
  try {
    const java = path.join(root, 'android/app/src/main/java/com/example');
    fs.mkdirSync(java, { recursive: true });
    fs.writeFileSync(path.join(root, 'android/gradle.properties'), 'android.minSdkVersion=24\nhermesEnabled=true\n');
    const buildGradlePath = path.join(root, 'android/app/build.gradle');
    fs.writeFileSync(buildGradlePath, 'dependencies {\n    implementation("com.example:existing:1.0")\n}\n');
    fs.writeFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'),
      '<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example"><application android:name=".MainApplication"/></manifest>');
    const mainAppPath = path.join(java, 'MainApplication.kt');
    const rulesPath = path.join(root, 'android/app/proguard-rules.pro');
    fs.writeFileSync(rulesPath, '-keep class com.example.Existing { *; }\n');
    fs.writeFileSync(mainAppPath, `package com.example
import android.app.Application
import com.facebook.react.ReactApplication
class MainApplication : Application(), ReactApplication {
  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}`);
    for (let i = 0; i < 2; i++) {
      let config = { name: 'Terminal preflight', slug: 'terminal-preflight', android: { package: 'com.example' } };
      config = stripePlugin(config, { appDelegate: true, tapToPayCheck: true });
      config = withAndroidTerminal(config);
      await compileModsAsync(config, { projectRoot: root, platforms: ['android'] });
      const app = fs.readFileSync(mainAppPath, 'utf8');
      assert.match(app, /super\.onCreate\(\)\n\s*if \(TapToPay\.isInTapToPayProcess\(\)\) \{ return \}\n\s*TerminalApplicationDelegate\.onCreate\(this\)/);
      assert.equal((app.match(/TapToPay\.isInTapToPayProcess/g) || []).length, 1);
      assert.ok(app.indexOf('TerminalApplicationDelegate.onCreate') < app.indexOf('loadReactNative'));
      const properties = fs.readFileSync(path.join(root, 'android/gradle.properties'), 'utf8');
      assert.match(properties, /android.minSdkVersion=26/);
      assert.match(properties, /StripeTerminalReactNative_terminalSdkVersion=5\.8\.2/);
      assert.match(properties, /StripeTerminalReactNative_taptopay.enabled=true/);
      assert.match(properties, /hermesEnabled=true/);
      assert.match(properties, /android.packagingOptions.merges=META-INF\/DEPENDENCIES/);
      const manifest = fs.readFileSync(path.join(root, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
      for (const permission of ['ACCESS_COARSE_LOCATION', 'BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT']) assert.ok(manifest.includes(permission));
      const rules = fs.readFileSync(rulesPath, 'utf8');
      assert.ok(rules.includes('-keep class com.example.Existing { *; }'));
      assert.equal(withAndroidTerminal.configureTerminalProguard(rules), rules);
      assert.ok(!rules.includes('-dontwarn'));
      const buildGradle = fs.readFileSync(buildGradlePath, 'utf8');
      assert.ok(buildGradle.includes('com.example:existing:1.0'));
      assert.equal((buildGradle.match(/com.google.http-client:google-http-client:1\.47\.1/g) || []).length, 1);
      assert.equal((buildGradle.match(/joda-time:joda-time:2\.14\.0/g) || []).length, 1);
      assert.equal((buildGradle.match(/org.joda:joda-convert:2\.2\.3/g) || []).length, 1);
      assert.equal(withAndroidTerminal.configureTerminalDependencies(buildGradle), buildGradle);
    }
    const props = [{ type: 'property', key: 'android.minSdkVersion', value: '33' }, { type: 'comment', value: 'keep' }];
    const configured = withAndroidTerminal.configureTerminalProperties(props);
    assert.deepEqual(withAndroidTerminal.configureTerminalProperties(configured), configured);
    assert.equal(configured.find(item => item.key === 'android.minSdkVersion').value, '33');
    assert.ok(configured.some(item => item.type === 'comment' && item.value === 'keep'));
    const lowBudget = withAndroidTerminal.configureTerminalProperties([{ type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx2048m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8' }]);
    assert.equal(lowBudget.find(p => p.key === 'org.gradle.jvmargs').value, '-Xmx6144m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8');
    const largerBudget = '-Xmx8g -XX:MaxMetaspaceSize=2g -Dfile.encoding=UTF-8';
    assert.equal(withAndroidTerminal.configureTerminalProperties([{ type: 'property', key: 'org.gradle.jvmargs', value: largerBudget }]).find(p => p.key === 'org.gradle.jvmargs').value, largerBudget);
    assert.throws(() => withAndroidTerminal.configureTerminalApplication('changed template'), /review MainApplication/);
    const mergeConfig = withAndroidTerminal.configureTerminalProperties([{type:'property',key:'android.packagingOptions.merges',value:'existing/notice,META-INF/DEPENDENCIES'}]);
    assert.equal(mergeConfig.find(p => p.key === 'android.packagingOptions.merges').value,'existing/notice,META-INF/DEPENDENCIES');
    assert.throws(() => withAndroidTerminal.configureTerminalDependencies('changed template'), /review Terminal dependencies/);
    assert.equal(withAndroidTerminal.configureTerminalProguard('-keep class Existing\n# SalonPro Terminal: unused Tink desktop downloader\n-checkdiscard class Example\n# End SalonPro Terminal downloader\n'), '-keep class Existing\n');

    const configPath = path.resolve(__dirname, '../app.config.js');
    const nativeConfigPath = path.resolve(__dirname, '../react-native.config.js');
    for (const enabled of [false, true]) {
      process.env.STRIPE_TERMINAL_BUILD = String(enabled);
      delete require.cache[configPath]; delete require.cache[nativeConfigPath];
      const config = require(configPath)();
      assert.equal(config.extra.terminalBuildEnabled, enabled);
      assert.equal(config.plugins.includes('./plugins/with-android-terminal'), enabled);
      assert.equal(typeof config.android.runtimeVersion === 'string' && config.android.runtimeVersion.includes('-terminal2'), enabled);
      const dependency = require(nativeConfigPath).dependencies['@stripe/stripe-terminal-react-native'];
      assert.deepEqual(dependency, enabled ? {} : { platforms: { ios: null, android: null } });
    }
    assert.equal(androidContactlessPrerequisite(35, false), null);
    assert.match(androidContactlessPrerequisite(32, false), /Android 13/);
    assert.match(androidContactlessPrerequisite(35, true), /DEV/);
    assert.match(androidContactlessError('TAP_TO_PAY_INSECURE_ENVIRONMENT', 'fallback'), /debug USB/);
    assert.match(androidContactlessError('TAP_TO_PAY_NFC_DISABLED', 'fallback'), /Attiva NFC/);
    assert.equal(androidContactlessError('NETWORK_ERROR', 'Connessione assente'), 'Connessione assente');
    console.log('Android Terminal: isolated Expo native mods, repeated generation, permissions, runtime/autolinking gates and readiness passed. No build started.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
