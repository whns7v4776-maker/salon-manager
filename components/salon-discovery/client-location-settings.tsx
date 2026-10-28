import {InfoButton} from '../ui/info-button';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccessAppearance } from '../access-premium';
import { customerPortalStyles } from '../customer-portal-styles';
import { clientNotificationTone } from '../client-notification-premium';
import { Alert, AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ClientBookingText as Text } from '../client-booking-text';
import { Ionicons } from '@expo/vector-icons';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { disableClientGpsReminders, enableClientGpsReminders, getClientGpsConsent } from '../../src/lib/client-gps-reminders';

export function ClientLocationSettings({ salonCode }: { salonCode: string }) {
  const { palette: p } = useAccessAppearance();
  const activeTone = clientNotificationTone(p, 'accepted');
  const styles = useMemo(() => {
    const themed = customerPortalStyles(baseStyles, p);
    return { ...themed,
      heading: { ...themed.heading, justifyContent: 'center' as const, flexWrap: 'wrap' as const },
      card: { ...themed.card, width: '100%' as const, padding: 13, gap: 9, borderRadius: 17, backgroundColor: p.surface, borderColor: p.border },
      title: { ...themed.title, fontSize: 15, lineHeight: 21, fontWeight: '600' as const, color: p.ink, textAlign: 'center' as const },
      copy: { ...themed.copy, fontSize: 12, lineHeight: 18, color: p.muted, textAlign: 'center' as const },
      status: { ...themed.status, fontSize: 11, lineHeight: 16, fontWeight: '500' as const, color: p.muted },
      button: { ...themed.button, minHeight: 44, paddingVertical: 9, borderWidth: 1, borderColor: p.border, backgroundColor: p.field },
      buttonText: { ...themed.buttonText, color: p.ink, fontSize: 13, lineHeight: 20, fontWeight: '600' as const, textAlign: 'center' as const },
      reminderStatus: { ...themed.reminderStatus, backgroundColor: p.field },
      reminderStatusActive: { backgroundColor: clientNotificationTone(p, 'accepted').soft },
      reminderButtonActive: { backgroundColor: clientNotificationTone(p, 'accepted').soft, borderWidth: 1, borderColor: p.border },
      reminderTextActive: { color: clientNotificationTone(p, 'accepted').ink },
    };
  }, [p]);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [status, setStatus] = useState<'loading'|'enabled'|'disabled'|'unavailable'>('loading');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const consent = await getClientGpsConsent();
      setGpsEnabled(consent?.salonCode === salonCode);
      if (!requireOptionalNativeModule('ExpoLocation')) { setStatus('unavailable'); return; }
      const location = await import('expo-location');
      const [permission, enabled] = await Promise.all([location.getForegroundPermissionsAsync(), location.hasServicesEnabledAsync()]);
      setStatus(permission.granted && enabled ? 'enabled' : 'disabled');
    } catch { setStatus('unavailable'); }
  }, [salonCode]);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void refresh();
    const subscription = AppState.addEventListener('change', next => { if (next === 'active') void refresh(); });
    return () => subscription.remove();
  }, [refresh]);
  if (Platform.OS === 'web') return null;
  const enabled = status === 'enabled';
  return <View style={styles.card}>
    <View style={styles.heading}><Ionicons name="location-outline" size={20} color={p.muted}/><Text style={[styles.title,{flexShrink:1}]}>Posizione</Text><InfoButton accessibilityRole="button" accessibilityLabel="Informazioni su posizione e privacy" style={styles.infoButton} onPress={() => Alert.alert('Posizione e privacy', 'La posizione serve a cercare saloni vicini. Puoi prenotare anche senza.\n\nSe attivi il promemoria a 30 minuti, lo ricevi anche con app chiusa e senza GPS, purché le notifiche siano consentite.\n\nCon posizione già consentita, l’app può aggiungere un controllo tra 35 e 25 minuti prima dell’appuntamento, soltanto mentre è aperta. Il controllo si interrompe quando esci dall’app o termina la finestra. Non teniamo il GPS acceso in background.\n\nNon conserviamo una cronologia degli spostamenti. Puoi disattivare il promemoria in qualsiasi momento.', [{text:'Ho capito'}])} /><Text style={[styles.status, enabled && {color:activeTone.ink}]}>{enabled?'Attiva':status==='loading'?'Verifica…':'Non attiva'}</Text></View>
    <Text style={styles.copy}>Saloni vicini e promemoria dei tuoi appuntamenti. Sei tu a scegliere.</Text>
    {status==='unavailable' ? <Text style={styles.copy}>Aggiorna l’app per utilizzare la posizione.</Text> : <Pressable accessibilityRole="button" disabled={busy || status==='loading'} style={styles.button} onPress={async () => {
      setBusy(true);
      try {
        const location = await import('expo-location');
        const permission = await location.getForegroundPermissionsAsync();
        if (permission.granted || !permission.canAskAgain) await Linking.openSettings();
        else { await location.requestForegroundPermissionsAsync(); await refresh(); }
      } catch { Alert.alert('Posizione non disponibile', 'Riprova oppure controlla i permessi nelle impostazioni del telefono.'); } finally {setBusy(false);}
    }}><Text style={styles.buttonText}>{busy?'Attendi…':enabled?'Gestisci permesso':'Attiva posizione'}</Text></Pressable>}
    <View style={{height:1,backgroundColor:p.line,marginVertical:4}} />
    <View style={styles.heading}>
      <Text style={[styles.title, {flexShrink:1}]}>Promemoria a 30 minuti</Text>
      <View style={[styles.reminderStatus, gpsEnabled && styles.reminderStatusActive]}>
        <Ionicons name={gpsEnabled ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={gpsEnabled ? activeTone.ink : p.muted} />
        <Text style={[styles.status, gpsEnabled && styles.reminderTextActive]}>{gpsEnabled ? 'Attivo' : 'Non attivo'}</Text>
      </View>
    </View>
    <Text style={styles.copy}>Un avviso prima dell’appuntamento, anche senza GPS. Richiede le notifiche attive.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{busy:gpsBusy, disabled:gpsBusy}} disabled={gpsBusy} style={[styles.button, gpsEnabled && styles.reminderButtonActive]} onPress={() => {
      const update = async () => {
        setGpsBusy(true);
        try {
          if (gpsEnabled) await disableClientGpsReminders();
          else await enableClientGpsReminders(salonCode);
        } catch (error) { Alert.alert('Promemoria a 30 minuti',error instanceof Error ? error.message : 'Riprova tra poco.'); }
        finally { await refresh(); setGpsBusy(false); }
      };
      if (gpsEnabled) { void update(); return; }
      Alert.alert('Attivare il promemoria a 30 minuti?', 'Ricevi un avviso circa mezz’ora prima degli appuntamenti confermati, anche con app chiusa e senza GPS. Consenti le notifiche per riceverlo. Se la posizione è già consentita, viene usata solo con app aperta e vicino all’appuntamento, senza tracciamento continuo. Puoi disattivare il promemoria quando vuoi.', [{text:'Non ora',style:'cancel'},{text:'Continua',onPress:()=>void update()}]);
    }}><Text style={[styles.buttonText, gpsEnabled && styles.reminderTextActive]}>{gpsBusy?'Aggiornamento…':gpsEnabled?'Attivo · Disattiva':'Attiva promemoria a 30 minuti'}</Text></Pressable>
  </View>;
}
const baseStyles=StyleSheet.create({card:{padding:16,gap:10,borderRadius:20,borderWidth:1,borderColor:'#DCE5EF',backgroundColor:'#F7FAFD'},heading:{flexDirection:'row',alignItems:'center',gap:8},infoButton:{width:44,height:44,alignItems:'center',justifyContent:'center'},privacy:{flexDirection:'row',gap:9,padding:12,borderRadius:14,backgroundColor:'#EAF1F9'},privacyText:{flex:1,fontSize:12,lineHeight:18,color:'#365A7C'},title:{fontSize:16,fontWeight:'800',color:'#172B43'},status:{fontSize:12,fontWeight:'700',color:'#738397'},copy:{fontSize:13,lineHeight:19,color:'#60748A'},button:{minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:13,backgroundColor:'#EAF1F9',paddingHorizontal:12},reminderStatus:{flexDirection:'row',alignItems:'center',gap:4,paddingHorizontal:8,paddingVertical:5,borderRadius:12,backgroundColor:'#EAF1F9'},reminderStatusActive:{backgroundColor:'#DCFCE7'},reminderButtonActive:{backgroundColor:'#DCFCE7',borderWidth:1,borderColor:'#86EFAC'},reminderTextActive:{color:'#166534'},buttonText:{fontSize:13,fontWeight:'700',color:'#315F8B'}});
