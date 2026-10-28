const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const home = read('app/(tabs)/index.tsx');
const save = home.slice(home.indexOf('const salvaDatiSalone ='), home.indexOf('const salvaAccountSalone ='));
assert.ok(save.indexOf('await updateSalonWorkspacePersisted') < save.indexOf('returnToProfileAfterSaveRef.current = true'));
assert.match(save, /requireRemoteProfileConfirmation: true/);
assert.doesNotMatch(save, /scrollToQrSection/);
assert.match(home, /y: Math.max\(0, profileSectionYRef.current - 12\)/);
assert.match(home, /<SalonActivityPicker[\s\S]*?onChange=\{setActivityCategoryInput\}/);
assert.match(home, /<SalonFontPicker[\s\S]*?onChange=\{setSalonNameFontVariantInput\}/);
for (const name of ['salon-font-picker', 'salon-activity-picker']) {
  assert.doesNotMatch(read(`components/ui/${name}.tsx`), /supabase|updateSalonWorkspacePersisted|AsyncStorage/);
}
assert.match(read('components/ui/premium-expand-button.tsx'), /salon = false/);
console.log('Salon profile presentation: local drafts, confirmed-save return and scoped expand style OK');
