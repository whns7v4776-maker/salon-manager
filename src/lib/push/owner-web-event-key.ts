/** One browser alert per logical booking, independent of phase and status refreshes. */
export const buildOwnerWebEventKey = (item: {
  id?: string | null;
  appointmentGroupId?: string | null;
  stato?: string | null;
  cancellationSource?: string | null;
  operatorChangeRespondedAt?: string | null;
  operatorChangeStatus?: string | null;
}, fallback: string) => {
  const identity = item.appointmentGroupId?.trim() || item.id?.trim() || fallback;
  const event = item.stato === 'Annullata'
    ? `cancelled:${item.cancellationSource || 'unknown'}`
    : item.operatorChangeRespondedAt
      ? `operator:${item.operatorChangeStatus}:${item.operatorChangeRespondedAt}`
      : 'booking';
  return `web:${identity}:${event}`;
};
