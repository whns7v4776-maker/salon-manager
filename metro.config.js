const fs = require('fs');
const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

const config = getDefaultConfig(__dirname);
const metroSurface = process.env.SALONPRO_METRO_SURFACE === 'web' ? 'web' : 'native';

// Two persistent Metro instances (native + web) otherwise start seven workers
// each on this Mac and can exhaust memory/swap while both platforms rebuild.
config.maxWorkers = metroSurface === 'web' ? 2 : 3;

// Physical iOS and Android clients request different transforms of the same
// large files. Sticky assignment queues both behind one worker while others
// sit idle. Limit this scheduling change to the local native DEV server.
if (
  process.env.SALONPRO_METRO_SURFACE === 'native' &&
  process.env.APP_VARIANT === 'development'
) {
  config.stickyWorkers = false;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockDirectory = (relativePath) => {
  const absolutePath = escapeRegExp(path.resolve(__dirname, relativePath));
  return new RegExp(`^${absolutePath}(?:[/\\\\].*)?$`);
};

// These folders are separate projects or generated native artifacts. Watching
// them makes local iOS/Android/web bundles slower without adding app modules.
const ignoredDirectories = [
  'admin-dashboard',
  'node_modules_old',
  'work',
  'ios/Pods',
  'ios/build',
  'android/.gradle',
  'android/build',
  'android/app/build',
  'android/app/.cxx',
].map(blockDirectory);

const nodeModulesRoot = escapeRegExp(path.resolve(__dirname, 'node_modules'));
const generatedDependencyBuilds = new RegExp(
  `^${nodeModulesRoot}[/\\\\].*[/\\\\]android[/\\\\](?:build|\\.cxx)(?:[/\\\\].*)?$`,
);

const defaultBlockList = Array.isArray(config.resolver.blockList)
  ? config.resolver.blockList
  : config.resolver.blockList
    ? [config.resolver.blockList]
    : [];

config.resolver.blockList = [
  ...defaultBlockList,
  ...ignoredDirectories,
  generatedDependencyBuilds,
];

// Metro's default shared temporary cache can grow by several gigabytes when
// iOS, Android and web are exercised frequently. Keep a SalonPro-only cache.
// Cleanup is handled by scripts/prune-development-metro-cache.js: using
// AutoCleanFileStore here schedules a recurring timer that prevents one-shot
// exports (including EAS production builds) from exiting after bundling.
const metroCacheRoot = path.join(
  path.join(__dirname, '.expo', 'premium-cache'),
  `salonpro-metro-cache-${metroSurface}`,
);
const metroFileMapRoot = path.join(
  path.join(__dirname, '.expo', 'premium-cache'),
  `salonpro-metro-file-map-${metroSurface}`,
);
fs.mkdirSync(metroCacheRoot, { recursive: true });
fs.mkdirSync(metroFileMapRoot, { recursive: true });
config.fileMapCacheDirectory = metroFileMapRoot;
config.cacheStores = [
  new FileStore({
    root: metroCacheRoot,
  }),
];

module.exports = config;
