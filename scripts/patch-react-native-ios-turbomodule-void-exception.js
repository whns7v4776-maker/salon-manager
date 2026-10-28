/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(
  __dirname,
  '..',
  'node_modules',
  'react-native',
);
const packageJsonPath = path.join(packageRoot, 'package.json');
const sourcePath = path.join(
  packageRoot,
  'ReactCommon',
  'react',
  'nativemodule',
  'core',
  'platform',
  'ios',
  'ReactCommon',
  'RCTTurboModule.mm',
);
const supportedVersions = new Set(['0.81.5']);

if (!fs.existsSync(packageJsonPath) || !fs.existsSync(sourcePath)) {
  throw new Error(
    'React Native iOS non trovato: impossibile applicare la protezione TurboModule.',
  );
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

if (!supportedVersions.has(packageJson.version)) {
  throw new Error(
    `react-native@${packageJson.version}: versione non verificata; riesamina la patch TurboModule iOS prima di aggiornare.`,
  );
}

const source = fs.readFileSync(sourcePath, 'utf8');
const vulnerableSource = `    } @catch (NSException *exception) {
      throw convertNSExceptionToJSError(runtime, exception, std::string{moduleName}, methodNameStr);
    } @finally {`;
const protectedSource = `    } @catch (NSException *exception) {
      // Void methods are always async, re-throw instead of converting to
      // JSError, same as the async branch in performMethodInvocation.
      @throw exception;
    } @finally {`;

if (source.includes(protectedSource)) {
  process.stdout.write(
    `react-native@${packageJson.version}: TurboModule void iOS gia protetto.\n`,
  );
  process.exit(0);
}

const vulnerableOccurrences = source.split(vulnerableSource).length - 1;
if (vulnerableOccurrences !== 1) {
  throw new Error(
    `react-native@${packageJson.version}: sorgente RCTTurboModule inattesa; patch iOS non applicata.`,
  );
}

fs.writeFileSync(sourcePath, source.replace(vulnerableSource, protectedSource));
process.stdout.write(
  `react-native@${packageJson.version}: corruzione Hermes da TurboModule void protetta.\n`,
);
