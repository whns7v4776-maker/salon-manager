// Read-only, opt-in diagnostic for a connected Android development app.
// Never collects URLs, request bodies, headers, identities or response bodies.
const WebSocket = require('ws');

async function main() {
  const seconds = Math.max(5, Math.min(45, Number(process.argv[2]) || 20));
  const devices = await (await fetch('http://127.0.0.1:8081/json/list')).json();
  const device = devices.find(item =>
    item.title.includes('SM-A145R') && item.description?.includes('Bridgeless'));
  if (!device) throw new Error('Connected Samsung development app not found');
  const socket = new WebSocket(device.webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 0;
  socket.on('message', buffer => {
    const message = JSON.parse(buffer);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(message.error) : request.resolve(message.result);
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = expression => call('Runtime.evaluate', { expression, returnByValue: true });
  const watchdog = setTimeout(() => { socket.close(); process.exit(1); }, 65000);
  await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
  try {
    await evaluate(`(() => {
      const g = globalThis;
      if (g.__salonDayDiag?.restore) g.__salonDayDiag.restore();
      const base = g.fetch, start = Date.now(), rows = [], lags = [];
      const state = { start, rows, lags };
      const wrapped = function(input) {
        const url = typeof input === 'string' ? input : String(input?.url || '');
        const match = url.match(/\\/rpc\\/([^?]+)/);
        if (!match) return base.apply(this, arguments);
        const row = { rpc: match[1], at: Date.now() - start };
        rows.push(row);
        return base.apply(this, arguments).then(response => {
          row.ms = Date.now() - start - row.at;
          row.status = response.status;
          return response;
        }, error => {
          row.ms = Date.now() - start - row.at;
          row.error = error?.name || 'Error';
          throw error;
        });
      };
      let last = Date.now(), stopped = false;
      const pulse = () => {
        if (stopped) return;
        const now = Date.now(); lags.push(Math.max(0, now - last - 250)); last = now;
        state.timer = setTimeout(pulse, 250);
      };
      state.restore = () => {
        stopped = true;
        if (g.fetch === wrapped) g.fetch = base;
        clearTimeout(state.timer);
      };
      g.fetch = wrapped; g.__salonDayDiag = state;
      state.timer = setTimeout(pulse, 250);
      setTimeout(state.restore, 55000);
      return 'started';
    })()`);
    console.log('Measurement started; select a service on the Samsung.');
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    const result = await evaluate(`(() => {
      const d = globalThis.__salonDayDiag;
      if (!d) return 'null';
      d.restore();
      const value = JSON.stringify({ elapsed: Date.now() - d.start, rows: d.rows, lags: d.lags });
      delete globalThis.__salonDayDiag;
      return value;
    })()`);
    console.log(result.result?.value ?? JSON.stringify(result));
  } finally {
    // The device-side expiry also restores fetch if the debugger disconnects.
    socket.close(); clearTimeout(watchdog);
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
