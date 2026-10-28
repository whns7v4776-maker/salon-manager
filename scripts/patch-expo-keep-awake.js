/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(
  __dirname,
  '..',
  'node_modules',
  'expo-keep-awake',
);
const packageJsonPath = path.join(packageRoot, 'package.json');
const sourcePath = path.join(packageRoot, 'src', 'index.ts');

if (!fs.existsSync(packageJsonPath) || !fs.existsSync(sourcePath)) {
  throw new Error(
    'expo-keep-awake non trovato: impossibile applicare la protezione Android DEV.',
  );
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const source = fs.readFileSync(sourcePath, 'utf8');
const vulnerableSource = `    activateKeepAwakeAsync(tagOrDefault).then(() => {
      if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
        addListener(tagOrDefault, options.listener);
      }
    });`;
const protectedSource = `    activateKeepAwakeAsync(tagOrDefault)
      .then(() => {
        if (isMounted && ExpoKeepAwake.addListenerForTag && options?.listener) {
          addListener(tagOrDefault, options.listener);
        }
      })
      .catch(() => {});`;

if (source.includes(protectedSource)) {
  process.stdout.write(
    `expo-keep-awake@${packageJson.version}: attivazione DEV gia protetta.\n`,
  );
  process.exit(0);
}

if (!source.includes(vulnerableSource)) {
  throw new Error(
    `expo-keep-awake@${packageJson.version}: sorgente inattesa; patch DEV non applicata.`,
  );
}

fs.writeFileSync(sourcePath, source.replace(vulnerableSource, protectedSource));
process.stdout.write(
  `expo-keep-awake@${packageJson.version}: race Android DEV protetta.\n`,
);
