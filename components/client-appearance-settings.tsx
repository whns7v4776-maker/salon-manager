import React from 'react';
import { Pressable, View } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import { useAccessAppearance } from './access-premium';

type Sync = { status: 'loading' | 'saving' | 'saved' | 'error'; message: string; retry: () => void };
export function ClientAppearanceSettings({ sync }: { sync: Sync }) {
  const { palette: p, mode, setMode } = useAccessAppearance();
  return <View style={{ padding: 16, borderRadius: 18, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, gap: 12 }}>
    <Text accessibilityRole="header" style={{ color: p.ink, fontSize: 17, fontWeight: '500' }}>Aspetto</Text>
    <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>Automatico segue il tema del dispositivo. Puoi sempre cambiare aspetto anche dal pulsante nelle schermate.</Text>
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 7 }}>
      {([['system', 'Automatico'], ['day', 'Chiaro'], ['night', 'Scuro']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Aspetto ${label.toLowerCase()}`} accessibilityState={{ checked: mode === value }} onPress={() => setMode(value)} style={{ flex: 1, minWidth: 0, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5, borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: mode === value ? p.action : p.field }}>
        <Text style={{ color: mode === value ? p.actionText : p.ink, fontSize: 12, fontWeight: mode === value ? '600' : '400' }}>{label}</Text>
      </Pressable>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{sync.message}</Text>
    {sync.status === 'error' ? <Pressable accessibilityRole="button" accessibilityLabel="Riprova sincronizzazione aspetto" onPress={sync.retry} style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, backgroundColor: p.field }}><Text style={{ color: p.ink, fontSize: 13 }}>Riprova</Text></Pressable> : null}
  </View>;
}
