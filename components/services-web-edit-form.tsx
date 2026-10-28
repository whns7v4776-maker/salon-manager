import { NativeMedal } from './owner-premium-native-home';
import { PremiumSearchToolbar } from './ui/premium-search-toolbar';
import { NativeDatePickerModal } from './ui/native-date-picker-modal';
import { NativeTimePickerModal } from './ui/native-time-picker-modal';
import { popupGlass } from './premium-web-surfaces';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useAccessAppearance } from './access-premium';
import { ServicesSelect } from './services-profession-filter';
import { ServicesEditorStyle, ServicesOptionRow } from './services-web-editor';
import { SERVICE_PROMOTION_WEEKDAYS } from '../src/lib/service-promotions';

type FieldProps = { label: string; value: string; onChange: (value: string) => void; placeholder?: string; unit?: string; multiline?: boolean; numeric?: boolean; readOnly?: boolean; maxLength?: number };
export function ServiceWebField({ label, value, onChange, placeholder, unit, multiline, numeric, readOnly, maxLength }: FieldProps) {
  const { palette: p } = useAccessAppearance();
  return <PremiumSearchToolbar enabled={/cerca/i.test(label)}><View style={{ gap: 8, flex: 1, minWidth: 0 }}>
    <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{label}</Text>
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: p.night?p.border:'rgba(122,100,70,.26)', borderRadius: 12, backgroundColor: p.night ? '#2B2B29' : '#FFFDF9', minHeight: 50, overflow: 'hidden' }}>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={p.muted} multiline={multiline} maxLength={maxLength} editable={!readOnly} inputMode={numeric ? 'decimal' : 'text'}
        style={{ flex: 1, minWidth: 0, width: '100%', color: p.ink, fontSize: 14, lineHeight: 22, paddingHorizontal: 15, paddingVertical: 13, ...(multiline ? { minHeight: 132, textAlignVertical: 'top' } : {}), opacity: readOnly ? .65 : 1 }} />
      {unit ? <Text style={{ color: p.muted, fontSize: 12, paddingRight: 15 }}>{unit}</Text> : null}
    </View>
  </View></PremiumSearchToolbar>;
}

