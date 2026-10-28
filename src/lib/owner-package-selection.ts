import type { CustomerPackage } from './service-packages';
export type OwnerPackageSelection = { packageId: string; customerId: string; operationId: string };
export function eligibleOwnerPackages(packages: CustomerPackage[], serviceIds: string[], dates: string[]) {
  if (!serviceIds.length || dates.length !== serviceIds.length) return [];
  const sorted = [...serviceIds].sort();
  return packages.filter(p => p.available > 0 && dates.every(date => date >= p.starts_on && date <= p.expires_on) && p.entitlements.some(e =>
    serviceIds.length === 1 ? e.kind === 'service' && e.id === serviceIds[0]
      : e.kind === 'composition' && e.componentIds.length === sorted.length && [...e.componentIds].sort().every((id, i) => id === sorted[i])));
}
