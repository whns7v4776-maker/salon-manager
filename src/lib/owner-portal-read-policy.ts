/** Public occupancy aliases must never become owner customer labels. */
export const isPublicOccupancyAlias = (value: unknown) =>
  typeof value === 'string' && /^occ_[a-f0-9]{24}$/i.test(value.trim());

export function portalReadPolicy(input: {
  code: string; currentCode: string; accountEmail: string;
  ownerEmail: string; publicSnapshotOnly?: boolean;
}) {
  const account = input.accountEmail.trim().toLowerCase();
  const owner = !input.publicSnapshotOnly && !!input.code &&
    input.code === input.currentCode && !!account &&
    account === input.ownerEmail.trim().toLowerCase();
  return { owner, cacheKey: `${owner ? 'owner' : 'public'}:${input.code}` };
}

export function assertOwnerPortalIdentity<T extends {
  appuntamenti?: { cliente?: unknown }[];
} | null>(snapshot: T, owner: boolean): T {
  if (owner && snapshot?.appuntamenti?.some(item => isPublicOccupancyAlias(item.cliente))) {
    throw new Error('La sessione del salone non ha restituito i dati riservati. Riprova ad accedere; i dati già caricati restano invariati.');
  }
  return snapshot;
}

/** Owner-only presentation fallback for an old, anonymized browser cache. */
export function ownerAgendaCustomerLabel(
  appointment: { cliente: string; customerId?: string | null; occasionalCustomer?: { name?: string } },
  customers: readonly { id: string; nome: string }[],
): string {
  const label = appointment.cliente.trim();
  if (!isPublicOccupancyAlias(label)) return label;
  const knownName = customers.find(item => item.id === appointment.customerId)?.nome?.trim()
    || appointment.occasionalCustomer?.name?.trim();
  return knownName && !isPublicOccupancyAlias(knownName) ? knownName : 'Nome in aggiornamento';
}
