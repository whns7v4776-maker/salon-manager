import React from 'react';
import { Image, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAccessAppearance } from './access-premium';
import { webHomePart } from './owner-premium-web';

/** Web Home only: the "La giornata" people cards, as scannable rows instead of metric pills. */

export type HomeOperatorRow = {
  id: string;
  name: string;
  role: string;
  photoUri?: string | null;
  openTasks: number;
  pendingRequests: number;
  nextTime: string | null;
};

export type HomeCustomerRow = {
  key: string;
  name: string;
  when: string;
  service: string;
};

const MAX_OPERATOR_ROWS = 5;
/** Below this width the right-hand column moves under the name so names never break mid-word. */
const STACK_BELOW = 520;
const oneLine = Platform.OS === 'web' ? ({ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'normal' } as object) : {};

const initialsOf = (name: string) =>
  name
    .split(/[\s·-]+/)
    .filter((part) => /[A-Za-zÀ-ÿ]/.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '·';

function useTones() {
  const { palette: p } = useAccessAppearance();
  return {
    p,
    avatar: p.night ? 'rgba(216,194,155,.14)' : 'rgba(232,222,205,.62)',
    hover: p.night ? 'rgba(255,255,255,.05)' : 'rgba(255,253,250,.7)',
    gold: p.night ? '#D8C29B' : '#9A7743',
    amber: p.night ? '#E3BD89' : '#7A5424',
    amberDot: p.night ? '#D9A55E' : '#C2873F',
  };
}

function CardHeader({ title, icon, action, actionLabel, onAction }: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  action: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const { p, hover } = useTones();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
      <Ionicons name={icon} size={22} color={p.ink} />
      <Text accessibilityRole="header" style={{ flex: 1, fontFamily: 'Georgia', fontSize: 22, lineHeight: 28, color: p.ink }}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        onPress={onAction}
        style={(state: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          minHeight: 36,
          paddingLeft: 14,
          paddingRight: 10,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: state.hovered || state.pressed ? hover : p.field,
        })}
      >
        <Text style={{ fontSize: 13, fontWeight: '500', color: p.ink }}>{action}</Text>
        <Ionicons name="chevron-forward" size={15} color={p.ink} />
      </Pressable>
    </View>
  );
}

function Avatar({ name, photoUri }: { name: string; photoUri?: string | null }) {
  const { p, avatar } = useTones();
  return (
    <View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: avatar, borderWidth: 1, borderColor: p.border }}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={{ width: 38, height: 38 }} />
      ) : (
        <Text style={{ fontFamily: 'Georgia', fontSize: 14, color: p.ink, letterSpacing: 0.4 }}>{initialsOf(name)}</Text>
      )}
    </View>
  );
}

function Row({ children, onPress, label, first }: { children: React.ReactNode; onPress: () => void; label: string; first: boolean }) {
  const { p, hover } = useTones();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={(state: any) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 58,
        paddingVertical: 9,
        paddingHorizontal: 8,
        marginHorizontal: -8,
        borderRadius: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: state.hovered || state.pressed ? 'transparent' : p.line,
        backgroundColor: state.hovered || state.pressed ? hover : 'transparent',
      })}
    >
      {children}
      <Ionicons name="chevron-forward" size={16} color={p.muted} />
    </Pressable>
  );
}

function Summary({ children }: { children: React.ReactNode }) {
  const { p } = useTones();
  return <Text style={{ marginTop: 4, marginBottom: 8, fontSize: 13, lineHeight: 19, color: p.muted }}>{children}</Text>;
}

function Muted({ children }: { children: React.ReactNode }) {
  const { p } = useTones();
  return <Text style={{ paddingVertical: 14, fontSize: 13, lineHeight: 19, color: p.muted }}>{children}</Text>;
}

type OperatorStatus = { text: string; color: string; dot: string; hollow: boolean };

function StatusLine({ status: s, extra }: { status: OperatorStatus; extra?: string | null }) {
  const { p } = useTones();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: extra === undefined ? 0 : 2 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: s.hollow ? 'transparent' : s.dot, borderWidth: s.hollow ? 1.2 : 0, borderColor: s.dot }} />
      <Text numberOfLines={1} style={[{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: s.color, fontVariant: ['tabular-nums'] }, oneLine]}>
        {s.text}
        {extra ? <Text style={{ fontWeight: '400', color: p.muted }}>{` · ${extra}`}</Text> : null}
      </Text>
    </View>
  );
}

