import { NativeSheetHandle } from './ui/native-sheet-drag';
import {useAccessAppearance} from './access-premium';
import {createAgendaPremiumStyles} from './agenda-premium-style';
import {TABLET_MODAL_ORIENTATIONS} from '../src/lib/tablet-modal-orientations';
import { DockedSheetSurface } from './ui/docked-sheet-surface';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { HapticTouchable } from './ui/haptic-touchable';
import { PremiumExpandButton } from './ui/premium-expand-button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getWebExpandableCardProps,
  getWebExpandableCardStyle,
} from './ui/web-expandable-card';

export type AppointmentImpactItem = {
  key: string;
  customerName: string;
  dateLabel: string;
  timeLabel: string;
  serviceLabel: string;
  operatorLabel?: string;
};

type AppointmentImpactModalProps = {
  visible: boolean;
  title: string;
  message: string;
  items: AppointmentImpactItem[];
  busy?: boolean;
  eyebrow?: string;
  keepLabel?: string;
  onClose: () => void;
  onShow?: () => void;
  onReviewAppointments?: () => void;
  onCalendarExceptions?: () => void;
  onKeepAppointments: () => void | Promise<void>;
  onCancelAppointments: (selectedKeys: string[]) => void | Promise<void>;
};

export function AppointmentImpactModal({
  visible,
  title,
  message,
  items,
  busy = false,
  eyebrow = 'Agenda · Disponibilità',
  keepLabel = 'Blocca e mantieni',
  onClose,
  onShow,
  onReviewAppointments,
  onCalendarExceptions,
  onKeepAppointments,
  onCancelAppointments,
}: AppointmentImpactModalProps) {
  const {palette:p}=useAccessAppearance();
  const styles=useMemo(()=>{
    const next=createAgendaPremiumStyles(baseImpactStyles,p);
    for(const style of Object.values(next))if('fontWeight' in style&&style.fontWeight==='900')Object.assign(style,{fontWeight:'600'});
    Object.assign(next.backdrop,{backgroundColor:p.night?'rgba(0,0,0,.48)':'rgba(40,36,30,.28)',...(Platform.OS==='web'?{backdropFilter:'blur(9px)'}:{})});
    Object.assign(next.shell,{maxWidth:600});
    Object.assign(next.card,{backgroundColor:p.night?'rgba(28,32,34,.98)':'rgba(252,249,245,.98)',borderColor:p.border,borderRadius:22,...(Platform.OS==='web'?{backdropFilter:'blur(24px)',boxShadow:'0 20px 70px rgba(0,0,0,.18)'}:{})});
    Object.assign(next.iconWrap,{width:38,height:38,borderRadius:12,backgroundColor:p.field,borderColor:p.border});
    Object.assign(next.title,{fontFamily:Platform.OS==='android'?'serif':'Georgia',fontWeight:'400',fontSize:24,lineHeight:31});
    Object.assign(next.message,{fontWeight:'400',color:p.muted,fontSize:14,lineHeight:21});
    Object.assign(next.expandButton,{minHeight:54,borderRadius:12,borderColor:p.border,backgroundColor:p.field});
    Object.assign(next.button,{minHeight:44,borderRadius:12,paddingHorizontal:18});
    Object.assign(next.actions,{flexWrap:'wrap',justifyContent:'center'});
    Object.assign(next.actionButton,{flex:undefined,flexGrow:0,flexShrink:0,flexBasis:'auto'});
    Object.assign(next.listContent,{padding:9,paddingTop:9,paddingBottom:9,gap:8});
    Object.assign(next.reviewButton,{backgroundColor:p.field,borderWidth:1,borderColor:p.border});
    Object.assign(next.cancelActions,{flexWrap:'wrap',justifyContent:'center'});
    for(const key of ['cancelSelectedButton','cancelAllButton'] as const)Object.assign(next[key],{flex:undefined,flexGrow:0,flexShrink:0,flexBasis:'auto',maxWidth:'100%',minHeight:44,paddingHorizontal:16,paddingVertical:10,borderRadius:12});
    Object.assign(next.keepButton,{backgroundColor:p.action});
    Object.assign(next.keepButtonText,{color:p.actionText,fontWeight:'500'});
    Object.assign(next.rowSelected,{borderColor:'#BB6370',backgroundColor:p.night?'rgba(185,66,84,.17)':'rgba(185,66,84,.08)'});
    Object.assign(next.cancelSelectedButton,{backgroundColor:p.night?'rgba(185,66,84,.17)':'rgba(185,66,84,.08)',borderColor:'#BB6370'});
    Object.assign(next.cancelSelectedText,{color:p.night?'#F4B7C2':'#982D40'});
    Object.assign(next.cancelAllButton,{backgroundColor:'#B4233A'});
    Object.assign(next.cancelAllText,{color:'#FFFFFF'});
    return next;
  },[p]);
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const Surface = isWeb ? View : DockedSheetSurface;
  const sheetMaxHeight = Math.max(
    120,
    viewportHeight - (isWeb ? 32 : Math.max(56, insets.top + 12))
  );
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = React.useCallback(() => {
    setExpanded((current) => !current);
  }, []);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const allKeys = useMemo(() => items.map((item) => item.key), [items]);
  const allKeysSignature = useMemo(() => allKeys.join('|'), [allKeys]);
  const allSelected = items.length > 0 && selectedKeys.length === items.length;

  useEffect(() => {
    if (!visible) {
      setExpanded((current) => (current ? false : current));
      setSelectedKeys((current) => (current.length > 0 ? [] : current));
      return;
    }

    setSelectedKeys((current) => {
      const visibleKeySet = new Set(allKeysSignature ? allKeysSignature.split('|') : []);
      const next = current.filter((key) => visibleKeySet.has(key));
      return next.length === current.length && next.every((key, index) => key === current[index])
        ? current
        : next;
    });
  }, [allKeysSignature, visible]);

  const toggleItem = (key: string) => {
    if (busy) return;
    setSelectedKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  return (
    <Modal
      supportedOrientations={TABLET_MODAL_ORIENTATIONS}
      onShow={onShow}
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.backdrop} />
        <View style={[styles.shell, { maxHeight: sheetMaxHeight }]}>
          <Surface
            testID="appointment-impact-surface"
            {...(!isWeb ? { onClose, dismissDisabled: busy } : {})}
            style={[styles.card, { maxHeight: sheetMaxHeight }]}
          >
            {!isWeb ? <NativeSheetHandle style={styles.handle} /> : null}
            <ScrollView
              style={styles.contentScroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <View style={styles.iconWrap}>
                <Ionicons name="calendar-outline" size={21} color={p.ink} />
              </View>
              <Text style={styles.eyebrow}>{eyebrow}</Text>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>

              <View style={styles.summaryPill}>
                <Ionicons name="people-outline" size={18} color={p.ink} />
                <Text style={styles.summaryText}>
                  {items.length === 1
                    ? '1 appuntamento coinvolto'
                    : `${items.length} appuntamenti coinvolti`}
                </Text>
              </View>

              <View
                {...getWebExpandableCardProps(toggleExpanded, {
                  expanded,
                  disabled: busy,
                })}
                style={[
                  styles.expandButton,
                  getWebExpandableCardStyle(expanded, busy),
                ]}
              >
                <View style={styles.expandButtonCopy}>
                  <Text style={styles.expandButtonTitle}>Scegli quali annullare</Text>
                  <Text style={styles.expandButtonMeta}>
                    {selectedKeys.length > 0
                      ? `${selectedKeys.length} selezionati`
                      : 'Apri l’elenco degli appuntamenti'}
                  </Text>
                </View>
                <PremiumExpandButton
                  salon
                  tone={{ink:p.ink,fill:p.field,border:p.border}}
                  expanded={expanded}
                  onPress={toggleExpanded}
                  disabled={busy}
                  accessibilityLabel={
                    expanded
                      ? 'Chiudi scelta appuntamenti da annullare'
                      : 'Apri scelta appuntamenti da annullare'
                  }
                />
              </View>

              {expanded ? (
                <View style={styles.selectionPanel}>
                  <HapticTouchable
                    style={styles.selectAllRow}
                    onPress={() => setSelectedKeys(allSelected ? [] : allKeys)}
                    disabled={busy}
                    immediatePress
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: allSelected, disabled: busy }}
                    accessibilityLabel={allSelected ? 'Deseleziona tutti gli appuntamenti' : 'Seleziona tutti gli appuntamenti'}
                  >
                    <Ionicons
                      name={allSelected ? 'checkmark-circle' : 'ellipse-outline'}
                      size={22}
                      color={allSelected ? '#B42318' : '#64748B'}
                    />
                    <Text style={styles.selectAllText}>
                      {allSelected ? 'Deseleziona tutti' : 'Seleziona tutti'}
                    </Text>
                  </HapticTouchable>
                  <View style={styles.listContent}>
                    {items.map((item) => {
                      const selected = selectedKeys.includes(item.key);
                      return (
                        <HapticTouchable
                          key={item.key}
                          style={[styles.row, selected && styles.rowSelected]}
                          onPress={() => toggleItem(item.key)}
                          disabled={busy}
                          immediatePress
                          pressScale={0.99}
                          pressOpacity={0.97}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected, disabled: busy }}
                          accessibilityLabel={`${item.customerName}, ${item.serviceLabel}, ${item.dateLabel}, ${item.timeLabel}${item.operatorLabel ? `, ${item.operatorLabel}` : ''}`}
                        >
                          <View style={styles.rowCheck}>
                            <Ionicons
                              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                              size={23}
                              color={selected ? '#B42318' : '#94A3B8'}
                            />
                          </View>
                          <View style={styles.rowCopy}>
                            <Text style={styles.rowCustomer}>{item.customerName}</Text>
                            <Text style={styles.rowService}>{item.serviceLabel}</Text>
                            <Text style={styles.rowMeta}>
                              {item.dateLabel} · {item.timeLabel}
                              {item.operatorLabel ? ` · ${item.operatorLabel}` : ''}
                            </Text>
                          </View>
                        </HapticTouchable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {onCalendarExceptions ? (
                <HapticTouchable
                  style={[styles.button, styles.closeButton, { marginTop: 16, flexDirection: 'row', gap: 8 }]}
                  onPress={onCalendarExceptions}
                  disabled={busy}
                  immediatePress
                  accessibilityRole="button"
                  accessibilityLabel="Eccezioni calendario per questa giornata"
                >
                  <Ionicons name="calendar-outline" size={20} color={p.ink} />
                  <Text style={styles.closeButtonText}>Eccezioni calendario</Text>
                </HapticTouchable>
              ) : null}

              {onReviewAppointments ? (
                <HapticTouchable
                  style={[styles.button, styles.keepButton, styles.reviewButton]}
                  onPress={onReviewAppointments}
                  disabled={busy}
                  immediatePress
                  accessibilityRole="button"
                  accessibilityLabel="Modifica prima in Agenda. Il blocco non viene ancora salvato."
                >
                  <Text style={[styles.keepButtonText,{color:p.ink}]}>Modifica prima in Agenda</Text>
                  <Text style={[styles.rowMeta, { color:p.muted,fontWeight:'400' }]}>Il blocco non viene ancora salvato.</Text>
                </HapticTouchable>
              ) : null}

              <View style={styles.actions}>
                <HapticTouchable
                  style={[styles.button, styles.actionButton, styles.closeButton]}
                  onPress={onClose}
                  disabled={busy}
                  immediatePress
                  accessibilityRole="button"
                >
                  <Text style={styles.closeButtonText}>Annulla</Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.button, styles.actionButton, styles.keepButton]}
                  onPress={() => void onKeepAppointments()}
                  disabled={busy}
                  immediatePress
                  accessibilityRole="button"
                >
                  <Text style={styles.keepButtonText}>
                    {busy ? 'Salvataggio…' : keepLabel}
                  </Text>
                </HapticTouchable>
              </View>

              {expanded ? (
                <View style={styles.cancelActions}>
                  <HapticTouchable
                    style={[
                      styles.cancelSelectedButton,
                      selectedKeys.length === 0 && styles.buttonDisabled,
                    ]}
                    onPress={() => void onCancelAppointments(selectedKeys)}
                    disabled={busy || selectedKeys.length === 0}
                    immediatePress
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelSelectedText}>
                      Annulla selezionati ({selectedKeys.length})
                    </Text>
                  </HapticTouchable>
                  <HapticTouchable
                    style={styles.cancelAllButton}
                    onPress={() => void onCancelAppointments(allKeys)}
                    disabled={busy || items.length === 0}
                    immediatePress
                    accessibilityRole="button"
                  >
                    <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.cancelAllText}>Annulla tutti</Text>
                  </HapticTouchable>
                </View>
              ) : null}
            </ScrollView>
          </Surface>
        </View>
      </View>
    </Modal>
  );
}

const baseImpactStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end',
    paddingHorizontal: Platform.OS === 'web' ? 24 : 0,
    paddingVertical: Platform.OS === 'web' ? 16 : 10,
    paddingBottom: Platform.OS === 'web' ? 16 : 0,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.58)',
  },
  shell: {
    width: '100%',
    maxWidth: 680,
    flexShrink: 1,
  },
  card: {
    width: '100%',
    maxHeight: '100%',
    borderRadius: 30,
    backgroundColor: '#FFFEFC',
    borderWidth: 1,
    borderColor: 'rgba(234, 88, 12, 0.18)',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    flexShrink: 1,
    minHeight: 0,
    overflow: 'hidden',
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 20 },
    elevation: 24,
  },
  contentScroll: { flexShrink: 1, minHeight: 0 },
  content: {
    paddingHorizontal: Platform.OS === 'web' ? 24 : 18,
    paddingTop: Platform.OS === 'web' ? 24 : 0,
    paddingBottom: Platform.OS === 'web' ? 24 : 18,
  },
  handle: {
    width: 54,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D6D3D1',
    alignSelf: 'center',
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFEDD5',
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginBottom: 10,
  },
  eyebrow: {
    color: '#7C8594',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  title: {
    color: '#0B1220',
    fontSize: Platform.OS === 'web' ? 26 : 24,
    lineHeight: Platform.OS === 'web' ? 32 : 29,
    fontWeight: '900',
    textAlign: 'center',
    marginTop: 5,
  },
  message: {
    color: '#475569',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
  summaryPill: {
    alignSelf: 'center',
    minHeight: 40,
    borderRadius: 999,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 15,
  },
  summaryText: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '900',
  },
  expandButton: {
    minHeight: 62,
    borderRadius: 20,
    paddingHorizontal: 17,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  expandButtonCopy: { flex: 1 },
  expandButtonTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  expandButtonMeta: { color: '#7C2D12', fontSize: 12, fontWeight: '700', marginTop: 3 },
  selectionPanel: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  selectAllRow: {
    minHeight: 48,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  selectAllText: { color: '#334155', fontSize: 14, fontWeight: '900' },
  listContent: { padding: 9, gap: 8 },
  row: {
    minHeight: 74,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowSelected: { borderColor: '#FCA5A5', backgroundColor: '#FFF1F2' },
  rowCheck: { alignSelf: 'flex-start', paddingTop: 1 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowCustomer: { color: '#0F172A', fontSize: 15, fontWeight: '900' },
  rowService: { color: '#334155', fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 2 },
  rowMeta: { color: '#64748B', fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 17 },
  button: {
    minHeight: 53,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionButton: { flex: 1 },
  reviewButton: { marginTop: 16, paddingVertical: 12 },
  closeButton: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1' },
  closeButtonText: { color: '#334155', fontSize: 15, fontWeight: '900' },
  keepButton: { backgroundColor: '#0F172A' },
  keepButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' },
  cancelActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  cancelSelectedButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FDA4AF',
    paddingHorizontal: 10,
  },
  cancelSelectedText: { color: '#9F1239', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  cancelAllButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    backgroundColor: '#B42318',
    paddingHorizontal: 10,
  },
  cancelAllText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  buttonDisabled: { opacity: 0.42 },
});
