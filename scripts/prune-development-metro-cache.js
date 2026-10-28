const fs = require('fs');
const os = require('os');
const path = require('path');

const MIB = 1024 * 1024;
const cachePolicies = [
  { surface: 'native', maxBytes: 1536 * MIB, targetBytes: 1024 * MIB },
  { surface: 'web', maxBytes: 768 * MIB, targetBytes: 512 * MIB },
];

const temporaryDirectory = path.resolve(os.tmpdir());
const dryRun = process.env.SALONPRO_METRO_PRUNE_DRY_RUN === '1';

const collectFiles = (directory, files) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(entryPath, files);
    } else if (entry.isFile()) {
      const stats = fs.statSync(entryPath);
      files.push({ path: entryPath, size: stats.size, modifiedAt: stats.mtimeMs });
    }
  }
};

const pruneCache = ({ surface, maxBytes, targetBytes }) => {
  const cacheRoot = path.join(temporaryDirectory, `salonpro-metro-cache-${surface}`);
  const resolvedRoot = path.resolve(cacheRoot);

  if (
    path.dirname(resolvedRoot) !== temporaryDirectory ||
    !/^salonpro-metro-cache-(native|web)$/.test(path.basename(resolvedRoot))
  ) {
    throw new Error(`Percorso cache Metro non sicuro: ${resolvedRoot}`);
  }

  if (!fs.existsSync(resolvedRoot)) {
    return { surface, beforeBytes: 0, afterBytes: 0, removedFiles: 0 };
  }

  const files = [];
  collectFiles(resolvedRoot, files);
  const beforeBytes = files.reduce((total, file) => total + file.size, 0);

  if (beforeBytes <= maxBytes) {
    return { surface, beforeBytes, afterBytes: beforeBytes, removedFiles: 0 };
  }

  files.sort((left, right) => left.modifiedAt - right.modifiedAt);
  let afterBytes = beforeBytes;
  let removedFiles = 0;

  for (const file of files) {
    if (afterBytes <= targetBytes) {
      break;
    }

    try {
      if (!dryRun) {
        fs.unlinkSync(file.path);
      }
      afterBytes -= file.size;
      removedFiles += 1;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return { surface, beforeBytes, afterBytes, removedFiles };
};

for (const result of cachePolicies.map(pruneCache)) {
  console.log(
    `[metro-cache:${result.surface}] ${(result.beforeBytes / MIB).toFixed(1)} MiB -> ` +
      `${(result.afterBytes / MIB).toFixed(1)} MiB; rimossi ${result.removedFiles} file` +
      (dryRun ? ' (simulazione)' : ''),
  );
}
