import { Platform, StyleSheet } from 'react-native';
import type { Palette } from './access-appearance-context';
import { CLIENT_NOTIFICATION_RED, CLIENT_NOTIFICATION_ON_RED } from './client-notification-tone';
import { clientNotificationPremiumStyles } from './client-notification-premium';
import { premiumNotificationBannerStyles } from './premium-notification-banner';
import { clientNativePortalStyles } from './client-native-portal-styles';

/** The customer portal shares the satin, glass and typography of the Premium workspace. */
export function clientBookingPremiumStyles<T extends Record<string, object>>(base: T, p: Palette): T {
  const result: Record<string, any> = {};
  const glass = p.surface;
  const selected = p.action;
  for (const [key, original] of Object.entries(base)) {
    const value: any = { ...StyleSheet.flatten(original) };
    if (value.color) value.color = /Hint|Meta|Description|Subtitle|Powered|Count|Secondary|Placeholder/.test(key) ? p.muted : p.ink;
    if (value.backgroundColor && value.backgroundColor !== 'transparent') value.backgroundColor = p.field;
    for (const edge of ['borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor']) {
      if (value[edge]) value[edge] = p.border;
    }
    if (value.fontWeight === '900' || value.fontWeight === '800') value.fontWeight = '600';
    if (value.shadowOpacity) value.shadowOpacity = 0;
    if (value.elevation) value.elevation = 0;
    if (value.textShadowRadius) value.textShadowRadius = 0;
    if (Platform.OS === 'web' && value.boxShadow) value.boxShadow = 'none';
    if (/Error|Danger|Destructive/.test(key)) {
      if (value.color) value.color = p.night ? '#F0B5BA' : '#963F4A';
      if (value.backgroundColor) value.backgroundColor = p.night ? 'rgba(181,93,106,.15)' : 'rgba(245,221,225,.65)';
    }
    if (/Selected$|Active$/.test(key) && !/Inactive|Disabled|Error/.test(key)) {
      if (value.backgroundColor && value.backgroundColor !== 'transparent') value.backgroundColor = selected;
      if (value.color) value.color = p.actionText;
    }
    result[key] = value;
  }
  const patch = (key: string, value: Record<string, any>) => { result[key] = { ...result[key], ...value }; };
  const banner = premiumNotificationBannerStyles(p.night);
  patch('clientForegroundBar', banner.surface);
  patch('clientForegroundBarIcon', banner.icon);
  patch('clientForegroundBarDismiss', banner.icon);
  patch('clientForegroundBarTitle', banner.title);
  patch('clientForegroundBarBody', banner.body);
  for (const key of ['topIntegratedCountBadge', 'notificationsTopCountBadge', 'notificationsTopCountBadgeCompact', 'notificationsTopCountBadgeNative', 'notificationsTopCountBadgeNativeCompact', 'requestsToggleBadge', 'frontendBookingAccordionCornerBadge', 'frontendBookingAccordionNewPill', 'salonCommunicationUnreadPill', 'salonCommunicationUnreadDot', 'waitlistPremiumHeroUnread', 'waitlistAlertUnreadFloatingChip']) patch(key, { backgroundColor: CLIENT_NOTIFICATION_RED, borderColor: CLIENT_NOTIFICATION_RED });
  for (const key of ['topIntegratedCountBadgeText', 'notificationsTopCountBadgeText', 'notificationsTopCountBadgeTextCompact', 'requestsToggleBadgeText', 'frontendBookingAccordionCornerBadgeText', 'frontendBookingAccordionNewPillText', 'salonCommunicationUnreadPillText', 'waitlistPremiumHeroUnreadText', 'waitlistAlertUnreadText']) patch(key, { color: CLIENT_NOTIFICATION_ON_RED, fontWeight: '600' });
  for (const key of ['frontendBookingAccordionWithNotification', 'requestStatusCardUnreadActive', 'salonCommunicationCardUnread', 'waitlistAlertCardUnread']) patch(key, { backgroundColor: p.surface, borderColor: p.border, borderWidth: 1 });
  for (const key of ['container', 'frontendClientCurrentPage', 'frontendClientSwipeStage', 'frontendWebScrollHost']) patch(key, { backgroundColor: 'transparent' });
  patch('heroCard', { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0, shadowOpacity: 0 });
  patch('bookingBrandHeader', { backgroundColor: 'transparent', borderWidth: 0, paddingVertical: 0, marginBottom: 16 });
  for (const key of ['sectionCard', 'bookingWizardPanel', 'summaryCard', 'bookingConfirmationTop', 'bookingConfirmationBottom', 'serviceInfoModalCard']) patch(key, { backgroundColor: glass, borderColor: p.border, borderWidth: 1, borderRadius: 22, shadowOpacity: 0, elevation: 0 });
  patch('sectionCardActiveFocus', { backgroundColor: glass, borderColor: p.border, shadowOpacity: 0, elevation: 0 });
  patch('bookingConfirmationTop', { borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 });
  patch('bookingConfirmationBottom', { borderTopWidth: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 });
  patch('bookingSectionHeader', { alignSelf: 'stretch', alignItems: 'flex-start', marginBottom: 18, transform: [{ scale: 1 }] });
  patch('bookingSectionStepPill', { display: 'none' });
  patch('bookingWizardHeading', { fontSize: 13, lineHeight: 20, color: p.muted, fontWeight: '400', marginBottom: 8 });
  patch('bookingSectionTitleActive', { color: p.ink });
  patch('bookingSectionTitle', { color: p.ink });
  patch('bookingWizardProgress', { maxWidth: 900, marginBottom: 14, paddingHorizontal: 2 });
  patch('bookingWizardPanel', { maxWidth: 900, paddingHorizontal: 16, paddingVertical: 18 });
  patch('bookingWizardHeading', { display: 'none' });
  patch('bookingWizardTrack', { gap: 4 });
  patch('bookingWizardStepCurrent', { backgroundColor: p.night ? 'rgba(226,209,180,.13)' : 'rgba(255,255,255,.76)' });
  patch('bookingWizardDotCurrent', { backgroundColor: selected });
  patch('bookingWizardDotDone', { backgroundColor: p.action });
  patch('bookingCatalogCard', { backgroundColor: p.field, borderColor: p.border, borderRadius: 15 });
  patch('bookingCatalogCardSelected', { borderColor: p.action, backgroundColor: p.surface });
  patch('bookingCatalogCardChoice', { minHeight: 104, padding: 13, gap: 4 });
  patch('bookingCatalogCardTitle', { color: p.ink, fontWeight: '600', fontSize: 16, lineHeight: 22 });
  patch('bookingCatalogCardCommerce', { paddingTop: 8 });
  patch('bookingCatalogCardInfo', { minHeight: 38, borderTopColor: p.line, backgroundColor: 'transparent' });
  patch('bookingCatalogCardBadge', { color: p.night ? '#D8C29B' : '#80683F' });
  for (const key of ['bookingWizardBack', 'frontendBookingTimeCard', 'frontendBookingTimeCardRecommended', 'bookingNoteInset', 'frontendServiceRoleFilterPanel', 'frontendServiceRoleFilterPanelWeb', 'frontendServiceRoleFilterPanelNative']) patch(key, { backgroundColor: p.field, borderColor: p.border, borderWidth: 1, shadowOpacity: 0, elevation: 0 });
  patch('bookingWizardNavigation', { maxWidth: 900, padding: 10, backgroundColor: glass, borderColor: p.border, borderWidth: 1, borderRadius: 20, flexWrap: 'wrap', alignItems: 'center' });
  patch('bookingWizardBack', { borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4 });
  patch('bookingWizardNext', { backgroundColor: selected, borderRadius: 14, minHeight: 46, paddingHorizontal: 14 });
  patch('bookingWizardNextText', { color: p.actionText });
  for (const key of ['primaryButton', 'frontendBookingTimeCardSelected', 'guidedTimeChipSelected', 'operatorSelectionCardActive', 'serviceInfoModalPrimaryButton', 'frontendServiceRoleFilterChipActive', 'frontendServiceRoleFilterChipAllActive']) patch(key, { backgroundColor: selected, borderColor: selected, shadowOpacity: 0, elevation: 0 });
  for (const key of ['primaryButtonText', 'frontendBookingTimeLabelSelected', 'frontendBookingTimeStateSelected', 'frontendServiceRoleFilterChipTextAllActive']) patch(key, { color: p.actionText });
  for (const key of ['guidedTimePanel', 'guidedTimePanelWeb']) patch(key, { backgroundColor: 'transparent', borderWidth: 0, padding: 0, paddingHorizontal: 0, paddingVertical: 0, width: '100%' });
  for (const key of ['guidedTimeGrid', 'guidedTimeGridWeb', 'frontendBookingTimesGrid']) patch(key, { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 0, width: '100%' });
  patch('guidedTimeEyebrowPill', { display: 'none' });
  patch('guidedTimeInlineNotice', { display: 'none' });
  patch('frontendBookingDayPickerWrap', { backgroundColor: 'transparent', borderWidth: 0 });
  patch('frontendBookingDayGhostCard', { height: 102, borderRadius: 15, shadowOpacity: 0, elevation: 0 });
  patch('frontendBookingDayGhostCardSelected', { backgroundColor: p.action, borderColor: p.action, transform: [{ scale: 1 }] });
  patch('bookingReviewDate', { fontSize: 34, lineHeight: 42, color: p.ink });
  patch('bookingReviewHero', { borderBottomColor: p.line });
  for (const key of ['frontendSettingsPasswordPanelActive', 'frontendSettingsBiometricRowActive']) patch(key, { backgroundColor: p.field, borderColor: p.border });
  for (const key of ['frontendSettingsPasswordButton', 'frontendSettingsLogoutButton']) patch(key, { backgroundColor: p.action, minHeight: 44, minWidth: 0, borderRadius: 13 });
  for (const key of ['frontendSettingsPasswordButtonText', 'frontendSettingsLogoutButtonText']) patch(key, { color: p.actionText });
  for (const key of ['frontendSettingsPanelTitle', 'frontendSettingsPanelHint', 'frontendSettingsProfileName', 'frontendSettingsProfileMeta']) patch(key, { textAlign: 'left', fontWeight: key === 'frontendSettingsPanelTitle' || key === 'frontendSettingsProfileName' ? '600' : '400' });
  patch('frontendSettingsPanel', { borderRadius: 17, paddingHorizontal: 16, paddingVertical: 16 });
  patch('frontendSettingsPasswordButton', { alignSelf: 'flex-start' });
  patch('serviceInfoModalPrimaryButtonText', { color: p.actionText });
  patch('serviceInfoModalIcon', { backgroundColor: p.action });
  patch('serviceInfoModalOverlay', { backgroundColor: 'transparent', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', paddingVertical: Platform.OS === 'web' ? 24 : 0 });
  patch('serviceInfoModalBackdrop', { backgroundColor: 'rgba(0,0,0,.48)' });
  if (Platform.OS === 'web') {
    for (const key of ['bookingWizardPanel', 'bookingCatalogCard', 'bookingWizardNavigation', 'serviceInfoModalCard']) patch(key, { backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' });
  }
  const notifications = clientNotificationPremiumStyles(result, p);
  return (Platform.OS === 'web' ? notifications : clientNativePortalStyles(notifications, p)) as T;
}
