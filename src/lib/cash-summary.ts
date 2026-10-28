type CashEntry = { id: string; descrizione: string; importo: number; metodo?: string | null };
export const isLegacyAutoCashout = (item: Pick<CashEntry, 'id' | 'descrizione'>) =>
  item.id.startsWith('auto-cashout-') || item.descrizione.startsWith('Incasso automatico fine giornata');
export const formatCash = (amount: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: true }).format(amount);
export function summarizeCash(entries: CashEntry[]) {
  return entries.reduce((sum, item) => {
    if (isLegacyAutoCashout(item)) { sum.legacy += item.importo; return sum; }
    if (!item.metodo) { sum.pending += item.importo; return sum; }
    sum.confirmed += item.importo;
    if (item.metodo === 'Carta') sum.card += item.importo;
    if (item.metodo === 'Contanti') sum.cash += item.importo;
    return sum;
  }, { confirmed: 0, card: 0, cash: 0, pending: 0, legacy: 0 });
}

export function summarizeCashActivity(entries: CashEntry[]) {
  const summary = summarizeCash(entries);
  const confirmedCount = entries.filter(item => !isLegacyAutoCashout(item) && Boolean(item.metodo)).length;
  return {
    ...summary,
    confirmedCount,
    averageConfirmed: confirmedCount > 0 ? summary.confirmed / confirmedCount : 0,
  };
}
