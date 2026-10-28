import React, { useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useAccessAppearance } from './access-premium';
import { ClientBookingText as Text } from './client-booking-text';
import { clientNotificationTone } from './client-notification-premium';
import { CLIENT_NOTIFICATION_RED, CLIENT_NOTIFICATION_ON_RED } from './client-notification-tone';
import { SkeletonShimmer } from './ui/skeleton-shimmer';

type ArchiveYear = { key: string; label: string; count: number; months: { key: string; label: string; count: number; cards: ReactNode[] }[] };
type Props = {
  available: ReactNode[]; active: ReactNode[]; archive: ArchiveYear[]; unreadCount: number;
  loading: boolean; error: string; onRetry: () => void; onBooking: () => void;
  archiveOpen: boolean; onArchive: (value: boolean) => void;
  openMonths: Record<string, boolean>; onMonth: (key: string, open: boolean) => void;
};

/** Presentation only: availability and subscription actions remain authoritative in the screen. */
export function ClientWaitlist(props: Props) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  const border = p.night ? p.border : 'rgba(109,108,104,.18)';
  const controlSurface = p.night ? 'rgba(29,33,36,.96)' : 'rgba(255,255,255,.96)';
  const count = props.available.length + props.active.length;
  const archivedCount = props.archive.reduce((total, year) => total + year.count, 0);
  const sectionHeading = (label: string, value: number, available = false) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
    {available ? <View style={{ width: 22, height: 3, borderRadius: 2, backgroundColor: p.night ? '#8FD4A2' : '#387849' }} /> : null}
    <Text style={{ color: p.ink, fontSize: large ? 20 : 17, lineHeight: 27, fontWeight: '600' }}>{label}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{value}</Text>
  </View>;
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerWaitlist: 'true' } } : {})} style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: large ? 24 : 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
      <View style={{ width: 44, height: 44, borderRadius: 15, borderWidth: 1, borderColor: border, backgroundColor: p.field, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="notifications-outline" size={21} color={p.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: p.ink, fontSize: large ? 19 : 16, lineHeight: 25, fontWeight: '600' }}>I tuoi avvisi</Text><Text style={{ color: p.muted, fontSize: large ? 14 : 12, lineHeight: 21 }}>Ti avvisiamo quando torna libero l’orario che cerchi.</Text></View>
      {props.unreadCount > 0 ? <View accessibilityLabel={`${props.unreadCount} ${props.unreadCount === 1 ? 'notifica di slot liberati da leggere' : 'notifiche di slot liberati da leggere'}`} style={{ minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: CLIENT_NOTIFICATION_RED, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: CLIENT_NOTIFICATION_ON_RED, fontSize: 12, fontWeight: '600' }}>{props.unreadCount > 99 ? '99+' : props.unreadCount}</Text></View> : null}
    </View>
    <View {...(Platform.OS === 'web' ? { dataSet: { clientReadingControl: 'true' } } : {})} accessibilityRole="tablist" accessibilityLabel="Avvisi slot liberati" style={{ flexDirection: 'row', alignSelf: 'flex-start', maxWidth: '100%', gap: 4, padding: 4, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: controlSurface }}>
      {[{ label: 'In corso', archive: false, count }, { label: 'Archivio', archive: true, count: archivedCount }].map(tab => <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: props.archiveOpen === tab.archive }} onPress={() => props.onArchive(tab.archive)} style={({ pressed }) => ({ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: large ? 19 : 13, borderRadius: 12, borderWidth: 1, borderColor: props.archiveOpen === tab.archive ? border : 'transparent', backgroundColor: props.archiveOpen === tab.archive ? p.surface : 'transparent', opacity: pressed ? .75 : 1 })}>
        <Text style={{ color: props.archiveOpen === tab.archive ? p.ink : p.muted, fontSize: large ? 14 : 12, fontWeight: props.archiveOpen === tab.archive ? '600' : '400' }}>{tab.label}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{tab.count > 99 ? '99+' : tab.count}</Text>
      </Pressable>)}
    </View>
    {!!props.error && <View accessibilityRole="alert" style={{ padding: 18, gap: 12, borderRadius: 18, borderWidth: 1, borderColor: border, backgroundColor: p.surface }}><Text style={{ color: p.ink, fontSize: 14, lineHeight: 23 }}>{props.error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Riprova a caricare gli avvisi" onPress={props.onRetry} style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 15, borderRadius: 12, backgroundColor: p.field, justifyContent: 'center' }}><Text style={{ color: p.ink, fontSize: 14 }}>Riprova</Text></Pressable></View>}
    {props.loading && !count && !archivedCount ? <View accessibilityRole="progressbar" accessibilityLabel="Caricamento avvisi slot liberati" style={{ gap: 12 }}>{[0, 1].map(index => <SkeletonShimmer key={index} style={{ height: 150, borderRadius: 20 }} />)}</View> : props.archiveOpen ? props.archive.length ? props.archive.map(year => <View key={year.key} style={{ gap: 16 }}>
      <Text style={{ color: p.ink, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia', fontSize: large ? 23 : 20 }}>{year.label}</Text>
      {year.months.map(month => {
        const expanded = props.openMonths[month.key] ?? false;
        const monthLabel = month.label.endsWith(year.label) ? month.label.slice(0, -year.label.length).trim() : month.label;
        return <View key={month.key} style={{ gap: 12 }}><Pressable {...(Platform.OS === 'web' ? { dataSet: { clientReadingControl: 'true' } } : {})} accessibilityRole="button" accessibilityLabel={`${expanded ? 'Chiudi' : 'Apri'} avvisi ${monthLabel} ${year.label}`} accessibilityState={{ expanded }} onPress={() => props.onMonth(month.key, !expanded)} style={({ pressed }) => ({ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: controlSurface, opacity: pressed ? .88 : 1 })}>
          <Ionicons name="calendar-outline" size={18} color={p.muted} /><Text style={{ flex: 1, color: p.ink, fontSize: 14, textTransform: 'capitalize' }}>{monthLabel}</Text><Text style={{ color: p.muted, fontSize: 12 }}>{month.count}</Text><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={p.muted} />
        </Pressable>{expanded ? month.cards : null}</View>;
      })}
    </View>) : <WaitlistEmpty archive /> : count ? <>
      {!!props.available.length && <View>{sectionHeading('Disponibili ora', props.available.length, true)}<View style={{ gap: 14 }}>{props.available}</View></View>}
      {!!props.active.length && <View>{sectionHeading('Avvisi attivi', props.active.length)}<View style={{ gap: 14 }}>{props.active}</View></View>}
    </> : !props.error ? <WaitlistEmpty onBooking={props.onBooking} /> : null}
  </View>;
}

function WaitlistEmpty({ archive = false, onBooking }: { archive?: boolean; onBooking?: () => void }) {
  const { palette: p } = useAccessAppearance();
  return <View style={{ padding: 24, borderRadius: 22, borderWidth: 1, borderColor: p.border, backgroundColor: p.surface, gap: 13 }}>
    <Ionicons name={archive ? 'archive-outline' : 'time-outline'} size={28} color={p.muted} />
    <Text style={{ color: p.ink, fontSize: 19, lineHeight: 28, fontWeight: '600' }}>{archive ? 'Nessun avviso archiviato' : 'Aspetti il tuo orario ideale?'}</Text>
    <Text style={{ maxWidth: 600, color: p.muted, fontSize: 14, lineHeight: 24 }}>{archive ? 'Gli avvisi conclusi rimangono qui, divisi per mese.' : 'Durante la prenotazione puoi attivare un avviso per un orario occupato. Se si libera, lo ritrovi qui.'}</Text>
    {onBooking ? <Pressable accessibilityRole="button" accessibilityLabel="Vai a Prenota per scegliere un servizio" onPress={onBooking} style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 10, minHeight: 46, paddingHorizontal: 18, borderRadius: 13, alignItems: 'center', backgroundColor: p.action }}><Text style={{ color: p.actionText, fontSize: 14, fontWeight: '600' }}>Vai a Prenota</Text><Ionicons name="chevron-forward" size={16} color={p.actionText} /></Pressable> : null}
  </View>;
}

export function ClientWaitlistAlert({ title, date, range, times, operator, status, statusLabel, archived, unread, busy, phased, onOpen, onDismiss }: {
  title: string; date: string; range?: string; times: string[]; operator: string; status: string; statusLabel: string;
  archived: boolean; unread: boolean; busy: boolean; phased?: boolean; onOpen: () => void; onDismiss?: () => void;
}) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  const [expandedTimes, setExpandedTimes] = useState(false);
  const available = !archived && status === 'notified';
  const tone = clientNotificationTone(p, archived ? 'archive' : available ? 'accepted' : 'pending');
  const badgeLabel = archived && statusLabel === 'Attivo' ? 'In attesa' : archived && statusLabel === 'Slot libero' ? 'Disponibilità segnalata' : statusLabel;
  const visibleTimes = expandedTimes ? times : times.slice(0, large ? 8 : 6);
  const remainingTimes = times.length - visibleTimes.length;
  const border = p.night ? p.border : 'rgba(109,108,104,.18)';
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerWaitlistCard: 'true', waitlistStatus: status } } : {})} style={{ padding: large ? 24 : 18, borderRadius: 22, borderWidth: 1, borderColor: border, backgroundColor: p.night ? 'rgba(29,33,36,.96)' : 'rgba(255,255,255,.94)', gap: 16 }}>
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: tone.soft }}><Ionicons name={archived ? 'archive-outline' : available ? 'time-outline' : 'notifications-outline'} size={20} color={tone.ink} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><Text style={{ alignSelf: 'flex-start', color: tone.ink, fontSize: 11.5, lineHeight: 18, paddingVertical: 3, paddingHorizontal: 9, borderRadius: 10, backgroundColor: tone.soft }}>{badgeLabel}</Text>{unread ? <Text style={{ color: p.muted, fontSize: 11.5, lineHeight: 18 }}>Da leggere</Text> : null}</View>
        <Text style={{ color: p.ink, fontSize: large ? 21 : 18, lineHeight: large ? 30 : 27, fontWeight: '600' }}>{title}</Text>
      </View>
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      {!!date && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Ionicons name="calendar-outline" size={17} color={p.muted} /><Text style={{ color: p.ink, fontSize: large ? 16 : 14, lineHeight: 24 }}>{date}</Text></View>}
      {!!range && <Text style={{ color: p.muted, fontSize: 13, lineHeight: 22 }}>{range}</Text>}
    </View>
    {(!range || available) && !!times.length && <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      {visibleTimes.map(time => <View key={time} style={{ paddingHorizontal: 13, minHeight: 36, justifyContent: 'center', borderRadius: 11, backgroundColor: p.field, borderWidth: 1, borderColor: border }}><Text style={{ color: p.ink, fontSize: large ? 16 : 14, fontWeight: '600' }}>{time}</Text></View>)}
      {remainingTimes > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Mostra tutti gli orari segnalati" onPress={() => setExpandedTimes(true)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}><Text style={{ color: p.ink, fontSize: 12 }}>Mostra {remainingTimes} {remainingTimes === 1 ? 'altro orario' : 'altri orari'}</Text></Pressable> : null}
    </View>}
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Ionicons name="person-outline" size={15} color={p.muted} /><Text style={{ color: p.muted, fontSize: 12, lineHeight: 21 }}>{operator || 'Assegnazione del salone'}</Text></View>{phased ? <Text style={{ color: p.muted, fontSize: 12, lineHeight: 21 }}>Percorso con più fasi</Text> : null}</View>
    {!archived && <>
      <View style={{ height: 1, backgroundColor: p.line, opacity: .65 }} />
      <Text style={{ maxWidth: 700, color: p.muted, fontSize: 13, lineHeight: 22 }}>{available ? 'È arrivata una disponibilità compatibile. Apri Prenota per verificarla e confermare.' : 'L’avviso è attivo. Ti aggiorniamo quando si libera un posto compatibile.'}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {available ? <Pressable accessibilityRole="button" accessibilityLabel="Apri lo slot disponibile in Prenota" onPress={onOpen} style={({ pressed }) => ({ minHeight: 46, paddingHorizontal: 18, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: p.action, opacity: pressed ? .75 : 1 })}><Text style={{ color: p.actionText, fontSize: 14, fontWeight: '600' }}>{times.length > 1 ? 'Vedi gli orari' : 'Scegli questo orario'}</Text><Ionicons name="chevron-forward" size={16} color={p.actionText} /></Pressable> : null}
        {onDismiss ? <Pressable accessibilityRole="button" accessibilityLabel={available ? 'Questo avviso non mi serve' : 'Disattiva questo avviso'} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={event => { event.stopPropagation(); onDismiss(); }} style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 14, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: border, backgroundColor: p.field, opacity: busy || pressed ? .65 : 1 })}>{busy ? <ActivityIndicator size="small" color={p.muted} /> : null}<Text style={{ color: p.ink, fontSize: 13 }}>{busy ? 'Aggiornamento…' : available ? 'Non mi serve' : 'Disattiva avviso'}</Text></Pressable> : null}
      </View>
    </>}
  </View>;
}
