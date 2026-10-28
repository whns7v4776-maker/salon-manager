// Creation time only: edits, bookings and list order must not change the latest registration.
export function selectLatestCustomer<T extends { id: string; createdAt?: string }>(customers: readonly T[]): T | undefined {
  return customers.reduce<T | undefined>((latest, customer) => {
    const time = Date.parse(customer.createdAt ?? '');
    if (!Number.isFinite(time)) return latest;
    if (!latest) return customer;
    const previous = Date.parse(latest.createdAt ?? '');
    return time > previous || (time === previous && customer.id.localeCompare(latest.id) > 0) ? customer : latest;
  }, undefined);
}
