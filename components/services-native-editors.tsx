import { PremiumChoiceRow } from './ui/premium-choice-row';
import { premiumSectionAccent } from './premium-section-accent';
import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessAppearance } from './access-premium';
import { NativeReadableText as Text, nativeSerif } from './owner-native-premium';
import { ServicesSelect } from './services-profession-filter';
import { NativeDatePickerModal } from './ui/native-date-picker-modal';
import type { ServicesWebEditForm } from './services-web-edit-form';

function EditorSection({ title, open, onPress, children }: React.PropsWithChildren<{ title: string; open: boolean; onPress: () => void }>) {
  const { palette: p } = useAccessAppearance();
  return <View style={{ gap: 12, borderBottomWidth: 1, borderBottomColor: p.line, paddingBottom: 15 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={onPress} style={{ ...premiumSectionAccent(p.night,title), flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 46 }}><Text style={{ flex: 1, color: p.ink, fontSize: 18, lineHeight: 25, fontFamily: nativeSerif }}>{title}</Text><Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={p.muted} /></Pressable>
    <View style={{ display: open ? 'flex' : 'none', gap: 13 }}>{children}</View>
  </View>;
}

function useEditorControls() {
  const { palette: p } = useAccessAppearance();
  const button = (label: string, onPress: () => void, disabled = false, primary = false) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ maxWidth: '100%', alignSelf: 'flex-start', minHeight: 44, borderWidth: 1, borderColor: p.border, backgroundColor: primary ? p.action : p.field, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, opacity: disabled ? .4 : 1 }}><Text style={{ color: primary ? p.actionText : p.ink, fontSize: 14, lineHeight: 20 }}>{label}</Text></Pressable>;
  const field = (label: string, value: string, onChangeText: (v: string) => void, numeric = false, multiline = false) => <PremiumSearchToolbar enabled={/cerca/i.test(label)}><View style={{ gap: 7 }}><Text style={{ color: p.muted, fontSize: 13 }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} keyboardType={numeric ? 'decimal-pad' : 'default'} multiline={multiline} textAlignVertical={multiline ? 'top' : 'center'} style={{ minHeight: multiline ? 80 : 48, fontSize: 16, color: p.ink, padding: 13, backgroundColor: p.field, borderWidth: 1, borderColor: p.line, borderRadius: 12 }} /></View></PremiumSearchToolbar>;
  const check = (label: string, checked: boolean, onPress: () => void) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={{ flexDirection: 'row', gap: 11, alignItems: 'center', minHeight: 46, paddingVertical: 9 }}><Ionicons name={checked ? 'checkbox-outline' : 'square-outline'} size={22} color={p.ink} /><Text style={{ flex: 1, color: p.ink, fontSize: 14, lineHeight: 21 }}>{label}</Text></Pressable>;
  return { p, button, field, check };
}

