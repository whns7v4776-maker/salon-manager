const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const requests = [];
const customers = [];
const updates = [];

// Evaluate the actual PostgREST read filter, including nested and/or and nulls.
const splitTopLevel = (text) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '(') depth += 1;
    if (text[index] === ')') depth -= 1;
    if (text[index] === ',' && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  assert.equal(depth, 0, 'Read filter must have balanced groups');
  parts.push(text.slice(start));
  return parts;
};
const parseFilter = (text) => {
  for (const operation of ['and', 'or']) {
    if (text.startsWith(`${operation}(`) && text.endsWith(')')) {
      const children = splitTopLevel(text.slice(operation.length + 1, -1)).map(parseFilter);
      return (row) => operation === 'and'
        ? children.every((predicate) => predicate(row))
        : children.some((predicate) => predicate(row));
    }
  }
  const match = text.match(/^([a-z_]+)\.(eq|neq|is|in)\.(.+)$/);
  assert.ok(match, `Supported valid PostgREST condition: ${text}`);
  const [, column, operation, value] = match;
  const values = operation === 'in' ? splitTopLevel(value.slice(1, -1)) : [value];
  if (column === 'status') {
    for (const status of values) {
      assert.ok(['pending', 'accepted', 'rejected', 'cancelled'].includes(status),
        `Read filter must only send real request_status enum values: ${status}`);
    }
  }
  return (row) => {
    if (operation === 'is') return value === 'null' && row[column] == null;
    if (row[column] == null) return false;
    if (operation === 'in') return values.includes(String(row[column]));
    return operation === 'eq'
      ? String(row[column]) === value
      : String(row[column]) !== value;
  };
};

const database = {
  from(table) {
    const predicates = [];
    let update = null;
    let selectOptions = null;
    const query = {
      select(_columns, options) { selectOptions = options; return query; },
      update(values) { update = values; return query; },
      eq(column, value) { predicates.push((row) => row[column] === value); return query; },
      or(expression) {
        predicates.push(parseFilter(`or(${expression})`));
        return query;
      },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          const source = table === 'booking_requests' ? requests : customers;
          const data = source.filter((row) => predicates.every((predicate) => predicate(row)));
          if (update) {
            for (const row of data) Object.assign(row, update);
            updates.push({ table, ids: data.map((row) => row.id) });
          }
          return { data: selectOptions?.head ? null : data, count: data.length, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  },
};

const load = (relativePath, extraSource = '') => {
  const exports = {};
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8') + extraSource;
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    reportDiagnostics: true,
  });
  assert.equal((compiled.diagnostics ?? []).length, 0, `${relativePath} transpiles`);
  vm.runInNewContext(compiled.outputText, {
    exports,
    require: (id) => {
      if (id === 'react-native') return { Platform: { OS: 'web' } };
      if (id === '../supabase') return { supabase: database, publicSupabase: database };
      if (id === '../notification-badge-sync') return { syncApplicationBadgeCount: async () => {} };
      if (id === '@react-native-async-storage/async-storage') return { default: {} };
      if (id.startsWith('https://esm.sh/')) return { createClient: () => database };
      throw new Error(`Unexpected module ${id}`);
    },
    Deno: { serve: () => {}, env: { get: () => undefined } },
    console: { log: () => {}, error: () => {} },
    Date,
    setTimeout,
    clearTimeout,
  }, { filename: relativePath });
  return exports;
};

const app = load('src/lib/badges/unread-badges.ts');
const worker = load('supabase/functions/send-push/index.ts',
  '\nexport { countOwnerVisibleUnreadBookingRequests };\n');
let sequence = 0;
const row = (overrides = {}) => ({
  id: `request-${++sequence}`,
  workspace_id: workspaceId,
  appointment_group_id: null,
  origin: 'frontend',
  status: 'accepted',
  operator_change_status: null,
  cancellation_source: null,
  viewed_by_salon: false,
  appointment_date: '2026-10-08',
  appointment_time: '10:00',
  requested_service_name: 'Taglio',
  customer_name: 'Test',
  customer_surname: 'Cliente',
  created_at: '2026-10-08T08:00:00Z',
  updated_at: '2026-10-08T08:00:00Z',
  ...overrides,
});

const assertCounts = (name, rows, expected) => {
  const result = worker.countOwnerVisibleUnreadBookingRequests(rows, {
    includeAllCustomerCancellations: true,
  });
  assert.equal(app.calculateOwnerUnreadRequestCount(rows), expected.requests, `${name}: Requests`);
  assert.equal(result.count, expected.requests, `${name}: push/app parity`);
  assert.equal(app.calculateOwnerUnreadAgendaCount(rows), expected.agenda, `${name}: Agenda`);
  if (expected.cancellations != null) {
    assert.equal(app.calculateOwnerUnreadCancellationCount(rows), expected.cancellations, `${name}: cancellations`);
  }
  if (expected.responses != null) {
    assert.equal(app.calculateOwnerUnreadOperatorChangeResponseCount(rows), expected.responses, `${name}: operator responses`);
  }
  assert.equal(new Set(result.ids).size, result.count, `${name}: one ID per logical booking`);
};

