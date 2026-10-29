import React, { useMemo, useRef, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { ClientBookingText as Text } from './client-booking-text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccessAppearance } from './access-premium';
import { SkeletonShimmer } from './ui/skeleton-shimmer';
import { ClientTimeChoice } from './client-service-choice';
import { bookingAvailableDates, bookingCalendarCells, bookingMonthKey, bookingMonthShift, bookingNativeDateLayout, bookingTimePeriods } from './client-booking-presentation';
import { ClientBookingProgressTrack } from './client-booking-progress-track';
import { ClientBookingWaitlistChoices } from './client-booking-waitlist-choices';

export type JourneyPage = { key: string; label: string; complete: boolean };
export type JourneyDay = { value: string; weekday: string; number: string; month: string; label: string; disabled: boolean; pending: boolean; status: string };
export type JourneyOperator = { id: string; name: string; role?: string; photo?: string };
export type JourneyTime = { value: string; disabled: boolean; hint?: string };
export type JourneyWaitlistChoice = { key: string; label: string; hint: string; active: boolean; busy: boolean; onPress: () => void };
export type ClientBookingJourneyProps = {
  onNoteFocus?: (input: TextInput) => void; onNoteBlur?: () => void;
  /** Native note editing: the summary steps aside so nothing overlaps the field above the keyboard. */
  noteEditing?: boolean;
  hideProgress?: boolean; phase?: { initialLabel: string; initialDurationMinutes: number; processingLabel: string; processingDurationMinutes: number; finalServiceName: string; finalDurationMinutes: number; finalPhaseEnabled?: boolean }; linkedServiceNames?: string[];
  onHorizontalStart?: () => void; onHorizontalEnd?: () => void;
  pages: JourneyPage[]; page: number; limit: number; onPage: (page: number) => void;
  services: ReactNode; filters: { key: string; label: string; count: number }[]; filter: string; onFilter: (key: string) => void;
  hasMoreServices: boolean; expandedServices: boolean; onExpandServices: () => void;
  dependencyRequired: boolean; dependencies: ReactNode; automaticDependency?: string; contact?: ReactNode;
  serviceSelectionKey?: string; onIncludedServicesLayout?: (y: number, height: number) => void;
  days: JourneyDay[]; date: string; dateConfirmed: boolean; onDate: (date: string) => void; onPrepareDate: (date: string) => void;
  dayError?: boolean; onRetryDays?: () => void;
  operators: JourneyOperator[]; operatorId: string; automaticAvailable: boolean; automaticSelected: boolean; onOperator: (operator: JourneyOperator | null) => void;
  recommended: JourneyTime[]; additional: JourneyTime[]; time: string; loadingTimes: boolean; timeError?: string; onTime: (time: string) => void; onRetryTimes: () => void; onWaitlist: () => void;
  waitlistChoices?: JourneyWaitlistChoice[];
  serviceName: string; duration: string; operatorName: string; customerName: string; total: number; note: string; onNote: (note: string) => void;
  reviewExtras: ReactNode; reviewBenefits?: ReactNode; reviewPackages?: ReactNode; reviewPayment?: ReactNode; paymentHold?: ReactNode; canSubmit: boolean; submitLabel: string; blockedReason?: string; submitting: boolean; onSubmit: () => void;
};

const money = (value: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
const sentence = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const dateText = (date: string) => date ? sentence(new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })) : '';

