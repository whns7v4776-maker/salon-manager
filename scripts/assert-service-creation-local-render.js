const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('app/(tabs)/servizi.tsx', 'utf8');
assert.match(source, /function ServiceCreationModeBoundary[\s\S]*?const \[mode, setMode\] = useState/);
assert.doesNotMatch(source, /const \[serviceCreationMode, setServiceCreationMode\] = useState/);
assert.match(source, /onWebToggle=\{toggleServiceFormExpanded\}[\s\S]*?body=\{\s*<ServiceCreationModeBoundary\b/);
assert.match(source, /pointerEvents=\{expanded \? 'auto' : 'none'\}[\s\S]*?\{body\}/);
const frontend = fs.readFileSync('app/cliente-screen.tsx', 'utf8');
assert.match(source, /import \{ resolveServiceClientHighlightTone \} from .*service-client-highlight-tone/);
assert.match(frontend, /import \{ resolveServiceClientHighlightTone \} from .*service-client-highlight-tone/);
const moduleOutput = ts.transpileModule(fs.readFileSync('src/lib/service-client-highlight-tone.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exported = {};
new Function('exports', moduleOutput)(exported);
for (const [label, color, icon] of [
  ['Più richiesto', '#1E3A8A', 'flame'],
  ['Offerta', '#166534', 'pricetag'],
  ['Consigliato', '#5B21B6', 'thumbs-up'],
  ['Novità', '#0F766E', 'sparkles'],
  ['Premium', '#111827', 'diamond'],
  ['Sconto a scadenza', '#7F1D1D', 'time'],
]) {
  const tone = exported.resolveServiceClientHighlightTone(label);
  assert.equal(tone.backgroundColor, color);
  assert.equal(tone.icon, icon);
}
console.log('Local creation rendering and shared badge palette checks passed.');
