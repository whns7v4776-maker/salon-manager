/** Only known in-app destinations; never follow arbitrary URLs from a push. */
export type OwnerNotificationTarget = {
  pathname: '/(tabs)/cassa' | '/(tabs)/clienti' | '/(tabs)/agenda' | '/(tabs)/prenotazioni';
  params: Record<string, string>;
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
export function resolveOwnerNotificationTarget(data: Record<string, unknown>, salonCode?: string | null, workspaceId?: string | null): OwnerNotificationTarget | null {
  const audiences = [data._pushTarget, data._pushAudience, data.recipientRole, data.recipient_role].map(value => text(value).toLowerCase());
  if (audiences.some(value => ['client', 'customer', 'cliente', 'public'].includes(value))) return null;
  if (data._badgeOnly === true || data._badgeOnly === 'true' || data._playInAppBannerSound === true) return null;
  const workspace = text(data._pushWorkspaceId ?? data.workspaceId ?? data.workspace_id);
  if (workspace && workspaceId && workspace !== workspaceId) return null;
  const code = text(data.salonCode ?? data.salon_code).toLowerCase();
  if (code && salonCode && code !== salonCode.trim().toLowerCase()) return null;
  const types = [data.kind, data.event_type, data.eventType, data.notificationType, data._pushEventType, data.type].map(value => text(value).toLowerCase());
  if (types.includes('shop_order')) return { pathname: '/(tabs)/cassa', params: { shopOrderId: text(data.shopOrderId) } };
  if (types.includes('cash_terminal_outcome')) return { pathname: '/(tabs)/cassa', params: {} };
  if (types.includes('frontend_customer_registered')) return { pathname: '/(tabs)/clienti', params: {} };
  if (types.includes('owner_badge_refresh')) return null;
  const requestId = text(data.bookingRequestId ?? data.booking_request_id ?? data.requestId ?? data.request_id);
  const status = text(data.statusCode ?? data.status ?? data.response).toLowerCase();
  const isCancelled = ['cancelled', 'canceled', 'annullata', 'rejected', 'declined', 'expired'].includes(status) || types.some(type => type.includes('cancelled') || type === 'booking_operator_change_expired');
  const isOperatorResponse = types.includes('booking_operator_change_response');
  const params: Record<string, string> = requestId ? { requestId } : {};
  if (isCancelled || isOperatorResponse) return { pathname: '/(tabs)/prenotazioni', params: { ...params, section: isCancelled ? 'cancelled' : 'accepted' } };
  if (requestId || types.some(type => type.startsWith('booking_') || type.startsWith('appointment_'))) {
    const date = text(data.appointmentDate ?? data.appointment_date);
    const time = text(data.appointmentTime ?? data.appointment_time);
    return date ? { pathname: '/(tabs)/agenda', params: { ...params, start: date, ...(time ? { requestTime: time } : {}), openDetails: 'true' } } : { pathname: '/(tabs)/prenotazioni', params };
  }
  return null;
}