const SECTION_LOOK: [RegExp, React.ComponentProps<typeof Ionicons>['name'], string, string][] = [
  [/servizio$/i, 'cut-outline', '#A9ABD9', '#5B5E9A'],
  [/prezzo e durata/i, 'pricetag-outline', '#D6B27A', '#8C6A35'],
  [/prenota/i, 'globe-outline', '#86C2BE', '#3E7C7A'],
  [/promo/i, 'sparkles-outline', '#D69AB0', '#9A4F67'],
  [/./, 'ellipse-outline', '#C9AA8C', '#7E6247'],
];
export function ServiceWebSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  const { palette: p } = useAccessAppearance();
  // Section heading: coloured medallion + serif title, no tinted box (same language as Richieste/Clienti).
  const look = SECTION_LOOK.find(([match]) => match.test(title)) ?? SECTION_LOOK[SECTION_LOOK.length - 1];
  return <View style={{ gap: 16, minWidth: 0 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><NativeMedal icon={look[1]} size={40} iconSize={18} accent={p.night ? look[2] : look[3]} /><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={{ color: p.ink, fontFamily: 'Georgia', fontSize: 21, lineHeight: 27 }}>{title}</Text>{description ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>{description}</Text> : null}</View></View>{children}</View>;
}

type EditProps = {
 title?:string; headerExtra?:React.ReactNode;
  name: string; description: string; role: string; roles: string[]; price: string; duration: string; phased: boolean;
  onName: (value: string) => void; onDescription: (value: string) => void; onRole: (value: string) => void;
  onPrice: (value: string) => void; onDuration: (value: string) => void; onCreateRole: (value: string) => void;
  booking: React.ReactNode; promotion: React.ReactNode; onClose: () => void; onSave: () => void; canSave: boolean; saving: boolean;
};

export function ServicesWebEditForm(props: EditProps) {
  const { palette: p } = useAccessAppearance();
  const [newRole, setNewRole] = useState<string | null>(null);
  const activeFill = p.night ? 'rgba(216,194,155,.16)' : 'rgba(52,55,53,.10)';
  const button = { minHeight: 44, borderRadius: 11, paddingHorizontal: 20, justifyContent: 'center' as const, alignItems: 'center' as const };
  return <View {...{dataSet:{ servicesEditForm: 'true' }}} style={{ flex: 1, minHeight: 0 }}>
    <ServicesEditorStyle />
    {React.createElement('style', null, '[data-services-edit-form] input{outline:none!important;box-shadow:none!important;}[data-service-edit-columns]{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:40px;align-items:start;}@media(max-width:760px){[data-service-edit-columns]{grid-template-columns:minmax(0,1fr);gap:28px;}}')}
    <View style={{ paddingHorizontal: 28, paddingTop: 25, paddingBottom: 22, gap: 18, borderBottomWidth: 1, borderColor: p.line }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 }}><NativeMedal icon="cut-outline" size={46} iconSize={21} accent={p.night ? '#D6B27A' : '#8C6A35'} /><Text style={{ flex: 1, color: p.ink, fontFamily: 'Georgia', fontSize: 27, lineHeight: 34 }}>{props.title??'Modifica servizio'}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Chiudi finestra" onPress={props.onClose} disabled={props.saving} style={{ width: 38, height: 38, borderWidth: 1, borderColor: p.border, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={19} color={p.ink} /></Pressable>
      </View>
      {props.headerExtra}
    </View>
    <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ padding: 28, gap: 32 }} keyboardShouldPersistTaps="handled">
      <View {...{dataSet:{ serviceEditColumns: 'true' }}}>
        <ServiceWebSection title="Il servizio" description="Nome e descrizione che i clienti troveranno nel listino.">
          <ServiceWebField label="Nome del servizio" value={props.name} onChange={props.onName} placeholder="Es. Colore e piega" />
          <ServiceWebField label="Descrizione facoltativa" value={props.description} onChange={props.onDescription} placeholder="Racconta cosa comprende il servizio" multiline maxLength={300} />
          <Text style={{ color: p.muted, fontSize: 11, alignSelf: 'flex-end' }}>{props.description.length}/300</Text>
        </ServiceWebSection>
        <ServiceWebSection title="Prezzo e durata" description="Definisci il valore del servizio e il tempo in agenda.">
          <View style={{ flexDirection: 'row', gap: 12 }}><ServiceWebField label="Prezzo" value={props.price} onChange={props.onPrice} numeric unit="€" /><ServiceWebField label={props.phased ? 'Durata totale' : 'Durata'} value={props.duration} onChange={props.onDuration} numeric unit="min" readOnly={props.phased} /></View>
          {props.phased ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 18 }}>La durata si aggiorna dalle fasi nella sezione Prenotazione.</Text> : null}
          <View style={{ gap: 8 }}><Text style={{ color: p.muted, fontSize: 12 }}>Mestiere richiesto</Text><ServicesSelect label="Mestiere richiesto" fullWidth value={props.role} entries={[...new Set([props.role, ...props.roles].filter(Boolean))].map(role => ({ value: role, label: role }))} onChange={props.onRole} /></View>
          <Pressable accessibilityRole="button" onPress={() => setNewRole(newRole === null ? '' : null)} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}><Text style={{ color: p.ink, fontSize: 12 }}>{newRole === null ? '+ Nuovo mestiere' : 'Annulla nuovo mestiere'}</Text></Pressable>
          {newRole !== null ? <View style={{ gap: 10 }}><ServiceWebField label="Nome del nuovo mestiere" value={newRole} onChange={setNewRole} /><Pressable accessibilityRole="button" disabled={!newRole.trim()} onPress={() => { props.onCreateRole(newRole); setNewRole(null); }} style={{ ...button, backgroundColor: activeFill, alignSelf: 'flex-start', opacity: newRole.trim() ? 1 : .5 }}><Text style={{ color: p.ink, fontSize: 12 }}>Usa mestiere</Text></Pressable></View> : null}
        </ServiceWebSection>
      </View>
      <ServiceWebSection title="Come si prenota" description="Visibilità online, tempi di posa e servizi da abbinare.">{props.booking}</ServiceWebSection><ServiceWebSection title="Prezzo promozionale" description="Imposta uno sconto e scegli quando renderlo disponibile.">{props.promotion}</ServiceWebSection>
    </ScrollView>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: 28, paddingVertical: 18, borderTopWidth: 1, borderColor: p.line, backgroundColor: p.night ? '#262623' : '#D1C8BA', ...popupGlass(p, 'footer') }}>
      <Text style={{ color: p.ink, fontSize: 15, lineHeight: 23, fontWeight: '500', flexShrink: 1 }}>{props.price || '—'} € · {props.duration || '—'} min{props.role ? ` · ${props.role}` : ''}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}><Pressable accessibilityRole="button" onPress={props.onClose} disabled={props.saving} style={button}><Text style={{ color: p.ink, fontSize: 13 }}>Annulla</Text></Pressable><Pressable accessibilityRole="button" onPress={props.onSave} disabled={!props.canSave || props.saving} style={{ ...button, backgroundColor: p.action, opacity: !props.canSave || props.saving ? .45 : 1 }}><Text style={{ color: p.actionText, fontSize: 13, fontWeight: '600' }}>{props.saving ? 'Salvataggio…' : props.title==='Nuovo servizio'?'Aggiungi servizio':'Salva modifiche'}</Text></Pressable></View>
    </View>
  </View>;
}

