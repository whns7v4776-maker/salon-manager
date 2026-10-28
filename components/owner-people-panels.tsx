import React from 'react';
import { Image, Platform, ScrollView, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { HapticTouchable } from './ui/haptic-touchable';

/** Body of the Home "Agenda operatori" and "Clienti del salone" sheets, shared by app and web. */

type Palette = ReturnType<typeof useAccessAppearance>['palette'];
const serif = Platform.OS === 'web' ? 'Georgia' : Platform.OS === 'ios' ? 'Georgia' : 'serif';
const oneLine = Platform.OS === 'web' ? ({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'normal' } as object) : {};
const WIDE = 860;

function tones(p: Palette) {
  return {
    avatar: p.night ? 'rgba(216,194,155,.14)' : 'rgba(232,222,205,.62)',
    sand: p.night ? 'rgba(216,194,155,.09)' : 'rgba(240,229,209,.58)',
    section: p.night ? 'rgba(255,255,255,.035)' : 'rgba(255,253,249,.62)',
    gold: p.night ? '#D8C29B' : '#8F6D3B',
    amber: p.night ? '#E3BD89' : '#7A5424',
    amberDot: p.night ? '#D9A55E' : '#C2873F',
    sage: p.night ? '#A9C8A4' : '#4F7A55',
    sageDot: p.night ? '#8DB389' : '#6F946A',
    bar: p.night ? 'rgba(216,194,155,.45)' : 'rgba(176,141,87,.42)',
  };
}

const initialsOf = (name: string) =>
  name.split(/[\s·-]+/).filter((part) => /[A-Za-zÀ-ÿ]/.test(part)).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || '·';

const dayFormatter = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const monthFormatter = new Intl.DateTimeFormat('it-IT', { month: 'short' });
/** Timeline dates arrive as dd/mm/yyyy; anything else is shown as-is. */
const parseItalianDate = (label?: string) => {
  const match = label?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12) : null;
};
const isoToDate = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : null);
const shortDay = (date: Date | null, fallback = '—') => (date ? dayFormatter.format(date).replace(/\./g, '') : fallback);
const euro = (value: number) => `€ ${Math.round(value).toLocaleString('it-IT')}`;

function Avatar({ name, photoUri, size = 40 }: { name: string; photoUri?: string | null; size?: number }) {
  const { palette: p } = useAccessAppearance();
  const t = tones(p);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: t.avatar, borderWidth: 1, borderColor: p.border, flexShrink: 0 }}>
      {photoUri ? <Image source={{ uri: photoUri }} style={{ width: size, height: size }} /> : <Text style={{ fontFamily: serif, fontSize: size * 0.36, color: p.ink, letterSpacing: 0.4 }}>{initialsOf(name)}</Text>}
    </View>
  );
}

function Dot({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: hollow ? 'transparent' : color, borderWidth: hollow ? 1.2 : 0, borderColor: color }} />;
}

function Chip({ label, count, active, onPress }: { label: string; count?: number; active: boolean; onPress: () => void }) {
  const { palette: p } = useAccessAppearance();
  return (
    <HapticTouchable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      pressScale={0.98}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: active ? p.action : p.border, backgroundColor: active ? p.action : p.field }}
    >
      <Text style={{ fontSize: 13, fontWeight: '500', color: active ? p.actionText : p.ink }}>{label}</Text>
      {count ? <Text style={{ fontSize: 12, fontWeight: '600', color: active ? p.actionText : p.muted, fontVariant: ['tabular-nums'] }}>{count}</Text> : null}
    </HapticTouchable>
  );
}

function Segmented<K extends string>({ options, value, onChange }: { options: { key: K; label: string; count?: number }[]; value: K; onChange: (key: K) => void }) {
  const { palette: p } = useAccessAppearance();
  return (
    <View style={{ flexDirection: 'row', padding: 3, gap: 2, borderRadius: 13, backgroundColor: p.field, borderWidth: 1, borderColor: p.border, alignSelf: 'flex-start' }}>
      {options.map((option) => {
        const active = option.key === value;
        return (
          <HapticTouchable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.key)}
            pressScale={0.98}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 12, borderRadius: 10, backgroundColor: active ? p.action : 'transparent' }}
          >
            <Text style={{ fontSize: 13, fontWeight: '500', color: active ? p.actionText : p.ink }}>{option.label}</Text>
            {option.count !== undefined ? <Text style={{ fontSize: 12, color: active ? p.actionText : p.muted, fontVariant: ['tabular-nums'] }}>{option.count}</Text> : null}
          </HapticTouchable>
        );
      })}
    </View>
  );
}

