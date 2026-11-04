/** Package an Expo static export without node_modules asset paths.
 * Vercel CLI filters node_modules directories even when they contain exported
 * fonts. Keep the generated assets and every reference together in a staging
 * directory, leaving source code and native exports untouched.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const source = path.resolve(process.argv[3] || path.join(root, 'dist'));
const target = path.resolve(process.argv[2] || path.join(root, 'work', `web-release-${Date.now()}`));
if (!fs.existsSync(path.join(source, 'index.html'))) throw new Error('Export web missing: run npm run web:export first.');
if (fs.existsSync(target)) throw new Error('Use a new staging directory to avoid stale assets.');
fs.cpSync(source, target, { recursive: true, filter: (file) => {
  const relative = path.relative(source, file).split(path.sep).join('/');
  return !['_expo/static/js/ios', '_expo/static/js/android'].some(prefix => relative === prefix || relative.startsWith(prefix + '/'));
} });
// A combined Expo export also contains native update bundles. They do not
// belong to the website; retain them in the original export only.
for (const platform of ['ios', 'android']) {
  fs.rmSync(path.join(target, '_expo', 'static', 'js', platform), { recursive: true, force: true });
}
fs.rmSync(path.join(target, 'metadata.json'), { force: true });
// node_modules can sit deeper than assets/ (an export from a git worktree whose
// node_modules is a symlink lands under assets/_<folder>/node_modules): rename
// every one of them, or the CLI silently drops the icon fonts.
const renamedAssetDirs = [];
function renameNodeModules(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(directory, entry.name);
    if (entry.name === 'node_modules') {
      const relative = path.relative(target, file).split(path.sep).join('/');
      fs.renameSync(file, path.join(directory, 'vendor'));
      renamedAssetDirs.push([`${relative}/`, `${relative.slice(0, -'node_modules'.length)}vendor/`]);
      continue;
    }
    renameNodeModules(file);
  }
}
const assetsRoot = path.join(target, 'assets');
if (fs.existsSync(assetsRoot)) renameNodeModules(assetsRoot);
let rewritten = 0;
function rewrite(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { rewrite(file); continue; }
    if (!/\.(?:html|js|css|json)$/.test(entry.name)) continue;
    const content = fs.readFileSync(file, 'utf8');
    let next = content;
    for (const [from, to] of renamedAssetDirs) next = next.replaceAll(from, to);
    if (next !== content) { fs.writeFileSync(file, next); rewritten++; }
  }
}
rewrite(target);
// Expo can keep an entry filename while changing the injected async route map.
// Give every bootstrap its final content digest after rewriting asset paths.
const bootstrapDirectory = path.join(target, '_expo', 'static', 'js', 'web');
const bootstraps = [];
if (fs.existsSync(bootstrapDirectory)) {
  for (const name of fs.readdirSync(bootstrapDirectory)) {
    if (!/^entry-[0-9a-f]{32}\.js$/.test(name)) continue;
    const file = path.join(bootstrapDirectory, name);
    const digest = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 32);
    const next = `entry-${digest}.js`;
    if (name === next) continue;
    fs.renameSync(file, path.join(bootstrapDirectory, next));
    bootstraps.push({ old: name, next });
  }
}
function rewriteBootstrapReferences(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { rewriteBootstrapReferences(file); continue; }
    if (!/\.(?:html|js|css|json)$/.test(entry.name)) continue;
    const original = fs.readFileSync(file, 'utf8');
    let content = original;
    for (const item of bootstraps) content = content.replaceAll(item.old, item.next);
    if (content !== original) fs.writeFileSync(file, content);
  }
}
if (bootstraps.length) rewriteBootstrapReferences(target);
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
config.buildCommand = '';
config.installCommand = '';
config.outputDirectory = '.';
fs.writeFileSync(path.join(target, 'vercel.json'), JSON.stringify(config, null, 2) + '\n');
fs.mkdirSync(path.join(target, '.vercel'), { recursive: true });
fs.copyFileSync(path.join(root, '.vercel', 'project.json'), path.join(target, '.vercel', 'project.json'));
const html = fs.readFileSync(path.join(target, 'index.html'), 'utf8');
const fonts = [...html.matchAll(/url\("([^"\n]+\.ttf)"\)/g)].map(match => match[1]);
if (!fonts.some(file => file.includes('Ionicons.'))) throw new Error('Icon font missing from export.');
for (const font of fonts) {
  if (font.includes('node_modules')) throw new Error(`Font path would be dropped by Vercel: ${font}`);
  const file = path.join(target, font.replace(/^\//, ''));
  if (!fs.existsSync(file) || fs.statSync(file).size < 1000) throw new Error(`Missing font: ${font}`);
}
console.log(JSON.stringify({ target, rewritten, verifiedFonts: fonts.length }));