type PromotionProps = { originalPrice: string; onOriginalPrice: (value: string) => void; available: boolean; enabled: boolean; onEnabled: (value: boolean) => void; always: boolean; onAlways: (value: boolean) => void; startDate: string; endDate: string; onStartDate: (value: string) => void; onEndDate: (value: string) => void; startTime: string; endTime: string; onStartTime: (value: string) => void; onEndTime: (value: string) => void; weekdays: number[]; onWeekdays: (value: number[]) => void; labelEditor: React.ReactNode };
export function ServiceWebPromotion(props: PromotionProps) {
  const { palette: p } = useAccessAppearance();
  const dateField = (label: string, type: 'date' | 'time', value: string, onChange: (value: string) => void) => Platform.OS!=='web'?<NativePromotionDateTimeField label={label} type={type} value={value} onChange={onChange}/>:<View style={{ flex: 1, minWidth: 160, gap: 8 }}><Text style={{ color: p.muted, fontSize: 12 }}>{label}</Text>{React.createElement('input', { type, value, 'aria-label': label, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value), style: { boxSizing: 'border-box', width: '100%', minWidth: 0, height: 48, borderRadius: 12, border: `1px solid ${p.night?p.border:'#B9AE9C'}`, padding: '0 13px', color: p.ink, backgroundColor: p.night ? '#2B2B29' : '#EAE4DA', colorScheme: p.night ? 'dark' : 'light', fontFamily: 'inherit', fontSize: 14 } })}</View>;
  return <View style={{ gap: 24 }}>
    <View style={{ maxWidth: 340, gap: 10 }}><ServiceWebField label="Prezzo pieno prima dello sconto" value={props.originalPrice} onChange={props.onOriginalPrice} numeric unit="€" placeholder="Facoltativo" /><Text style={{ color: p.muted, fontSize: 12, lineHeight: 19 }}>Il prezzo nella sezione Prezzo e durata diventa il prezzo promozionale. Lascia vuoto questo campo per non mostrare uno sconto.</Text></View>
    {props.available ? <View style={{ gap: 18 }}>
      <ServicesOptionRow title="Mostra la promozione" description="Puoi sospenderla conservando le impostazioni." value={props.enabled} onChange={props.onEnabled} />
      <ServicesOptionRow title="Senza scadenza" description="Disattiva per scegliere una data di inizio e fine." value={props.always} onChange={props.onAlways} />
      {!props.always ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{dateField('Data inizio', 'date', props.startDate, props.onStartDate)}{dateField('Data fine', 'date', props.endDate, props.onEndDate)}</View> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>{dateField('Orario inizio', 'time', props.startTime, props.onStartTime)}{dateField('Orario fine', 'time', props.endTime, props.onEndTime)}</View>
      <View style={{ gap: 10 }}><Text style={{ color: p.muted, fontSize: 12 }}>Giorni della promozione</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{SERVICE_PROMOTION_WEEKDAYS.map(({label:day,value:index}) => <Pressable accessibilityRole="checkbox" accessibilityLabel={day} accessibilityState={{ checked: props.weekdays.includes(index) }} aria-checked={props.weekdays.includes(index)} key={day} onPress={() => props.onWeekdays(props.weekdays.includes(index) ? props.weekdays.filter(d => d !== index) : [...props.weekdays, index].sort())} style={{ minWidth: 46, height: 40, borderRadius: 10, borderWidth: 1, borderColor: p.border, backgroundColor: props.weekdays.includes(index) ? (p.night ? 'rgba(216,194,155,.16)' : 'rgba(52,55,53,.10)') : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.ink, fontSize: 12 }}>{day}</Text></Pressable>)}</View></View>
    </View> : null}
    {props.labelEditor}
  </View>;
}

function NativePromotionDateTimeField({label,type,value,onChange}:{label:string;type:'date'|'time';value:string;onChange:(value:string)=>void}){
 const {palette:p}=useAccessAppearance();const [open,setOpen]=React.useState(false);
 return <View style={{flex:1,minWidth:135,gap:7}}><Text style={{color:p.muted,fontSize:13}}>{label}</Text><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={()=>setOpen(true)} style={{minHeight:48,padding:13,borderRadius:12,borderWidth:1,borderColor:p.line,backgroundColor:p.field}}><Text style={{color:p.ink,fontSize:15}}>{value||'Scegli'}</Text></Pressable>{type==='date'?<NativeDatePickerModal visible={open} title={label} initialValue={value} onClose={()=>setOpen(false)} onConfirm={next=>{onChange(next);setOpen(false);}}/>:<NativeTimePickerModal visible={open} title={label} initialValue={value} onClose={()=>setOpen(false)} onConfirm={next=>{onChange(next);setOpen(false);}}/>}</View>;
}