function Section({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { palette: p } = useAccessAppearance();
  return <View style={[{ borderRadius: 18, borderWidth: 1, borderColor: p.border, backgroundColor: tones(p).section, padding: 16 }, style]}>{children}</View>;
}

/* ───────────────────────────── Agenda operatori ───────────────────────────── */

export type AgendaEntry = { id: string; ora: string; title: string; subtitle: string; badge: string; tone: string };
export type AgendaOperator = { id: string; name: string; role: string; photoUri?: string | null; openTasks: number; nextTime: string | null; timeline: AgendaEntry[] };
export type AgendaPrintScope = 'day' | 'week' | 'month';

function entryTone(p: Palette, tone: string) {
  const t = tones(p);
  if (tone === 'done' || tone === 'cash') return { color: t.sage, dot: t.sageDot, hollow: false };
  if (tone === 'request') return { color: t.gold, dot: t.gold, hollow: true };
  if (tone === 'muted') return { color: p.muted, dot: p.muted, hollow: true };
  return { color: t.amber, dot: t.amberDot, hollow: false };
}

function operatorStatus(p: Palette, row: AgendaOperator) {
  const t = tones(p);
  if (row.nextTime) return { text: `Prossimo alle ${row.nextTime}`, color: p.ink, dot: t.gold, hollow: false };
  if (row.openTasks > 0) return { text: `${row.openTasks} da chiudere`, color: t.amber, dot: t.amberDot, hollow: false };
  return { text: 'Giornata chiusa', color: t.sage, dot: t.sageDot, hollow: false };
}

export function OperatorAgendaPanel({ operators, selectedId, onSelect, dateLabel, totalOpen, totalRequests, scope, onScope, onPdf, onPrint, exportBusy, bottomInset = 0 }: {
  operators: AgendaOperator[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  dateLabel: string;
  totalOpen: number;
  totalRequests: number;
  scope: AgendaPrintScope;
  onScope: (scope: AgendaPrintScope) => void;
  onPdf: () => void;
  onPrint?: () => void;
  exportBusy: boolean;
  bottomInset?: number;
}) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const visible = selectedId ? operators.filter((row) => row.id === selectedId) : operators;
  const busy = visible.filter((row) => row.timeline.length > 0);
  const free = visible.filter((row) => row.timeline.length === 0);

  const exportButton = (label: string, icon: React.ComponentProps<typeof Ionicons>['name'], action: () => void) => (
    <HapticTouchable
      accessibilityRole="button"
      onPress={action}
      disabled={exportBusy}
      pressScale={0.98}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: p.border, backgroundColor: p.field, opacity: exportBusy ? 0.5 : 1 }}
    >
      <Ionicons name={icon} size={16} color={p.ink} />
      <Text style={{ fontSize: 13, fontWeight: '500', color: p.ink }}>{label}</Text>
    </HapticTouchable>
  );

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 14, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: p.ink, textTransform: 'capitalize' }}>{dateLabel}</Text>
          <Text style={{ fontSize: 13, color: p.muted }}>{`${totalOpen} da fare · ${totalRequests} ${totalRequests === 1 ? 'richiesta' : 'richieste'} in attesa`}</Text>
        </View>

        {operators.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 8 }}>
            <Chip label="Tutti" active={!selectedId} onPress={() => onSelect(null)} />
            {operators.map((row) => <Chip key={row.id} label={row.name} count={row.openTasks || undefined} active={selectedId === row.id} onPress={() => onSelect(row.id)} />)}
          </ScrollView>
        ) : null}

        {operators.length === 0 ? (
          <Section><Text style={{ fontSize: 14, lineHeight: 20, color: p.muted }}>Nessun operatore configurato. Aggiungili da Servizi per vedere qui il loro lavoro di oggi.</Text></Section>
        ) : null}

        <View style={wide ? { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' } : { gap: 14 }}>
          {busy.map((row) => {
            const status = operatorStatus(p, row);
            return (
              <Section key={row.id} style={wide ? { flexBasis: busy.length > 1 ? '47%' : '100%', flexGrow: 1, minWidth: 0 } : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                  <Avatar name={row.name} photoUri={row.photoUri} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[{ fontFamily: serif, fontSize: 19, lineHeight: 24, color: p.ink }, oneLine]}>{row.name}</Text>
                    {row.role ? <Text numberOfLines={1} style={[{ fontSize: 12, lineHeight: 17, color: p.muted }, oneLine]}>{row.role}</Text> : null}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <Dot color={status.dot} hollow={status.hollow} />
                    <Text style={{ fontSize: 13, fontWeight: '500', color: status.color, fontVariant: ['tabular-nums'] }}>{status.text}</Text>
                  </View>
                </View>
                {row.timeline.map((entry) => {
                  const tone = entryTone(p, entry.tone);
                  return (
                    <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, borderTopWidth: 1, borderTopColor: p.line }}>
                      <Text style={{ width: 48, fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink, fontVariant: ['tabular-nums'] }}>{entry.ora}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={[{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink }, oneLine]}>{entry.title}</Text>
                        <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: p.muted }}>{entry.subtitle}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2, flexShrink: 0 }}>
                        <Dot color={tone.dot} hollow={tone.hollow} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: tone.color }}>{entry.badge}</Text>
                      </View>
                    </View>
                  );
                })}
              </Section>
            );
          })}
        </View>

        {free.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 }}>
            <Dot color={p.muted} hollow />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 19, color: p.muted }}>
              {free.length === visible.length && selectedId ? 'Agenda libera oggi: nessun appuntamento o richiesta assegnata.' : `Agenda libera oggi: ${free.map((row) => row.name).join(', ')}`}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 12 + bottomInset, borderTopWidth: 1, borderTopColor: p.line }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: p.muted, marginRight: 2 }}>Report</Text>
        <Segmented options={[{ key: 'day', label: 'Giorno' }, { key: 'week', label: 'Settimana' }, { key: 'month', label: 'Mese' }]} value={scope} onChange={onScope} />
        <View style={{ flexDirection: 'row', gap: 8, marginLeft: wide ? 'auto' : 0 }}>
          {exportButton('PDF', 'document-text-outline', onPdf)}
          {onPrint ? exportButton('Stampa', 'print-outline', onPrint) : null}
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────────── Clienti del salone ───────────────────────────── */

