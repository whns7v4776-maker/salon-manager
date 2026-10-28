const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const statusEnumDefinition = fs.readFileSync('supabase/schema.sql', 'utf8')
  .match(/create type public\.request_status as enum\s*\(([^)]+)\)/i);
assert.ok(statusEnumDefinition, 'booking request status enum must be present in schema');
const serverStatuses = [...statusEnumDefinition[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

const workspace = '11111111-1111-4111-8111-111111111111';
const otherWorkspace = '22222222-2222-4222-8222-222222222222';
const group = '33333333-3333-4333-8333-333333333333';
const id = (n) => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const sources = new Map();
const sourceFile = (path) => {
  if (!sources.has(path)) {
    const text = fs.readFileSync(path, 'utf8');
    sources.set(path, ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
  }
  return sources.get(path);
};
const expression = (path, name, callback = false) => {
  let result;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) {
      result = callback ? node.initializer.arguments[0] : node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(path));
  assert.ok(result, `Missing ${name}`);
  return result.getText(sourceFile(path));
};
const effect = (path, anchor) => {
  let result;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'useEffect' &&
      node.arguments[0]?.getText().includes(anchor)) result = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(sourceFile(path));
  assert.ok(result, `Missing effect ${anchor}`);
  return result.getText(sourceFile(path));
};
const evaluate = (body, context) => vm.runInNewContext(
  ts.transpileModule(`globalThis.result = (${body});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
  context,
) ?? context.result;

let rows = [];
let dbError = null;
let queries = 0;
let pendingRead = null;
const supabase = {
  from(table) {
    assert.equal(table, 'booking_requests');
    queries++;
    const filters = [];
    return {
      update(update) { assert.equal(update.viewed_by_salon, true); assert.deepEqual(Object.keys(update), ['viewed_by_salon']); return this; },
      eq(key, value) {
        if (key === 'status') assert.ok(serverStatuses.includes(value), 'server booking enum must exist');
        filters.push((row) => row[key] === value); return this;
      },
      is(key, value) { filters.push((row) => (row[key] ?? null) === value); return this; },
      in(key, values) {
        if (key === 'status') assert.ok(values.every((value) => serverStatuses.includes(value)), 'server booking enum must exist');
        filters.push((row) => values.includes(row[key])); return this;
      },
      or(value) {
        if (value === 'operator_change_status.is.null,operator_change_status.neq.pending') {
          filters.push((row) => row.operator_change_status !== 'pending');
        } else {
          assert.equal(value, 'origin.eq.frontend,and(operator_change_status.eq.accepted,operator_change_responded_at.not.is.null)');
          filters.push((row) => row.origin === 'frontend' ||
            (row.operator_change_status === 'accepted' && row.operator_change_responded_at != null));
        }
        return this;
      },
      async select() {
        if (pendingRead) await pendingRead;
        if (dbError) return { data: null, error: dbError };
        const selected = rows.filter((row) => filters.every((filter) => filter(row)));
        selected.forEach((row) => { row.viewed_by_salon = true; });
        return { data: selected, error: null };
      },
    };
  },
};
const moduleContext = { exports: {}, require: () => ({ supabase }) };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/badges/owner-accepted-request-read.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText, moduleContext);
const { buildOwnerViewedRequestSignature: signature, getOwnerAcceptedAppointmentReadTarget: target,
  markOwnerAcceptedBookingRequestsRead: markRead } = moduleContext.exports;

const request = (n, overrides = {}) => ({
  id: id(n), workspace_id: workspace, appointment_group_id: group,
  origin: 'frontend', status: 'accepted', viewed_by_salon: false,
  operator_change_status: null, operator_change_responded_at: null,
  cancellation_source: null, created_at: '2026-10-08T08:00:00Z', ...overrides,
});
const uiRequest = (n, overrides = {}) => ({
  id: id(n), origine: 'frontend', stato: 'Accettata', viewedBySalon: false,
  createdAt: '2026-10-08T08:00:00Z',
  data: '2026-09-25', ora: '10:00', servizio: 'Taglio', nome: 'QA', cognome: String(n),
  ...overrides,
});
const tabs = 'app/(tabs)/_layout.tsx';
const bookings = 'app/(tabs)/prenotazioni.tsx';
const agenda = 'app/(tabs)/agenda.tsx';

(async () => {
  const ordinarySignature = `${id(1)}:Accettata:none:2026-10-08T08:00:00Z`;
  assert.equal(signature({ id: id(1), stato: 'Accettata', createdAt: '2026-10-08T08:00:00Z' }), ordinarySignature);
  const changedSignature = signature({ id: id(1), stato: 'Accettata', createdAt: '2026-10-08T08:00:00Z',
    operatorChangeStatus: 'accepted', operatorChangeRespondedAt: '2026-10-08T09:00:00Z' });
  assert.notEqual(changedSignature, ordinarySignature, 'new operator response must not inherit the earlier read');
  assert.equal(target({ bookingOrigin: 'backoffice', bookingRequestId: id(1) }, workspace), null);
  assert.equal(target({ syntheticRequestStatus: 'In attesa', syntheticRequestId: id(1) }, workspace), null);
  assert.equal(target({ syntheticOperatorChangeStatus: 'pending', bookingRequestId: id(1) }, workspace), null);
  assert.equal(target({ id: 'a', cliente: 'Same name' }, workspace), null, 'no fuzzy customer matching');

  rows = [request(1), request(2), request(3, { status: 'pending' }),
    request(4, { status: 'cancelled' }), request(5, { origin: 'backoffice' }),
    request(6, { workspace_id: otherWorkspace }), request(7, { operator_change_status: 'pending' })];
  const acknowledged = await markRead({ workspaceId: workspace, appointmentGroupId: group });
  assert.deepEqual(Array.from(acknowledged.requestIds), [id(1), id(2)], 'read all accepted phases and only those in this workspace');
  assert.equal(rows[2].viewed_by_salon, false, 'pending remains actionable');
  assert.equal(rows[3].viewed_by_salon, false, 'cancellation remains unread');
  assert.equal(rows[4].viewed_by_salon, false, 'ordinary owner-created booking remains unchanged');
  assert.equal(rows[5].viewed_by_salon, false, 'other workspace unchanged');
  assert.equal(rows[6].viewed_by_salon, false, 'customer response pending unchanged');
  rows.push(request(8, { origin: 'backoffice', operator_change_status: 'accepted', operator_change_responded_at: '2026-10-08T09:00:00Z' }));
  const response = await markRead({ workspaceId: workspace, requestIds: [id(8), id(5)], includeOperatorChangeResponses: true });
  assert.deepEqual(Array.from(response.requestIds), [id(8)], 'backoffice response can be read without reading ordinary backoffice booking');
  const beforeInvalid = queries;
  await markRead({ workspaceId: workspace, requestIds: ['local-only'] });
  await markRead({ workspaceId: 'invalid', appointmentGroupId: group });
  assert.equal(queries, beforeInvalid, 'invalid targets never write');

  const accepted = uiRequest(1);
  const pending = uiRequest(2, { stato: 'In attesa' });
  const opPending = uiRequest(3, { operatorChangeStatus: 'pending' });
  const alreadyRead = uiRequest(4, { viewedBySalon: true });
  const recentlyHandled = new Map([[accepted.id, 1]]);
  const isEventViewed = evaluate(expression(tabs, 'isRequestEventViewed', true), {
    buildViewedRequestSignature: signature,
  });
  assert.equal(isEventViewed(accepted, [signature(accepted)]), false,
    'Agenda cannot hide a server-unread accepted booking using an old local signature');
  assert.equal(isEventViewed({ ...accepted, viewedBySalon: true }, [signature(accepted)]), true);
  assert.equal(isEventViewed(pending, [signature(pending)]), true, 'Other read behavior stays unchanged');
  const localContext = {
    hasLoadedViewedRequestIds: true, hasLoadedDeletedCustomerIdentityKeys: true,
    hasLoadedOwnerPendingBannerShownState: true, ownerInitialDataHydrating: false, ownerServerSyncReady: true,
    canonicalFrontendRequests: [accepted, pending, opPending, alreadyRead],
    isCustomerCancellationRequestEvent: () => false, isResolvedOperatorChangeResponseEvent: () => false,
    supersededPendingRequestKeys: new Set(), buildFrontendRequestSyncKey: (item) => item.id,
    ownerAutoAcceptedRequestSyncKeysRef: { current: new Map() },
    isOwnerRelevantFrontendRequestValue: () => true, isDeletedFrontendRequest: () => false,
    isSupersededCustomerCancellation: () => false, isOwnerCountableRequestNotification: () => true,
    isRequestEventViewed: isEventViewed, viewedRequestIds: [signature(accepted)],
    recentlyHandledOwnerRequestIdsRef: { current: recentlyHandled },
    recentlyHandledOwnerRequestSyncKeysRef: { current: recentlyHandled },
  };
  const unreadItems = evaluate(expression(tabs, 'ownerUnreadFrontendRequestEvents', true), localContext)();
  assert.deepEqual(Array.from(unreadItems, (item) => item.id), [accepted.id, pending.id],
    'old accepted stays unread despite hydrated handled refs; pending customer change/read excluded');
  const badgeContext = {
    ownerTabBadgeDataReady: true, ownerLivePendingFrontendRequests: [pending], ownerUnreadFrontendRequestEvents: unreadItems,
    countOwnerLogicalBookingEvents: (items) => new Set(items.map((item) => item.appointmentGroupId || item.id)).size,
    isCustomerCancellationRequestEvent: () => false, isAutoacceptVisualTrackedEvent: () => false,
    IS_WEB: true, viewedRequestIds: [], isRequestEventViewed: () => false,
    androidAutoacceptVisualRequestsCount: 0, webAutoacceptVisualRequestsCount: 0,
    unreadCountsBySection: {},
  };
  assert.equal(evaluate(expression(tabs, 'localAgendaPendingRequestsCount'), badgeContext), 2,
    'Agenda includes unread accepted and actionable pending');
  unreadItems[0].appointmentGroupId = 'logical';
  unreadItems.push({ ...unreadItems[0], id: id(9) });
  assert.equal(evaluate(expression(tabs, 'localAgendaPendingRequestsCount'), badgeContext), 2, 'linked phases count once');
  badgeContext.isAutoacceptVisualTrackedEvent = (item) => item.appointmentGroupId === 'logical';
  badgeContext.webAutoacceptVisualRequestsCount = 1;
  assert.equal(evaluate(expression(tabs, 'localAgendaPendingRequestsCount'), badgeContext), 2,
    'temporary web autoaccept is counted once across all logical accepted phases');
  badgeContext.IS_WEB = false;
  badgeContext.webAutoacceptVisualRequestsCount = 0;
  badgeContext.androidAutoacceptVisualRequestsCount = 1;
  assert.equal(evaluate(expression(tabs, 'localAgendaPendingRequestsCount'), badgeContext), 2,
    'temporary native autoaccept is counted once across all logical accepted phases');
  const trackedContext = {
    IS_ANDROID: true, isCustomerCancellationRequestEvent: () => false,
    androidAutoacceptVisualRequestsRef: { current: {} },
    ownerAutoAcceptedRequestSyncKeysRef: { current: new Map([[accepted.id, 1]]) },
    buildFrontendRequestSyncKey: (item) => item.id,
    buildOwnerForegroundStableBannerKey: (item) => item.id,
    buildOwnerLiveBannerShownKey: (item) => item.id, buildLiveRequestBannerEventKey: (item) => item.id,
  };
  const isTracked = evaluate(expression(tabs, 'isAndroidAutoacceptVisualTrackedEvent'), trackedContext);
  assert.equal(isTracked(accepted), false,
    'accepted unread returns to normal badge after the temporary visual expires even while autoaccept history remains');
  trackedContext.androidAutoacceptVisualRequestsRef.current[accepted.id] = { requestId: accepted.id };
  assert.equal(isTracked(accepted), true, 'an actually active visual bridge still prevents duplicate count');
  assert.equal(evaluate(expression(bookings, 'unreadAcceptedCount', true), {
    hasLoadedViewedRequestIds: true, richiesteAccettateRecenti: [accepted, opPending, alreadyRead],
    isUnreadRequest: (item) => item.viewedBySalon !== true,
  })(), 1, 'Accepted section shows all unseen accepted; pending customer change excluded');

  const archivedContext = {
    hasLoadedViewedRequestIds: true,
    richiesteArchivioStorico: [
      uiRequest(10, { appointmentGroupId: 'old-group' }),
      uiRequest(11, { appointmentGroupId: 'old-group' }),
      uiRequest(12),
      uiRequest(13, { viewedBySalon: true }),
      uiRequest(14, { stato: 'Rifiutata' }),
      uiRequest(15, { stato: 'Annullata', cancellationSource: 'salone' }),
      uiRequest(16, { stato: 'Annullata', cancellationSource: 'cliente' }),
      uiRequest(17, { stato: 'Accettata', operatorChangeStatus: 'pending' }),
    ],
    isUnreadRequest: item => item.viewedBySalon !== true && item.operatorChangeStatus !== 'pending',
    isCancelledByCustomer: item => item.cancellationSource === 'cliente',
    isResolvedOperatorChangeResponseEvent: () => false,
  };
  const archiveCount = expression(bookings, 'unreadArchiveCount', true);
  assert.equal(evaluate(archiveCount, archivedContext)(), 3,
    'Archived unread notifications remain reachable; linked phases count once, read/owner-handled events stay excluded');
  archivedContext.hasLoadedViewedRequestIds = false;
  assert.equal(evaluate(archiveCount, archivedContext)(), 0, 'No archive unread flash during local read hydration');

  const unreadRequest = evaluate(expression(bookings, 'isUnreadRequest', true), {
    isUnworkedManualPendingRequest: item => item.stato === 'In attesa',
    isFrontendRequest: item => item.origine === 'frontend',
    isCancelledByCustomer: item => item.cancellationSource === 'cliente',
    isResolvedOperatorChangeResponseEvent: () => false,
    viewedRequestIds: [signature(accepted)], buildViewedRequestSignature: signature,
  });
  assert.equal(unreadRequest(accepted), true, 'A legacy local accepted read cannot hide an unacknowledged server read');
  assert.equal(unreadRequest(alreadyRead), false);
  assert.equal(unreadRequest(pending), true, 'Pending remains actionable');

  let legacyItems = [accepted, pending], legacyRefreshes = 0;
  const legacyContext = {
    isAuthenticated: true, workspaceAccessAllowed: true, hasLoadedViewedRequestIds: true,
    viewedRequestIds: [signature(accepted), signature(pending)],
    richiestePrenotazione: legacyItems,
    isUnworkedManualPendingRequest: item => item.stato === 'In attesa',
    buildViewedRequestSignature: signature,
    buildViewedRequestSyncSignature: (ids, signatures) => `${ids.sort().join('|')}::${signatures.slice().sort().join('|')}`,
    viewedRequestBackendSyncRef: { current: '' }, salonWorkspace: { id: workspace },
    isUuidLike: value => /^[0-9a-f-]{36}$/.test(value), supabase,
    legacyViewedReadOwnerScope: 'current-owner', legacyViewedReadOwnerScopeRef: { current: 'current-owner' },
    setRichiestePrenotazione: update => { legacyItems = update(legacyItems); },
    refreshBadges: async () => legacyRefreshes++, console: { log: () => {} },
  };
  const reconcileLegacyRead = evaluate(effect(bookings, 'viewedRequestBackendSyncRef.current = syncSignature'), legacyContext);
  let finishLegacyRead;
  pendingRead = new Promise(resolve => { finishLegacyRead = resolve; });
  rows = [request(1), request(2, { status: 'pending' }), request(1, { workspace_id: otherWorkspace })];
  reconcileLegacyRead();
  assert.equal(legacyItems[0].viewedBySalon, false, 'Legacy reconciliation is not optimistic');
  finishLegacyRead(); await new Promise(resolve => setImmediate(resolve)); pendingRead = null;
  assert.equal(legacyItems[0].viewedBySalon, true, 'Legacy read applies only after server confirmation');
  assert.equal(rows[1].viewed_by_salon, false, 'Manual pending request is never migrated as read');
  assert.equal(rows[2].viewed_by_salon, false, 'Legacy migration stays in its owner workspace');
  assert.equal(legacyRefreshes, 1, 'Legacy server read refreshes the navigation badge');

  legacyItems = [accepted, pending];
  legacyContext.viewedRequestBackendSyncRef.current = '';
  dbError = { message: 'offline' };
  reconcileLegacyRead(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(legacyItems[0].viewedBySalon, false, 'Failed legacy read stays visible');
  assert.equal(legacyContext.viewedRequestBackendSyncRef.current, '', 'Failed legacy migration can retry');
  dbError = null;
  legacyContext.legacyViewedReadOwnerScopeRef.current = 'different-owner';
  reconcileLegacyRead(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(legacyItems[0].viewedBySalon, false, 'Late legacy read cannot modify a different owner profile');
  assert.equal(legacyRefreshes, 1);
  legacyContext.legacyViewedReadOwnerScopeRef.current = 'current-owner';
  legacyContext.viewedRequestBackendSyncRef.current = '';
  rows = [request(1, { status: 'cancelled', cancellation_source: 'cliente' })];
  reconcileLegacyRead(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows[0].viewed_by_salon, false, 'Legacy accepted read cannot acknowledge a racing customer cancellation');
  assert.equal(legacyItems[0].viewedBySalon, false);
  legacyContext.viewedRequestBackendSyncRef.current = '';
  rows = [request(1, { operator_change_status: 'accepted', operator_change_responded_at: '2026-10-08T10:00:00Z' })];
  reconcileLegacyRead(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(rows[0].viewed_by_salon, false, 'A later operator response cannot inherit a legacy read');
  legacyContext.isAuthenticated = false;
  const beforeUnauthenticatedLegacy = queries;
  reconcileLegacyRead();
  assert.equal(queries, beforeUnauthenticatedLegacy, 'Legacy migration never writes while signed out');

  let releaseRead;
  pendingRead = new Promise((resolve) => { releaseRead = resolve; });
  rows = [request(1)];
  let currentItems = [accepted], viewedSignatures = [], emitted = 0, refreshed = 0;
  const readContext = {
    acceptedReadOwnerScope: 'current-owner', acceptedReadOwnerScopeRef: { current: 'current-owner' },
    isAuthenticated: true, workspaceAccessAllowed: true,
    salonWorkspace: { id: workspace }, markOwnerAcceptedBookingRequestsRead: markRead,
    buildViewedRequestSignature: signature,
    setRichiestePrenotazione: (update) => { currentItems = update(currentItems); },
    setViewedRequestIds: (update) => { viewedSignatures = update(viewedSignatures); },
    emitOwnerViewedNotificationChange: () => emitted++, refreshBadges: async () => refreshed++,
    salonAccountEmail: 'owner@example.invalid', console: { log: () => {} },
  };
  const readAccepted = evaluate(expression(bookings, 'persistAcceptedRequestsAsViewed', true), readContext);
  const reading = readAccepted([accepted]);
  assert.equal(currentItems[0].viewedBySalon, false, 'no optimistic accepted read before server confirmation');
  releaseRead(); await reading; pendingRead = null;
  assert.equal(currentItems[0].viewedBySalon, true);
  assert.equal(emitted, 1); assert.equal(refreshed, 1); assert.equal(viewedSignatures.length, 1);

  currentItems = [accepted]; dbError = { message: 'offline' };
  await readAccepted([accepted]);
  assert.equal(currentItems[0].viewedBySalon, false, 'failed server read stays unread');
  dbError = null; readContext.acceptedReadOwnerScopeRef.current = 'different-owner';
  await readAccepted([accepted]);
  assert.equal(currentItems[0].viewedBySalon, false, 'a late read response cannot alter another owner profile');
  readContext.acceptedReadOwnerScopeRef.current = 'current-owner';
  rows = [request(1, { status: 'cancelled' })];
  await readAccepted([accepted]);
  assert.equal(currentItems[0].viewedBySalon, false, 'racing cancellation must stay unread');

  let agendaWrites = 0;
  const agendaContext = {
    isAgendaScreenFocused: false, weekAppointmentDetails: { bookingOrigin: 'frontend', bookingRequestId: id(1) },
    weekAppointmentAwaitingCustomerConfirmation: false, weekManualAcceptChoiceOpen: false,
    weekManualAcceptDurationOpen: false, weekPhasedTimeEditor: null, salonWorkspace: { id: workspace },
    getOwnerAcceptedAppointmentReadTarget: target, agendaReadOwnerScope: 'current-owner',
    agendaReadOwnerScopeRef: { current: 'current-owner' }, agendaAcceptedReadInFlightRef: { current: new Set() },
    markOwnerAcceptedBookingRequestsRead: async () => { agendaWrites++; return { requestIds: [id(1)], requestSignatures: [] }; },
    setRichiestePrenotazione: () => {}, emitOwnerViewedNotificationChange: () => {}, refreshBadges: async () => {},
    appContext: { salonAccountEmail: 'owner@example.invalid', isAuthenticated: true, workspaceAccessAllowed: true }, console,
    buildOwnerViewedRequestSignature: signature,
  };
  const readDisplayed = evaluate(expression(agenda, 'markDisplayedAcceptedAppointmentAsViewed', true), agendaContext);
  await readDisplayed(); assert.equal(agendaWrites, 0, 'inactive Agenda never reads');
  agendaContext.isAgendaScreenFocused = true;
  agendaContext.appContext.workspaceAccessAllowed = false;
  await readDisplayed(); assert.equal(agendaWrites, 0, 'inaccessible owner workspace never reads');
  agendaContext.appContext.workspaceAccessAllowed = true;
  agendaContext.weekAppointmentDetails.syntheticRequestStatus = 'In attesa';
  await readDisplayed(); assert.equal(agendaWrites, 0, 'displayed manual pending never auto-reads');
  delete agendaContext.weekAppointmentDetails.syntheticRequestStatus;
  agendaContext.weekManualAcceptChoiceOpen = true;
  await readDisplayed(); assert.equal(agendaWrites, 0, 'hidden detail behind selection never reads');
  agendaContext.weekManualAcceptChoiceOpen = false;
  await readDisplayed(); assert.equal(agendaWrites, 1, 'actual accepted detail can acknowledge its booking');
  assert.match(fs.readFileSync(agenda, 'utf8'), /onShow=\{\(\) => \{ void markDisplayedAcceptedAppointmentAsViewed\(\); \}\}/);
  console.log('PASS: owner accepted notification badges, logical groups, persistent read, response renewal, failures and profile isolation');
})().catch((error) => { console.error(error); process.exitCode = 1; });
