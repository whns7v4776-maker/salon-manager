import React from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { getMetaMeasurementConsent, getMetaMeasurementSaveError, isMetaMeasurementAvailable, setMetaMeasurementConsent } from '../src/lib/meta-app-events';

export function MetaMeasurementPreferences() {
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('');
  React.useEffect(() => {
    void getMetaMeasurementConsent().then(setEnabled);
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void getMetaMeasurementConsent().then(setEnabled);
    });
    return () => subscription.remove();
  }, []);
  if (!isMetaMeasurementAvailable()) return null;
  const update = async (value: boolean) => {
    setBusy(true);
    const granted = await setMetaMeasurementConsent(value);
    setEnabled(granted);
    setMessage(getMetaMeasurementSaveError() ?? (granted ? 'Misurazione autorizzata.' : 'Misurazione non autorizzata. Su iPhone puoi gestire anche il permesso in Impostazioni > Privacy e sicurezza > Tracciamento.'));
    setBusy(false);
  };
  return <View style={{ padding: 20, gap: 12, backgroundColor: '#fff', borderRadius: 16, marginBottom: 20 }}>
    <Text style={{ fontWeight: '700', fontSize: 18 }}>Misurazione pubblicitaria facoltativa</Text>
    <Text>Se acconsenti, condividiamo con Meta gli eventi di installazione, apertura dell’app e nuova registrazione del titolare, insieme agli identificativi pubblicitari e ai dati tecnici del dispositivo, per misurare le campagne SalonPro. Non aggiungiamo nomi, email, clienti o appuntamenti agli eventi. Puoi usare l’app anche senza accettare e revocare qui il consenso in qualsiasi momento; la revoca non cancella i dati già inviati.</Text>
    <Text>Stato: {enabled ? 'consenso salvato (su iPhone serve anche il permesso di sistema)' : 'non autorizzata'}</Text>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void update(!enabled)} style={{ padding: 12, borderWidth: 1, borderRadius: 8 }}>
      <Text>{busy ? 'Attendi…' : enabled ? 'Revoca il consenso' : 'Acconsento alla misurazione con Meta'}</Text>
    </Pressable>
    {!enabled && <Text>Non vuoi acconsentire? Non devi fare nulla: rimane disattivata.</Text>}
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
  </View>;
}
