import type { Palette } from './access-appearance-context';
import { Platform } from 'react-native';
import { clientNotificationActionColors } from './client-notification-actions';

/** Muted status accents; the unread count owns the only attention-red treatment. */
export function clientNotificationTone(p: Palette, tone: string) {
  if (tone === 'pending') return { ink: p.night ? '#E6CCA0' : '#76581F', soft: p.night ? 'rgba(192,157,99,.14)' : '#F6EDDC' };
  if (tone === 'accepted' || tone === 'new') return { ink: p.night ? '#B5D4BB' : '#3F654B', soft: p.night ? 'rgba(139,175,147,.14)' : '#EAF1E9' };
  if (tone === 'cancelled' || tone === 'rejected') return { ink: p.night ? '#DEBFCC' : '#775563', soft: p.night ? 'rgba(168,128,148,.14)' : '#F1E7EC' };
  if (tone === 'changed' || tone === 'upcoming') return { ink: p.night ? '#BCD0E0' : '#4C6578', soft: p.night ? 'rgba(141,168,188,.14)' : '#E8EEF2' };
  return { ink: p.muted, soft: p.field };
}

/** Presentation of both read/unread cards. No state, read receipts, booking or action logic. */
export function clientNotificationPremiumStyles(base: Record<string, any>, p: Palette) {
  const result = { ...base };
  const patch = (key: string, value: Record<string, any>) => { result[key] = { ...result[key], ...value }; };
  const card = p.night ? 'rgba(29,33,36,.94)' : 'rgba(255,255,255,.94)';
  const unread = p.night ? 'rgba(38,43,46,.96)' : 'rgba(255,255,255,.98)';
  const field = p.night ? p.field : 'rgba(96,91,80,.055)';
  const border = p.night ? p.border : 'rgba(109,108,104,.18)';
  for (const key of ['requestStatusCard', 'requestStatusCardPending', 'requestStatusCardAccepted', 'requestStatusCardRejected', 'requestStatusCardCancelled']) patch(key, { backgroundColor: card, borderColor: border, borderWidth: 1, shadowOpacity: 0, elevation: 0 });
  patch('requestStatusCardUnreadActive', { backgroundColor: unread, borderColor: border, borderWidth: 1, shadowOpacity: 0, elevation: 0 });
  for (const key of ['frontendBookingAccordion', 'frontendBookingAccordionExpanded', 'frontendBookingAccordionWithNotification']) patch(key, { backgroundColor: p.night ? 'rgba(25,29,32,.88)' : 'rgba(255,255,255,.72)', borderColor: p.border, borderWidth: 1, borderRadius: 22 });
  // The floating red count is sufficient; avoid a second competing red "new" pill.
  patch('frontendBookingAccordionNewPill', { display: 'none' });
  for (const key of ['frontendBookingAccordionTitle', 'requestStatusTitle', 'requestStatusTitleWeb', 'requestStatusTitleCompact', 'requestStatusTitleTight', 'requestLogicalBookingService']) patch(key, { color: p.ink, fontFamily: 'Manrope_600SemiBold', fontWeight: 'normal', textAlign: 'left' });
  patch('frontendBookingAccordionTitle', { fontSize: 16, lineHeight: 24 });
  patch('requestStatusTitle', { fontSize: 19, lineHeight: 28, marginBottom: 6 });
  patch('requestStatusTitleWeb', { fontSize: 21, lineHeight: 30 });
  patch('requestStatusTitleCompact', { fontSize: 18, lineHeight: 27 });
  patch('requestStatusTitleTight', { fontSize: 17, lineHeight: 25 });
  for (const key of ['requestStatusMeta', 'requestStatusMetaWeb', 'requestStatusMetaCompact', 'requestStatusBody', 'requestStatusBodyWeb', 'requestStatusBodyCompact', 'requestStatusHint', 'frontendBookingAccordionHint', 'requestLogicalBookingTime', 'requestLogicalBookingOperatorText', 'requestLogicalBookingPhaseText']) patch(key, { color: p.muted, fontFamily: 'Manrope_400Regular', fontWeight: 'normal', fontSize: 13, lineHeight: 21, textAlign: 'left' });
  for (const key of ['requestStatusHeroBlockWeb', 'requestStatusHeroBlockCompact', 'requestStatusHeroBlockCompactWeb', 'requestStatusHeaderStack', 'requestStatusHeaderStackCompact', 'requestStatusHeaderCopy', 'requestStatusHeaderCopyWeb', 'requestStatusHeaderCopyCompact', 'requestStatusHeaderCopyCompactWeb']) patch(key, { width: '100%', minHeight: 0, alignItems: 'flex-start', justifyContent: 'flex-start', marginBottom: 9 });
  for (const key of ['requestStatusHeroBlockWeb', 'requestStatusHeroBlockCompact', 'requestStatusHeroBlockCompactWeb', 'requestStatusHeaderCopy', 'requestStatusHeaderCopyWeb', 'requestStatusHeaderCopyCompact', 'requestStatusHeaderCopyCompactWeb']) patch(key, { marginBottom: 0 });
  for (const key of ['requestStatusBody', 'requestStatusBodyWeb', 'requestStatusBodyCompact', 'requestStatusHint']) patch(key, { alignSelf: 'stretch', width: '100%', maxWidth: '100%', minHeight: 0, marginTop: 3, marginBottom: 10, textAlign: 'left' });
  patch('requestStatusBodyWeb', { fontSize: 14, lineHeight: 23 });
  for (const key of ['frontendBookingAccordion', 'frontendBookingAccordionExpanded', 'frontendBookingAccordionWithNotification', 'requestStatusCardWeb', 'requestStatusCardCompactWeb', 'requestOverviewRow']) patch(key, { maxWidth: '100%' });
  patch('requestStatusBadgeWrap', { alignSelf: 'flex-start', marginBottom: 10 });
  for (const key of ['requestMetaPillsRow', 'requestMetaPillsRowWeb', 'requestMetaPillsRowCompact']) patch(key, { justifyContent: 'flex-start', alignItems: 'center', alignSelf: 'stretch', minHeight: 0, marginTop: 0, marginBottom: 12, gap: 8 });
  for (const key of ['requestCategoryChip', 'requestOperatorChip']) patch(key, { backgroundColor: field, borderColor: border, borderRadius: 12, paddingVertical: 7, paddingHorizontal: 11 });
  for (const key of ['requestCategoryChipText', 'requestOperatorChipText']) patch(key, { color: p.muted, fontFamily: 'Manrope_500Medium', fontWeight: 'normal', fontSize: 12, lineHeight: 18 });
  for (const [suffix, tone] of [['Pending','pending'],['Accepted','accepted'],['Cancelled','cancelled'],['Rejected','rejected']] as const) {
    const colors = clientNotificationTone(p, tone);
    patch(`requestStateBadge${suffix}`, { backgroundColor: colors.soft, borderColor: p.border });
    patch(`requestStateBadgeText${suffix}`, { color: colors.ink });
  }
  for (const [suffix, tone] of [['New','new'],['Changed','changed'],['Cancelled','cancelled'],['Rejected','rejected']] as const) {
    const colors = clientNotificationTone(p, tone);
    patch(`requestInlineNotificationBadge${suffix}`, { backgroundColor: colors.soft, borderColor: p.border });
    patch(`requestInlineNotificationBadgeIcon${suffix}`, { backgroundColor: 'transparent' });
    patch(`requestInlineNotificationBadgeText${suffix}`, { color: colors.ink });
  }
  patch('requestInlineNotificationBadge', { alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 });
  patch('requestInlineNotificationBadgeText', { fontFamily: 'Manrope_500Medium', fontWeight: 'normal', fontSize: 11.5, lineHeight: 18 });
  for (const [suffix, tone] of [['Upcoming','upcoming'],['Pending','pending'],['Accepted','accepted'],['Cancelled','cancelled'],['Archive','archive']] as const) patch(`frontendBookingAccordionIcon${suffix}`, { backgroundColor: clientNotificationTone(p, tone).soft });
  patch('requestLogicalBookingPanel', { width: '100%', maxWidth: '100%', alignSelf: 'stretch', backgroundColor: field, borderColor: border, padding: 15, borderRadius: 17, marginTop: 2, marginBottom: 14 });
  patch('requestLogicalBookingHeading', { justifyContent: 'flex-start', marginBottom: 12 });
  patch('requestLogicalBookingEyebrow', { color: p.muted, fontFamily: 'Manrope_500Medium', fontWeight: 'normal', fontSize: 12, lineHeight: 19, letterSpacing: 0 });
  patch('requestLogicalBookingService', { fontSize: 14, lineHeight: 22 });
  for (const key of ['requestLogicalBookingRootStem', 'requestLogicalBookingTrunkTop', 'requestLogicalBookingTrunkBottom', 'requestLogicalBookingBranch', 'requestLogicalBookingPhaseTrunk', 'requestLogicalBookingPhaseBranch']) patch(key, { backgroundColor: p.line });
  for (const key of ['requestLogicalBookingNode', 'requestLogicalBookingPhaseNode', 'requestLogicalBookingPhaseNodePause']) patch(key, { backgroundColor: p.surface, borderColor: p.line });
  patch('requestLogicalBookingNodeText', { color: p.muted });
  patch('requestLogicalBookingPhaseTextPause', { color: p.muted, fontWeight: 'normal' });
  patch('requestActionsStack', { width: '100%', maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 9, alignSelf: 'stretch', marginTop: 12 });
  patch('requestActionButtonWeb', { flexGrow: 1, flexBasis: 180, minWidth: 0, maxWidth: '100%', minHeight: 46, borderRadius: 13 });
  patch('calendarButton', { backgroundColor: p.action, borderColor: p.action, minHeight: 46, borderRadius: 13 });
  patch('calendarButtonText', { color: p.actionText, fontFamily: 'Manrope_600SemiBold', fontWeight: 'normal', fontSize: 14, lineHeight: 21 });
  for (const key of ['cancelBookingButton', 'inlineWhatsappButton', 'inlineCallButton', 'webInlineCancelKeepButton']) patch(key, { backgroundColor: field, borderColor: border, borderWidth: 1, borderRadius: 13, minHeight: 44 });
  for (const key of ['cancelBookingButtonText', 'inlineWhatsappButtonText', 'inlineCallButtonText', 'webInlineCancelKeepButtonText']) patch(key, { color: p.ink, fontFamily: 'Manrope_500Medium', fontWeight: 'normal', fontSize: 14, lineHeight: 21 });
  for (const key of ['confirmationActionsRow', 'confirmationActionsRowWeb']) patch(key, { width: '100%', maxWidth: '100%', justifyContent: 'flex-start', alignSelf: 'stretch', flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 10 });
  patch('inlineContactButtonWeb', { flex: 1, minWidth: 100, minHeight: 44 });
  for (const key of ['requestMoveRouteCard', 'operatorChangeConfirmationCard', 'requestAddressCard']) patch(key, { backgroundColor: field, borderColor: border, borderRadius: 15 });
  patch('webInlineCancelConfirmCard', { backgroundColor: field, borderColor: border, alignItems: 'stretch' });
  patch('webInlineCancelConfirmText', { color: p.ink, textAlign: 'left', fontFamily: 'Manrope_400Regular', fontWeight: 'normal', fontSize: 13, lineHeight: 21 });
  for (const key of ['webInlineCancelConfirmButton', 'operatorChangeAcceptButton']) patch(key, { backgroundColor: p.action, borderColor: p.action, minHeight: 46, borderRadius: 13 });
  for (const key of ['webInlineCancelConfirmButtonText', 'operatorChangeAcceptButtonText']) patch(key, { color: p.actionText, fontFamily: 'Manrope_600SemiBold', fontWeight: 'normal' });
  patch('operatorChangeAcceptIcon', { backgroundColor: 'transparent' });
  patch('operatorChangeRejectButton', { backgroundColor: field, borderColor: border, borderRadius: 13 });
  patch('operatorChangeRejectButtonText', { color: p.ink });
  patch('requestOverviewCard', { backgroundColor: p.night ? '#24282B' : '#F3F1EC', borderColor: border, borderRadius: 18 });
  const darkOverview = { upcoming: '#252D32', pending: '#322E26', cancelled: '#302B33', archive: '#24282B' };
  for (const [key, tone] of [['requestOverviewCardUpcoming','upcoming'],['requestOverviewCardPending','pending'],['requestOverviewCardSalonCancelled','cancelled'],['requestOverviewCardArchived','archive']] as const) patch(key, { backgroundColor: p.night ? darkOverview[tone] : tone === 'archive' ? '#F3F1EC' : clientNotificationTone(p, tone).soft, borderColor: border });
  patch('requestOverviewLabel', { textTransform: 'none', color: p.night ? p.muted : '#605F5B', fontFamily: 'Manrope_400Regular', fontWeight: 'normal', fontSize: 13 });
  patch('requestOverviewValue', { color: p.ink, fontFamily: 'Manrope_600SemiBold', fontWeight: 'normal', fontSize: 27 });
  if (Platform.OS === 'web') {
    for (const [action, button, text] of [
      ['call', 'inlineCallButton', 'inlineCallButtonText'],
      ['whatsapp', 'inlineWhatsappButton', 'inlineWhatsappButtonText'],
      ['cancel', 'cancelBookingButton', 'cancelBookingButtonText'],
      ['cancel', 'webInlineCancelConfirmButton', 'webInlineCancelConfirmButtonText'],
    ] as const) {
      const c = clientNotificationActionColors(p.night, action);
      patch(button, { backgroundColor: c.fill, borderColor: c.border });
      patch(text, { color: c.ink });
    }
  }
  return result;
}
