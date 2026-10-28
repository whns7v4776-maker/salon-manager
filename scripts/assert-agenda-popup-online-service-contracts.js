/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agenda = fs.readFileSync(path.join(root, 'app/(tabs)/agenda.tsx'), 'utf8');
const clientPortal = fs.readFileSync(
  path.join(root, 'src/lib/client-portal.ts'),
  'utf8',
);
const publicCompositions = fs.readFileSync(
  path.join(
    root,
    'supabase/migrations/20260807150000_public_composition_split_operators.sql',
  ),
  'utf8',
);

assert.match(
  agenda,
  /const quickBookingVisibleAtomicServices = useMemo[\s\S]*?authoritativeAgendaServiceById\.get[\s\S]*?authoritativeService\.soloComposizione === true[\s\S]*?quickBookingOnlineCatalogRoleKeySet\.has[\s\S]*?return authoritativeService\.disponibileOnline !== false[\s\S]*?quickBookingPendingServiceIdSet\.has/,
  'Prenota Slot must hide authoritative archived services while preserving session-only services.',
);
assert.match(
  agenda,
  /const quickBookingOnlineCatalogRoleKeySet = useMemo[\s\S]*?service\.disponibileOnline !== false[\s\S]*?service\.soloComposizione !== true[\s\S]*?authoritativeService\.soloComposizione === true[\s\S]*?quickBookingOnlineCatalogRoleKeySet\.has/,
  'Composition-only components must disappear when their profession has no ordinary online service.',
);
assert.match(
  agenda,
  /const quickBookingSelectableServices = useMemo[\s\S]*?compositionSourceKind !== 'derived'[\s\S]*?!compositionSourceServiceId[\s\S]*?!normalizeServicePhaseConfig\(service\.phaseConfig\)[\s\S]*?!normalizeServiceLinkConfig\(service\.linkedServiceConfig\)/,
  'Only independently authored atomic components may be nested inside a new composition.',
);
assert.match(
  agenda,
  /const quickBookingVisibleCompositionLaunchers = useMemo[\s\S]*?componentIds\.length >= 2[\s\S]*?componentIds\.every[\s\S]*?quickBookingVisibleAtomicServiceIdSet\.has/,
  'Saved compositions must disappear when a component is deleted or its profession has no online service.',
);
assert.match(
  agenda,
  /const quickBookingSelectableServices = useMemo[\s\S]*?quickBookingVisibleAtomicServices\.filter[\s\S]*?: quickBookingVisibleServices/,
  'Single and composition catalogs must both derive from the online-only popup projection.',
);
assert.match(
  agenda,
  /setQuickBookingPackageServiceIds[\s\S]*?current\.filter[\s\S]*?quickBookingVisibleAtomicServiceIdSet\.has[\s\S]*?setQuickBookingServiceId[\s\S]*?!quickBookingVisibleServices\.some/,
  'An archive event must evict stale single and composition selections from an open popup.',
);
assert.match(
  agenda,
  /Uno dei servizi scelti è stato archiviato o non è più disponibile nel listino/,
  'The composition planner must fail closed if an archived selection survives a race.',
);
assert.match(
  agenda,
  /title: 'Servizio archiviato'[\s\S]*?seleziona solo servizi online[\s\S]*?title: 'Servizio archiviato'[\s\S]*?Rimettilo online oppure scegline un altro/,
  'Both composition and single submit boundaries must reject newly archived services.',
);
assert.match(
  agenda,
  /Nessun servizio online[\s\S]*?I servizi archiviati ricompariranno qui appena verranno rimessi online/,
  'Empty popup catalogs must explain the archive/restore lifecycle.',
);

assert.match(
  clientPortal,
  /const isServiceAvailableOnline = \(item: Record<string, any>\) =>[\s\S]*?!== false[\s\S]*?!== true/,
  'The shared app/web customer snapshot must exclude offline and composition-only atomic services.',
);
assert.match(
  publicCompositions,
  /get_public_service_compositions_v1[\s\S]*?bool_and\([\s\S]*?service\.is_online is not false[\s\S]*?having count\(\*\) >= 2[\s\S]*?service\.is_online is not false/,
  'Public compositions must disappear when one of their required services is offline.',
);

console.log('Agenda popup online-service contracts: OK');