export function ClientBookingProgress(props: Pick<ClientBookingJourneyProps, 'pages' | 'page' | 'limit' | 'onPage' | 'paymentHold'>) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const compact = width < 560;
  const large = Platform.OS === 'web' && width >= 1000;
  return <View {...(Platform.OS === 'web' ? { dataSet: { bookingProgress: 'true' } } : {})} style={{ width: '100%', paddingVertical: 6 }}>
    <ClientBookingProgressTrack page={props.page} count={props.pages.length} large={large} canContinue={props.pages[props.page].complete && props.page < props.limit && !props.paymentHold} />
    <View style={{ flexDirection: 'row', width: '100%' }}>
      {props.pages.map((page, index) => {
        const selected = props.page === index;
        const done = page.complete && !selected;
        const disabled = index > props.limit || Boolean(props.paymentHold);
        return <Pressable key={page.key} accessibilityRole="button" accessibilityLabel={`${index + 1}. ${page.label}${done ? ', completato' : ''}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => props.onPage(index)}
          style={{ flex: 1, minWidth: 0, minHeight: 60, alignItems: 'center', gap: 10, paddingTop: 4, paddingBottom: 7 }}>
          <View style={{ width: large ? 36 : 26, height: large ? 36 : 26, borderRadius: large ? 18 : 14, backgroundColor: p.canvas, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: large ? 34 : 24, height: large ? 34 : 24, borderRadius: large ? 17 : 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: selected ? p.action : p.border, backgroundColor: selected ? p.action : p.surface }}>
              {done ? <Ionicons name="checkmark" size={large ? 21 : 15} color={p.ink} /> : <Text maxFontSizeMultiplier={1} style={{ color: selected ? p.actionText : p.muted, fontSize: large ? 15 : 11, lineHeight: large ? 22 : 16, fontWeight: '600' }}>{index + 1}</Text>}
            </View>
          </View>
          <Text maxFontSizeMultiplier={1} style={{ color: selected ? p.ink : p.muted, fontSize: large ? 15 : width < 360 ? 9.5 : compact ? 10.3 : 12, lineHeight: large ? 22 : 15, fontWeight: selected ? '600' : '400', textAlign: 'center' }}>{page.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

function JourneySelectedDate(props: ClientBookingJourneyProps) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  if (!props.dateConfirmed) return null;
  return <View style={{ padding: large ? 20 : 15, borderRadius: 17, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, flexDirection: 'row', alignItems: 'center', gap: 13 }}><Ionicons name="checkmark-circle" size={large ? 32 : 26} color={p.action} /><View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.ink, fontSize: large ? 17 : 13, lineHeight: large ? 26 : 20, fontWeight: '600' }}>{dateText(props.date)}</Text><Text style={{ color: p.muted, fontSize: large ? 14 : 11, lineHeight: large ? 22 : 17 }}>{props.serviceName} · {props.duration}</Text></View></View>;
}

function JourneyDateOptions(props: ClientBookingJourneyProps) {
  const { palette: p } = useAccessAppearance();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const native = Platform.OS !== 'web';
  const large = Platform.OS === 'web' && width >= 1000;
  const nativeGrid = bookingNativeDateLayout(width - Math.max(20, insets.left, insets.right) * 2, fontScale);
  const initialDateCount = native ? nativeGrid.batchSize : large ? 9 : 6;
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dateCount, setDateCount] = useState(initialDateCount);
  const visibleDateCount = native ? Math.max(dateCount, initialDateCount) : dateCount;
  const available = useMemo(() => bookingAvailableDates(props.days), [props.days]);
  const visible = available.slice(0, visibleDateCount);
  const chosen = props.dateConfirmed ? available.find(day => day.value === props.date) : undefined;
  if (chosen && !visible.includes(chosen)) visible.push(chosen);
  const green = p.night ? '#8FD4A2' : '#387849';
  return <View style={{ gap: large ? 22 : 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
      <Text style={{ color: p.ink, fontSize: large ? 18 : 13, lineHeight: large ? 27 : 20, fontWeight: '500' }}>{calendarOpen ? 'Scegli dal calendario' : 'Prossime date disponibili'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={calendarOpen ? 'Chiudi calendario' : 'Apri calendario'} accessibilityState={{ expanded: calendarOpen }} onPress={() => setCalendarOpen(value => !value)} style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 13, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="calendar-outline" size={large ? 21 : 17} color={p.ink} /><Text style={{ color: p.ink, fontSize: large ? 14 : 11 }}>{calendarOpen ? 'Date disponibili' : 'Calendario'}</Text></Pressable>
    </View>
    {calendarOpen ? <JourneyCalendar {...props} /> : <>
      <View accessibilityRole="radiogroup" accessibilityLabel="Date con posti disponibili" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: native ? nativeGrid.gap : large ? 14 : 12 }}>
        {visible.map(day => {
          const selected = props.dateConfirmed && props.date === day.value;
          return <Pressable key={day.value} accessibilityRole="radio" accessibilityLabel={`${day.label}, posti disponibili`} accessibilityState={{ checked: selected }} onPress={() => props.onDate(day.value)} style={({ pressed }) => ({ width: native ? nativeGrid.cardWidth : large && width >= 1200 ? '32%' : '47%', minWidth: 0, minHeight: native ? 94 : large ? 120 : 100, padding: native ? 9 : large ? 19 : 13, borderRadius: native ? 16 : 18, borderWidth: 1, borderColor: selected ? p.action : p.border, backgroundColor: p.surface, gap: native ? 4 : 8, opacity: pressed ? .75 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: native ? 4 : 6 }}><Text style={{ color: native ? p.ink : p.muted, fontSize: native ? 12 : large ? 15 : 11, lineHeight: native ? 18 : large ? 22 : 17, fontWeight: native ? '700' : '400', textTransform: 'capitalize' }}>{day.weekday}</Text>{selected ? <Ionicons name="checkmark-circle" size={native ? 16 : large ? 23 : 19} color={p.action} /> : null}</View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: native ? 4 : 6 }}><Text style={{ color: p.ink, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: native ? 24 : large ? 32 : 26, lineHeight: native ? 27 : large ? 37 : 30 }}>{day.number}</Text><Text style={{ color: p.muted, fontSize: native ? 11 : large ? 15 : 12 }}>{day.month}</Text></View>
            <View style={{ flexDirection: native ? 'column' : 'row', alignItems: native ? 'flex-start' : 'center', gap: native ? 5 : 6, flexWrap: native ? 'nowrap' : 'wrap' }}>
              {!native ? <View style={{ width: large ? 24 : 18, height: 3, borderRadius: 2, backgroundColor: green }} /> : null}
              <Text style={{ color: green, fontSize: native ? 9.5 : large ? 13 : 10, lineHeight: native ? 14 : large ? 20 : 16, fontWeight: '600' }}>Posti disponibili</Text>
              {native ? <View style={{ width: 24, height: 3, borderRadius: 2, backgroundColor: green }} /> : null}
            </View>
          </Pressable>;
        })}
      </View>
      {!visible.length ? props.days.some(day => day.pending) ? <View accessibilityRole="progressbar" accessibilityLabel="Verifica delle prossime date disponibili" style={{ gap: 10 }}><SkeletonShimmer style={{ width: '100%', height: 100, borderRadius: 18 }} /><Text style={{ color: p.muted, fontSize: large ? 15 : 12 }}>Sto verificando le prossime date con posti liberi.</Text></View> : <Text style={{ color: p.muted, fontSize: large ? 15 : 12, lineHeight: 23 }}>Non ci sono date con posti liberi da proporre. Apri il calendario per consultare gli altri giorni e gli avvisi.</Text> : null}
      {available.length > visibleDateCount ? <Pressable accessibilityRole="button" accessibilityLabel="Mostra altre date disponibili" onPress={() => { setDateCount(value => (native ? Math.max(value, initialDateCount) : value) + (native ? nativeGrid.batchSize : large ? 9 : 6)); const next = available[visibleDateCount]; if (next) props.onPrepareDate(next.value); }} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}><Text style={{ color: p.ink, fontSize: large ? 14 : 11 }}>Mostra altre date disponibili</Text><Ionicons name="chevron-down" size={15} color={p.muted} /></Pressable> : null}
      <JourneySelectedDate {...props} />
    </>}
  </View>;
}

function JourneyCalendar(props: ClientBookingJourneyProps) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  const first = props.days[0]?.value || props.date || new Date().toISOString().slice(0, 10);
  const last = props.days[props.days.length - 1]?.value || first;
  const [visibleMonth, setVisibleMonth] = useState(bookingMonthKey(props.dateConfirmed ? props.date : first));
  const month = visibleMonth < bookingMonthKey(first) ? bookingMonthKey(first) : visibleMonth > bookingMonthKey(last) ? bookingMonthKey(last) : visibleMonth;
  const cells = useMemo(() => bookingCalendarCells(props.days, month), [props.days, month]);
  const changeMonth = (offset: number) => {
    const next = bookingMonthShift(month, offset);
    setVisibleMonth(next);
    const pending = props.days.find(day => day.value.startsWith(next) && day.pending) || props.days.find(day => day.value.startsWith(next));
    if (pending) props.onPrepareDate(pending.value);
  };
  return <View style={{ gap: 15 }}>
    <View style={{ borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, borderRadius: 19, padding: large ? 20 : 12, gap: large ? 18 : 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <Text style={{ flex: 1, minWidth: 0, color: p.ink, fontSize: large ? 22 : 16, lineHeight: large ? 32 : 24, fontWeight: '600', paddingLeft: 3 }}>{sentence(new Date(`${month}-01T12:00:00`).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }))}</Text>
        {[-1, 1].map(offset => {
          const disabled = offset < 0 ? month <= bookingMonthKey(first) : month >= bookingMonthKey(last);
          return <Pressable key={offset} accessibilityRole="button" accessibilityLabel={offset < 0 ? 'Mese precedente' : 'Mese successivo'} accessibilityState={{ disabled }} disabled={disabled} onPress={() => changeMonth(offset)} style={{ width: 36, minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? .25 : 1 }}><Ionicons name={offset < 0 ? 'chevron-back' : 'chevron-forward'} size={17} color={p.ink} /></Pressable>;
        })}
      </View>
      <View style={{ flexDirection: 'row' }}>{['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((day, index) => <Text key={index} style={{ width: '14.285714%', color: p.muted, fontSize: large ? 14 : 10, lineHeight: large ? 22 : 18, textAlign: 'center' }}>{day}</Text>)}</View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((cell, index) => {
          if (!cell) return <View key={`blank-${index}`} style={{ width: '14.285714%', minHeight: large ? 59 : 36 }} />;
          const day = cell.day;
          const selected = props.dateConfirmed && props.date === cell.value;
          const disabled = !day || day.disabled;
          return <Pressable key={cell.value} accessibilityRole="button" accessibilityLabel={day ? `${day.label}, ${day.status}` : `${cell.number}, fuori dalla finestra di prenotazione`} accessibilityState={{ selected, disabled, busy: day?.pending || false }} disabled={disabled} onPress={() => props.onDate(cell.value)}
            style={{ width: '14.285714%', minHeight: large ? 59 : 36, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ minWidth: large ? 46 : 32, minHeight: large ? 46 : 34, paddingHorizontal: 3, borderRadius: large ? 24 : 18, backgroundColor: selected ? p.action : 'transparent', justifyContent: 'center', alignItems: 'center', opacity: disabled && !selected ? .4 : 1 }}>
              <Text style={{ color: selected ? p.actionText : p.ink, fontSize: large ? 19 : 13, lineHeight: large ? 29 : 20, fontWeight: selected ? '600' : '400', textDecorationLine: day?.status === 'Chiuso' ? 'line-through' : 'none' }}>{cell.number}</Text>
              {day && !disabled && day.status === 'Disponibile' ? <View style={{ position: 'absolute', bottom: 1, width: large ? 24 : 17, height: 3, borderRadius: 2, backgroundColor: selected ? p.night ? '#2E6B40' : '#A3DCAE' : p.night ? '#8FD4A2' : '#387849' }} /> : null}
              {day?.pending ? <View style={{ position: 'absolute', bottom: 0, width: 8, height: 2, borderRadius: 1, backgroundColor: p.muted }} /> : null}
            </View>
          </Pressable>;
        })}
      </View>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><View style={{ width: 20, height: 3, borderRadius: 2, backgroundColor: p.night ? '#8FD4A2' : '#387849' }} /><Text style={{ color: p.muted, fontSize: large ? 13 : 10, lineHeight: 19 }}>Posti disponibili</Text></View><Text style={{ color: p.muted, fontSize: large ? 13 : 10, lineHeight: 19 }}>Data barrata: salone chiuso</Text>{props.days.some(day => day.pending) ? <Text style={{ color: p.muted, fontSize: large ? 13 : 10, lineHeight: 19 }}>Verifica disponibilità in corso</Text> : null}</View>
    <JourneySelectedDate {...props} />
  </View>;
}

function JourneyRoute({ phase, linkedServiceNames }: Pick<ClientBookingJourneyProps, 'phase' | 'linkedServiceNames'>) {
  const { palette: p } = useAccessAppearance();
  if (!phase && !linkedServiceNames?.length) return null;
  const rows = phase ? [
    { icon: 'cut-outline' as const, text: `${phase.initialLabel || 'Lavorazione'} · ${phase.initialDurationMinutes} min` },
    ...(phase.processingDurationMinutes ? [{ icon: 'hourglass-outline' as const, text: `${phase.processingLabel || 'Posa'} · ${phase.processingDurationMinutes} min` }] : []),
    ...(phase.finalPhaseEnabled !== false && phase.finalDurationMinutes ? [{ icon: 'cut-outline' as const, text: `${phase.finalServiceName || 'Fase finale'} · ${phase.finalDurationMinutes} min` }] : []),
  ] : [];
  return <View style={{ gap: 9 }}>
    {rows.map((row, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name={row.icon} size={15} color={p.muted} /><Text style={{ flex: 1, color: p.muted, fontSize: 11, lineHeight: 18 }}>{row.text}</Text></View>)}
    {linkedServiceNames?.length ? <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}><Ionicons name="link-outline" size={15} color={p.muted} /><Text style={{ flex: 1, color: p.muted, fontSize: 11, lineHeight: 18 }}>Servizi collegati: {linkedServiceNames.join(', ')}</Text></View> : null}
  </View>;
}

function JourneyContext(props: ClientBookingJourneyProps) {
  const { palette: p } = useAccessAppearance();
  const operator = props.pages[props.page].key === 'operator';
  return <View style={{ padding: 14, borderRadius: 18, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 43, height: 43, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.field, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={operator ? 'calendar-outline' : 'cut-outline'} size={21} color={p.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: p.ink, fontSize: 13, lineHeight: 20, fontWeight: '600' }}>{operator ? dateText(props.date) : props.serviceName}</Text><Text style={{ color: p.muted, fontSize: 11, lineHeight: 17 }}>{operator ? `${props.serviceName} · ${props.duration}` : `${props.duration}${props.operatorName ? ` · ${props.operatorName}` : ''}`}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Modifica il servizio" onPress={() => props.onPage(0)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: p.muted, fontSize: 10 }}>Modifica</Text></Pressable>
    </View>
    {props.phase || props.linkedServiceNames?.length ? <JourneyRoute phase={props.phase} linkedServiceNames={props.linkedServiceNames} /> : null}
  </View>;
}

/** The approved visual system. The caller continues to own all booking rules and callbacks. */
export function ClientBookingJourney(props: ClientBookingJourneyProps) {
  const noteRef = useRef<TextInput | null>(null);
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  const [expandedPeriods, setExpandedPeriods] = useState<string[]>([]);
  const [showWaitlistChoices, setShowWaitlistChoices] = useState(false);
  const [showNote, setShowNote] = useState(Boolean(props.note));
  const current = props.pages[props.page];
  const periods = useMemo(() => bookingTimePeriods(props.recommended, props.additional), [props.recommended, props.additional]);
  const muted = { color: p.muted, fontSize: large ? 14 : 11.5, lineHeight: large ? 22 : 18 } as const;
  const readingSurface = p.night ? 'rgba(29,33,36,.96)' : 'rgba(255,255,255,.96)';
  const includedSurface: ViewStyle = { padding: 15, borderRadius: 17, borderWidth: 1, backgroundColor: p.night ? 'rgba(132,186,149,.12)' : 'rgba(214,236,219,.64)', borderColor: p.night ? 'rgba(151,197,165,.32)' : 'rgba(112,161,125,.38)' };
  const choice = (selected: boolean): ViewStyle => ({ backgroundColor: p.surface, borderWidth: 1, borderColor: selected ? p.action : p.border, borderRadius: 18 });
  const moreButton = (text: string, onPress: () => void, expanded = false) => <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={onPress} style={{ minHeight: 44, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}><Text style={{ ...muted, color: p.ink }}>{text}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={p.muted} /></Pressable>;
  const titles: Record<string, [string, string]> = {
    service: ['Scegli il servizio', 'Scegli come prenderti cura di te.'],
    day: ['Scegli il giorno', 'Ti proponiamo le prossime date con posti liberi.'],
    operator: ['Scegli l’operatore', 'Affidati a chi preferisci.'],
    time: ['Scegli l’orario', dateText(props.date)],
    review: ['Il tuo appuntamento', 'Controlla i dettagli prima di inviare.'],
  };
  const [heading, subtitle] = titles[current.key] || titles.review;
  const renderOperator = (operator: JourneyOperator | null) => {
    const selected = operator ? props.operatorId === operator.id : props.automaticSelected;
    const name = operator?.name || 'Qualsiasi operatore';
    return <Pressable key={operator?.id || 'automatic'} accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ checked: selected }} onPress={() => props.onOperator(operator)} style={({ pressed }) => [choice(selected), { padding: 15, minHeight: large ? 108 : 88, flexDirection: 'row', alignItems: 'center', gap: 13, opacity: pressed ? .75 : 1 }]}>
      {operator?.photo ? <Image source={{ uri: operator.photo }} style={{ width: 46, height: 46, borderRadius: 23 }} /> : <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 1, borderColor: p.border, backgroundColor: p.field, alignItems: 'center', justifyContent: 'center' }}>{operator ? <Text style={{ color: p.ink, fontSize: 14, fontWeight: '500' }}>{operator.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('')}</Text> : <Ionicons name="people-outline" size={23} color={p.muted} />}</View>}
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: p.ink, fontSize: large ? 18 : 14, lineHeight: large ? 27 : 21, fontWeight: '600' }}>{name}</Text><Text style={muted}>{operator?.role || (operator ? 'Operatore del salone' : 'Il salone assegna un operatore disponibile.')}</Text></View>
      <Ionicons name={selected ? 'checkmark-circle' : 'ellipse-outline'} size={21} color={selected ? p.action : p.muted} />
    </Pressable>;
  };
  return <View {...(Platform.OS === 'web' ? { dataSet: { clientBookingJourney: 'true', bookingStep: current.key } } : {})} style={{ width: '100%', minWidth: 0, maxWidth: 1100, alignSelf: 'center', gap: 16 }}>
    {!props.hideProgress ? <ClientBookingProgress {...props} /> : null}
    <View style={{ gap: 5, marginBottom: 1 }}><Text accessibilityRole="header" style={{ fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', color: p.ink, fontSize: large ? 38 : width < 360 ? 28 : 31, lineHeight: large ? 48 : 39, fontWeight: '400' }}>{heading}</Text><Text style={{ ...muted, fontSize: large ? 15 : 12, lineHeight: large ? 23 : 18 }}>{subtitle}</Text></View>
    {current.key === 'service' ? <>
      {props.filters.length > 1 ? <View {...(Platform.OS === 'web' ? { dataSet: { clientReadingControl: 'true' } } : {})} style={{ backgroundColor: readingSurface, borderWidth: 1, borderColor: p.border, borderRadius: 14, padding: 4 }}><ScrollView horizontal nestedScrollEnabled directionalLockEnabled onTouchStart={props.onHorizontalStart} onTouchEnd={props.onHorizontalEnd} onTouchCancel={props.onHorizontalEnd} showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, width: '100%' }} contentContainerStyle={{ minWidth: '100%', gap: 4 }}>
        {props.filters.map(filter => <Pressable key={filter.key || 'all'} accessibilityRole="button" accessibilityLabel={`${filter.label}, ${filter.count} servizi`} accessibilityState={{ selected: filter.key === props.filter }} onPress={() => props.onFilter(filter.key)} style={{ minHeight: large ? 46 : Platform.OS !== 'web' ? 44 : 36, flexGrow: 1, flexShrink: 0, borderRadius: 11, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, backgroundColor: filter.key === props.filter ? p.action : 'transparent' }}><Text style={{ color: filter.key === props.filter ? p.actionText : p.muted, fontSize: large || Platform.OS !== 'web' ? 14 : 11, ...(Platform.OS !== 'web' ? { lineHeight: 21, fontWeight: filter.key === props.filter ? '600' : '500' } : {}) }}>{filter.label}</Text><Text style={{ color: filter.key === props.filter ? p.actionText : p.muted, fontSize: large || Platform.OS !== 'web' ? 12 : 9, ...(Platform.OS !== 'web' ? { lineHeight: 18, fontWeight: '500' } : {}) }}>{filter.count}</Text></Pressable>)}
      </ScrollView></View> : null}
      <View accessibilityRole="radiogroup" accessibilityLabel="Servizi del salone" style={{ gap: large ? 10 : 6 }}>{props.services}</View>
      {props.hasMoreServices ? moreButton(props.expandedServices ? 'Mostra meno servizi' : 'Mostra tutti i servizi', props.onExpandServices, props.expandedServices) : null}
      {props.dependencyRequired ? <View nativeID="booking-linked-services" style={{ padding: 15, borderRadius: 18, borderWidth: 1, borderColor: p.action, backgroundColor: p.surface, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="link-outline" size={18} color={p.ink} /><Text style={{ flex: 1, color: p.ink, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>Completa il servizio</Text></View>
        <Text style={muted}>Scegli l’abbinamento richiesto dal salone. Il totale e la durata comprendono il percorso scelto.</Text>
        {props.dependencies}
      </View> : null}
      {props.automaticDependency || props.phase || props.linkedServiceNames?.length ? <View key={props.serviceSelectionKey ?? props.serviceName}
        {...(Platform.OS === 'web' ? { dataSet: { bookingIncludedServices: props.automaticDependency ? 'true' : 'false' } } : {})}
        onLayout={props.automaticDependency ? event => props.onIncludedServicesLayout?.(event.nativeEvent.layout.y, event.nativeEvent.layout.height) : undefined}
        accessibilityLiveRegion="polite" style={{ gap: 12 }}>
        {props.automaticDependency ? <View style={[includedSurface, { gap: 5 }]}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Ionicons name="checkmark-circle-outline" size={17} color={p.night ? '#AED3B8' : '#50745B'} /><Text style={{ color: p.ink, fontSize: 13, lineHeight: 20, fontWeight: '500' }}>Abbinamento incluso</Text></View><Text style={muted}>{props.automaticDependency}</Text></View> : null}
        {props.phase || props.linkedServiceNames?.length ? <View style={[props.automaticDependency ? includedSurface : { padding: 15, borderRadius: 17, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border }, { gap: 12 }]}><Text style={{ color: p.ink, fontSize: 13, fontWeight: '500' }}>Il percorso del servizio</Text><JourneyRoute phase={props.phase} linkedServiceNames={props.linkedServiceNames} /></View> : null}
      </View> : null}
      {props.contact}
    </> : current.key === 'day' ? <>
      {props.dayError ? <View style={{ gap: 6 }}><Text accessibilityRole="alert" style={muted}>Non riesco a verificare i giorni disponibili. Controlla la connessione e riprova.</Text>{props.onRetryDays ? moreButton('Riprova disponibilità giorni', props.onRetryDays) : null}</View> : null}
      <JourneyDateOptions {...props} />
      {props.days.some(day => day.status === 'Completo') ? <Text style={muted}>Puoi consultare anche i giorni completi per chiedere un avviso se si libera un posto.</Text> : null}
    </> : current.key === 'operator' ? <>
      <JourneyContext {...props} />
      <View accessibilityRole="radiogroup" accessibilityLabel="Operatore" style={{ gap: 12 }}>{props.automaticAvailable ? renderOperator(null) : null}{props.operators.map(renderOperator)}</View>
      {!props.operators.length && !props.automaticAvailable ? <Text style={muted}>Nessun operatore disponibile. Scegli un altro giorno o servizio.</Text> : <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}><Ionicons name="information-circle-outline" size={16} color={p.muted} /><Text style={{ ...muted, flex: 1 }}>Vedrai solo gli orari disponibili per l’operatore scelto.</Text></View>}
    </> : current.key === 'time' ? <>
      <JourneyContext {...props} />
      {props.loadingTimes ? <View accessibilityRole="progressbar" accessibilityLabel="Caricamento orari disponibili" accessibilityState={{ busy: true }} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{[0, 1, 2, 3, 4, 5].map(index => <SkeletonShimmer key={index} style={{ width: '31%', height: 48, borderRadius: 13 }} />)}</View> : <>
        {props.timeError ? <View style={{ gap: 8 }}><Text accessibilityRole="alert" style={muted}>Non riesco a verificare gli orari. Riprova tra poco.</Text>{moreButton('Riprova disponibilità', props.onRetryTimes)}</View> : null}
        {periods.map(period => {
          const expanded = expandedPeriods.includes(period.key);
          const selectedIndex = period.items.findIndex(item => item.value === props.time);
          const visible = expanded ? period.items : period.items.filter((_, index) => index < 6 || index === selectedIndex);
          const availableCount = period.items.filter(item => !item.disabled).length;
          return <View key={period.key} style={{ gap: 13 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><Text style={{ flex: 1, color: p.ink, fontSize: 14, lineHeight: 22, fontWeight: '500' }}>{period.label}</Text><View {...(Platform.OS === 'web' ? { dataSet: { clientReadingCounter: 'true' } } : {})} style={{ borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: readingSurface }}><Text style={{ ...muted, fontSize: large ? 12 : 10 }}>{availableCount} {availableCount === 1 ? 'orario disponibile' : 'orari disponibili'}</Text></View></View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9 }}>{visible.map(item => <ClientTimeChoice key={item.value} label={item.value} selected={item.value === props.time} disabled={item.disabled} hint={item.hint} width={width >= 1000 ? '23.5%' : '31%'} onPress={() => props.onTime(item.value)} />)}</View>
            {period.items.length > 6 ? moreButton(expanded ? 'Mostra meno orari' : 'Mostra tutti gli orari', () => setExpandedPeriods(values => values.includes(period.key) ? values.filter(value => value !== period.key) : [...values, period.key]), expanded) : null}
          </View>;
        })}
        {!periods.length && !props.timeError ? <Text style={muted}>Non ci sono orari prenotabili per questa scelta. {props.waitlistChoices?.length ? 'Puoi cambiare giorno oppure chiedere un avviso.' : 'Prova un altro giorno o un altro operatore.'}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={props.waitlistChoices?.length ? { expanded: showWaitlistChoices } : undefined} onPress={() => props.waitlistChoices?.length ? setShowWaitlistChoices(value => !value) : props.onWaitlist()} style={{ padding: 15, backgroundColor: p.field, borderWidth: 1, borderColor: p.border, borderRadius: 17, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Ionicons name="notifications-outline" size={21} color={p.muted} /><View style={{ flex: 1, gap: 5 }}><Text style={{ color: p.ink, fontSize: 12, lineHeight: 19, fontWeight: '500' }}>Non trovi il tuo orario?</Text><Text style={{ ...muted, fontSize: 11 }}>{props.waitlistChoices?.length ? 'Avvisami se si libera un posto' : 'Gestisci i tuoi avvisi'}</Text></View><Ionicons name={showWaitlistChoices ? 'chevron-up' : 'chevron-forward'} size={16} color={p.muted} />
        </Pressable>
        {showWaitlistChoices && props.waitlistChoices?.length ? <View style={{ gap: 9 }}>{Platform.OS !== 'web' ? <ClientBookingWaitlistChoices choices={props.waitlistChoices} /> : props.waitlistChoices.map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityLabel={`${item.label}, ${item.active ? 'avviso attivo' : 'attiva avviso'}`} accessibilityState={{ disabled: item.busy || item.active, busy: item.busy }} disabled={item.busy || item.active} onPress={item.onPress} style={[choice(item.active), { minHeight: 58, padding: 13, gap: 4, opacity: item.busy ? .5 : 1 }]}><Text style={{ color: p.ink, fontSize: 13, fontWeight: '500' }}>{item.label}{item.active ? ' · Attivo' : ''}</Text><Text style={muted}>{item.busy ? 'Attivazione…' : item.hint}</Text></Pressable>)}{moreButton('Gestisci gli avvisi attivi', props.onWaitlist)}</View> : null}
      </>}
    </> : <>
      {props.paymentHold || <>
        {!props.noteEditing ? <View style={{ padding: 16, borderRadius: 19, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View style={{ minWidth: 61, minHeight: 65, padding: 8, borderRadius: 14, backgroundColor: p.field, borderWidth: 1, borderColor: p.border, alignItems: 'center', justifyContent: 'center', gap: 4 }}><Text style={{ color: p.muted, fontSize: 10, lineHeight: 15 }}>{props.date ? new Date(`${props.date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short' }).toUpperCase() : ''}</Text><Text style={{ color: p.ink, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: 29, lineHeight: 33 }}>{props.date ? Number(props.date.slice(-2)) : ''}</Text></View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}><Text style={{ color: p.ink, fontSize: 14, lineHeight: 21, fontWeight: '500' }}>{dateText(props.date)}</Text><Text style={muted}>{props.time} · {props.duration}</Text></View>
          </View>
          <View style={{ height: 1, backgroundColor: p.line }} />
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}><Text style={{ flex: 1, minWidth: 0, color: p.ink, fontSize: 16, lineHeight: 24, fontWeight: '500' }}>{props.serviceName}</Text><Text style={{ color: p.ink, fontSize: 15, lineHeight: 24, fontWeight: '600' }}>{money(props.total)}</Text></View>
          <JourneyRoute phase={props.phase} linkedServiceNames={props.linkedServiceNames} />
          {props.operatorName ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="person-outline" size={17} color={p.muted} /><Text style={{ ...muted, flex: 1, color: p.ink }}>{props.operatorName}</Text></View> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><Ionicons name="person-outline" size={17} color={p.muted} /><Text style={{ ...muted, flex: 1, color: p.ink }}>{props.customerName}</Text><Text style={{ ...muted, fontSize: 10 }}>Cliente</Text></View>
          <View style={{ borderTopWidth: 1, borderTopColor: p.line }}>{moreButton('Modifica i dettagli', () => props.onPage(0))}</View>
        </View> : null}
        <View style={{ backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, borderRadius: 18, paddingHorizontal: 15 }}>
          {props.reviewBenefits}
          {props.reviewBenefits ? <View style={{ height: 1, backgroundColor: p.line }} /> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: showNote }} onPress={() => setShowNote(value => !value)} style={{ minHeight: 51, flexDirection: 'row', alignItems: 'center', gap: 11 }}><Ionicons name="create-outline" size={19} color={p.muted} /><Text style={{ flex: 1, color: p.ink, fontSize: 12 }}>Nota per il salone</Text><Ionicons name={showNote ? 'chevron-up' : 'chevron-forward'} size={15} color={p.muted} /></Pressable>
          {showNote ? <TextInput ref={noteRef} onFocus={() => { if (noteRef.current) props.onNoteFocus?.(noteRef.current); }} onBlur={props.onNoteBlur} accessibilityLabel="Nota per il salone" value={props.note} onChangeText={props.onNote} placeholder="Vuoi aggiungere qualcosa?" placeholderTextColor={p.muted} multiline style={{ minHeight: 90, marginBottom: 14, textAlignVertical: 'top', borderRadius: 13, padding: 12, fontSize: 14, lineHeight: 21, color: p.ink, backgroundColor: p.field, borderWidth: 1, borderColor: p.border }} /> : null}
          {props.reviewPayment ? <View style={{ height: 1, backgroundColor: p.line }} /> : null}
          {props.reviewPayment}
        </View>
        {props.reviewPackages}
        <View style={{ gap: 12 }}>{props.reviewExtras}</View>
        {props.blockedReason && !props.canSubmit ? <Text accessibilityLiveRegion="polite" style={{ ...muted, color: p.night ? '#E4B5B9' : '#963F4A' }}>{props.blockedReason}</Text> : null}
      </>}
    </>}
  </View>;
}

