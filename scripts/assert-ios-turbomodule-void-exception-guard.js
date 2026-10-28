const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
);
const easConfig = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
const reactNativePackage = JSON.parse(
  fs.readFileSync(path.join(root, 'node_modules', 'react-native', 'package.json'), 'utf8'),
);
const turboModuleSource = fs.readFileSync(
  path.join(
    root,
    'node_modules',
    'react-native',
    'ReactCommon',
    'react',
    'nativemodule',
    'core',
    'platform',
    'ios',
    'ReactCommon',
    'RCTTurboModule.mm',
  ),
  'utf8',
);

const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

expect(
  reactNativePackage.version === '0.81.5',
  `Versione React Native non verificata: ${reactNativePackage.version}`,
);
expect(
  packageJson.scripts?.postinstall?.includes(
    'patch-react-native-ios-turbomodule-void-exception.js',
  ),
  'Il postinstall non applica la patch TurboModule iOS.',
);
expect(
  turboModuleSource.includes(
    '// Void methods are always async, re-throw instead of converting to',
  ) && turboModuleSource.includes('@throw exception;'),
  'RCTTurboModule.mm non contiene la correzione ufficiale per i void async.',
);
expect(
  !turboModuleSource.includes(
    'throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);\n    } @finally {',
  ),
  'RCTTurboModule.mm contiene ancora il ramo void vulnerabile.',
);

for (const profileName of [
  'development',
  'preview',
  'production',
  'store-fixed-version',
]) {
  const profile = easConfig.build?.[profileName];
  expect(Boolean(profile), `Profilo EAS mancante: ${profileName}`);
  expect(
    profile?.env?.RCT_USE_PREBUILT_RNCORE === '0',
    `Il profilo EAS ${profileName} non compila React Native Core dai sorgenti.`,
  );
  expect(
    profile?.env?.RCT_USE_RN_DEP !== '0',
    `Il profilo EAS ${profileName} disabilita inutilmente le dipendenze RN precompilate.`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log('PASS: protezione TurboModule iOS e build RN Core verificate.');
