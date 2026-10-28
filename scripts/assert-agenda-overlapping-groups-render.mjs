import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  resolveAgendaStableLaneKey,
  selectAgendaBlockingItems,
} from '../src/lib/agenda-blocking-appointments.ts';

const phase = ({ id, groupId, service, operator, synthetic = false, priority = 0 }) => ({
  id,
  groupId,
  service,
  operator,
  synthetic,
  priority,
  baseKey: `2026-08-30|${service}|marzio-verdi`,
});

const realRobyGroup = [
  phase({ id: 'roby-1', groupId: 'group-roby', service: 'piega', operator: 'Roby' }),
  phase({ id: 'roby-2', groupId: 'group-roby', service: 'colore', operator: 'Roby' }),
  phase({ id: 'roby-3', groupId: 'group-roby', service: 'balayage', operator: 'Roby' }),
];
const realSaraGroup = [
  phase({ id: 'sara-1', groupId: 'group-sara', service: 'piega', operator: 'Sara' }),
  phase({ id: 'sara-2', groupId: 'group-sara', service: 'colore', operator: 'Sara' }),
  phase({ id: 'sara-3', groupId: 'group-sara', service: 'balayage', operator: 'Sara' }),
];
const syntheticRequestProjection = phase({
  id: 'request-sara-1',
  groupId: 'group-sara',
  service: 'piega',
  operator: 'Sara',
  synthetic: true,
  priority: 20,
});

const selected = selectAgendaBlockingItems({
  items: [
    syntheticRequestProjection,
    ...realRobyGroup,
    ...realSaraGroup,
  ],
  getBaseSyncKey: (item) => item.baseKey,
  isSynthetic: (item) => item.synthetic,
  getSyntheticPriority: (item) => item.priority,
});

assert.equal(selected.length, 6, 'both real three-phase groups must survive');
assert.deepEqual(
  new Set(selected.map((item) => item.groupId)),
  new Set(['group-roby', 'group-sara']),
  'distinct authoritative groups must never be merged by visible slot identity',
);
assert.equal(
  selected.some((item) => item.synthetic),
  false,
  'the synthetic request projection must still disappear beside a real row',
);

const selectedSynthetic = selectAgendaBlockingItems({
  items: [
    phase({
      id: 'request-low',
      groupId: 'pending',
      service: 'taglio',
      operator: 'Sara',
      synthetic: true,
      priority: 20,
    }),
    phase({
      id: 'request-high',
      groupId: 'pending',
      service: 'taglio',
      operator: 'Sara',
      synthetic: true,
      priority: 40,
    }),
  ],
  getBaseSyncKey: (item) => item.baseKey,
  isSynthetic: (item) => item.synthetic,
  getSyntheticPriority: (item) => item.priority,
});

assert.deepEqual(
  selectedSynthetic.map((item) => item.id),
  ['request-high'],
  'synthetic request projections must retain the previous priority dedupe',
);

const availableLaneKeys = new Set(['operator-id:roby', 'operator-id:sara']);
assert.equal(
  resolveAgendaStableLaneKey({
    currentLaneKey: 'operator-id:sara',
    previousLaneKey: 'operator-id:roby',
    availableLaneKeys,
    hasExplicitOperator: true,
  }),
  'operator-id:sara',
  'an authoritative Sara assignment must not stay pinned to a stale Roby lane',
);
assert.equal(
  resolveAgendaStableLaneKey({
    currentLaneKey: 'salon-lane:hair-stylist',
    previousLaneKey: 'operator-id:roby',
    availableLaneKeys,
    hasExplicitOperator: false,
  }),
  'operator-id:roby',
  'unassigned fallback cards must retain the existing visual-stability behavior',
);

const agendaSource = fs.readFileSync(
  new URL('../app/(tabs)/agenda.tsx', import.meta.url),
  'utf8',
);
assert.match(
  agendaSource,
  /selectAgendaBlockingItems\(\{[\s\S]*?isSynthetic:\s*\(item\)\s*=>\s*isSyntheticWeekAppointmentId\(item\.id\)/,
  'Agenda must apply base-key dedupe only through the synthetic-aware selector',
);
assert.match(
  agendaSource,
  /const appointmentStableKey = hasExplicitOperator[\s\S]*?getAgendaStickyAssignmentKey\(appointment, todayDate\)[\s\S]*?resolveAgendaStableLaneKey\(\{[\s\S]*?hasExplicitOperator/,
  'Agenda lane stability must be keyed by appointment identity and respect explicit operators',
);

console.log('Agenda overlapping-group render contracts: OK');
