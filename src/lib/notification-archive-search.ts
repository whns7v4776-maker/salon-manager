type ArchiveSearchRequest = {
  nome?: string;
  cognome?: string;
  servizio?: string;
  operatoreNome?: string;
  email?: string;
  telefono?: string;
  data?: string;
  ora?: string;
  stato?: string;
  cancellationSource?: string;
  operatorChangeStatus?: string;
};

export const normalizeArchiveSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('it-IT')
  .replace(/[.,:;/'’"()+_-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const archiveDateFormatter = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric', month: 'long', year: 'numeric',
});

export function buildArchiveSearchText(item: ArchiveSearchRequest) {
  const date = item.data?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dateLabel = date ? archiveDateFormatter.format(
    new Date(Number(date[1]), Number(date[2]) - 1, Number(date[3]))
  ) : '';
  const cancellationLabel = item.stato === 'Annullata'
    ? `Annullata dal ${item.cancellationSource === 'salone' ? 'salone' : 'cliente'}` : '';
  const responseLabel = item.operatorChangeStatus === 'rejected'
    ? 'Cambio operatore rifiutato'
    : item.operatorChangeStatus === 'expired'
      ? 'Conferma cambio scaduta'
      : item.operatorChangeStatus === 'pending' ? 'Attesa conferma cliente' : '';
  return normalizeArchiveSearch([
    item.nome, item.cognome, item.servizio, item.operatoreNome, item.email,
    item.telefono, item.telefono?.replace(/\D/g, ''), item.data, dateLabel,
    item.ora, item.stato, cancellationLabel, responseLabel,
  ].filter(Boolean).join(' '));
}

export function filterArchiveSearch<T>(items: T[], query: string, getSearchText: (item: T) => string): T[] {
  const tokens = normalizeArchiveSearch(query).split(' ').filter(Boolean);
  if (!tokens.length) return items;
  return items.filter(item => {
    const text = getSearchText(item);
    return tokens.every(token => text.includes(token));
  });
}