type CustomerAppointment = { data?: string; ora: string; servizio: string };
export type CustomerTimelineEntry = { id: string; dateLabel: string; ora: string; title: string; subtitle: string; badge: string; phase: string; tone: string };
export type CustomerPanelBoard = {
  boardKey: string;
  customer: { nome: string; telefono?: string; email?: string; instagram?: string };
  totalAppointments: number;
  pastAppointments: number;
  todayAppointments: number;
  futureAppointments: number;
  totalSpent: number;
  averageTicket: number;
  nextAppointment: CustomerAppointment | null;
  serviceStats: { serviceName: string; count: number; total: number }[];
  timeline: CustomerTimelineEntry[];
};
export type CustomerTimelineFilter = 'all' | 'today' | 'future' | 'past';

function CustomerListRow({ board, active, onPress, first }: { board: CustomerPanelBoard; active: boolean; onPress: () => void; first: boolean }) {
  const { palette: p } = useAccessAppearance();
  const t = tones(p);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const next = board.nextAppointment ? (board.nextAppointment.data === todayIso ? 'oggi' : shortDay(isoToDate(board.nextAppointment.data))) : null;
  const visits = `${board.totalAppointments} ${board.totalAppointments === 1 ? 'appuntamento' : 'appuntamenti'}`;
  return (
    <HapticTouchable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`Apri la scheda di ${board.customer.nome}`}
      onPress={onPress}
      pressScale={0.99}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 9, paddingHorizontal: 10, borderRadius: active ? 12 : 0, borderTopWidth: first || active ? 0 : 1, borderTopColor: p.line, backgroundColor: active ? t.sand : 'transparent' }}
    >
      <Avatar name={board.customer.nome} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={[{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink }, oneLine]}>{board.customer.nome}</Text>
        <Text numberOfLines={1} style={[{ fontSize: 12, lineHeight: 17, color: p.muted }, oneLine]}>{next ? `${visits} · prossimo ${next}` : visits}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={p.muted} />
    </HapticTouchable>
  );
}

