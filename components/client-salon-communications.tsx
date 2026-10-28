import React, { type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import type { PublicCustomerCommunication } from '../src/lib/customer-communications';
import { useAccessAppearance } from './access-premium';
import { ClientBookingText as Text } from './client-booking-text';
import { SkeletonShimmer } from './ui/skeleton-shimmer';
import { CLIENT_NOTIFICATION_RED, CLIENT_NOTIFICATION_ON_RED } from './client-notification-tone';

type Communication = PublicCustomerCommunication;
type ArchiveYear = { key: string; label: string; count: number; months: { key: string; label: string; items: Communication[] }[] };
type Props = {
  current: Communication[]; currentMonth: string; archive: ArchiveYear[]; unreadCount: number;
  loading: boolean; error: string; onRetry: () => void;
  archiveOpen: boolean; onArchive: (open: boolean) => void;
  openMonths: Record<string, boolean>; onMonth: (key: string, open: boolean) => void;
  expanded: Set<string>; onToggle: (item: Communication, open: boolean) => void;
  formatDate: (value: string) => string; renderPoster: (item: Communication) => ReactNode;
};

/** Customer reading surface. Fetching, grouping and read receipts remain with the screen. */
export function ClientSalonCommunications(props: Props) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const large = Platform.OS === 'web' && width >= 1000;
  const surface = p.night ? 'rgba(29,33,36,.96)' : 'rgba(255,255,255,.94)';
  const border = p.night ? p.border : 'rgba(109,108,104,.18)';
  const archiveCount = props.archive.reduce((total, year) => total + year.count, 0);
  const count = (value: number) => <Text style={{ color: p.muted, fontSize: 12 }}>{value > 99 ? '99+' : value}</Text>;
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerCommunications: 'true' } } : {})} style={{ width: '100%', maxWidth: 1100, alignSelf: 'center', gap: large ? 24 : 18 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
      <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: p.field, borderWidth: 1, borderColor: border, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="megaphone-outline" size={21} color={p.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={{ color: p.ink, fontSize: large ? 19 : 16, lineHeight: 25, fontWeight: '600' }}>Dal tuo salone</Text>
        <Text style={{ color: p.muted, fontSize: large ? 14 : 12, lineHeight: 21 }}>Avvisi, novità e messaggi per te.</Text>
      </View>
      {props.unreadCount > 0 ? <View accessibilityLabel={`${props.unreadCount} ${props.unreadCount === 1 ? 'comunicazione da leggere' : 'comunicazioni da leggere'}`} style={{ minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: 14, backgroundColor: CLIENT_NOTIFICATION_RED, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: CLIENT_NOTIFICATION_ON_RED, fontSize: 12, fontWeight: '600' }}>{props.unreadCount > 99 ? '99+' : props.unreadCount}</Text></View> : null}
    </View>
    <View {...(Platform.OS === 'web' ? { dataSet: { clientReadingControl: 'true' } } : {})} accessibilityRole="tablist" accessibilityLabel="Periodo comunicazioni" style={{ flexDirection: 'row', alignSelf: 'flex-start', padding: 4, borderRadius: 16, borderWidth: 1, borderColor: border, backgroundColor: surface, gap: 4, maxWidth: '100%' }}>
      {([{ label: 'Questo mese', active: !props.archiveOpen, value: props.current.length, archive: false }, { label: 'Archivio', active: props.archiveOpen, value: archiveCount, archive: true }]).map(tab => <Pressable key={tab.label} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: tab.active }} onPress={() => props.onArchive(tab.archive)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44, paddingHorizontal: large ? 19 : 13, borderRadius: 12, backgroundColor: tab.active ? p.surface : 'transparent', borderWidth: 1, borderColor: tab.active ? border : 'transparent', opacity: pressed ? .75 : 1 })}>
        <Text style={{ color: tab.active ? p.ink : p.muted, fontSize: large ? 14 : 12, fontWeight: tab.active ? '600' : '400' }}>{tab.label}</Text>{count(tab.value)}
      </Pressable>)}
    </View>
    {props.error ? <View accessibilityRole="alert" style={{ padding: 20, borderRadius: 20, borderWidth: 1, borderColor: border, backgroundColor: surface, gap: 14 }}>
      <Text style={{ color: p.ink, fontSize: 14, lineHeight: 23 }}>{props.error}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Riprova a caricare le comunicazioni" onPress={props.onRetry} style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 18, borderRadius: 13, backgroundColor: p.action, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: p.actionText, fontSize: 14, fontWeight: '600' }}>Riprova</Text></Pressable>
    </View> : props.loading && !props.current.length && !archiveCount ? <View accessibilityRole="progressbar" accessibilityLabel="Caricamento comunicazioni" style={{ gap: 12 }}>
      {[0, 1].map(index => <SkeletonShimmer key={index} style={{ height: 132, borderRadius: 20 }} />)}
    </View> : props.archiveOpen ? props.archive.length ? props.archive.map(year => <View key={year.key} style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: p.ink, fontSize: large ? 23 : 20, fontFamily: Platform.OS === 'android' ? 'serif' : 'Georgia' }}>{year.label}</Text>{count(year.count)}</View>
      {year.months.map(month => {
        const expanded = props.openMonths[month.key] ?? false;
        return <View key={month.key} style={{ gap: 12 }}>
          <Pressable {...(Platform.OS === 'web' ? { dataSet: { clientReadingControl: 'true' } } : {})} accessibilityRole="button" accessibilityLabel={`${expanded ? 'Chiudi' : 'Apri'} ${month.label} ${year.label}`} accessibilityState={{ expanded }} onPress={() => props.onMonth(month.key, !expanded)} style={({ pressed }) => ({ minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, borderRadius: 16, backgroundColor: surface, borderWidth: 1, borderColor: border, opacity: pressed ? .88 : 1 })}>
            <Ionicons name="calendar-outline" size={18} color={p.muted} /><Text style={{ flex: 1, color: p.ink, fontSize: 14, textTransform: 'capitalize' }}>{month.label}</Text>{count(month.items.length)}<Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={p.muted} />
          </Pressable>
          {expanded ? month.items.map(item => <CommunicationCard key={item.communicationId} item={item} expanded={props.expanded.has(item.communicationId)} onToggle={props.onToggle} formatDate={props.formatDate} renderPoster={props.renderPoster} large={large} />) : null}
        </View>;
      })}
    </View>) : <CommunicationEmpty title="L’archivio è ancora vuoto" body="Qui ritroverai le comunicazioni dei mesi precedenti." /> : <>
      <Text style={{ color: p.muted, fontSize: large ? 15 : 13, lineHeight: 22, textTransform: 'capitalize' }}>{props.currentMonth}</Text>
      {props.current.length ? props.current.map(item => <CommunicationCard key={item.communicationId} item={item} expanded={props.expanded.has(item.communicationId)} onToggle={props.onToggle} formatDate={props.formatDate} renderPoster={props.renderPoster} large={large} />) : <CommunicationEmpty title="Nessuna comunicazione questo mese" body="Quando il salone ti invia un messaggio, lo trovi qui." />}
    </>}
  </View>;
}

