/* Real transpiled owner hook; isolated transport, lifecycle and timer boundaries. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/lib/customer-notification-consent.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const row = (id, permission = 'granted', checked = '2026-10-10T12:00:00.000Z') => ({
  id, notification_permission: permission, notification_permission_checked_at: checked,
});
function fixture({ web = false, appState = 'active', abortAvailable = true } = {}) {
  let rendering, cursor = 0, timerId = 0;
  const requests = [], channels = [], removed = [], timers = new Map(), appListeners = new Set();
  const deadlines = new Map();
  const windowListeners = new Map(), documentListeners = new Map();
  const add = (map, name, callback) => {
    if (!map.has(name)) map.set(name, new Set()); map.get(name).add(callback);
  };
  const remove = (map, name, callback) => {
    map.get(name)?.delete(callback); if (!map.get(name)?.size) map.delete(name);
  };
  const React = {
    useState(initial) {
      const instance = rendering, index = cursor++;
      if (!instance.slots[index]) instance.slots[index] = { value: initial };
      return [instance.slots[index].value, value => {
        assert.equal(instance.disposed, false, 'Late data must not notify an unmounted card.');
        instance.writes++; instance.slots[index].value = typeof value === 'function'
          ? value(instance.slots[index].value) : value;
      }];
    },
    useEffect(effect, dependencies) {
      const instance = rendering, index = cursor++, previous = instance.slots[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        instance.slots[index] = { dependencies, cleanup: previous?.cleanup };
        instance.effects.push(() => {
          instance.slots[index].cleanup?.(); instance.slots[index].cleanup = effect();
        });
      }
    },
  };
  const AppState = { currentState: appState,
    addEventListener(name, listener) {
      assert.equal(name, 'change'); appListeners.add(listener);
      return { remove: () => appListeners.delete(listener) };
    },
  };
  const document = { visibilityState: 'visible',
    addEventListener: (name, listener) => add(documentListeners, name, listener),
    removeEventListener: (name, listener) => remove(documentListeners, name, listener),
  };
  const window = {
    addEventListener: (name, listener) => add(windowListeners, name, listener),
    removeEventListener: (name, listener) => remove(windowListeners, name, listener),
  };
  const supabase = {
    from(table) {
      assert.equal(table, 'customers');
      return { select(columns) {
        assert.equal(columns, 'id,notification_permission,notification_permission_checked_at');
        return { eq(column, workspaceId) {
          assert.equal(column, 'workspace_id');
          let resolve, reject;
          const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
          const request = { workspaceId, resolve, reject };
          promise.abortSignal = signal => { request.signal = signal; return promise; };
          requests.push(request); return promise;
        } };
      } };
    },
    channel(name) {
      const channel = { name, on(event, filter, callback) {
        assert.equal(event, 'postgres_changes'); assert.equal(filter.event, '*');
        assert.equal(filter.schema, 'public'); assert.equal(filter.table, 'customer_notification_consent_updates');
        channel.filter = filter; channel.callback = callback; return channel;
      }, subscribe(callback) { channel.status = callback; return channel; } };
      channels.push(channel); return channel;
    },
    removeChannel(channel) { removed.push(channel); return Promise.resolve(); },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, Date, Set, Map, ...(abortAvailable ? { AbortController } : {}),
    // React Native exposes window, but does not implement browser DOM events.
    ...(web ? { window, document } : { window: {} }),
    setInterval(callback, milliseconds) {
      assert.equal(milliseconds, 60000); const id = ++timerId;
      timers.set(id, callback); return id;
    },
    clearInterval: id => timers.delete(id),
    setTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 15000); const id = ++timerId;
      deadlines.set(id, callback); return id;
    },
    clearTimeout: id => deadlines.delete(id),
    require(name) {
      if (name === 'react') return React;
      if (name === 'react-native') return { AppState };
      if (name === './supabase') return { supabase };
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  function card(workspaceId = 'workspace-a', customerId = 'customer-a') {
    const instance = { slots: [], effects: [], disposed: false, writes: 0, workspaceId, customerId };
    instance.render = (nextWorkspace = instance.workspaceId, nextCustomer = instance.customerId) => {
      instance.workspaceId = nextWorkspace; instance.customerId = nextCustomer;
      rendering = instance; cursor = 0; instance.effects = [];
      const result = exports.useCustomerConsent(nextWorkspace, nextCustomer);
      instance.effects.forEach(effect => effect()); return result;
    };
    instance.unmount = () => {
      instance.slots.forEach(slot => slot.cleanup?.()); instance.disposed = true;
    };
    instance.render(); return instance;
  }
  return {
    card, requests, channels, removed, timers, deadlines, appListeners, windowListeners, documentListeners,
    reply(index, rows) { requests[index].resolve({ data: rows, error: null }); },
    error(index) { requests[index].resolve({ data: null, error: new Error('Offline') }); },
    emit(value, { event = 'UPDATE', channel = 0 } = {}) {
      channels[channel].callback({ eventType: event, [event === 'DELETE' ? 'old' : 'new']: value });
    },
    live(permission = 'granted', { id = 'customer-a', workspace = 'workspace-a', channel = 0 } = {}) {
      this.emit({ ...row(id, permission), workspace_id: workspace }, { channel });
    },
    status(value = 'SUBSCRIBED', index = 0) { channels[index].status(value); },
    poll() { [...timers.values()].forEach(callback => callback()); },
    timeout() { [...deadlines.values()].forEach(callback => callback()); },
    app(state) { AppState.currentState = state; [...appListeners].forEach(callback => callback(state)); },
    webEvent(event, visible) {
      if (visible !== undefined) document.visibilityState = visible ? 'visible' : 'hidden';
      const map = event === 'visibilitychange' ? documentListeners : windowListeners;
      [...(map.get(event) ?? [])].forEach(callback => callback());
    },
  };
}
const checks = [];
const check = async (name, run) => { await run(); checks.push({ name, passed: true }); };
(async () => {
  await check('initial authoritative read is scoped and minimal', async () => {
    const f = fixture(), card = f.card(); assert.equal(f.requests[0].workspaceId, 'workspace-a');
    f.reply(0, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, 'granted');
    assert.equal(f.channels[0].filter.filter, 'workspace_id=eq.workspace-a'); card.unmount();
  });
  await check('live permission updates render immediately without another fetch', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a', null, null)]); await flush();
    f.live(); assert.equal(card.render().notification_permission, 'granted');
    f.live('denied'); assert.equal(card.render().notification_permission, 'denied');
    f.live('undetermined'); assert.equal(card.render().notification_permission, 'undetermined');
    assert.equal(f.requests.length, 1); card.unmount();
  });
  await check('explicit reset clears the displayed verification immediately', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush();
    f.emit({ ...row('customer-a', null, null), workspace_id: 'workspace-a' });
    const result = card.render(); assert.equal(result.notification_permission, null);
    assert.equal(result.notification_permission_checked_at, null); card.unmount();
  });
  await check('late initial load cannot overwrite a newer permission or reset event', async () => {
    const f = fixture(), card = f.card(); f.live('denied');
    f.reply(0, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, 'denied');
    f.poll(); f.emit({ ...row('customer-a', null, null), workspace_id: 'workspace-a' });
    f.reply(1, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, null);
    card.unmount();
  });
  await check('late load merges live updates while retaining other authoritative rows', async () => {
    const f = fixture(), a = f.card(), b = f.card('workspace-a', 'customer-b');
    f.live('denied'); f.reply(0, [row('customer-a'), row('customer-b', 'undetermined')]); await flush();
    assert.equal(a.render().notification_permission, 'denied'); assert.equal(b.render().notification_permission, 'undetermined');
    a.unmount(); b.unmount();
  });
  await check('DELETE cannot be resurrected by an older load', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush();
    f.poll(); f.emit({ id: 'customer-a' }, { event: 'DELETE' }); assert.equal(card.render(), null);
    f.reply(1, [row('customer-a')]); await flush(); assert.equal(card.render(), null); card.unmount();
  });
  await check('scoped deletion during initial load prevents a stale row from appearing', async () => {
    const f = fixture(), card = f.card(); f.emit({ id: 'customer-a', workspace_id: 'workspace-a' }, { event: 'DELETE' });
    f.reply(0, [row('customer-a')]); await flush(); assert.equal(card.render(), null); card.unmount();
  });
  await check('wrong workspace, unknown deletes and malformed rows cannot alter verified data', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush(); const writes = card.writes;
    f.live('denied', { workspace: 'workspace-b' });
    f.emit({ id: 'customer-a', workspace_id: 'workspace-b' }, { event: 'DELETE' });
    f.emit({ id: 'unknown-customer' }, { event: 'DELETE' });
    for (const bad of [null, {}, { id: 'customer-a', notification_permission: 'wrong', notification_permission_checked_at: null },
      row('customer-a', 'denied', 'not-a-date'), { ...row('customer-a'), notification_permission: undefined }]) {
      f.emit(bad && { ...bad, workspace_id: 'workspace-a' });
    }
    f.emit(row('customer-a', 'denied')); f.emit({ ...row('customer-a', 'denied'), workspace_id: 'workspace-a' }, { event: 'OTHER' });
    assert.equal(card.render().notification_permission, 'granted'); assert.equal(card.writes, writes); card.unmount();
  });
  await check('duplicate identical events do not cause extra card renders', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush(); const writes = card.writes;
    f.live(); f.live(); assert.equal(card.writes, writes); card.unmount();
  });
  await check('one hundred cards share one channel, one load and one timer', async () => {
    const f = fixture(), cards = Array.from({ length: 100 }, (_, i) => f.card('workspace-a', `customer-${i}`));
    assert.equal(f.channels.length, 1); assert.equal(f.requests.length, 1); assert.equal(f.timers.size, 1);
    assert.equal(f.appListeners.size, 1); f.reply(0, [row('customer-0')]); await flush();
    cards.slice(0, 99).forEach(card => card.unmount()); assert.equal(f.removed.length, 0);
    cards[99].unmount(); assert.equal(f.removed.length, 1); assert.equal(f.timers.size, 0); assert.equal(f.appListeners.size, 0);
  });
  for (const failure of ['reported', 'thrown', 'malformed']) {
    await check(`${failure} load failure preserves previously verified state`, async () => {
      const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush(); f.poll();
      if (failure === 'reported') f.error(1);
      else if (failure === 'thrown') f.requests[1].reject(new Error('Offline'));
      else f.reply(1, [{ id: 'customer-a' }]);
      await flush(); assert.equal(card.render().notification_permission, 'granted'); card.unmount();
    });
  }
  await check('subscribed and reconnected channel refresh authoritative rows', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush();
    f.status('CHANNEL_ERROR'); assert.equal(f.requests.length, 1);
    f.status(); assert.equal(f.requests.length, 2); f.reply(1, [row('customer-a', 'denied')]); await flush();
    assert.equal(card.render().notification_permission, 'denied'); f.status(); assert.equal(f.requests.length, 3);
    f.reply(2, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, 'granted'); card.unmount();
  });
  await check('overlapping resume and subscription refresh coalesce into one trailing load', async () => {
    const f = fixture(), card = f.card(); f.status(); f.app('active'); f.poll();
    assert.equal(f.requests.length, 1); f.reply(0, [row('customer-a')]); await flush();
    assert.equal(f.requests.length, 2); f.reply(1, [row('customer-a', 'denied')]); await flush();
    assert.equal(f.requests.length, 2); assert.equal(card.render().notification_permission, 'denied'); card.unmount();
  });
  await check('native background does not poll, active resumes immediately', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush();
    f.app('background'); f.poll(); f.status(); assert.equal(f.requests.length, 1);
    f.app('active'); assert.equal(f.requests.length, 2); f.reply(1, [row('customer-a', 'denied')]); await flush();
    assert.equal(card.render().notification_permission, 'denied'); card.unmount();
  });
  await check('initially background owner defers load until active', async () => {
    const f = fixture({ appState: 'background' }), card = f.card(); assert.equal(f.requests.length, 0);
    f.poll(); f.status(); assert.equal(f.requests.length, 0); f.app('active'); assert.equal(f.requests.length, 1);
    f.reply(0, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, 'granted'); card.unmount();
  });
  for (const event of ['focus', 'online', 'visibilitychange']) {
    await check(`web ${event} refreshes immediately and hidden pages never poll`, async () => {
      const f = fixture({ web: true }), card = f.card(); f.reply(0, [row('customer-a')]); await flush();
      f.webEvent('visibilitychange', false); f.poll(); f.webEvent('focus'); f.webEvent('online');
      assert.equal(f.requests.length, 1); f.webEvent(event, true); assert.equal(f.requests.length, 2);
      f.reply(1, [row('customer-a', 'denied')]); await flush(); assert.equal(card.render().notification_permission, 'denied');
      card.unmount(); assert.equal(f.windowListeners.size, 0); assert.equal(f.documentListeners.size, 0);
    });
  }
  await check('workspace switching never flashes old rows or accepts old results/events', async () => {
    const f = fixture(), card = f.card(); f.reply(0, [row('customer-a')]); await flush(); assert.ok(card.render());
    f.poll(); assert.equal(card.render('workspace-b'), null); assert.equal(f.removed.length, 1);
    f.live('denied'); f.reply(1, [row('customer-a', 'denied')]); await flush(); assert.equal(card.render(), null);
    f.reply(2, [row('customer-a', 'undetermined')]); await flush(); assert.equal(card.render().notification_permission, 'undetermined');
    assert.equal(f.channels[1].filter.filter, 'workspace_id=eq.workspace-b'); card.unmount();
  });
  await check('A to B to A ignores the abandoned first A load without deleting new entry', async () => {
    const f = fixture(), card = f.card(); card.render('workspace-b'); card.render('workspace-a');
    f.reply(2, [row('customer-a')]); await flush(); f.reply(0, [row('customer-a', 'denied')]); f.reply(1, []); await flush();
    assert.equal(card.render().notification_permission, 'granted'); assert.equal(f.timers.size, 1); card.unmount();
  });
  await check('late data and events after final unmount do not notify or restart work', async () => {
    const f = fixture({ web: true }), card = f.card(), writes = card.writes; card.unmount();
    f.reply(0, [row('customer-a')]); f.live(); f.status(); f.app('active'); f.webEvent('focus'); f.poll(); await flush();
    assert.equal(card.writes, writes); assert.equal(f.requests.length, 1); assert.equal(f.removed.length, 1);
    assert.equal(f.timers.size, 0); assert.equal(f.windowListeners.size, 0); assert.equal(f.documentListeners.size, 0);
  });
  await check('empty workspace starts no subscription or read', async () => {
    const f = fixture(), card = f.card(''); assert.equal(card.render(), null); assert.equal(f.channels.length, 0);
    assert.equal(f.requests.length, 0); assert.equal(f.timers.size, 0); card.unmount();
  });
  await check('hung fallback aborts after the deadline, preserves verified data, and permits refocus', async () => {
    const f = fixture({ web: true }), card = f.card(); f.reply(0, [row('customer-a')]); await flush();
    assert.equal(f.deadlines.size, 0); f.poll(); assert.equal(f.requests.length, 2);
    f.timeout(); await flush(); assert.equal(f.requests[1].signal.aborted, true);
    assert.equal(f.deadlines.size, 0); assert.equal(card.render().notification_permission, 'granted');
    f.webEvent('focus'); assert.equal(f.requests.length, 3); f.reply(2, [row('customer-a', 'denied')]); await flush();
    assert.equal(card.render().notification_permission, 'denied'); assert.equal(f.deadlines.size, 0); card.unmount();
  });
  await check('hung initial read times out without inferring a denial and online can retry', async () => {
    const f = fixture({ web: true }), card = f.card(); f.timeout(); await flush();
    assert.equal(card.render(), null); assert.equal(f.requests[0].signal.aborted, true);
    f.webEvent('online'); assert.equal(f.requests.length, 2); f.reply(1, [row('customer-a')]); await flush();
    assert.equal(card.render().notification_permission, 'granted'); card.unmount();
  });
  await check('focus events during a hung read run one trailing refresh after timeout', async () => {
    const f = fixture({ web: true }), card = f.card(); f.webEvent('focus'); f.webEvent('online'); f.status();
    assert.equal(f.requests.length, 1); f.timeout(); await flush(); assert.equal(f.requests.length, 2);
    f.reply(1, [row('customer-a')]); await flush(); assert.equal(f.requests.length, 2);
    assert.equal(card.render().notification_permission, 'granted'); card.unmount();
  });
  await check('unmount aborts the active read and clears deadline synchronously', async () => {
    const f = fixture(), card = f.card(); assert.equal(f.deadlines.size, 1); card.unmount();
    assert.equal(f.requests[0].signal.aborted, true); assert.equal(f.deadlines.size, 0);
    f.timeout(); f.reply(0, [row('customer-a')]); await flush(); assert.equal(card.writes, 0);
    assert.equal(f.requests.length, 1);
  });
  await check('deadline releases a hung read even without AbortController support', async () => {
    const f = fixture({ web: true, abortAvailable: false }), card = f.card(); f.timeout(); await flush();
    assert.equal(f.requests[0].signal, undefined); f.webEvent('focus'); assert.equal(f.requests.length, 2);
    f.reply(1, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, 'granted'); card.unmount();
  });
  await check('late HTTP success after timeout cannot overwrite a newer live event or successful retry', async () => {
    const f = fixture({ web: true }), card = f.card(); f.live('denied'); f.timeout(); await flush();
    assert.equal(card.render().notification_permission, 'denied'); f.webEvent('focus');
    f.reply(1, [row('customer-a', 'undetermined')]); await flush();
    f.reply(0, [row('customer-a')]); await flush(); assert.equal(card.render().notification_permission, 'undetermined'); card.unmount();
  });
  const report = { allPassed: true, count: checks.length,
    sourceSha256: crypto.createHash('sha256').update(source).digest('hex'), checks };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