export function HomeOperatorsCard({ rows, totalOpen, totalRequests, loading, onOpenAll, onOpenOperator }: {
  rows: HomeOperatorRow[];
  totalOpen: number;
  totalRequests: number;
  loading: boolean;
  onOpenAll: () => void;
  onOpenOperator: (id: string) => void;
}) {
  const { p, gold, amber, amberDot } = useTones();
  const stacked = useWindowDimensions().width < STACK_BELOW;
  const visible = rows.slice(0, MAX_OPERATOR_ROWS);
  const hidden = rows.length - visible.length;
  const status = (row: HomeOperatorRow): OperatorStatus => {
    if (row.nextTime) return { text: `Prossimo alle ${row.nextTime}`, color: p.ink, dot: gold, hollow: false };
    if (row.openTasks > 0) return { text: `${row.openTasks} da chiudere`, color: amber, dot: amberDot, hollow: false };
    return { text: 'Agenda libera', color: p.muted, dot: p.muted, hollow: true };
  };
  return (
    <View {...webHomePart('operators')} style={{ gap: 2 }}>
      <CardHeader title="Operatori" icon="id-card-outline" action="Agenda" actionLabel="Apri agenda operatori" onAction={onOpenAll} />
      <Summary>
        {loading ? 'Aggiornamento della giornata…' : `${totalOpen} da fare oggi · ${totalRequests} ${totalRequests === 1 ? 'richiesta' : 'richieste'} in attesa`}
      </Summary>
      {loading ? null : rows.length === 0 ? (
        <Muted>Nessun operatore configurato. Aggiungili da Servizi per vedere qui il loro lavoro.</Muted>
      ) : (
        <View>
          {visible.map((row, index) => {
            const s = status(row);
            const extra = row.nextTime && row.openTasks > 1 ? `${row.openTasks} da fare` : row.pendingRequests > 0 ? `${row.pendingRequests} in attesa` : null;
            return (
              <Row key={row.id} first={index === 0} onPress={() => onOpenOperator(row.id)} label={`Apri agenda di ${row.name}: ${s.text}`}>
                <Avatar name={row.name} photoUri={row.photoUri} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={[{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink }, oneLine]}>
                    {row.name}
                    {stacked && row.role ? <Text style={{ fontWeight: '400', color: p.muted, fontSize: 13 }}>{` · ${row.role}`}</Text> : null}
                  </Text>
                  {!stacked && row.role ? <Text numberOfLines={1} style={[{ fontSize: 12, lineHeight: 17, color: p.muted }, oneLine]}>{row.role}</Text> : null}
                  {stacked ? <StatusLine status={s} extra={extra} /> : null}
                </View>
                {!stacked ? (
                  <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                    <StatusLine status={s} />
                    {extra ? <Text style={{ fontSize: 12, lineHeight: 16, color: p.muted }}>{extra}</Text> : null}
                  </View>
                ) : null}
              </Row>
            );
          })}
          {hidden > 0 ? (
            <Pressable accessibilityRole="button" onPress={onOpenAll} style={{ paddingTop: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '500', color: p.ink, textDecorationLine: 'underline' }}>{`Vedi tutti gli operatori (${rows.length})`}</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

export function HomeCustomersCard({ upcoming, footer, loading, onOpenAll, onOpenCustomer }: {
  upcoming: HomeCustomerRow[];
  footer: string;
  loading: boolean;
  onOpenAll: () => void;
  onOpenCustomer: (key: string) => void;
}) {
  const { p, hover } = useTones();
  const stacked = useWindowDimensions().width < STACK_BELOW;
  return (
    <View {...webHomePart('customers')} style={{ gap: 2 }}>
      <CardHeader title="Clienti" icon="people-outline" action="Tutti" actionLabel="Apri schede clienti" onAction={onOpenAll} />
      <Pressable
        accessibilityRole="search"
        accessibilityLabel="Cerca un cliente"
        onPress={onOpenAll}
        style={(state: any) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
          minHeight: 44,
          marginTop: 6,
          marginBottom: 12,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: p.border,
          backgroundColor: state.hovered ? hover : p.field,
          ...(Platform.OS === 'web' ? ({ cursor: 'text' } as object) : null),
        })}
      >
        <Ionicons name="search-outline" size={17} color={p.muted} />
        <Text style={{ fontSize: 14, color: p.muted }}>Cerca un cliente…</Text>
      </Pressable>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: p.muted, marginBottom: 2 }}>Prossimi in agenda</Text>
      {loading ? (
        <Muted>Aggiornamento dei clienti…</Muted>
      ) : upcoming.length === 0 ? (
        <Muted>Nessun cliente in agenda nei prossimi giorni.</Muted>
      ) : (
        <View>
          {upcoming.map((row, index) => (
            <Row key={row.key} first={index === 0} onPress={() => onOpenCustomer(row.key)} label={`Apri la scheda di ${row.name}, ${row.when}`}>
              <Avatar name={row.name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: p.ink }, oneLine]}>{row.name}</Text>
                {stacked ? <Text numberOfLines={1} style={[{ fontSize: 13, lineHeight: 18, fontWeight: '500', color: p.ink, fontVariant: ['tabular-nums'] }, oneLine]}>{row.when}</Text> : null}
                <Text numberOfLines={1} style={[{ fontSize: 12, lineHeight: 17, color: p.muted }, oneLine]}>{row.service}</Text>
              </View>
              {!stacked ? <Text style={{ flexShrink: 0, fontSize: 13, lineHeight: 18, fontWeight: '500', color: p.ink, fontVariant: ['tabular-nums'] }}>{row.when}</Text> : null}
            </Row>
          ))}
        </View>
      )}
      {footer ? <Text style={{ marginTop: 'auto', paddingTop: 12, fontSize: 12, lineHeight: 17, color: p.muted }}>{footer}</Text> : null}
    </View>
  );
}