function NativeEditorFrame({ title, onClose, embedded, children, footer }: React.PropsWithChildren<{ title: string; onClose: () => void; embedded: boolean; footer: React.ReactNode }>) {
  const { palette: p } = useAccessAppearance();
  const insets = useSafeAreaInsets();
  if (embedded) return <View style={{ gap: 16 }}>{children}{footer}</View>;
  return <View style={{ flex: 1, minHeight: 0 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: p.line }}><Text accessibilityRole="header" style={{ flex: 1, color: p.ink, fontSize: 24, lineHeight: 31, fontFamily: nativeSerif }}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Chiudi ${title}`} onPress={onClose} style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: p.field, borderWidth: 1, borderColor: p.border }}><Ionicons name="close-outline" size={22} color={p.ink} /></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 18, gap: 14 }}>{children}</ScrollView>
    <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12 + insets.bottom, borderTopWidth: 1, borderTopColor: p.line }}>{footer}</View>
  </View>;
}

export function NativeServiceEditor(m: React.ComponentProps<typeof ServicesWebEditForm> & {error?:string}) {
  const { p, button, field } = useEditorControls();
  const [section, setSection] = useState('Dati del servizio');
  const [newRole, setNewRole] = useState<string | null>(null);
  const footer = <View style={{ gap: 10 }}>{m.error ? <Text accessibilityRole="alert" style={{ color: p.night ? '#F5BBBB' : '#A53636', fontSize: 14 }}>{m.error}</Text> : null}<Text style={{ color: p.muted, fontSize: 13 }}>{m.price || '0'} € · {m.duration || '0'} min</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{button(m.saving ? 'Salvataggio in corso' : 'Salva servizio', m.onSave, !m.canSave || m.saving, true)}{button('Annulla', m.onClose, m.saving)}</View></View>;
  return <NativeEditorFrame title={m.title??'Modifica servizio'} onClose={m.onClose} embedded={m.title === 'Nuovo servizio'} footer={footer}>
    {m.headerExtra}
    <EditorSection title="Dati del servizio" open={section === 'Dati del servizio'} onPress={() => setSection(section === 'Dati del servizio' ? '' : 'Dati del servizio')}>
      {field('Nome del servizio', m.name, m.onName)}{field('Descrizione', m.description, m.onDescription, false, true)}
      <Text style={{ color: p.muted, fontSize: 13 }}>Mestiere richiesto</Text><ServicesSelect fullWidth label="Mestiere richiesto" value={m.role} entries={[...new Set([m.role, ...m.roles].filter(Boolean))].map(value => ({ value, label: value }))} onChange={m.onRole} />
      {button(newRole === null ? 'Nuovo mestiere' : 'Chiudi nuovo mestiere', () => setNewRole(newRole === null ? '' : null))}{newRole !== null ? <>{field('Nome del mestiere', newRole, setNewRole)}{button('Usa mestiere', () => { m.onCreateRole(newRole); setNewRole(null); }, !newRole.trim())}</> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}><View style={{ flex: 1, minWidth: 135 }}>{field('Prezzo (€)', m.price, m.onPrice, true)}</View><View style={{ flex: 1, minWidth: 135 }}>{field('Durata (minuti)', m.duration, m.onDuration, true)}</View></View>
    </EditorSection>
    <EditorSection title="Prenotazione e posa" open={section === 'Prenotazione e posa'} onPress={() => setSection(section === 'Prenotazione e posa' ? '' : 'Prenotazione e posa')}>{m.booking}</EditorSection>
    <EditorSection title="Promozione ed etichetta" open={section === 'Promozione ed etichetta'} onPress={() => setSection(section === 'Promozione ed etichetta' ? '' : 'Promozione ed etichetta')}>{m.promotion}</EditorSection>
  </NativeEditorFrame>;
}

type OperatorModel = { roleColor?: (role: string) => string; title: string; name: string; role: string; roles: string[]; photo?: string; onName: (v: string) => void; onRole: (v: string) => void; onPhoto: () => void; onRemovePhoto: () => void; mode: string; onMode: (v: 'all_role' | 'selected') => void; services: { id: string; name: string; role?: string; selected: boolean; onToggle: () => void }[]; days: { value: number; label: string }[]; weekdays: number[]; onDay: (v: number) => void; start: string; end: string; onStart: (v: string) => void; onEnd: (v: string) => void; canAddRange: boolean; onAddRange: () => void; ranges: { id: string; label: string; onRemove: () => void }[]; onArchive?: () => void; onDelete?: () => void; onClose: () => void; onSave: () => void; valid: boolean; saving: boolean; error?: string };
export function NativeOperatorEditor({ model: m }: { model: OperatorModel }) {
  const { p, button, field, check } = useEditorControls();
  const [section, setSection] = useState('Profilo');
  const [customRole, setCustomRole] = useState(false);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState<'start' | 'end' | null>(null);
  const footer = <View style={{ gap: 10 }}>{m.error ? <Text accessibilityRole="alert" style={{ color: p.night ? '#F5BBBB' : '#A53636', fontSize: 14 }}>{m.error}</Text> : null}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{button(m.saving ? 'Salvataggio in corso' : 'Salva operatore', m.onSave, !m.valid || m.saving, true)}{button('Annulla', m.onClose, m.saving)}</View></View>;
  return <><NativeEditorFrame title={m.title} onClose={m.onClose} embedded={m.title === 'Nuovo operatore'} footer={footer}>
    <EditorSection title="Profilo" open={section === 'Profilo'} onPress={() => setSection(section === 'Profilo' ? '' : 'Profilo')}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>{m.photo ? <Image source={{ uri: m.photo }} style={{ width: 52, height: 52, borderRadius: 16 }} /> : <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: p.field, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" color={p.ink} size={26} /></View>}{button(m.photo ? 'Cambia foto' : 'Aggiungi foto', m.onPhoto)}{m.photo ? button('Rimuovi foto', m.onRemovePhoto) : null}</View>
      {field('Nome operatore', m.name, m.onName)}<Text style={{ color: p.muted, fontSize: 13 }}>Mestiere</Text><ServicesSelect fullWidth label="Mestiere operatore" value={m.role} entries={[...new Set([m.role, ...m.roles].filter(Boolean))].map(value => ({ value, label: value }))} onChange={m.onRole} />
      {button(customRole ? 'Chiudi nuovo mestiere' : 'Nuovo mestiere', () => setCustomRole(!customRole))}{customRole ? field('Mestiere personalizzato', m.role, m.onRole) : null}
    </EditorSection>
    <EditorSection title="Competenze" open={section === 'Competenze'} onPress={() => setSection(section === 'Competenze' ? '' : 'Competenze')}>
      {check('Tutti i servizi del mestiere', m.mode !== 'selected', () => m.onMode('all_role'))}{check('Solo i servizi selezionati', m.mode === 'selected', () => m.onMode('selected'))}
      {m.mode === 'selected' ? <>{field('Cerca servizio', query, setQuery)}{m.services.filter(service => `${service.name} ${service.role ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(service => <View key={service.id}>{check(`${service.name}${service.role ? ` · ${service.role}` : ''}`, service.selected, service.onToggle)}</View>)}</> : <Text style={{ color: p.muted, fontSize: 13, lineHeight: 20 }}>L’operatore può ricevere tutti i servizi del proprio mestiere in Agenda e online.</Text>}
    </EditorSection>
    <EditorSection title="Disponibilità" open={section === 'Disponibilità'} onPress={() => setSection(section === 'Disponibilità' ? '' : 'Disponibilità')}>
      <Text style={{ color: p.muted, fontSize: 13 }}>Giorni della settimana</Text><PremiumChoiceRow style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{m.days.map(day => <Pressable key={day.value} accessibilityRole="checkbox" accessibilityLabel={day.label} accessibilityState={{ checked: m.weekdays.includes(day.value) }} onPress={() => m.onDay(day.value)} style={{ minWidth: 44, minHeight: 44, borderWidth: 1, borderColor: p.border, backgroundColor: m.weekdays.includes(day.value) ? p.action : p.field, borderRadius: 12, padding: 11, alignItems: 'center' }}><Text style={{ color: m.weekdays.includes(day.value) ? p.actionText : p.ink, fontSize: 13 }}>{day.label}</Text></Pressable>)}</PremiumChoiceRow>
      <Text style={{ color: p.muted, fontSize: 13, lineHeight: 20 }}>Senza periodi specifici valgono i giorni settimanali per tutto l’anno.</Text>{button(`Data inizio: ${m.start || 'scegli'}`, () => setDate('start'))}{m.end !== '9999-12-31' ? button(`Data fine: ${m.end || 'scegli'}`, () => setDate('end')) : null}{check('Senza scadenza', m.end === '9999-12-31', () => m.onEnd(m.end === '9999-12-31' ? '' : '9999-12-31'))}{button('Aggiungi periodo', m.onAddRange, !m.canAddRange)}{m.ranges.map(range => <View key={range.id} style={{ gap: 8, paddingVertical: 12, borderTopWidth: 1, borderTopColor: p.line }}><Text style={{ color: p.ink, fontSize: 14, lineHeight: 21 }}>{range.label}</Text>{button('Rimuovi periodo', range.onRemove)}</View>)}
    </EditorSection>
    {m.onArchive || m.onDelete ? <EditorSection title="Altre azioni" open={section === 'Altre azioni'} onPress={() => setSection(section === 'Altre azioni' ? '' : 'Altre azioni')}>{m.onArchive ? button('Archivia operatore', m.onArchive) : null}{m.onDelete ? button('Elimina operatore', m.onDelete) : null}</EditorSection> : null}
  </NativeEditorFrame><NativeDatePickerModal visible={!!date} title={date === 'start' ? 'Data inizio' : 'Data fine'} initialValue={date === 'start' ? m.start : m.end} onClose={() => setDate(null)} onConfirm={value => { if (date === 'start') m.onStart(value); else if (date === 'end') m.onEnd(value); setDate(null); }} /></>;
}
