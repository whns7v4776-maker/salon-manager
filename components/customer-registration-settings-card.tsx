import {NativeReadableText as Text, NativePremiumIcon as Ionicons} from './owner-native-premium';
import { useSettingsWebStyles } from './settings-web-styles';

import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAppContext } from '../src/context/AppContext';
import { HapticTouchable } from './ui/haptic-touchable';

export function CustomerRegistrationSettingsCard() {
 const styles=useSettingsWebStyles(baseRegistrationStyles);
  const {
    availabilitySettings,
    updateAvailabilitySettingsPersisted,
    ownerWorkspaceSettingsHydrated,
    ownerServerSyncReady,
    salonWorkspace,
  } = useAppContext();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const busyRef = React.useRef(false);
  const workspaceRef = React.useRef(salonWorkspace.id);
  workspaceRef.current = salonWorkspace.id;
  const enabled = availabilitySettings.customerRegistrationApprovalRequired === true;
  const disabled = busy || !ownerWorkspaceSettingsHydrated || !ownerServerSyncReady;

  React.useEffect(() => { setError(''); }, [salonWorkspace.id]);

  const toggle = async () => {
    if (disabled || busyRef.current) return;
    const workspaceId = salonWorkspace.id;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await updateAvailabilitySettingsPersisted(current => ({
        ...current,
        customerRegistrationApprovalRequired: !enabled,
        customerRegistrationApprovalUpdatedAt: new Date().toISOString(),
      }), { waitForServerPersistence: true });
    } catch (cause) {
      if (workspaceRef.current === workspaceId) {
        setError(cause instanceof Error ? cause.message : 'Salvataggio non completato. Riprova.');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.heading}>
        <View style={styles.icon}><Ionicons name="people-outline" size={22} color="#315C8A" /></View>
        <Text style={styles.title}>Registrazione clienti</Text>
      </View>
      <HapticTouchable
        onPress={() => void toggle()}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel="Approva nuovi clienti"
        accessibilityState={{ checked: enabled, disabled, busy }}
        aria-checked={enabled}
        aria-busy={busy}
        style={styles.row}
      >
        <View style={styles.copy}>
          <Text style={styles.label}>Approva nuovi clienti</Text>
          <Text style={styles.description}>
            {enabled
              ? 'I nuovi clienti possono prenotare dopo la tua approvazione.'
              : 'I nuovi clienti si registrano e possono prenotare subito.'}
          </Text>
        </View>
        {busy ? <ActivityIndicator color="#2563EB" style={styles.spinner} /> : (
          <View style={[styles.toggle, enabled && styles.toggleEnabled, disabled && styles.disabled]}>
            <View style={[styles.thumb, enabled && styles.thumbEnabled]} />
            <Text style={[styles.toggleText, enabled && styles.toggleTextEnabled]}>{enabled ? 'ON' : 'OFF'}</Text>
          </View>
        )}
      </HapticTouchable>
      <Text style={styles.hint}>
        {enabled
          ? 'Gestisci Approva e Rifiuta nelle schede da approvare in Clienti.'
          : 'Attivala se vuoi scegliere chi può prenotare nel tuo salone.'}
      </Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const baseRegistrationStyles = StyleSheet.create({
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: '#DDE7F3', shadowColor: '#315C8A', shadowOpacity: 0.05,
    shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 1, gap: 12 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 13, backgroundColor: '#EEF5FD', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#0F172A', fontSize: 17, fontWeight: '800', flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 },
  copy: { flex: 1, gap: 4 },
  label: { color: '#1E293B', fontSize: 15, fontWeight: '800' },
  description: { color: '#64748B', fontSize: 13, lineHeight: 19 },
  toggle: { width: 72, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', padding: 4, justifyContent: 'center', flexShrink: 0 },
  toggleEnabled: { backgroundColor: '#0F172A' },
  thumb: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF' },
  thumbEnabled: { alignSelf: 'flex-end' },
  toggleText: { position: 'absolute', left: 34, right: 4, textAlign: 'center', fontSize: 10, fontWeight: '900', color: '#64748B' },
  toggleTextEnabled: { left: 4, right: 34, color: '#FFFFFF' },
  spinner: { width: 72 },
  disabled: { opacity: 0.5 },
  hint: { color: '#64748B', fontSize: 12, lineHeight: 18, borderTopWidth: 1, borderTopColor: '#EDF2F8', paddingTop: 10 },
  error: { color: '#B4233B', fontSize: 13, lineHeight: 19 },
});
