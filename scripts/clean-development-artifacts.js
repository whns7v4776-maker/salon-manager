const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const removableProjectPaths = [
  path.join(projectRoot, 'ios', 'build'),
  path.join(projectRoot, 'android', 'app', 'build'),
  path.join(projectRoot, 'android', 'app', '.cxx'),
  path.join(projectRoot, 'android', '.gradle'),
  path.join(projectRoot, '.swift-cache'),
];

const removed = [];

function removeDirectory(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
  removed.push(path.relative(projectRoot, targetPath));
}

function removeNativeModuleBuilds(directory) {
  if (!fs.existsSync(directory)) return;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;

    const childPath = path.join(directory, entry.name);
    const parentName = path.basename(directory);
    if (parentName === 'android' && (entry.name === 'build' || entry.name === '.cxx')) {
      removeDirectory(childPath);
      continue;
    }

    removeNativeModuleBuilds(childPath);
  }
}

for (const targetPath of removableProjectPaths) removeDirectory(targetPath);
removeNativeModuleBuilds(path.join(projectRoot, 'node_modules'));

if (removed.length === 0) {
  console.log('Nessun artefatto di sviluppo da eliminare.');
} else {
  console.log(`Eliminati ${removed.length} artefatti rigenerabili:`);
  for (const targetPath of removed) console.log(`- ${targetPath}`);
}
