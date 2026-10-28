// One-time local sandbox login. Password is forwarded only to A-Cube and never persisted.
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const nonce = crypto.randomBytes(32).toString('hex');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'salonpro-acube-'));
fs.chmodSync(dir, 0o700);
let busy = false;
let complete = false;
const page = (message = '') => `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SalonPro · Collegamento sandbox</title><style>body{font:17px system-ui;background:#f2f5f9;color:#142139;padding:40px 20px}main{max-width:480px;margin:8vh auto;background:white;border-radius:28px;padding:32px}h1{font-size:26px}p{line-height:1.6;color:#56657a}label{display:block;margin:20px 0 8px}input,button{box-sizing:border-box;width:100%;padding:15px;border:1px solid #d9e1eb;border-radius:12px;font:inherit}button{margin-top:24px;background:#20384e;color:white}.tag{color:#315c43;background:#e8f5ec;padding:6px 12px;border-radius:20px}</style><main><span class="tag">Solo ambiente di prova</span><h1>Collega A-Cube al collaudo SalonPro</h1><p>Accesso temporaneo per provare le ricevute. Nessun abbonamento e nessun invio fiscale reale. La password viene inviata esclusivamente ad A-Cube e non viene salvata.</p>${message ? `<p role="status">${message}</p>` : ''}${complete ? '' : `<form method="post" action="/connect"><input type="hidden" name="nonce" value="${nonce}"><label>Email</label><input name="email" type="email" value="salon.pro.app13@gmail.com" readonly><label>Password A-Cube</label><input name="password" type="password" autocomplete="off" required><button type="submit">Autorizza il collegamento di prova</button></form>`}</main></html>`;
const server = http.createServer(async (req, res) => {
  const origin = `http://127.0.0.1:${server.address().port}`;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.headers.host !== origin.slice(7)) { res.writeHead(403); return res.end(); }
  if (req.method === 'GET' && (req.url === '/' || req.url === '/connect')) return res.end(page(complete ? 'Collegamento di prova completato. Puoi tornare a Codex.' : ''));
  if (req.method !== 'POST' || req.url !== '/connect' || req.headers.origin !== origin) { res.writeHead(403); return res.end(page('Richiesta non valida. Torna alla pagina di collegamento e riprova.')); }
  let body = '';
  for await (const part of req) { body += part; if (body.length > 8192) { res.writeHead(413); return res.end(); } }
  const form = new URLSearchParams(body);
  if (form.get('nonce') !== nonce || busy || complete) { res.writeHead(409); return res.end(page('Richiesta già elaborata o scaduta.')); }
  busy = true;
  try {
    const response = await fetch('https://common.api.acubeapi.com/login', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: 'salon.pro.app13@gmail.com', password: form.get('password'), environment: 'sandbox' }),
    });
    form.delete('password'); body = '';
    if (!response.ok) throw new Error('login');
    const { token } = await response.json();
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    if (claims.environment !== 'sandbox' || claims.exp * 1000 <= Date.now()) throw new Error('mode');
    fs.writeFileSync(path.join(dir, 'token'), token, { mode: 0o600, flag: 'wx' });
    complete = true;
    console.log('SANDBOX_CONNECTED');
    res.end(page('Collegamento di prova completato. Puoi tornare a Codex.'));
  } catch { res.end(page('Accesso non riuscito. Controlla la password A-Cube e riprova.')); }
  finally { busy = false; }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, tokenDirectory: dir })));
setTimeout(() => server.close(), 30 * 60 * 1000).unref();
