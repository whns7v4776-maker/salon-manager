import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getInstallReferrerAsync } from 'expo-application';
import { parseSalonInstallReferrer } from './salon-install-link';

const CHECKED_KEY = 'salonpro_install_referrer_checked_v1';
const LAST_SALON_KEY = 'salon_manager_frontend_last_salon_code';

export function useSalonInstallRecovery(enabled: boolean, onSalon: (code: string) => void) {
  const cancelledByUser = useRef(false);
  const callback = useRef(onSalon);
  callback.current = onSalon;

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) return;
    let active = true;
    const timeout = setTimeout(() => { active = false; }, 2000);
    const canApply = () => active && !cancelledByUser.current;
    void (async () => {
      const [checked, savedSalon, initialUrl] = await Promise.all([
        AsyncStorage.getItem(CHECKED_KEY),
        AsyncStorage.getItem(LAST_SALON_KEY),
        Linking.getInitialURL(),
      ]);
      if (!canApply() || checked || savedSalon || initialUrl) return;
      const raw = await getInstallReferrerAsync();
      if (!canApply()) return;
      const code = parseSalonInstallReferrer(raw);
      // Consume even organic installs, so logout never replays an old invite.
      await AsyncStorage.setItem(CHECKED_KEY, '1');
      if (canApply() && code) callback.current(code);
    })().catch(() => {
      // No Play Store (DEV/sideload), offline, or unsupported runtime:
      // keep the ordinary landing and the explicit QR recovery available.
    }).finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); };
  }, [enabled]);

  return () => {
    if (Platform.OS !== 'android' || cancelledByUser.current) return;
    cancelledByUser.current = true;
    // A deliberate choice in the landing wins, also on later app launches.
    void AsyncStorage.setItem(CHECKED_KEY, '1').catch(() => {});
  };
}
