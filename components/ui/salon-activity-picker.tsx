import { TABLET_MODAL_ORIENTATIONS } from '../../src/lib/tablet-modal-orientations';
import {useNativePremium, nativeSectionStyles, NativeReadableText as Text, NativePremiumIcon as Ionicons} from '../owner-native-premium';

import { popupGlass } from '../premium-web-surfaces';
import { useAccessAppearance } from '../access-premium';
import { DockedSheetSurface } from './docked-sheet-surface';
import { Picker } from '@react-native-picker/picker';

import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { HapticTouchable } from './haptic-touchable';

export function SalonActivityPicker({ value, options, disabled, onChange }: {
  value: string; options: string[]; disabled: boolean; onChange: (value: string) => void;
}) {
  const { palette:p } = useAccessAppearance();
  const native=useNativePremium();
  const styles = Platform.OS === 'web' ? {...baseStyles,
    backdrop:{...baseStyles.backdrop,justifyContent:'center',paddingBottom:20,backgroundColor:p.night?'rgba(0,0,0,.5)':'rgba(40,35,29,.28)',backdropFilter:'blur(8px)'} as any,
    sheet:{...baseStyles.sheet,...popupGlass(p),borderWidth:1,borderColor:p.border,padding:24},
    title:{...baseStyles.title,color:p.ink,fontFamily:'Georgia',fontSize:26,fontWeight:'400' as const},
    caption:{...baseStyles.caption,color:p.muted},value:{...baseStyles.value,color:p.ink},
    select:{...baseStyles.select,backgroundColor:p.field,borderColor:p.border},
    input:{...baseStyles.input,color:p.ink,backgroundColor:p.field,borderColor:p.border},
    create:{...baseStyles.create,paddingHorizontal:12,borderRadius:11,borderWidth:1,borderColor:p.border,backgroundColor:p.field,marginVertical:12},
    createText:{...baseStyles.createText,color:p.ink},
    cancel:{...baseStyles.cancel,borderRadius:11,borderWidth:1,borderColor:p.border,backgroundColor:p.field},
    confirm:{...baseStyles.confirm,backgroundColor:p.action,borderRadius:11},confirmText:{...baseStyles.confirmText,color:p.actionText}
  } : native?nativeSectionStyles(baseStyles,p):baseStyles;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const choices = useMemo(() => Array.from(new Set([value, ...options]
    .map((item) => item.trim().replace(/\s+/g, ' ').toLocaleUpperCase('it')).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'it')), [value, options]);
  const normalizedDraft = draft.trim().replace(/\s+/g, ' ').toLocaleUpperCase('it');
  return (
    <View>
      <HapticTouchable immediatePress disabled={disabled} style={styles.select}
        accessibilityRole="button" accessibilityLabel="Scegli categoria attività"
        onPress={() => { setDraft(value); setCreating(false); setOpen(true); }}>
        <Text style={styles.value}>{value || 'Scegli attività'}</Text><Ionicons name="chevron-down" size={18} color="#375472" />
      </HapticTouchable>
      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <DockedSheetSurface {...(Platform.OS !== 'web' ? {onClose: () => setOpen(false)} : {})} style={styles.sheet} accessibilityViewIsModal>
            <Text style={styles.title}>La tua attività</Text>
            <Text style={styles.caption}>Scegli tra i mestieri configurati o inserisci una nuova categoria del salone.</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {creating ? (
                <TextInput value={draft} onChangeText={setDraft} autoFocus maxLength={80}
                  accessibilityLabel="Nome nuova attività" placeholder="Nome attività" placeholderTextColor="#64748B"
                  style={styles.input} autoCapitalize="words" />
              ) : Platform.OS === 'web' ? (
                <View style={{gap:8,marginTop:12}}>{choices.map(name=><HapticTouchable key={name} accessibilityRole="radio" accessibilityState={{checked:draft===name}} onPress={()=>setDraft(name)} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:14,borderRadius:12,borderWidth:1,borderColor:draft===name?p.action:p.border,backgroundColor:draft===name?p.action:p.field}}><Text style={{color:draft===name?p.actionText:p.ink,fontSize:14}}>{name}</Text>{draft===name?<Ionicons name="checkmark" size={18} color={p.actionText}/>:null}</HapticTouchable>)}</View>
              ) : (
                <Picker selectedValue={draft} onValueChange={setDraft} accessibilityLabel="Attività configurate"
                  style={styles.picker} itemStyle={{ fontSize: 19, color: '#183451' }}>
                  <Picker.Item label="Scegli attività" value="" color="#64748B" />
                  {choices.map((name) => <Picker.Item key={name} label={name} value={name} color="#183451" />)}
                </Picker>
              )}
              <HapticTouchable immediatePress style={styles.create} onPress={() => { setCreating(!creating); setDraft(creating ? value : ''); }}>
                <Text style={styles.createText}>{creating ? 'Scegli dalle attività esistenti' : '+ Crea attività'}</Text>
              </HapticTouchable>
              <Text style={styles.caption}>La categoria sarà salvata con il profilo. Servizi e operatori non vengono modificati.</Text>
            </ScrollView>
            <View style={styles.actions}>
              <HapticTouchable immediatePress style={styles.cancel} onPress={() => setOpen(false)}><Text style={styles.createText}>Annulla</Text></HapticTouchable>
              <HapticTouchable immediatePress disabled={disabled || !normalizedDraft}
                style={[styles.confirm, !normalizedDraft && { opacity: 0.45 }]}
                onPress={() => { if (normalizedDraft) { onChange(normalizedDraft); setOpen(false); } }}>
                <Text style={styles.confirmText}>Usa attività</Text>
              </HapticTouchable>
            </View>
          </DockedSheetSurface>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
const baseStyles = StyleSheet.create({
  select: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#DCE5EF', backgroundColor: '#F7FAFD', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  value: { flex: 1, fontSize: 14, fontWeight: '600', color: '#183451' },
  arrow: { fontSize: 20, color: '#375472' },
  backdrop: { flex: 1, justifyContent: 'flex-end', padding: 20, backgroundColor: 'rgba(15,23,42,0.42)' , paddingBottom: 0 },
  sheet: { width: '100%', maxWidth: 480, maxHeight: '85%', alignSelf: 'center', padding: 18, borderRadius: 24, backgroundColor: '#FFFFFF' },
  title: { fontSize: 20, fontWeight: '700', color: '#183451' },
  caption: { fontSize: 12, lineHeight: 18, color: '#64748B', marginVertical: 10 },
  picker: { width: '100%', height: Platform.OS === 'ios' ? 216 : 56 },
  input: { minHeight: 48, flexShrink: 0, borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', padding: 12, color: '#183451', fontSize: 16, marginTop: 12, textAlignVertical: 'center' },
  create: { paddingVertical: 14 },
  createText: { fontSize: 14, fontWeight: '600', color: '#193B60' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancel: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 14 },
  confirm: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: '#193B60', padding: 10 },
  confirmText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