const scenarios = [
  ['unpaid pending hold', { status: 'pending', payment_hold_state: 'awaiting_payment' }, { requests: 0, agenda: 0, cancellations: 0, responses: 0 }],
  ['unpaid stale accepted hold', { payment_hold_state: 'awaiting_payment' }, { requests: 0, agenda: 0 }],
  ['expired hold is not a cancellation', { status: 'cancelled', payment_hold_state: 'expired', cancellation_source: 'cliente' }, { requests: 0, agenda: 0, cancellations: 0, responses: 0 }],
  ['paid manual request', { status: 'pending', payment_hold_state: 'paid' }, { requests: 1, agenda: 1 }],
  ['paid automatic booking', { payment_hold_state: 'paid' }, { requests: 1, agenda: 1 }],
  ['accepted customer booking', {}, { requests: 1, agenda: 1 }],
  ['automatic acceptance alias', { status: 'auto_accepted' }, { requests: 1, agenda: 1 }],
  ['read accepted booking', { viewed_by_salon: true }, { requests: 0, agenda: 0 }],
  ['read automatic booking', { status: 'auto_accepted', viewed_by_salon: true }, { requests: 0, agenda: 0 }],
  ['manual pending', { status: 'pending' }, { requests: 1, agenda: 1 }],
  ['viewed pending remains actionable', { status: 'pending', viewed_by_salon: true }, { requests: 0, agenda: 1 }],
  ['customer-pending operator change', { status: 'pending', operator_change_status: 'pending' }, { requests: 0, agenda: 0 }],
  ['accepted with customer-pending operator change', { operator_change_status: 'pending' }, { requests: 0, agenda: 0 }],
  ['backoffice accepted creation', { origin: 'backoffice' }, { requests: 0, agenda: 0 }],
  ['backoffice pending creation', { origin: 'backoffice', status: 'pending' }, { requests: 0, agenda: 0 }],
  ['legacy absent origin', { origin: null }, { requests: 1, agenda: 1 }],
  ['null viewed flag is unread', { viewed_by_salon: null }, { requests: 1, agenda: 1 }],
  ['old unseen accepted remains reachable', { appointment_date: '2026-08-03', created_at: '2026-08-03T08:00:00Z' }, { requests: 1, agenda: 1 }],
  ['frontend customer cancellation', { status: 'cancelled', cancellation_source: 'cliente' }, { requests: 1, agenda: 0, cancellations: 1 }],
  ['backoffice customer cancellation', { origin: 'backoffice', status: 'cancelled', cancellation_source: 'customer' }, { requests: 1, agenda: 0, cancellations: 1 }],
  ['read cancellation', { status: 'cancelled', cancellation_source: 'cliente', viewed_by_salon: true }, { requests: 0, agenda: 0, cancellations: 0 }],
  ['salon cancellation', { status: 'cancelled', cancellation_source: 'salone' }, { requests: 0, agenda: 0, cancellations: 0 }],
  ['salon rejection', { status: 'rejected' }, { requests: 0, agenda: 0 }],
  ['accepted operator response', { operator_change_status: 'accepted' }, { requests: 1, agenda: 1, responses: 1 }],
  ['backoffice accepted operator response', { origin: 'backoffice', operator_change_status: 'accepted' }, { requests: 1, agenda: 0, responses: 1 }],
  ['rejected operator response', { status: 'cancelled', operator_change_status: 'rejected', cancellation_source: 'salone' }, { requests: 1, agenda: 0, responses: 1 }],
  ['expired operator response', { origin: 'backoffice', status: 'cancelled', operator_change_status: 'expired', cancellation_source: 'salone' }, { requests: 1, agenda: 0, responses: 1 }],
  ['read operator response', { operator_change_status: 'accepted', viewed_by_salon: true }, { requests: 0, agenda: 0, responses: 0 }],
];
for (const [name, overrides, expected] of scenarios) assertCounts(name, [row(overrides)], expected);

for (const status of ['pending', 'accepted', 'auto_accepted', 'cancelled']) {
  const phases = [row({ appointment_group_id: 'group-1', status, cancellation_source: 'cliente' }),
    row({ appointment_group_id: 'group-1', status, cancellation_source: 'cliente' }),
    row({ appointment_group_id: 'group-1', status, cancellation_source: 'cliente' })];
  const expected = { requests: 1, agenda: status === 'cancelled' ? 0 : 1 };
  assertCounts(`${status}: three linked phases`, phases, expected);
  phases[0].viewed_by_salon = true;
  assertCounts(`${status}: partly read linked phases`, phases, expected);
  phases.forEach((item) => { item.viewed_by_salon = true; });
  assertCounts(`${status}: all linked phases read`, phases, { requests: 0, agenda: status === 'pending' ? 1 : 0 });
}
assertCounts('independent same-slot bookings', [row(), row()], { requests: 2, agenda: 2 });
assertCounts('latest accepted replaces stale pending phase', [
  row({ appointment_group_id: 'mixed', status: 'pending', updated_at: '2026-10-08T08:00:00Z' }),
  row({ appointment_group_id: 'mixed', status: 'accepted', updated_at: '2026-10-08T08:01:00Z' }),
], { requests: 1, agenda: 1 });
assertCounts('latest salon cancellation removes stale pending phase', [
  row({ appointment_group_id: 'mixed', status: 'pending', updated_at: '2026-10-08T08:00:00Z' }),
  row({ appointment_group_id: 'mixed', status: 'cancelled', cancellation_source: 'salone', updated_at: '2026-10-08T08:01:00Z' }),
], { requests: 0, agenda: 0 });

