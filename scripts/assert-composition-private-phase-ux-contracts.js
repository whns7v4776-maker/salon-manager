const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(process.cwd(), 'app/(tabs)/servizi.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

const requiredTokens = [
  "'catalog' | 'custom'",
  'Aggiungi una fase alla composizione',
  'Dal listino',
  'Nuova fase privata',
  'compositionDerivedSourceList',
  'Aggiungi fase',
  'Mestiere della composizione',
  'compatibleDerivedCompositionSourceOptions',
  'privateServiceDraftValid',
  'disabled={!privateServiceDraftValid || privateServiceSaving}',
  "supabase.rpc('create_composition_only_service_v2'",
  "p_source_phase: 'initial'",
  "compositionSourceKind: 'derived'",
  'compositionSourceServiceId: source.id',
];

for (const token of requiredTokens) {
  if (!source.includes(token)) {
    throw new Error(`Composition private-phase contract missing: ${token}`);
  }
}

if (source.includes('compositionDerivedSourceRow')) {
  throw new Error(
    'Derived composition phases must not return to a clipped horizontal row.',
  );
}

console.log('Composition private-phase UX contracts OK');
