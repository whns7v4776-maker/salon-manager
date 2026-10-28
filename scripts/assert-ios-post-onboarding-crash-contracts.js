const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const layout = read('app', '_layout.tsx');
const appContext = read('src', 'context', 'AppContext.tsx');
const header = read('components', 'module-hero-header.tsx');

assert.match(
  header,
  /function StandardSettingsButton\(\)[\s\S]*?const pathname = usePathname\(\);[\s\S]*?\[pathname, router\]/,
  'The native/web Settings callback must obtain pathname in the component that owns it.',
);

assert.doesNotMatch(
  header.match(/export function ModuleHeroHeader[\s\S]*?const styles = StyleSheet\.create/)?.[0] ?? '',
  /\[pathname, router\]/,
  'ModuleHeroHeader must not reference an undeclared pathname after onboarding renders the owner tabs.',
);

assert.match(
  layout,
  /if \(shouldRunPromptsAfterClose && promptOwnerEmail\)[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?void \(async \(\) => \{[\s\S]*?try \{[\s\S]*?armOwnerPostOnboardingPrompts[\s\S]*?runOwnerPostOnboardingPromptsNow[\s\S]*?catch \(error\)[\s\S]*?setOwnerPostOnboardingPromptPending\(true\)/,
  'The delayed post-onboarding prompt chain must contain its own rejection boundary.',
);

assert.match(
  appContext,
  /Errore persistenza completamento onboarding owner:[\s\S]*?syncOwnerOnboardingState\(targetEmail\)\.catch\(\(syncError\) => \{[\s\S]*?Errore riallineamento completamento onboarding owner:/,
  'Server recovery after local onboarding completion must not reject outside the detached task.',
);

console.log('iOS post-onboarding crash contracts: OK');
