import { isLegacyAutoCashout, summarizeCash } from './cash-summary';
type Entry = { id: string; descrizione: string; importo: number; metodo?: string | null };
// Quoted cells also neutralize spreadsheet formulas in user-entered descriptions.
const cell = (value: unknown) => `"${String(value ?? '').replace(/^[=+@\-\t\r]/, "'$&").replace(/"/g, '""')}"`;
export function buildCashReport(entries: Entry[], period: string, dateLabel: (entry: Entry) => string) {
  const sum = summarizeCash(entries);
  const confirmed = entries.filter(e => e.metodo && !isLegacyAutoCashout(e));
  const money = (n: number) => n.toFixed(2).replace('.', ',');
  const transfer = confirmed.filter(e => e.metodo === 'Bonifico').reduce((n, e) => n + e.importo, 0);
  const rows: unknown[][] = [
    ['Report Cassa', period], ['Generato il', new Date().toLocaleString('it-IT')],
    ['Incassi confermati', money(sum.confirmed)], ['Contanti', money(sum.cash)],
    ['Carte / POS', money(sum.card)], ['Bonifici', money(transfer)],
    ['Da saldare', money(sum.pending)], ['Storico da verificare (escluso dagli incassi)', money(sum.legacy)],
    ['Numero incassi confermati', confirmed.length],
    ['Incasso medio', money(confirmed.length ? sum.confirmed / confirmed.length : 0)], [],
    ['Data', 'Descrizione', 'Importo EUR', 'Metodo', 'Stato', 'ID'],
    ...entries.map(e => [dateLabel(e), e.descrizione, money(e.importo), e.metodo === 'Carta' ? 'Carta / POS' : e.metodo ?? '', isLegacyAutoCashout(e) ? 'Da verificare' : e.metodo ? 'Confermato' : 'Da saldare', e.id]),
  ];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}