// Exhaustive role/status/read matrix guards parity beyond the named scenarios.
for (const origin of ['frontend', 'backoffice', null]) {
  for (const status of ['pending', 'accepted', 'auto_accepted', 'cancelled', 'rejected']) {
    for (const operator_change_status of [null, 'pending', 'accepted', 'rejected', 'expired']) {
      for (const cancellation_source of [null, 'cliente', 'customer', 'salone']) {
        for (const viewed_by_salon of [false, true, null]) {
          const rows = [row({ origin, status, operator_change_status, cancellation_source, viewed_by_salon })];
          assert.equal(app.calculateOwnerUnreadRequestCount(rows),
            worker.countOwnerVisibleUnreadBookingRequests(rows, { includeAllCustomerCancellations: true }).count,
            JSON.stringify(rows[0]));
        }
      }
    }
  }
}

(async () => {
  requests.push(row({ id: 'auto-phase-1', appointment_group_id: 'read-group' }),
    row({ id: 'auto-phase-2', appointment_group_id: 'read-group' }),
    row({ id: 'pending', status: 'pending' }),
    row({ id: 'operator-customer-pending', status: 'pending', operator_change_status: 'pending' }),
    row({ id: 'backoffice-created', origin: 'backoffice' }),
    row({ id: 'customer-cancelled', origin: 'backoffice', status: 'cancelled', cancellation_source: 'cliente' }),
    row({ id: 'operator-accepted', origin: 'backoffice', operator_change_status: 'accepted' }),
    row({ id: 'operator-expired', origin: 'backoffice', status: 'cancelled', operator_change_status: 'expired' }),
    row({ id: 'other-salon', workspace_id: otherWorkspaceId }));
  customers.push({ id: 'new-customer', workspace_id: workspaceId, source: 'frontend', viewed_by_salon: false },
    { id: 'owner-customer', workspace_id: workspaceId, source: 'backoffice', viewed_by_salon: false },
    { id: 'read-customer', workspace_id: workspaceId, source: 'frontend', viewed_by_salon: true },
    { id: 'other-salon-customer', workspace_id: otherWorkspaceId, source: 'frontend', viewed_by_salon: false });
  const identity = { audience: 'owner', workspaceId };
  const before = await app.fetchUnreadBadgeSnapshot(identity);
  assert.equal(before.unreadCountsBySection.prenotazioni, 5);
  assert.equal(before.unreadCountsBySection.agenda, 2);
  assert.equal(before.unreadCountsBySection.cancellazioni, 1);
  assert.equal(before.unreadCountsBySection.risposteCambioOperatore, 2);
  assert.equal(before.unreadCountsBySection.clienti, 1);
  assert.equal(before.totalUnread, 6, 'App icon includes unique bookings + customers, without summing overlapping sections');
  await app.markBadgeSectionAsRead({ audience: 'owner', workspaceId: 'invalid' }, 'prenotazioni');
  assert.equal(updates.length, 0, 'Invalid identity must never mutate reads');
  for (const section of ['prenotazioni', 'agenda']) {
    requests.forEach((item) => { item.viewed_by_salon = false; });
    await app.markBadgeSectionAsRead(identity, section);
    assert.deepEqual(updates.at(-1).ids, ['auto-phase-1', 'auto-phase-2', 'pending', 'customer-cancelled', 'operator-accepted', 'operator-expired']);
    const after = await app.fetchUnreadBadgeSnapshot(identity);
    assert.equal(after.unreadCountsBySection.prenotazioni, 0, `${section}: booking unread cleared`);
    assert.equal(after.unreadCountsBySection.agenda, 1, `${section}: pending still requires action`);
    assert.equal(after.unreadCountsBySection.cancellazioni, 0);
    assert.equal(after.unreadCountsBySection.risposteCambioOperatore, 0);
    assert.equal(after.totalUnread, 1, 'Reading bookings preserves the new-customer badge');
    assert.equal(requests.find((item) => item.id === 'other-salon').viewed_by_salon, false);
    assert.equal(requests.find((item) => item.id === 'operator-customer-pending').viewed_by_salon, false);
    assert.equal(requests.find((item) => item.id === 'backoffice-created').viewed_by_salon, false);
  }
  await app.markBadgeSectionAsRead(identity, 'clienti');
  assert.deepEqual(updates.at(-1).ids, ['new-customer']);
  assert.equal((await app.fetchUnreadBadgeSnapshot(identity)).totalUnread, 0);
  console.log('PASS: owner accepted/pending/cancelled/operator badges, grouped phases, 900-case push parity, section reads and workspace isolation.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
