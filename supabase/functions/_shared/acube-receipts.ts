/** Smart Receipts sandbox adapter. Production deliberately unavailable until acceptance. */
export type ReceiptStatus = 'new' | 'submitted' | 'ready' | 'retry' | 'failed';
export type ReceiptInput = {
  fiscalId: string;
  description: string;
  amountCents: number;
  vatCode: string;
  method: 'cash' | 'electronic';
};
export function buildReceipt(input: ReceiptInput) {
  if (!/^\d{11}$/.test(input.fiscalId)) throw new Error('Partita IVA non valida');
  if (!input.description.trim() || input.description.length > 250) throw new Error('Descrizione non valida');
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('Importo non valido');
  if (!/^(4|5|10|22|N1|N2|N3|N4|N5|N6)$/.test(input.vatCode)) throw new Error('Aliquota o natura IVA da verificare');
  if (!['cash', 'electronic'].includes(input.method)) throw new Error('Metodo non valido');
  const amount = input.amountCents / 100;
  return {
    fiscal_id: input.fiscalId,
    items: [{ quantity: 1, description: input.description.trim(), unit_price: amount, vat_rate_code: input.vatCode }],
    [input.method === 'cash' ? 'cash_payment_amount' : 'electronic_payment_amount']: amount,
  };
}
export class AcubeUncertainSubmission extends Error {
  constructor() { super('Esito invio da verificare: non ripetere l’emissione.'); }
}
const receiptUuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const receiptStatuses: ReceiptStatus[] = ['new', 'submitted', 'ready', 'retry', 'failed'];
function validateReceipt(value: any, expected: { id?: string; fiscalId?: string } = {}) {
  if (!value || !receiptUuid.test(value.uuid) || !receiptStatuses.includes(value.status)
    || (expected.id && value.uuid !== expected.id)
    || (expected.fiscalId && value.fiscal_id !== expected.fiscalId)) {
    throw new Error('Risposta documento non valida');
  }
  return value;
}
export function createAcubeSandboxClient(token: string, request: typeof fetch = fetch) {
  if (!token) throw new Error('Accesso A-Cube di prova non configurato');
  // This is an environment guard, not JWT signature verification. A-Cube authenticates the token.
  let claims;
  try { claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { throw new Error('Accesso A-Cube di prova non valido'); }
  if (claims.environment !== 'sandbox' || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) {
    throw new Error('Richiesto un accesso sandbox valido e non scaduto');
  }
  const base = 'https://api-sandbox.acubeapi.com';
  async function call(path: string, init: RequestInit = {}) {
    return request(base + path, { ...init, redirect: 'error', headers: {
      Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers,
    }, signal: AbortSignal.timeout(20000) });
  }
  return {
    async submit(input: ReceiptInput) {
      const body = JSON.stringify(buildReceipt(input));
      let response: Response;
      try { response = await call('/receipts', { method: 'POST', body }); }
      catch { throw new AcubeUncertainSubmission(); }
      if (response.status >= 500) throw new AcubeUncertainSubmission();
      if (!response.ok) throw new Error(`A-Cube ha rifiutato la richiesta (${response.status}).`);
      let receipt;
      try { receipt = await response.json(); } catch { throw new AcubeUncertainSubmission(); }
      try { validateReceipt(receipt, { fiscalId: input.fiscalId }); }
      catch { throw new AcubeUncertainSubmission(); }
      return receipt;
    },
    async void(id: string) {
      if (!receiptUuid.test(id)) throw new Error('Documento non valido');
      try {
        const response = await call(`/receipts/${id}`, { method: 'DELETE' });
        if (!response.ok) throw new AcubeUncertainSubmission();
        const receipt = validateReceipt(await response.json());
        if (receipt.type !== 'void' || receipt.voided_receipt?.uuid !== id || receipt.fiscal_id !== '99926092711') throw new AcubeUncertainSubmission();
        return receipt;
      } catch { throw new AcubeUncertainSubmission(); }
    },
    async read(id: string) {
      if (!receiptUuid.test(id)) throw new Error('Documento non valido');
      const response = await call(`/receipts/${id}/details`);
      if (!response.ok) throw new Error('Stato documento non disponibile');
      return validateReceipt(await response.json(), { id });
    },
    async pdf(id: string) {
      if (!receiptUuid.test(id)) throw new Error('Documento non valido');
      const response = await call(`/receipts/${id}/details`, { headers: { Accept: 'application/pdf' } });
      if (!response.ok) throw new Error('PDF documento non disponibile');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('PDF documento non valido');
      return bytes;
    },
  };
}
