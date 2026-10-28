/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { configureProperties, configureBuildGradle } = require('../plugins/with-android-release-optimization');
const properties = [
  { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
  { type: 'property', key: 'android.enableMinifyInReleaseBuilds', value: 'false' },
  { type: 'property', key: 'hermesEnabled', value: 'true' },
];
const configured = configureProperties(properties);
assert.deepEqual(configureProperties(configured), configured, 'Prebuild must be idempotent');
for (const key of ['android.enableMinifyInReleaseBuilds', 'android.enableShrinkResourcesInReleaseBuilds']) {
  assert.deepEqual(configured.filter((item) => item.key === key).map((item) => item.value), ['true']);
}
assert.ok(configured.some((item) => item.key === 'hermesEnabled' && item.value === 'true'));
const template = `debug { debuggable true }
release {
  minifyEnabled enableMinifyInReleaseBuilds
  shrinkResources enableShrinkResources.toBoolean()
  proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
}`;
const result = configureBuildGradle(template);
assert.match(result, /proguard-android-optimize\.txt/);
assert.match(result, /'proguard-rules\.pro'/);
assert.ok(result.startsWith('debug { debuggable true }'));
assert.equal(configureBuildGradle(result), result);
assert.throws(() => configureBuildGradle('release {}'), /review the changed Expo/);
for (const variant of ['development', 'production']) {
  process.env.APP_VARIANT = variant;
  const configPath = path.resolve(__dirname, '../app.config.js');
  delete require.cache[configPath];
  const config = require(configPath)();
  assert.ok(config.plugins.includes('./plugins/with-android-release-optimization'));
}
const ignores = fs.readFileSync(path.resolve(__dirname, '../.easignore'), 'utf8');
assert.ok(!/^\/?plugins\/?$/m.test(ignores), 'EAS must upload the persistent optimization plugin');
console.log('Android release optimization: configuration, repeat prebuild, debug isolation and EAS plugin checks passed.');