function CommunicationEmpty({ title, body }: { title: string; body: string }) {
  const { palette: p } = useAccessAppearance();
  return <View style={{ paddingVertical: 32, paddingHorizontal: 22, borderRadius: 20, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border, gap: 9 }}>
    <Ionicons name="mail-outline" size={25} color={p.muted} /><Text style={{ color: p.ink, fontSize: 17, lineHeight: 25, fontWeight: '600' }}>{title}</Text><Text style={{ color: p.muted, fontSize: 13, lineHeight: 22 }}>{body}</Text>
  </View>;
}

function CommunicationCard({ item, expanded, onToggle, formatDate, renderPoster, large }: {
  item: Communication; expanded: boolean; onToggle: Props['onToggle']; formatDate: Props['formatDate']; renderPoster: Props['renderPoster']; large: boolean;
}) {
  const { palette: p } = useAccessAppearance();
  const reminder = item.kind === 'late_reminder';
  const border = p.night ? p.border : 'rgba(109,108,104,.18)';
  return <View {...(Platform.OS === 'web' ? { dataSet: { customerCommunicationCard: item.communicationId, unreadCommunication: !item.readAt } } : {})}
    style={{ borderWidth: 1, borderColor: border, backgroundColor: p.night ? 'rgba(29,33,36,.96)' : 'rgba(255,255,255,.94)', borderRadius: 22, overflow: 'hidden' }}>
    <Pressable {...(Platform.OS === 'web' ? { dataSet: { clientReadingControl: 'true' } } : {})} accessibilityRole="button" accessibilityLabel={`${expanded ? 'Chiudi' : 'Apri'} comunicazione ${item.title}`} accessibilityState={{ expanded }} onPress={() => onToggle(item, !expanded)}
      style={({ pressed }) => ({ padding: large ? 24 : 18, flexDirection: 'row', alignItems: 'flex-start', gap: large ? 16 : 12, opacity: pressed ? .78 : 1 })}>
      <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: p.field, borderWidth: 1, borderColor: border }}><Ionicons name={reminder ? 'alarm-outline' : 'megaphone-outline'} size={19} color={p.muted} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}><Text style={{ color: p.muted, fontSize: 11.5, lineHeight: 18 }}>{reminder ? 'Promemoria' : 'Messaggio dal salone'}</Text>{!item.readAt ? <Text style={{ color: p.ink, fontSize: 11.5, lineHeight: 18, fontWeight: '600' }}>Da leggere</Text> : null}</View>
        <Text style={{ color: p.ink, fontSize: large ? 21 : 18, lineHeight: large ? 30 : 27, fontWeight: '600' }}>{item.title}</Text>
        <Text style={{ color: p.muted, fontSize: 12, lineHeight: 20 }}>{formatDate(item.createdAt)}</Text>
        {!expanded ? <Text numberOfLines={2} style={{ color: p.muted, fontSize: large ? 14 : 13, lineHeight: 22 }}>{item.body}</Text> : null}
      </View>
      <View style={{ minHeight: 38, justifyContent: 'center' }}><Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={p.muted} /></View>
    </Pressable>
    {expanded ? <View style={{ paddingHorizontal: large ? 24 : 18, paddingBottom: large ? 24 : 20, gap: 18 }}>
      <View style={{ height: 1, backgroundColor: p.line, opacity: .65 }} />
      <View style={{ flexDirection: large && item.imagePath ? 'row' : 'column', alignItems: 'flex-start', gap: 24 }}>
        {!!item.body && <Text selectable style={{ color: p.ink, flex: large && item.imagePath ? 1 : undefined, width: large && item.imagePath ? undefined : '100%', maxWidth: large && !item.imagePath ? 760 : undefined, minWidth: 0, fontSize: large ? 15 : 14, lineHeight: large ? 26 : 24 }}>{item.body}</Text>}
        {item.imagePath ? <View style={{ width: large && item.body ? '42%' : '100%', maxWidth: large ? 440 : undefined, alignSelf: item.body ? undefined : 'center' }}>{renderPoster(item)}</View> : null}
      </View>
    </View> : null}
  </View>;
}
