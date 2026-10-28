const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const eas = require('../eas.json');
const read = (env) => {
  const result = spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify(require("./app.config.js")()))'], {
    cwd: require('node:path').resolve(__dirname, '..'),
    env: { ...process.env, META_APP_EVENTS_ENABLED: '', APP_VARIANT: '', ...env },
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};
for (const profile of ['production', 'store-fixed-version']) {
  const config = read(eas.build[profile].env);
  assert.equal(config.extra.metaAppEventsEnabled, true);
  assert.match(config.ios.runtimeVersion, /-meta1$/);
  assert.equal(config.android.runtimeVersion, config.ios.runtimeVersion);
  const [, options] = config.plugins.find(p => Array.isArray(p) && p[0] === 'react-native-fbsdk-next');
  assert.equal(options.appID, '3228220230705821');
  assert.ok(options.clientToken);
  assert.equal(options.autoLogAppEventsEnabled, false);
  assert.equal(options.isAutoInitEnabled, false);
  assert.equal(options.advertiserIDCollectionEnabled, false);
}
assert.equal(read({}).extra.metaAppEventsEnabled, false);
assert.equal(read({ META_APP_EVENTS_ENABLED: 'true', APP_VARIANT: 'development' }).extra.metaAppEventsEnabled, false);
console.log('PASS: production profiles ready, client configuration present, distinct native runtime, automatic collection disabled, development disabled.');
