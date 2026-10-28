/** Opaque inverse surfaces keep notifications distinct from the page in both themes. */
export function premiumNotificationBannerTone(night: boolean) {
  return night
    ? { surface: '#F0EADF', border: '#D2C5AE', ink: '#292C28', body: '#54594F', iconSurface: '#E2D7C2', icon: '#625640' }
    : { surface: '#343735', border: '#5B6059', ink: '#FAF7F0', body: '#D7DDD3', iconSurface: '#4A5048', icon: '#EEE1C7' };
}

export function premiumNotificationBannerStyles(night: boolean) {
  const tone = premiumNotificationBannerTone(night);
  return {
    surface: { backgroundColor: tone.surface, borderColor: tone.border, shadowColor: '#111510', shadowOpacity: .22, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 12 },
    icon: { backgroundColor: tone.iconSurface },
    title: { color: tone.ink },
    body: { color: tone.body },
  };
}