export function ClientBookingJourneyDock(props: ClientBookingJourneyProps & { inline?: boolean }) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = Platform.OS === 'web' && width >= 1000;
  const current = props.pages[props.page];
  const last = props.page === props.pages.length - 1;
  if (props.paymentHold) return null;
  return <View {...(Platform.OS === 'web' ? { dataSet: { bookingDock: 'true' } } : {})} pointerEvents="box-none" style={props.inline ? { width: '100%' } : { position: Platform.OS === 'web' ? 'fixed' : 'absolute', left: desktop ? 256 : 12, right: desktop ? 32 : 12, bottom: desktop ? 18 : 84 + (Platform.OS === 'web' ? 0 : Math.max(insets.bottom, 8)), zIndex: 245 } as ViewStyle}>
    <View style={{ width: '100%', minHeight: desktop ? 90 : 76, maxWidth: 1100, alignSelf: 'center', backgroundColor: Platform.OS !== 'web' ? p.night ? '#1D2326' : '#F8F5EF' : p.night ? 'rgba(25,29,32,.94)' : 'rgba(250,247,241,.92)', borderWidth: 1, borderColor: p.border, borderRadius: 21, padding: 11, flexDirection: 'row', alignItems: 'center', gap: width < 360 ? 8 : 12 }}>
      {props.page > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Indietro" onPress={() => props.onPage(props.page - 1)} style={{ width: 39, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: p.border, backgroundColor: p.field, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={18} color={p.ink} /></Pressable> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: p.muted, fontSize: 10, lineHeight: 16 }}>{props.dependencyRequired && !current.complete && current.key === 'service' ? 'Completa l’abbinamento' : props.serviceName ? 'Totale' : 'Scegli un servizio'}</Text>{props.serviceName ? <Text style={{ color: p.ink, fontWeight: '600', fontSize: desktop ? 25 : width < 360 ? 16 : 19, lineHeight: 25 }}>{money(props.total)}</Text> : null}</View>
      <Pressable accessibilityRole="button" accessibilityLabel={last ? props.submitLabel : 'Continua'} accessibilityState={{ disabled: last ? !props.canSubmit : !current.complete, busy: last && props.submitting }} disabled={last ? !props.canSubmit : !current.complete} onPress={() => { if (!props.submitting) { if (last) props.onSubmit(); else props.onPage(props.page + 1); } }} style={{ minHeight: desktop ? 56 : 46, minWidth: desktop ? 165 : width < 360 ? 95 : 120, maxWidth: last ? '54%' : '46%', paddingVertical: 10, paddingHorizontal: width < 360 ? 10 : 16, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: p.action, opacity: (last ? props.canSubmit : current.complete) ? 1 : .4 }}><Text style={{ color: p.actionText, fontSize: desktop ? last ? 15 : 16 : last ? 11.7 : 13, lineHeight: 19, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>{props.submitting && last ? 'Invio…' : last ? props.submitLabel : 'Continua'}</Text>{!last ? <Ionicons name="chevron-forward" size={16} color={p.actionText} /> : null}</Pressable>
    </View>
  </View>;
}