function CustomerDetail({ board, filter, onFilter, reserveCash }: { board: CustomerPanelBoard; filter: CustomerTimelineFilter; onFilter: (filter: CustomerTimelineFilter) => void; reserveCash: boolean }) {
  const { palette: p } = useAccessAppearance();
  const t = tones(p);
  const contacts = [board.customer.telefono, board.customer.email, board.customer.instagram ? `@${board.customer.instagram}` : ''].filter(Boolean).join(' · ');
  const next = board.nextAppointment;
  const lastVisit = board.timeline.find((entry) => entry.phase === 'Passato') ?? null;
  const maxCount = Math.max(1, ...board.serviceStats.map((item) => item.count));
  const filters: { key: CustomerTimelineFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Tutti', count: board.totalAppointments },
    ...(board.todayAppointments ? [{ key: 'today' as const, label: 'Oggi', count: board.todayAppointments }] : []),
    { key: 'future', label: 'Futuri', count: board.futureAppointments },
    { key: 'past', label: 'Passati', count: board.pastAppointments },
  ];
  const timeline = board.timeline.filter((entry) => filter === 'all' || (filter === 'today' ? entry.phase === 'Oggi' : filter === 'future' ? entry.phase === 'Futuro' : entry.phase === 'Passato'));
  const figure = (value: string, label: string, divider: boolean) => (
    <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 12, borderLeftWidth: divider ? 1 : 0, borderLeftColor: p.line }}>
      <Text numberOfLines={1} style={{ fontSize: 22, lineHeight: 28, fontWeight: '600', color: p.ink, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 17, color: p.muted }}>{label}</Text>
    </View>
  );

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar name={board.customer.nome} size={52} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: serif, fontSize: 25, lineHeight: 31, color: p.ink }}>{board.customer.nome}</Text>
          <Text selectable style={{ fontSize: 13, lineHeight: 19, color: p.muted }}>{contacts || 'Contatti non disponibili'}</Text>
        </View>
      </View>

      <Section style={{ flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 14 }}>
        {figure(String(board.pastAppointments), board.pastAppointments === 1 ? 'visita fatta' : 'visite fatte', false)}
        {figure(reserveCash ? 'Riservato' : euro(board.totalSpent), 'spesi', true)}
        {figure(reserveCash ? 'Riservato' : euro(board.averageTicket), 'a visita', true)}
      </Section>

      <View style={{ borderRadius: 18, borderWidth: 1, borderColor: p.border, backgroundColor: t.sand, padding: 16, gap: 4 }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.gold }}>Prossimo appuntamento</Text>
        {next ? (
          <>
            <Text style={{ fontSize: 18, lineHeight: 24, fontWeight: '600', color: p.ink, fontVariant: ['tabular-nums'] }}>{`${shortDay(isoToDate(next.data))} · ${next.ora}`}</Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: p.ink }}>{next.servizio}</Text>
          </>
        ) : (
          <Text style={{ fontSize: 15, lineHeight: 21, color: p.muted }}>Nessun appuntamento in agenda</Text>
        )}
        {lastVisit ? <Text style={{ marginTop: 6, fontSize: 13, lineHeight: 18, color: p.muted }}>{`Ultima visita: ${shortDay(parseItalianDate(lastVisit.dateLabel), lastVisit.dateLabel)} · ${lastVisit.title}`}</Text> : null}
      </View>

      <Section style={{ gap: 10 }}>
        <Text style={{ fontFamily: serif, fontSize: 19, lineHeight: 24, color: p.ink }}>Servizi preferiti</Text>
        {board.serviceStats.length === 0 ? (
          <Text style={{ fontSize: 13, lineHeight: 19, color: p.muted }}>Ancora nessun servizio svolto.</Text>
        ) : (
          board.serviceStats.slice(0, 5).map((item) => (
            <View key={item.serviceName} style={{ gap: 5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text numberOfLines={1} style={[{ flex: 1, fontSize: 14, lineHeight: 19, color: p.ink }, oneLine]}>{item.serviceName}</Text>
                <Text style={{ fontSize: 13, color: p.muted, fontVariant: ['tabular-nums'] }}>{reserveCash ? `${item.count}×` : `${item.count}× · ${euro(item.total)}`}</Text>
              </View>
              <View style={{ height: 4, borderRadius: 2, backgroundColor: p.line, overflow: 'hidden' }}>
                <View style={{ width: `${(item.count / maxCount) * 100}%`, height: 4, borderRadius: 2, backgroundColor: t.bar }} />
              </View>
            </View>
          ))
        )}
      </Section>

      <Section style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
          <Text style={{ fontFamily: serif, fontSize: 19, lineHeight: 24, color: p.ink }}>Storico</Text>
          <Segmented options={filters} value={filter} onChange={onFilter} />
        </View>
        {timeline.length === 0 ? (
          <Text style={{ paddingVertical: 10, fontSize: 13, lineHeight: 19, color: p.muted }}>Nessun appuntamento in questo filtro.</Text>
        ) : (
          timeline.map((entry, index) => {
            const date = parseItalianDate(entry.dateLabel);
            const statusColor = entry.tone === 'future' || entry.tone === 'today' ? t.gold : entry.tone === 'muted' ? p.muted : t.sage;
            return (
              <View key={entry.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, borderTopWidth: index ? 1 : 0, borderTopColor: p.line }}>
                <View style={{ width: 46, alignItems: 'center' }}>
                  <Text style={{ fontSize: 19, lineHeight: 23, fontWeight: '600', color: p.ink, fontVariant: ['tabular-nums'] }}>{date ? date.getDate() : '—'}</Text>
                  <Text style={{ fontSize: 11, lineHeight: 14, color: p.muted, textTransform: 'uppercase', letterSpacing: 0.6 }}>{date ? `${monthFormatter.format(date).replace('.', '')} ${String(date.getFullYear()).slice(2)}` : entry.dateLabel}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink }, oneLine]}>{entry.title}</Text>
                  <Text numberOfLines={1} style={[{ fontSize: 13, lineHeight: 18, color: p.muted }, oneLine]}>{`${entry.ora} · ${reserveCash ? entry.subtitle.replace(/€\s?[\d.,]+\s?·?\s?/, '') : entry.subtitle}`}</Text>
                </View>
                <Text style={{ flexShrink: 0, paddingTop: 2, fontSize: 12, fontWeight: '500', color: statusColor }}>{entry.badge}</Text>
              </View>
            );
          })
        )}
      </Section>
    </View>
  );
}

