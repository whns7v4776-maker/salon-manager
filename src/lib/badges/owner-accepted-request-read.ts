import { supabase } from '../supabase';

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export type OwnerAcceptedRequestReadTarget = {
  workspaceId: string;
  requestIds?: string[];
  appointmentGroupId?: string;
  includeOperatorChangeResponses?: boolean;
};

export type OwnerAcceptedRequestReadResult = {
  requestIds: string[];
  requestSignatures: string[];
};

export const buildOwnerViewedRequestSignature = (item: {
  id: string;
  stato?: string | null;
  cancellationSource?: string | null;
  createdAt?: string | null;
  operatorChangeStatus?: string | null;
  operatorChangeRespondedAt?: string | null;
}) => {
  const signature = [
    item.id,
    item.stato ?? 'unknown',
    item.cancellationSource ?? 'none',
    String(item.createdAt ?? '').trim() || 'no-created-at',
  ].join(':');
  const respondedAt = String(item.operatorChangeRespondedAt ?? '').trim();
  const resolvedResponse = respondedAt &&
    ['accepted', 'rejected', 'expired'].includes(item.operatorChangeStatus ?? '');
  return resolvedResponse
    ? `${signature}:operator-change:${item.operatorChangeStatus}:${respondedAt}`
    : signature;
};

export const getOwnerAcceptedAppointmentReadTarget = (appointment: {
  bookingOrigin?: string;
  syntheticRequestStatus?: string;
  syntheticOperatorChangeStatus?: string;
  bookingRequestId?: string;
  syntheticRequestId?: string;
  appointmentGroupId?: string;
}, workspaceId: string): OwnerAcceptedRequestReadTarget | null => {
  if (appointment.bookingOrigin === 'backoffice' ||
    appointment.syntheticRequestStatus === 'In attesa' ||
    appointment.syntheticOperatorChangeStatus === 'pending') return null;

  const appointmentGroupId = appointment.appointmentGroupId?.trim() ?? '';
  const requestId = appointment.bookingRequestId?.trim() || appointment.syntheticRequestId?.trim() || '';
  if (!isUuid(appointmentGroupId) && !isUuid(requestId)) return null;
  return { workspaceId, requestIds: [requestId], appointmentGroupId };
};

// Only the accepted customer request shown by the owner can be acknowledged.
// The server filters also protect a cancellation/change racing with the read.
export const markOwnerAcceptedBookingRequestsRead = async (
  target: OwnerAcceptedRequestReadTarget,
): Promise<OwnerAcceptedRequestReadResult> => {
  const workspaceId = target.workspaceId.trim();
  const appointmentGroupId = target.appointmentGroupId?.trim() ?? '';
  const requestIds = Array.from(new Set(
    (target.requestIds ?? []).map((id) => id.trim()).filter(isUuid),
  ));
  const emptyResult = { requestIds: [], requestSignatures: [] };

  if (!isUuid(workspaceId) || (!isUuid(appointmentGroupId) && requestIds.length === 0)) {
    return emptyResult;
  }

  let query = supabase
    .from('booking_requests')
    .update({ viewed_by_salon: true })
    .eq('workspace_id', workspaceId)
    .eq('status', 'accepted')
    .or('operator_change_status.is.null,operator_change_status.neq.pending');

  query = target.includeOperatorChangeResponses
    ? query.or('origin.eq.frontend,and(operator_change_status.eq.accepted,operator_change_responded_at.not.is.null)')
    : query.eq('origin', 'frontend');

  query = isUuid(appointmentGroupId)
    ? query.eq('appointment_group_id', appointmentGroupId)
    : query.in('id', requestIds);

  const { data, error } = await query.select('id,cancellation_source,created_at,operator_change_status,operator_change_responded_at');
  if (error) throw error;

  const acknowledgedRows = data ?? [];
  return {
    requestIds: acknowledgedRows.map((row) => String(row.id)),
    requestSignatures: acknowledgedRows.map((row) => buildOwnerViewedRequestSignature({
      id: row.id,
      stato: 'Accettata',
      cancellationSource: row.cancellation_source,
      createdAt: row.created_at,
      operatorChangeStatus: row.operator_change_status,
      operatorChangeRespondedAt: row.operator_change_responded_at,
    })),
  };
};
