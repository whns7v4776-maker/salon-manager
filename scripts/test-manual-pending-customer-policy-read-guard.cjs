const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const migration = (name) => fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
const between = (source, startToken, endToken) => {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0 && end > start, `Missing SQL fixture boundary: ${startToken}`);
  return source.slice(start, end);
};

const compileOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS };
const loadTs = (relative, dependencies = {}) => {
  const exports = {};
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: compileOptions }).outputText, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected runtime dependency: ${name}`);
      return dependencies[name];
    },
    Date, Intl, URL,
  });
  return exports;
};
const paymentFlow = loadTs('src/lib/booking-payment-flow.ts');
const customerPolicy = loadTs('src/lib/customer-online-booking-policy.ts', {
  './booking-payment-flow': paymentFlow,
});
const requestRead = loadTs('src/lib/badges/owner-accepted-request-read.ts', {
  '../supabase': { supabase: {} },
});
const ownerSource = fs.readFileSync(path.join(root, 'app/(tabs)/prenotazioni.tsx'), 'utf8');
const ownerAst = ts.createSourceFile('prenotazioni.tsx', ownerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const ownerCallbacks = new Map();
function walkOwner(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    const initializer = ts.isCallExpression(node.initializer)
      ? node.initializer.arguments[0] : node.initializer;
    if (initializer && ts.isArrowFunction(initializer)) ownerCallbacks.set(node.name.text, initializer.getText(ownerAst));
  }
  ts.forEachChild(node, walkOwner);
}
walkOwner(ownerAst);
function ownerRuntime(salonAutoAccept, customers, requests, platform = 'ios', cached = []) {
  const environment = {
    ...customerPolicy, ...paymentFlow,
    displayedAutoAcceptBookingRequests: salonAutoAccept,
    clienti: customers,
    richiestePrenotazione: requests,
    viewedRequestIds: cached.slice(),
    buildViewedRequestSignature: requestRead.buildOwnerViewedRequestSignature,
    Platform: { OS: platform },
    salonAccountEmail: 'owner@isolated.test',
    writes: [], acceptedWrites: [], emitted: [], badgeRefreshes: 0,
    setViewedRequestIds(update) { environment.viewedRequestIds = update(environment.viewedRequestIds); },
    persistViewedRequestIds(signatures, ids) { environment.writes.push({ signatures, ids }); },
    persistAcceptedRequestsAsViewed(items) { environment.acceptedWrites.push(items); },
    emitOwnerViewedNotificationChange(event) { environment.emitted.push(event); },
    refreshBadges() { environment.badgeRefreshes += 1; },
  };
  const context = vm.createContext(environment);
  for (const name of ['isUuidLike', 'isResolvedOperatorChangeResponseEvent', 'isCancelledByCustomer',
    'isFrontendRequest', 'isUnworkedManualPendingRequest', 'isUnreadRequest', 'markRequestsAsViewed']) {
    assert.ok(ownerCallbacks.has(name), `Actual owner callback exists: ${name}`);
    environment[name] = vm.runInContext(ts.transpileModule(`(${ownerCallbacks.get(name)})`, {
      compilerOptions: compileOptions,
    }).outputText, context);
  }
  return environment;
}

const ownerRequest = (record) => ({
  id: record.id, customerId: record.customer_id, origine: record.origin,
  stato: ({ pending: 'In attesa', accepted: 'Accettata', rejected: 'Rifiutata', cancelled: 'Annullata' })[record.status],
  operatorChangeStatus: record.operator_change_status,
  paymentHoldState: record.payment_hold_state,
  appointmentGroupId: record.appointment_group_id,
  viewedBySalon: record.viewed_by_salon,
  createdAt: String(record.updated_at),
});

function verifyUiPending(record, salonAutomatic, customers, effectiveAutomatic) {
  const request = ownerRequest(record);
  const signature = requestRead.buildOwnerViewedRequestSignature(request);
  for (const platform of ['ios', 'web']) {
    for (const cached of [[], [signature]]) {
      // A stale server/local read flag must never hide a still-unworked manual request.
      const optimisticRequest = { ...request, viewedBySalon: true };
      const runtime = ownerRuntime(salonAutomatic, customers, [optimisticRequest], platform, cached);
      assert.equal(runtime.isUnworkedManualPendingRequest(optimisticRequest), !effectiveAutomatic);
      assert.equal(runtime.isUnreadRequest(optimisticRequest), !effectiveAutomatic);
      runtime.markRequestsAsViewed([optimisticRequest]);
      assert.equal(runtime.writes.length, effectiveAutomatic ? 1 : 0,
        `${platform}: manual requests must not enter server/local read persistence`);
      assert.equal(runtime.emitted.length, platform === 'ios' && effectiveAutomatic ? 1 : 0);
    }
  }
}

(async () => {
  // No connection string or data directory: every write stays in this in-memory database.
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create type request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
      create table workspaces (
        id uuid primary key, auto_accept_booking_requests boolean,
        payment_mode text default 'salon', payment_percent integer default 0
      );
      create table customer_online_booking_policies (
        workspace_id uuid, customer_id uuid unique, acceptance_mode text
      );
      create table booking_payment_hold_batches (id uuid primary key, state text);
      create table booking_requests (
        id uuid primary key default gen_random_uuid(), workspace_id uuid, customer_id uuid,
        origin text default 'frontend', status request_status default 'pending',
        operator_change_status text, viewed_by_salon boolean default false,
        viewed_by_customer boolean default false, updated_at timestamptz default now(),
        payment_hold_state text, payment_hold_expires_at timestamptz, payment_hold_batch_id uuid,
        requested_price numeric default 20, requested_duration_minutes integer default 30,
        customer_email text, customer_phone text, requested_service_name text default 'Test',
        requested_operator_id text, requested_operator_name text,
        appointment_date date, appointment_time time, appointment_group_id uuid,
        phase_snapshot jsonb, phase_operator_assignments jsonb, phase_overlap_overrides jsonb
      );
      create table services (workspace_id uuid, name text, price numeric, updated_at timestamptz);
      -- External payment-policy/price lookup surfaces only; the payment hold guard is real SQL.
      create function public.resolve_booking_payment_policy(uuid, uuid)
      returns jsonb language sql stable as $$
        select jsonb_build_object('mode', payment_mode, 'percent', payment_percent)
        from workspaces where id = $1
      $$;
      create function public.resolve_customer_service_price_v1(uuid, text, text, text, numeric)
      returns jsonb language sql stable as $$ select jsonb_build_object('price', $5) $$;
    `);

    const policySql = migration('20260813113000_customer_online_booking_policies.sql');
    await db.exec(between(policySql,
      'create or replace function public.resolve_customer_online_auto_accept_v1(',
      'create or replace function public.get_public_customer_online_booking_policy_v1('));
    await db.exec(migration('20260731021500_keep_manual_pending_requests_actionable.sql'));
    const paymentSql = migration('20261009160000_booking_payment_before_confirmation.sql');
    await db.exec(between(paymentSql,
      'create function public.booking_payment_hold_ready_v1(',
      'create function public.guard_booking_payment_hold_appointment_v1('));

    const workspace = async (automatic, paymentMode = 'salon') => {
      const id = crypto.randomUUID();
      await db.query('insert into workspaces values ($1, $2, $3, $4)',
        [id, automatic, paymentMode, paymentMode === 'salon' ? 0 : paymentMode === 'deposit' ? 50 : 100]);
      return id;
    };
    const customer = async (workspaceId, mode) => {
      const id = crypto.randomUUID();
      if (mode) await db.query('insert into customer_online_booking_policies values ($1, $2, $3)',
        [workspaceId, id, mode]);
      return id;
    };
    const create = async (workspaceId, customerId, options = {}) => {
      const result = await db.query(`insert into booking_requests (
        workspace_id, customer_id, origin, status, viewed_by_salon,
        operator_change_status, payment_hold_state
      ) values ($1, $2, $3, $4, $5, $6, $7) returning *`, [
        workspaceId, customerId, options.origin || 'frontend', options.status || 'pending',
        options.viewed ?? true, options.operatorChange || null, options.hold || null,
      ]);
      return result.rows[0];
    };
    const row = async (id) => (await db.query('select * from booking_requests where id = $1', [id])).rows[0];
    const read = async (id) => {
      await db.query('update booking_requests set viewed_by_salon = true where id = $1', [id]);
      return row(id);
    };
    const automatic = async (workspaceId, customerId) =>
      (await db.query('select public.resolve_customer_online_auto_accept_v1($1, $2) enabled',
        [workspaceId, customerId])).rows[0].enabled;

    const on = await workspace(true);
    const off = await workspace(false);
    const manualOn = await customer(on, 'manual');
    const autoOff = await customer(off, 'auto');
    const legacy = await create(on, manualOn, { viewed: false });
    assert.equal(await automatic(on, manualOn), false);
    assert.equal((await read(legacy.id)).viewed_by_salon, true,
      'Reproduction: the legacy global-only guard permits reading an effective-manual pending request.');

    const accepted = await create(on, manualOn, { status: 'accepted' });
    const awaitingResponse = await create(on, manualOn, { operatorChange: 'pending' });
    const paidWorkspace = await workspace(true, 'full');
    const paidManual = await customer(paidWorkspace, 'manual');
    const hold = await create(paidWorkspace, paidManual);
    assert.equal(hold.payment_hold_state, 'awaiting_payment');
    assert.equal(hold.viewed_by_salon, true);

    await db.exec(migration('20261009181500_keep_customer_manual_pending_requests_unread.sql'));
    assert.equal((await row(legacy.id)).viewed_by_salon, false,
      'Migration repairs previously read effective-manual pending rows.');
    assert.equal((await row(accepted.id)).viewed_by_salon, true,
      'Backfill must not reopen accepted requests.');
    assert.equal((await row(awaitingResponse.id)).viewed_by_salon, true,
      'Awaiting customer operator responses retain their exception.');
    assert.equal((await row(hold.id)).viewed_by_salon, true,
      'Unpaid reservations remain outside the actionable unread queue.');

    for (const [workspaceId, mode, expectedAutomatic] of [
      [on, 'manual', false], [off, 'manual', false],
      [on, 'inherit', true], [off, 'inherit', false],
      [on, 'auto', true], [off, 'auto', true],
      [on, null, true], [off, null, false],
    ]) {
      const customerId = await customer(workspaceId, mode);
      assert.equal(await automatic(workspaceId, customerId), expectedAutomatic);
      const request = await create(workspaceId, customerId);
      assert.equal(request.viewed_by_salon, expectedAutomatic, `insert: ${mode}, global ${workspaceId === on}`);
      assert.equal((await read(request.id)).viewed_by_salon, expectedAutomatic,
        `attempted read: ${mode}, global ${workspaceId === on}`);
      verifyUiPending(request, workspaceId === on,
        mode ? [{ id: customerId, onlineBookingAcceptanceMode: mode }] : [],
        await automatic(workspaceId, customerId));
    }
    const noCustomer = await create(off, null);
    assert.equal((await read(noCustomer.id)).viewed_by_salon, false,
      'A missing customer policy falls back to the salon rule.');
    const nullDefault = await workspace(null);
    assert.equal((await create(nullDefault, await customer(nullDefault, 'inherit'))).viewed_by_salon, false,
      'A null salon setting retains the safe manual default.');
    const foreignAuto = await customer(on, 'auto');
    const foreignManual = await customer(off, 'manual');
    assert.equal(await automatic(off, foreignAuto), false,
      'An automatic override belonging to another workspace is ignored.');
    assert.equal((await create(off, foreignAuto)).viewed_by_salon, false);
    assert.equal(await automatic(on, foreignManual), true,
      'A manual override belonging to another workspace is ignored.');
    assert.equal((await create(on, foreignManual)).viewed_by_salon, true);
    const reassigned = await create(on, await customer(on, 'auto'));
    await db.query('update booking_requests set customer_id = $1 where id = $2', [manualOn, reassigned.id]);
    assert.equal((await row(reassigned.id)).viewed_by_salon, false,
      'Changing a pending request to a manual customer re-evaluates the final policy.');

    const backofficeOn = await create(on, manualOn, { origin: 'backoffice' });
    const backofficeOff = await create(off, autoOff, { origin: 'backoffice' });
    assert.equal(backofficeOn.viewed_by_salon, true);
    assert.equal(backofficeOff.viewed_by_salon, false,
      'Frontend overrides do not change the existing backoffice global-rule behavior.');
    verifyUiPending(backofficeOn, true, [{ id: manualOn, onlineBookingAcceptanceMode: 'manual' }], true);
    verifyUiPending(backofficeOff, false, [{ id: autoOff, onlineBookingAcceptanceMode: 'auto' }], false);

    const operatorResponse = ownerRequest(await row(awaitingResponse.id));
    const responseUi = ownerRuntime(true, [{ id: manualOn, onlineBookingAcceptanceMode: 'manual' }], [operatorResponse]);
    assert.equal(responseUi.isUnworkedManualPendingRequest(operatorResponse), false);
    assert.equal(responseUi.isUnreadRequest({ ...operatorResponse, viewedBySalon: false }), false,
      'Waiting for a customer operator response remains outside the owner unread action queue.');
    await db.query("update booking_requests set operator_change_status = 'accepted' where id = $1",
      [awaitingResponse.id]);
    assert.equal((await row(awaitingResponse.id)).viewed_by_salon, false,
      'A resolved operator response no longer bypasses the manual pending protection.');

    const forgedHold = await create(on, manualOn, { hold: 'awaiting_payment' });
    assert.equal(forgedHold.payment_hold_state, null, 'The real payment guard sanitizes client hold fields.');
    assert.equal(forgedHold.viewed_by_salon, false,
      'An untrusted hold value cannot bypass the final manual unread guard.');
    await db.query("update booking_requests set payment_hold_state = 'awaiting_payment', viewed_by_salon = true where id = $1",
      [forgedHold.id]);
    assert.equal((await row(forgedHold.id)).viewed_by_salon, false);
    assert.equal((await row(forgedHold.id)).payment_hold_state, null);

    assert.equal((await read(hold.id)).viewed_by_salon, true, 'A real unpaid hold remains suppressed.');
    for (const platform of ['ios', 'web']) {
      const staleHold = { ...ownerRequest(await row(hold.id)), viewedBySalon: false };
      const holdUi = ownerRuntime(true, [{ id: paidManual, onlineBookingAcceptanceMode: 'manual' }], [staleHold], platform);
      assert.equal(holdUi.isUnworkedManualPendingRequest(staleHold), false);
      assert.equal(holdUi.isUnreadRequest(staleHold), false);
      holdUi.markRequestsAsViewed([staleHold]);
      assert.equal(holdUi.writes.length, 0, 'A stale unpaid hold cannot enter owner read persistence.');
      assert.equal(holdUi.emitted.length, 0);
    }
    await assert.rejects(db.query("update booking_requests set status = 'accepted' where id = $1", [hold.id]),
      /booking_payment_required/, 'No acceptance before payment.');
    const batch = crypto.randomUUID();
    await db.query("insert into booking_payment_hold_batches values ($1, 'paid')", [batch]);
    await db.exec("set salonpro.booking_payment_hold_write = 'yes'");
    await db.query("update booking_requests set payment_hold_state = 'paid', payment_hold_batch_id = $1, viewed_by_salon = false where id = $2",
      [batch, hold.id]);
    await db.exec("set salonpro.booking_payment_hold_write = ''");
    assert.equal((await read(hold.id)).viewed_by_salon, false,
      'After payment, a still-pending manual request becomes actionable and cannot be hidden.');
    verifyUiPending(await row(hold.id), true, [{ id: paidManual, onlineBookingAcceptanceMode: 'manual' }],
      await automatic(paidWorkspace, paidManual));
    await db.query("update booking_requests set payment_hold_state = 'awaiting_payment', viewed_by_salon = true where id = $1", [hold.id]);
    assert.equal((await row(hold.id)).payment_hold_state, 'paid', 'Payment receipt state stays authoritative.');
    assert.equal((await row(hold.id)).viewed_by_salon, false);
    await db.query("update booking_requests set status = 'accepted' where id = $1", [hold.id]);
    assert.equal((await read(hold.id)).viewed_by_salon, true, 'Accepted paid requests can be marked read normally.');

    // Deposit and full payment follow the same rule independently of salon default
    // and customer override: suppress before payment, then apply effective approval.
    for (const [globalAutomatic, mode, expectedAutomatic] of [
      [false, 'manual', false], [false, 'auto', true],
      [false, 'inherit', false], [true, 'inherit', true],
    ]) {
      const depositWorkspace = await workspace(globalAutomatic, 'deposit');
      const depositCustomer = await customer(depositWorkspace, mode);
      const reservation = await create(depositWorkspace, depositCustomer);
      assert.equal(reservation.payment_hold_state, 'awaiting_payment');
      assert.equal(reservation.viewed_by_salon, true);
      assert.equal((await read(reservation.id)).viewed_by_salon, true);
      await assert.rejects(db.query("update booking_requests set status = 'accepted' where id = $1",
        [reservation.id]), /booking_payment_required/);
      const depositBatch = crypto.randomUUID();
      await db.query("insert into booking_payment_hold_batches values ($1, 'paid')", [depositBatch]);
      await db.exec("set salonpro.booking_payment_hold_write = 'yes'");
      await db.query("update booking_requests set payment_hold_state = 'paid', payment_hold_batch_id = $1, viewed_by_salon = false where id = $2",
        [depositBatch, reservation.id]);
      await db.exec("set salonpro.booking_payment_hold_write = ''");
      assert.equal((await read(reservation.id)).viewed_by_salon, expectedAutomatic,
        `Paid deposit: ${mode}, global ${globalAutomatic}`);
      verifyUiPending(await row(reservation.id), globalAutomatic,
        [{ id: depositCustomer, onlineBookingAcceptanceMode: mode }],
        await automatic(depositWorkspace, depositCustomer));
    }

    const expired = await create(paidWorkspace, paidManual);
    await db.exec("set salonpro.booking_payment_hold_write = 'yes'");
    await db.query("update booking_requests set payment_hold_state = 'expired', status = 'cancelled', viewed_by_salon = true where id = $1",
      [expired.id]);
    await db.exec("set salonpro.booking_payment_hold_write = ''");
    assert.equal((await row(expired.id)).viewed_by_salon, true);
    await assert.rejects(db.query("update booking_requests set status = 'pending' where id = $1", [expired.id]),
      /booking_payment_hold_expired/, 'Expired payment holds cannot become actionable bookings.');

    const expiredUiRequest = { ...ownerRequest(await row(expired.id)), viewedBySalon: false };
    const expiredUi = ownerRuntime(true, [{ id: paidManual, onlineBookingAcceptanceMode: 'manual' }], [expiredUiRequest]);
    assert.equal(expiredUi.isUnreadRequest(expiredUiRequest), false);
    expiredUi.markRequestsAsViewed([expiredUiRequest]);
    assert.equal(expiredUi.writes.length, 0, 'Expired reservations retain payment suppression.');

    const handled = { ...ownerRequest(await row(accepted.id)), viewedBySalon: false };
    const acceptedUi = ownerRuntime(true, [{ id: manualOn, onlineBookingAcceptanceMode: 'manual' }], [handled]);
    assert.equal(acceptedUi.isUnworkedManualPendingRequest(handled), false);
    acceptedUi.markRequestsAsViewed([handled]);
    assert.equal(acceptedUi.acceptedWrites.length, 1, 'Accepted requests keep the dedicated authoritative read path.');
    assert.equal(acceptedUi.writes.length, 0);
    for (const status of ['Rifiutata', 'Annullata']) {
      const history = { ...handled, stato: status, paymentHoldState: null };
      const historyUi = ownerRuntime(true, [{ id: manualOn, onlineBookingAcceptanceMode: 'manual' }], [history]);
      assert.equal(historyUi.isUnworkedManualPendingRequest(history), false);
      historyUi.markRequestsAsViewed([history]);
      assert.equal(historyUi.writes.length, 1, `${status}: handled history remains readable`);
    }

    const linkedGroup = crypto.randomUUID();
    const linkedAutoCustomer = await customer(on, 'auto');
    const linkedManual = { ...ownerRequest(await row(legacy.id)), appointmentGroupId: linkedGroup };
    const linkedAuto = { ...ownerRequest(await create(on, linkedAutoCustomer)), appointmentGroupId: linkedGroup };
    const linkedUi = ownerRuntime(true, [
      { id: manualOn, onlineBookingAcceptanceMode: 'manual' },
      { id: linkedAutoCustomer, onlineBookingAcceptanceMode: 'auto' },
    ], [linkedManual, linkedAuto]);
    linkedUi.markRequestsAsViewed([linkedAuto]);
    assert.deepEqual(Array.from(linkedUi.writes[0].ids), [linkedAuto.id],
      'Expanding a linked group cannot mark an unworked manual member read.');
    assert.equal(linkedUi.isUnreadRequest(linkedManual), true);

    const legacyIdentityRequest = { ...linkedManual, customerId: undefined,
      email: 'Customer@Isolated.Test ', telefono: '+39 333 123 4567' };
    const identityUi = ownerRuntime(true, [{ id: manualOn, email: 'customer@isolated.test',
      telefono: '393331234567', onlineBookingAcceptanceMode: 'manual' }], [legacyIdentityRequest]);
    assert.equal(identityUi.isUnworkedManualPendingRequest(legacyIdentityRequest), true,
      'Legacy projections use the existing exact email + phone policy match.');
    assert.equal(identityUi.isUnworkedManualPendingRequest({ ...legacyIdentityRequest, telefono: '' }), false,
      'An incomplete identity cannot borrow another customer policy.');

    const triggers = (await db.query(`select tgname from pg_trigger
      where tgrelid = 'public.booking_requests'::regclass and not tgisinternal order by tgname`))
      .rows.map((item) => item.tgname);
    assert.deepEqual(triggers, ['zzz_booking_payment_hold_request', 'zzzz_keep_unworked_manual_booking_request_unread']);
    console.log('PASS real SQL + actual iOS/web screen callbacks: legacy reproduction, manual/auto/inherit overrides, backfill, workspace scope, customer reassignment, operator responses, authoritative full/deposit unpaid/paid/expired holds, final trigger order, stale read-cache protection, optimistic persistence filtering, linked groups and handled-history read paths.');
  } finally {
    await db.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