export function CustomerInsightPanel({ search, boards, selected, detailOpen, onSelect, onBack, filter, onFilter, reserveCash, bottomInset = 0 }: {
  search: React.ReactNode;
  boards: CustomerPanelBoard[];
  selected: CustomerPanelBoard | null;
  detailOpen: boolean;
  onSelect: (key: string) => void;
  onBack: () => void;
  filter: CustomerTimelineFilter;
  onFilter: (filter: CustomerTimelineFilter) => void;
  reserveCash: boolean;
  bottomInset?: number;
}) {
  const { palette: p } = useAccessAppearance();
  const { width } = useWindowDimensions();
  const wide = width >= WIDE;
  const empty = <Text style={{ paddingVertical: 16, paddingHorizontal: 4, fontSize: 14, lineHeight: 20, color: p.muted }}>Nessun cliente trovato. Prova con nome, telefono, email o un servizio già fatto.</Text>;
  const list = (
    <View>
      {boards.length === 0 ? empty : boards.map((board, index) => <CustomerListRow key={board.boardKey} board={board} first={index === 0} active={wide && selected?.boardKey === board.boardKey} onPress={() => onSelect(board.boardKey)} />)}
    </View>
  );
  const detail = selected ? <CustomerDetail board={selected} filter={filter} onFilter={onFilter} reserveCash={reserveCash} /> : null;

  if (wide) {
    return (
      <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', gap: 20 }}>
        <View style={{ width: 300, minHeight: 0, gap: 8 }}>
          {search}
          <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 12 + bottomInset }} showsVerticalScrollIndicator={false}>{list}</ScrollView>
        </View>
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 16 + bottomInset }} showsVerticalScrollIndicator={false}>
          {detail ?? empty}
        </ScrollView>
      </View>
    );
  }

  if (detailOpen && detail) {
    return (
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 16 + bottomInset }} showsVerticalScrollIndicator={false}>
        <HapticTouchable accessibilityRole="button" onPress={onBack} pressScale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', minHeight: 36, paddingRight: 10 }}>
          <Ionicons name="chevron-back" size={17} color={p.ink} />
          <Text style={{ fontSize: 14, fontWeight: '500', color: p.ink }}>Tutti i clienti</Text>
        </HapticTouchable>
        {detail}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0, gap: 8 }}>
      {search}
      <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 16 + bottomInset }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{list}</ScrollView>
    </View>
  );
}
