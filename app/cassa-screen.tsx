import { TABLET_MODAL_ORIENTATIONS } from '../src/lib/tablet-modal-orientations';
import {CashNativeWorkspace} from '../components/cash-native-workspace';
import {useCashRefresh} from '../src/lib/use-cash-refresh';
import {CashDeviceGate,type CashAccessControls} from '../components/cash-device-gate';
import {CashWebWorkspace,CashShopTrigger} from '../components/cash-web-workspace';
import { MonthlyFinancialReport } from '../components/monthly-financial-report';
import { ShopEntry } from "../components/shop/shop-entry";
import { LoyaltyCheckoutReminder } from "../components/loyalty-checkout-reminder";
import { CreationSheet } from '../components/creation-sheet';
import { DockedSheetSurface } from '../components/ui/docked-sheet-surface';
import { AppointmentRefundSummary } from '../components/appointment-refund-summary';
import { OwnerDataLoading, useOwnerDataLoading } from '../components/owner-page-loading';
import * as CashPrint from 'expo-print';
import { NativeDatePickerModal } from '../components/ui/native-date-picker-modal';
import { cashIsoDay, cashPeriodRange, formatCashDate } from '../src/lib/cash-period';
import { buildCashPdf } from '../src/lib/cash-pdf';
import { createCashServiceMatcher } from '../src/lib/cash-service-match';
import { supabase } from '../src/lib/supabase';
import * as CashFileSystem from 'expo-file-system/legacy';
import * as CashSharing from 'expo-sharing';
import { premiumFilterStyles } from '../components/ui/premium-filter-styles';
import { buildCashWorkbook, writeCashWorkbook } from '../src/lib/cash-workbook';
import { Ionicons } from '@expo/vector-icons';
import { PremiumExpandButton } from '../components/ui/premium-expand-button';
import { isLegacyAutoCashout, formatCash, summarizeCash } from '../src/lib/cash-summary';
import { HorizontalCardScrollView } from '../components/ui/horizontal-card-scroll-view';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';
import { CashFiscalArchive } from '../components/cash-fiscal-archive';
import { CashFiscalPanel } from '../components/cash-fiscal-panel';
import { CashStripePanel, callCashStripe } from '../components/cash-stripe-panel';
import { BookingPaymentPolicyEditor } from '../components/booking-payment-policy-editor';
import { ModuleHeroHeader } from '../components/module-hero-header';
import { HapticTouchable } from '../components/ui/haptic-touchable';
import { KeyboardNextToolbar } from '../components/ui/keyboard-next-toolbar';
import { NumberPickerModal } from '../components/ui/number-picker-modal';
import { useAppContext } from '../src/context/AppContext';
import { formatLeadingCapitalizedValue } from '../src/lib/customer-name';
import { focusNextInput, useKeyboardAwareScroll } from '../src/lib/form-navigation';
import { tApp } from '../src/lib/i18n';
import { useResponsiveLayout } from '../src/lib/responsive';
import { resolveServiceAccent, blendServiceAccentWithWhite } from '../src/lib/service-accents';

function CashSettingsPopup({ children, onClose }: React.PropsWithChildren<{ onClose: () => void }>) {
  if (Platform.OS === 'web') return <>{children}</>;
  return (
    <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS} visible transparent animationType="none" onRequestClose={onClose}>
      <CreationSheet animatePresentation title="Gestione Cassa" icon="options-outline" onClose={onClose}>
        {children}
      </CreationSheet>
    </Modal>
  );
}

function CashSectionHeading({ title, icon }: { title: string; icon: React.ComponentProps<typeof Ionicons>['name'] }) {
  const sectionIconColors: Record<string, string> = { 'stats-chart-outline': '#347AC5', 'add-outline': '#16845D', 'flash-outline': '#CF8A1F', 'search-outline': '#A24681' };
  return <View style={styles.sectionHeading}><View style={styles.sectionIcon}><Ionicons name={icon} size={20} color={sectionIconColors[icon] ?? '#334B65'} /></View><Text style={styles.sectionHeadingText}>{title}</Text></View>;
}

type MetodoPagamento = 'Contanti' | 'Carta' | 'Bonifico';

type SuggerimentoDescrizione = {
  id: string;
  label: string;
  value: string;
  prezzo?: number;
};

const METODI_PAGAMENTO: MetodoPagamento[] = ['Contanti', 'Carta', 'Bonifico'];
const IS_ANDROID = Platform.OS === 'android';
const IS_WEB = Platform.OS === 'web';
const ENABLE_ANDROID_BACKOFFICE_PERF_LOGS = false;
const logAndroidBackofficePerf = (event: string, payload: Record<string, unknown> = {}) => {
  void event;
  void payload;
};
const CASH_CONTROL_STABLE_MS = 4500;
const CASH_CONTROL_INBOUND_COMMIT_MS = 420;
const CASH_CONTROL_PENDING_CONFIRMATION_TIMEOUT_MS = 12000;
const CASH_INTRO_STORAGE_PREFIX = 'salonpro:cash_intro_seen:v1';

const buildCashIntroStorageKey = (email?: string) =>
  `${CASH_INTRO_STORAGE_PREFIX}:${(email ?? '').trim().toLowerCase() || 'local'}`;

const parseWorkspaceUpdatedAtMs = (value?: string | null) => {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const resolveMovementDate = (movement: { id: string; createdAt?: string; descrizione?: string }) => {
  if (isLegacyAutoCashout({ ...movement, descrizione: movement.descrizione ?? '' })) {
    const day = movement.id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1] ?? movement.createdAt?.slice(0, 10);
    if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) return new Date(`${day}T12:00:00`);
  }
  if (movement.createdAt) {
    const createdDate = new Date(movement.createdAt);
    if (!Number.isNaN(createdDate.getTime())) return createdDate;
  }

  const timestamp = Number(movement.id);
  if (!Number.isNaN(timestamp)) return new Date(timestamp);

  const autoCashoutMatch = movement.id.match(/^auto-cashout-.+-(\d{4}-\d{2}-\d{2})$/);
  if (autoCashoutMatch) {
    const fallbackDate = new Date(`${autoCashoutMatch[1]}T23:59:00`);
    if (!Number.isNaN(fallbackDate.getTime())) return fallbackDate;
  }

  return null;
};

const formatMovementStamp = (movement: { id: string; createdAt?: string }) => {
  const resolvedDate = resolveMovementDate(movement);
  if (!resolvedDate) return 'Movimento registrato';

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(resolvedDate);
};

const getMovementDateKey = (movement: { id: string; createdAt?: string }) => {
  const resolvedDate = resolveMovementDate(movement);
  if (!resolvedDate) return 'senza-data';

  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(resolvedDate);
};

const formatMovementDateLabel = (movement: { id: string; createdAt?: string }) => {
  const resolvedDate = resolveMovementDate(movement);
  if (!resolvedDate) return 'Data non disponibile';

  return new Intl.DateTimeFormat('it-IT', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(resolvedDate);
};

function CassaContent({
  onClose,
  active = true,
  access,
}: {
  onClose?: () => void;
  active?: boolean;
  access?: CashAccessControls;
} = {}) {
  const cassaPerfCountersRef = useRef({
    renderCount: 0,
    scrollBeginEvents: 0,
    lastFlushAt: Date.now(),
  });
  if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
    const counters = cassaPerfCountersRef.current;
    counters.renderCount += 1;
    const now = Date.now();
    if (now - counters.lastFlushAt >= 1000) {
      logAndroidBackofficePerf('cassa_render_scroll_rate', {
        rendersPerSec: counters.renderCount,
        scrollBeginEventsPerSec: counters.scrollBeginEvents,
      });
      counters.renderCount = 0;
      counters.scrollBeginEvents = 0;
      counters.lastFlushAt = now;
    }
  }
  const responsive = useResponsiveLayout();
  const cashDataLoading = useOwnerDataLoading();
  const {
    movimenti,
    servizi,
    clienti,
    carteCollegate,
    createMovimentoPersisted,
    updateMovimentoPersisted,
    createCartaPersisted,
    setDefaultCartaPersisted,
    deleteCartaPersisted,
    serviceCardColorOverrides,
    roleCardColorOverrides,
    salonWorkspace,
    salonAccountEmail,
    updateSalonWorkspacePersisted,
    appLanguage,
  } = useAppContext();

  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [stripeAvailable, setStripeAvailable] = useState(false);
  useCashRefresh(salonWorkspace.id,async isCurrent=>{const status=await callCashStripe('status');if(isCurrent())setStripeAvailable(status.configured===true);},IS_WEB&&active);
  const [exportingReport, setExportingReport] = useState(false);
  const [stripeMovement, setStripeMovement] = useState<{ id: string; importo: number } | null>(null);
  const [savingMovement, setSavingMovement] = useState(false);
  const cashWriteLock = useRef(false);
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('Contanti');
  const [cartaSelezionataId, setCartaSelezionataId] = useState<string | null>(null);
  const [showAmountPicker, setShowAmountPicker] = useState(false);
  const [showCashIntroModal, setShowCashIntroModal] = useState(false);
  const [isCashSectionTogglePending, setIsCashSectionTogglePending] = useState(false);
  const [displayedCashSectionDisabled, setDisplayedCashSectionDisabled] = useState(
    salonWorkspace.cashSectionDisabled
  );
  const cashDisplaySyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cashStableUntilRef = useRef(0);
  const cashPendingDesiredRef = useRef<boolean | null>(null);
  const cashPendingDesiredTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cashIntroCheckedKeyRef = useRef('');
  const cashLastAcceptedWorkspaceUpdatedAtRef = useRef(
    parseWorkspaceUpdatedAtMs(salonWorkspace.updatedAt)
  );
  const [nomeCarta, setNomeCarta] = useState('');
  const [circuitoCarta, setCircuitoCarta] = useState('');
  const [ultime4, setUltime4] = useState('');
  const [campoAttivo, setCampoAttivo] = useState<'descrizione' | 'ricerca' | null>(null);
  const listRef = useRef<FlatList<(typeof movimentiFiltrati)[number]> | null>(null);
  const cardNameRef = useRef<TextInput | null>(null);
  const cardCircuitRef = useRef<TextInput | null>(null);
  const cardLast4Ref = useRef<TextInput | null>(null);
  const incomeDescriptionRef = useRef<TextInput | null>(null);
  const searchMovementRef = useRef<TextInput | null>(null);
  const { focusField, scrollToField } = useKeyboardAwareScroll(listRef, {
    topOffset: responsive.isDesktop ? 72 : 168,
  });
  const handleKeyboardNext = useCallback(() => {
    const focusedInput = (
      TextInput.State as unknown as {
        currentlyFocusedInput?: () => TextInput | null;
      }
    ).currentlyFocusedInput?.();

    if (focusedInput === incomeDescriptionRef.current) {
      setShowAmountPicker(true);
      return;
    }

    focusNextInput(
      [cardNameRef, cardCircuitRef, cardLast4Ref, incomeDescriptionRef, searchMovementRef],
      focusField
    );
  }, [focusField]);
  const metodoPagamentoLabels = useMemo<Record<MetodoPagamento, string>>(
    () => ({
      Contanti: tApp(appLanguage, 'payment_method_cash'),
      Carta: 'POS esterno',
      Bonifico: tApp(appLanguage, 'payment_method_transfer'),
    }),
    [appLanguage]
  );

  const cartaPredefinita = useMemo(
    () => carteCollegate.find((item) => item.predefinita) ?? carteCollegate[0] ?? null,
    [carteCollegate]
  );

  const cartaAttiva = useMemo(() => {
    if (!cartaSelezionataId) return cartaPredefinita;
    return carteCollegate.find((item) => item.id === cartaSelezionataId) ?? cartaPredefinita;
  }, [cartaPredefinita, cartaSelezionataId, carteCollegate]);

  const [cashPeriod, setCashPeriod] = useState<'all' | 'today' | 'week' | 'month' | 'custom'>('all');
  const [showCardReferences, setShowCardReferences] = useState(false);
  const [showCashSettings, setShowCashSettings] = useState(false);
  const [reportStart, setReportStart] = useState(cashIsoDay(new Date(new Date().getFullYear(),new Date().getMonth(),1)));
  const [reportEnd, setReportEnd] = useState(cashIsoDay(new Date()));
  const [datePicker, setDatePicker] = useState<'start'|'end'|null>(null);
  const periodRange = cashPeriodRange(cashPeriod,reportStart,reportEnd);
  const periodLabel = cashPeriod === 'all' ? 'Tutto lo storico' : cashPeriod === 'today' ? 'Oggi' : cashPeriod === 'week' ? 'Questa settimana' : cashPeriod === 'month' ? 'Questo mese' : `${formatCashDate(reportStart)} — ${formatCashDate(reportEnd)}`;
  const periodMovements = movimenti.filter(item => {const date=resolveMovementDate(item);return !periodRange || !!date && date>=periodRange.from && date<periodRange.until;});
  const previousMovements = periodRange ? movimenti.filter(item => {const date=resolveMovementDate(item);return !!date && date>=periodRange.previousFrom && date<periodRange.previousUntil;}) : [];
  const previousTotal = summarizeCash(previousMovements).confirmed;
  const comparison = periodRange ? { previousTotal, label: `${formatCashDate(cashIsoDay(periodRange.previousFrom))} — ${formatCashDate(cashIsoDay(new Date(periodRange.previousUntil.getTime()-1)))}` } : undefined;
  const { confirmed: totale, card: incassoCarta, cash: incassoContanti, pending: daChiudere } = useMemo(() => summarizeCash(periodMovements), [periodMovements]);

  const canAdd = useMemo(() => {
    if (descrizione.trim() === '' || importo.trim() === '') return false;
    if (savingMovement) return false;
    return true;
  }, [descrizione, importo, savingMovement]);

  const canSaveCard = useMemo(() => {
    return (
      nomeCarta.trim() !== '' &&
      circuitoCarta.trim() !== '' &&
      ultime4.trim().length === 4
    );
  }, [nomeCarta, circuitoCarta, ultime4]);

  const movimentiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) return periodMovements;

    return periodMovements.filter((movimento) => {
      return (
        movimento.descrizione.toLowerCase().includes(testo) ||
        movimento.importo.toString().includes(testo) ||
        (movimento.metodo ?? '').toLowerCase().includes(testo) ||
        (movimento.cartaLabel ?? '').toLowerCase().includes(testo)
      );
    });
  }, [periodMovements, ricerca]);

  const movimentiOrdinati = useMemo(
    () =>
      [...movimentiFiltrati].sort((first, second) => {
        const firstPending = first.metodo ? 1 : 0;
        const secondPending = second.metodo ? 1 : 0;
        if (firstPending !== secondPending) return firstPending - secondPending;

        const firstTime = resolveMovementDate(first)?.getTime() ?? Number.NaN;
        const secondTime = resolveMovementDate(second)?.getTime() ?? Number.NaN;
        if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime)) {
          return secondTime - firstTime;
        }

        return second.id.localeCompare(first.id);
      }),
    [movimentiFiltrati]
  );

  const [movementPage, setMovementPage] = useState(0);
  const movementHeaderHeight = useRef(0);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(movimentiOrdinati.length / pageSize));
  const currentPage = Math.min(movementPage, pageCount - 1);
  const visibleMovements = useMemo(() => movimentiOrdinati.slice(currentPage * pageSize, (currentPage + 1) * pageSize), [movimentiOrdinati, currentPage]);
  React.useEffect(() => { setMovementPage(0); }, [cashPeriod, ricerca, reportStart, reportEnd]);
  const changeMovementPage = (page: number) => {
    setMovementPage(Math.max(0, Math.min(page, pageCount - 1)));
    listRef.current?.scrollToOffset({ offset: Math.max(0, movementHeaderHeight.current - 30), animated: false });
  };

  const exportCashReport = async (pdf = false) => {
    if (exportingReport) return;
    setExportingReport(true);
    try {
      const period = periodLabel;
      let stripeReport;
      if (stripeAvailable) {
        const result = await supabase.functions.invoke('cash-stripe', { body: { action: 'report', from: periodRange ? Math.floor(periodRange.from.getTime()/1000) : 0, until: periodRange ? Math.floor(periodRange.until.getTime()/1000) : Math.floor(Date.now()/1000)+1 } });
        if (result.error || result.data?.error) throw new Error('Report Stripe non disponibile');
        stripeReport = result.data;
      }
      if (pdf) {
        const html = buildCashPdf(periodMovements,period,salonWorkspace.salonName,entry=>resolveMovementDate(entry),comparison,stripeReport);
        if (Platform.OS === 'web') await CashPrint.printAsync({html});
        else { const result=await CashPrint.printToFileAsync({html}); await CashSharing.shareAsync(result.uri,{mimeType:'application/pdf',UTI:'com.adobe.pdf'}); }
        return;
      }
      const data = writeCashWorkbook(buildCashWorkbook(periodMovements, period, salonWorkspace.salonName, entry => resolveMovementDate(entry), comparison, stripeReport));
      const name = `cassa-${cashPeriod}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), char => char.charCodeAt(0))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const link = document.createElement('a'); link.href = url; link.download = name; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        const fs = CashFileSystem;
        const sharing = CashSharing;
        if (!fs.cacheDirectory || !await sharing.isAvailableAsync()) throw new Error('Esportazione non disponibile su questo dispositivo.');
        const uri = fs.cacheDirectory + name;
        await fs.writeAsStringAsync(uri, data, { encoding: fs.EncodingType.Base64 });
        await sharing.shareAsync(uri, { mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', UTI: 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Salva report Cassa' });
      }
    } catch { Alert.alert('Report Cassa', 'Impossibile esportare il report. Verifica che la build sia aggiornata e riprova.'); }
    finally { setExportingReport(false); }
  };

  const [quickRole, setQuickRole] = useState('all');
  const quickServicesRef = useRef<ScrollView | null>(null);
  const quickRoleKey = (value?: string) => value?.trim().toLocaleLowerCase('it') || 'senza-mestiere';
  const quickRoles = useMemo(() => {
    const roles = new Map<string, { key: string; label: string; count: number }>();
    servizi.forEach(service => {
      const key = quickRoleKey(service.mestiereRichiesto);
      const role = roles.get(key);
      if (role) role.count += 1;
      else roles.set(key, { key, label: service.mestiereRichiesto?.trim() || 'Senza mestiere', count: 1 });
    });
    return [{ key: 'all', label: 'Tutti', count: servizi.length }, ...roles.values()];
  }, [servizi]);
  React.useEffect(() => { if (!quickRoles.some(role => role.key === quickRole)) setQuickRole('all'); }, [quickRoles, quickRole]);
  const quickServices = useMemo(() => servizi.filter(service => quickRole === 'all' || quickRoleKey(service.mestiereRichiesto) === quickRole), [servizi, quickRole]);

  const suggerimentiDescrizione = useMemo<SuggerimentoDescrizione[]>(() => {
    const testo = descrizione.trim().toLowerCase();
    const suggerimentiServizi = servizi
      .filter((servizio) => (testo ? servizio.nome.toLowerCase().includes(testo) : true))
      .map((servizio) => ({
        id: `servizio-${servizio.id}`,
        label: `${servizio.nome} · € ${servizio.prezzo.toFixed(2)}`,
        value: servizio.nome,
        prezzo: servizio.prezzo,
      }));

    const suggerimentiMovimenti = movimenti
      .filter((movimento) =>
        testo ? movimento.descrizione.toLowerCase().includes(testo) : true
      )
      .map((movimento) => ({
        id: `movimento-${movimento.id}`,
        label: movimento.descrizione,
        value: movimento.descrizione,
      }));

    const suggerimentiClienti = clienti
      .filter((cliente) => (testo ? cliente.nome.toLowerCase().includes(testo) : true))
      .map((cliente) => ({
        id: `cliente-${cliente.id}`,
        label: `${cliente.nome} · ${cliente.telefono}`,
        value: cliente.nome,
      }));

    return [...suggerimentiServizi, ...suggerimentiMovimenti, ...suggerimentiClienti]
      .filter(
        (suggerimento, index, array) =>
          array.findIndex((item) => item.value === suggerimento.value) === index
      )
      .slice(0, 6);
  }, [clienti, descrizione, movimenti, servizi]);

  const suggerimentiRicerca = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    return movimenti
      .filter((movimento) =>
        testo
          ? movimento.descrizione.toLowerCase().includes(testo) ||
            movimento.importo.toString().includes(testo) ||
            (movimento.metodo ?? '').toLowerCase().includes(testo) ||
            (movimento.cartaLabel ?? '').toLowerCase().includes(testo)
          : true
      )
      .slice(0, 6);
  }, [periodMovements, ricerca]);

  const closeActiveSuggestions = useCallback(() => {
    Keyboard.dismiss();
    setCampoAttivo(null);
  }, []);

  const handleCashListScrollBeginDrag = useCallback(() => {
    if (ENABLE_ANDROID_BACKOFFICE_PERF_LOGS) {
      cassaPerfCountersRef.current.scrollBeginEvents += 1;
    }
    closeActiveSuggestions();
  }, [closeActiveSuggestions]);

  useFocusEffect(
    useCallback(() => {
      if (!active) return;

      return () => {
        closeActiveSuggestions();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      };
    }, [active, closeActiveSuggestions])
  );

  useFocusEffect(
    useCallback(() => {
      if (!active) return;

      const storageKey = buildCashIntroStorageKey(salonAccountEmail);
      let isActive = true;

      if (cashIntroCheckedKeyRef.current === storageKey) {
        return () => {
          isActive = false;
        };
      }

      cashIntroCheckedKeyRef.current = storageKey;
      void AsyncStorage.getItem(storageKey)
        .then((value) => {
          if (isActive && value !== 'true') {
            setShowCashIntroModal(true);
          }
        })
        .catch(() => undefined);

      return () => {
        isActive = false;
      };
    }, [active, salonAccountEmail])
  );

  const dismissCashIntroModal = useCallback(async () => {
    setShowCashIntroModal(false);
    await AsyncStorage.setItem(buildCashIntroStorageKey(salonAccountEmail), 'true').catch(
      () => undefined
    );
  }, [salonAccountEmail]);

  const aggiungiMovimento = async () => {
    if (!canAdd || cashWriteLock.current) return;

    const valore = Number(importo.replace(',', '.'));
    if (!Number.isFinite(valore) || valore <= 0) return;
    cashWriteLock.current = true;
    setSavingMovement(true);
    try {

    const result = await createMovimentoPersisted({
      descrizione: descrizione.trim(),
      importo: valore,
      metodo: metodoPagamento,
      cartaLabel: metodoPagamento === 'Carta' ? 'POS esterno' : undefined,
      createdAt: new Date().toISOString(),
    });

    if (!result.ok) {
      Alert.alert('Salvataggio non riuscito', result.error ?? 'Non sono riuscito a registrare il movimento.');
      return;
    }

    setDescrizione('');
    setImporto('');
    setCampoAttivo(null);
    } finally { cashWriteLock.current = false; setSavingMovement(false); }
  };

  const salvaCarta = async () => {
    if (!canSaveCard) return;

    const result = await createCartaPersisted({
      nome: nomeCarta.trim(),
      circuito: circuitoCarta.trim(),
      ultime4: ultime4.trim(),
      predefinita: carteCollegate.length === 0,
    });

    if (!result.ok) {
      Alert.alert('Salvataggio non riuscito', result.error ?? 'Non sono riuscito a salvare il riferimento.');
      return;
    }

    setCartaSelezionataId(result.cardId ?? null);
    setNomeCarta('');
    setCircuitoCarta('');
    setUltime4('');
  };

  const impostaCartaPredefinita = async (id: string) => {
    const result = await setDefaultCartaPersisted(id);
    if (!result.ok) {
      Alert.alert('Aggiornamento non riuscito', result.error ?? 'Non sono riuscito ad aggiornare la carta.');
      return;
    }
    setCartaSelezionataId(id);
  };

  const eliminaCarta = async (id: string) => {
    const result = await deleteCartaPersisted(id);
    if (!result.ok) {
      Alert.alert('Eliminazione non riuscita', result.error ?? 'Non sono riuscito a eliminare la carta.');
      return;
    }

    if (cartaSelezionataId === id) {
      const primaRestante = carteCollegate.find((item) => item.id !== id);
      setCartaSelezionataId(primaRestante?.id ?? null);
    }
  };

  const selezionaServizio = (nome: string, prezzo: number) => {
    setDescrizione(nome);
    setImporto(prezzo.toString());
  };

  const selezionaSuggerimentoDescrizione = (item: SuggerimentoDescrizione) => {
    setDescrizione(item.value);
    if (typeof item.prezzo === 'number') {
      setImporto(item.prezzo.toString());
    }
    setCampoAttivo(null);
  };

  const assegnaMetodoMovimento = useCallback(async (id: string, metodo: MetodoPagamento) => {
    if (cashWriteLock.current) return;
    cashWriteLock.current = true;
    try {
    const result = await updateMovimentoPersisted(id, {
      metodo,
      cartaLabel: metodo === 'Carta' ? 'POS esterno' : undefined,
    });

    if (!result.ok) {
      if (result.error?.includes('Pagamento Stripe associato')) {
        const label = metodoPagamentoLabels[metodo];
        const resolveStripe = async () => {
          if (cashWriteLock.current) return;
          cashWriteLock.current = true;
          try {
            const payment = await callCashStripe('cancel', id);
            if (payment.status === 'paid' || payment.status === 'succeeded') {
              Alert.alert('Già pagato con Stripe', 'Il pagamento risulta ricevuto. La Cassa si aggiorna automaticamente: non registrare un secondo incasso.');
              return;
            }
            if (payment.status !== 'expired') {
              Alert.alert('Pagamento da verificare', 'Stripe non ha ancora confermato l’annullamento. Apri Incassa e verifica il pagamento prima di registrarlo con un altro metodo.');
              return;
            }
            const saved = await updateMovimentoPersisted(id, { metodo, cartaLabel: metodo === 'Carta' ? 'POS esterno' : undefined });
            if (!saved.ok) Alert.alert('Registrazione non riuscita', saved.error ?? 'Riprova: il pagamento Stripe è stato annullato.');
          } catch (error) {
            Alert.alert('Verifica non riuscita', error instanceof Error ? error.message : 'Riprova tra poco. Nessun incasso manuale è stato registrato.');
          } finally { cashWriteLock.current = false; }
        };
        const message = `Questo movimento ha un tentativo Stripe associato. Per registrare ${label.toLowerCase()} occorre prima annullarlo. Continua solo se hai già ricevuto il pagamento.`;
        // Release before presenting the confirmation (web confirmation is synchronous).
        cashWriteLock.current = false;
        if (Platform.OS === 'web') {
          if (window.confirm(message)) await resolveStripe();
        } else {
          Alert.alert('Passa a ' + label.toLowerCase(), message, [
            { text: 'Indietro', style: 'cancel' },
            { text: 'Annulla Stripe e registra', onPress: () => { void resolveStripe(); } },
          ]);
        }
      } else {
        Alert.alert('Aggiornamento non riuscito', result.error ?? 'Non sono riuscito ad aggiornare il movimento.');
      }
    }
    } finally { cashWriteLock.current = false; }
  }, [updateMovimentoPersisted]);

  const getMovementTitle = useCallback((description: string) => {
    if (description.startsWith('Incasso automatico fine giornata')) {
      return description.replace('Incasso automatico fine giornata · ', '');
    }

    return description;
  }, []);

  const matchMovementService = useMemo(() => createCashServiceMatcher(servizi), [servizi]);
  const keyExtractor = useCallback((item: (typeof movimentiOrdinati)[number]) => item.id, []);

  const renderCashMovementItem = useCallback(
    ({ item, index }: { item: (typeof movimentiOrdinati)[number]; index: number }) => {
      const title = getMovementTitle(item.descrizione);
      // Historical entries have no service id: only use an unambiguous catalog match.
      const service = matchMovementService(title);
      const roleAccent = service ? resolveServiceAccent({ roleName: service.mestiereRichiesto, roleColorOverrides: roleCardColorOverrides, preferRoleColor: true }) : undefined;
      const parts = isLegacyAutoCashout(item) ? title.split(' · ') : [title];
      const serviceTitle = parts[0];
      const customerTitle = parts.slice(1).join(' · ');
      return (
      <>
        {index === 0 || (!!visibleMovements[index - 1]?.metodo !== !!item.metodo) ? (
          <View
            style={[
              styles.sectionLabelWrap,
              styles.itemCardShell,
              { maxWidth: responsive.contentMaxWidth },
            ]}
          >
            <Text style={styles.sectionLabelText}>
              {item.metodo ? 'Registrati in cassa' : 'Da chiudere'}
            </Text>
          </View>
        ) : null}
        {index === 0 ||
        (!!visibleMovements[index - 1]?.metodo !== !!item.metodo) ||
        getMovementDateKey(visibleMovements[index - 1] ?? { id: '' }) !== getMovementDateKey(item) ? (
          <View
            style={[
              styles.dateSectionWrap,
              styles.itemCardShell,
              { maxWidth: responsive.contentMaxWidth },
            ]}
          >
            <View style={styles.dateSectionPill}>
              <Text style={styles.dateSectionText}>{formatMovementDateLabel(item)}</Text>
            </View>
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.itemCard,
            item.metodo
              ? item.metodo === 'Carta'
                ? styles.itemCardCard
                : item.metodo === 'Bonifico'
                ? styles.itemCardTransfer
                : styles.itemCardCash
              : styles.itemCardPending,
            styles.itemCardShell,
            { maxWidth: responsive.contentMaxWidth },
          ]}
          layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
          entering={FadeIn.duration(145).easing(Easing.out(Easing.cubic))}
          exiting={FadeOut.duration(120).easing(Easing.out(Easing.cubic))}
        >
          <View style={styles.movementServiceHeader}>
            {service?.mestiereRichiesto ? <View style={[styles.movementRole, { backgroundColor: blendServiceAccentWithWhite(roleAccent?.bg ?? '#E2E8F0', 0.78), borderColor: blendServiceAccentWithWhite(roleAccent?.border ?? '#CBD5E1', 0.65) }]}><Text style={styles.movementRoleText}>{service.mestiereRichiesto}</Text></View> : null}
            <Text style={[styles.itemDescription, { marginBottom: customerTitle ? 4 : 0 }]}>{serviceTitle}</Text>
            {customerTitle ? <Text style={styles.movementCustomer}>{customerTitle}</Text> : null}
          </View>
          <View style={styles.itemTop}>
            <View style={styles.itemMainInfo}>
              <View style={styles.itemMetaRow}>
                <Animated.View
                  style={[
                    styles.itemMetaBadge,
                    item.metodo
                      ? item.metodo === 'Carta'
                        ? styles.itemMetaBadgeBlue
                        : item.metodo === 'Bonifico'
                        ? styles.itemMetaBadgeViolet
                        : styles.itemMetaBadgeCash
                      : styles.itemMetaBadgePending,
                  ]}
                  entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                >
                  <Text
                    style={[
                      styles.itemMetaBadgeText,
                      item.metodo
                        ? item.metodo === 'Carta'
                          ? styles.itemMetaBadgeBlueText
                          : item.metodo === 'Bonifico'
                          ? styles.itemMetaBadgeVioletText
                          : styles.itemMetaBadgeCashText
                        : styles.itemMetaBadgePendingText,
                    ]}
                  >
                    {isLegacyAutoCashout(item) ? 'Automatica storica' : item.metodo ? (item.metodo === 'Carta' && item.cartaLabel?.startsWith('Stripe') ? (item.cartaLabel === 'Stripe · Contactless' ? 'Carta · Contactless' : 'Carta · Stripe') : metodoPagamentoLabels[item.metodo]) : tApp(appLanguage, 'cash_to_close_status')}
                  </Text>
                </Animated.View>
                {item.cartaLabel ? (
                  <Animated.View
                    style={[styles.itemMetaBadge, styles.itemMetaBadgeInk]}
                    entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                    layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                  >
                    <Text style={[styles.itemMetaBadgeText, styles.itemMetaBadgeInkText]}>
                      {item.cartaLabel}
                    </Text>
                  </Animated.View>
                ) : null}
                <Animated.View
                  style={[styles.itemMetaBadge, styles.itemMetaBadgeStamp]}
                  entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={[styles.itemMetaBadgeText, styles.itemMetaBadgeStampText]}>
                    {isLegacyAutoCashout(item) ? 'Orario non verificato' : formatMovementStamp(item)}
                  </Text>
                </Animated.View>
              </View>
            </View>

            <View style={styles.itemAmountWrap}>
              <Text
                style={[
                  styles.itemAmountEyebrow,
                  item.metodo ? styles.itemAmountEyebrowDone : styles.itemAmountEyebrowPending,
                ]}
              >
                {isLegacyAutoCashout(item) ? 'Da verificare' : item.metodo ? 'Registrato' : 'Da incassare'}
              </Text>
              <Text
                style={[
                  styles.itemAmount,
                  item.metodo
                    ? item.metodo === 'Carta'
                      ? styles.itemAmountCard
                      : item.metodo === 'Bonifico'
                      ? styles.itemAmountTransfer
                      : styles.itemAmountCash
                    : styles.itemAmountPending,
                ]}
              >
                {formatCash(item.importo)}
              </Text>
            </View>
          </View>

          {!item.metodo ? <LoyaltyCheckoutReminder movementId={item.id} workspaceId={salonWorkspace.id}/> : null}
          {!item.metodo && item.importo > 0 ? (
            <View style={styles.pendingMethodsRow}>
              {stripeAvailable ? <HapticTouchable style={styles.pendingMethodChip} onPress={() => setStripeMovement({ id: item.id, importo: item.importo })}><Text style={styles.pendingMethodChipText}>Incassa</Text></HapticTouchable> : null}
              {METODI_PAGAMENTO.map((metodo) => (
                <HapticTouchable
                  key={`${item.id}-${metodo}`}
                  style={styles.pendingMethodChip}
                  onPress={() => assegnaMetodoMovimento(item.id, metodo)}
                  pressScale={0.98}
                  pressOpacity={0.98}
                >
                  <Text style={styles.pendingMethodChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {metodoPagamentoLabels[metodo]}
                  </Text>
                </HapticTouchable>
              ))}
            </View>
          ) : null}
        </Animated.View>
      </>
    );
    },
    [
      matchMovementService,
      serviceCardColorOverrides,
      roleCardColorOverrides,
      appLanguage,
      assegnaMetodoMovimento,
      getMovementTitle,
      metodoPagamentoLabels,
      visibleMovements,
      stripeAvailable,
      responsive.contentMaxWidth,
    ]
  );

  React.useEffect(() => {
    const inboundValue = salonWorkspace.cashSectionDisabled;
    const inboundUpdatedAtMs = parseWorkspaceUpdatedAtMs(salonWorkspace.updatedAt);

    if (IS_WEB) {
      if (cashDisplaySyncTimerRef.current) {
        clearTimeout(cashDisplaySyncTimerRef.current);
        cashDisplaySyncTimerRef.current = null;
      }
      if (cashPendingDesiredTimeoutRef.current) {
        clearTimeout(cashPendingDesiredTimeoutRef.current);
        cashPendingDesiredTimeoutRef.current = null;
      }
      cashPendingDesiredRef.current = null;
      if (Number.isFinite(inboundUpdatedAtMs)) {
        cashLastAcceptedWorkspaceUpdatedAtRef.current = inboundUpdatedAtMs;
      }
      setDisplayedCashSectionDisabled(inboundValue);
      return;
    }

    if (cashPendingDesiredRef.current !== null) {
      if (inboundValue === cashPendingDesiredRef.current) {
        if (cashDisplaySyncTimerRef.current) {
          clearTimeout(cashDisplaySyncTimerRef.current);
          cashDisplaySyncTimerRef.current = null;
        }
        if (cashPendingDesiredTimeoutRef.current) {
          clearTimeout(cashPendingDesiredTimeoutRef.current);
          cashPendingDesiredTimeoutRef.current = null;
        }
        cashPendingDesiredRef.current = null;
        if (Number.isFinite(inboundUpdatedAtMs)) {
          cashLastAcceptedWorkspaceUpdatedAtRef.current = inboundUpdatedAtMs;
        }
        cashStableUntilRef.current = Date.now() + 1200;
        if (displayedCashSectionDisabled !== inboundValue) {
          setDisplayedCashSectionDisabled(inboundValue);
        }
      }
      return;
    }

    if (
      Number.isFinite(inboundUpdatedAtMs) &&
      Number.isFinite(cashLastAcceptedWorkspaceUpdatedAtRef.current) &&
      inboundUpdatedAtMs < cashLastAcceptedWorkspaceUpdatedAtRef.current &&
      inboundValue !== displayedCashSectionDisabled
    ) {
      return;
    }

    if (displayedCashSectionDisabled === inboundValue) {
      if (cashDisplaySyncTimerRef.current) {
        clearTimeout(cashDisplaySyncTimerRef.current);
        cashDisplaySyncTimerRef.current = null;
      }
      if (Number.isFinite(inboundUpdatedAtMs)) {
        cashLastAcceptedWorkspaceUpdatedAtRef.current = Math.max(
          cashLastAcceptedWorkspaceUpdatedAtRef.current,
          inboundUpdatedAtMs
        );
      }
      return;
    }

    if (cashDisplaySyncTimerRef.current) {
      clearTimeout(cashDisplaySyncTimerRef.current);
    }

    cashDisplaySyncTimerRef.current = setTimeout(() => {
      cashDisplaySyncTimerRef.current = null;
      const latestInboundUpdatedAtMs = parseWorkspaceUpdatedAtMs(salonWorkspace.updatedAt);
      if (
        Number.isFinite(latestInboundUpdatedAtMs) &&
        Number.isFinite(cashLastAcceptedWorkspaceUpdatedAtRef.current) &&
        latestInboundUpdatedAtMs < cashLastAcceptedWorkspaceUpdatedAtRef.current &&
        salonWorkspace.cashSectionDisabled !== displayedCashSectionDisabled
      ) {
        return;
      }

      if (Number.isFinite(latestInboundUpdatedAtMs)) {
        cashLastAcceptedWorkspaceUpdatedAtRef.current = Math.max(
          cashLastAcceptedWorkspaceUpdatedAtRef.current,
          latestInboundUpdatedAtMs
        );
      }
      cashStableUntilRef.current = Date.now() + 1800;
      setDisplayedCashSectionDisabled(salonWorkspace.cashSectionDisabled);
    }, Math.max(CASH_CONTROL_INBOUND_COMMIT_MS, cashStableUntilRef.current - Date.now()));
  }, [
    displayedCashSectionDisabled,
    salonWorkspace.cashSectionDisabled,
    salonWorkspace.updatedAt,
  ]);

  React.useEffect(
    () => () => {
      if (cashDisplaySyncTimerRef.current) {
        clearTimeout(cashDisplaySyncTimerRef.current);
      }
      if (cashPendingDesiredTimeoutRef.current) {
        clearTimeout(cashPendingDesiredTimeoutRef.current);
      }
    },
    []
  );

  const applyCashSectionDisabled = useCallback(
    async (nextValue: boolean) => {
      if (cashPendingDesiredTimeoutRef.current) {
        clearTimeout(cashPendingDesiredTimeoutRef.current);
      }
      cashPendingDesiredRef.current = nextValue;
      cashPendingDesiredTimeoutRef.current = setTimeout(() => {
        cashPendingDesiredTimeoutRef.current = null;
        cashPendingDesiredRef.current = null;
        setDisplayedCashSectionDisabled(salonWorkspace.cashSectionDisabled);
      }, CASH_CONTROL_PENDING_CONFIRMATION_TIMEOUT_MS);
      cashLastAcceptedWorkspaceUpdatedAtRef.current = Date.now();
      setDisplayedCashSectionDisabled(nextValue);
      cashStableUntilRef.current = Date.now() + CASH_CONTROL_STABLE_MS;
      await updateSalonWorkspacePersisted((current) => ({
        ...current,
        cashSectionDisabled: nextValue,
      }));
    },
    [salonWorkspace.cashSectionDisabled, updateSalonWorkspacePersisted]
  );

  const handleCashSectionToggle = useCallback(() => {
    if (isCashSectionTogglePending) {
      return;
    }

    const confirmToggle = (
      title: string,
      body: string,
      onConfirm: () => void | Promise<void>
    ) => {
      if (IS_WEB && typeof window !== 'undefined') {
        const confirmed = window.confirm(`${title}\n\n${body}`);
        if (!confirmed) return;
        setIsCashSectionTogglePending(true);
        void Promise.resolve(onConfirm()).finally(() => {
          setIsCashSectionTogglePending(false);
        });
        return;
      }

      Alert.alert(title, body, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: title.toLowerCase().includes('disabilita') ? 'Disabilita Cassa' : 'Riabilita Cassa',
          style: title.toLowerCase().includes('disabilita') ? 'destructive' : 'default',
          onPress: () => {
            setIsCashSectionTogglePending(true);
            void Promise.resolve(onConfirm()).finally(() => {
              setIsCashSectionTogglePending(false);
            });
          },
        },
      ]);
    };

    if (displayedCashSectionDisabled) {
      confirmToggle(
        'Riabilita Cassa',
        'Confermando, la sezione Cassa tornerà visibile con tutti i contenuti e i movimenti già registrati.',
        async () => {
          await applyCashSectionDisabled(false);
        }
      );
      return;
    }

    confirmToggle(
      'Disabilita Cassa',
      stripeAvailable ? 'Nascondi i contenuti della Cassa mantenendo i movimenti salvati. Stripe resta collegato e i link di pagamento già creati restano attivi.' : 'Nascondi i contenuti della Cassa mantenendo i movimenti salvati. Puoi riattivare la sezione quando vuoi.',
      async () => {
        await applyCashSectionDisabled(true);
      }
    );
  }, [
    applyCashSectionDisabled,
    isCashSectionTogglePending,
    displayedCashSectionDisabled,
  ]);

  const handleCashIntroDisable = useCallback(() => {
    if (isCashSectionTogglePending) {
      return;
    }

    setIsCashSectionTogglePending(true);
    void dismissCashIntroModal()
      .then(() => applyCashSectionDisabled(true))
      .finally(() => {
        setIsCashSectionTogglePending(false);
      });
  }, [applyCashSectionDisabled, dismissCashIntroModal, isCashSectionTogglePending]);

  const webMovement=(item:(typeof movimenti)[number])=>({...item,title:getMovementTitle(item.descrizione),stamp:formatMovementStamp(item),legacy:isLegacyAutoCashout(item),methodLabel:isLegacyAutoCashout(item)?'Automatica storica':item.metodo==='Carta'?item.cartaLabel?.startsWith('Stripe')?'Carta · Stripe':'POS esterno':item.metodo||'—'});
  const premiumCashModel = {active,
 total:totale,cash:incassoContanti,card:incassoCarta,pending:daChiudere,loading:cashDataLoading,
 period:cashPeriod,onPeriod:setCashPeriod,periodLabel,start:reportStart,end:reportEnd,
 onStart:(value:string)=>{setReportStart(value);if(value>reportEnd)setReportEnd(value);},onEnd:(value:string)=>{setReportEnd(value);if(value<reportStart)setReportStart(value);},
 query:ricerca,onQuery:setRicerca,count:movimentiOrdinati.length,page:currentPage,pages:pageCount,onPage:changeMovementPage,
 movements:visibleMovements.map(webMovement),getMovement:(id:string)=>{const item=movimenti.find(item=>item.id===id);return item?webMovement(item):null;},
 suggestions:suggerimentiDescrizione,onSuggestion:selezionaSuggerimentoDescrizione,
 references:{items:carteCollegate,name:nomeCarta,onName:(value:string)=>setNomeCarta(formatLeadingCapitalizedValue(value)),network:circuitoCarta,onNetwork:(value:string)=>setCircuitoCarta(formatLeadingCapitalizedValue(value)),last4:ultime4,onLast4:setUltime4,canSave:canSaveCard,onSave:salvaCarta,onDefault:impostaCartaPredefinita,onRemove:eliminaCarta},
 services:servizi.filter(item=>item.soloComposizione!==true),description:descrizione,onDescription:(value:string)=>setDescrizione(formatLeadingCapitalizedValue(value)),amount:importo,onAmount:setImporto,method:metodoPagamento,onMethod:setMetodoPagamento,
 onService:(id:string)=>{const service=servizi.find(item=>item.id===id);if(service)selezionaServizio(service.nome,service.prezzo);},
 canSave:canAdd&&Number.isFinite(Number(importo.replace(',','.')))&&Number(importo.replace(',','.'))>0,saving:savingMovement,onSave:aggiungiMovimento,onSetMethod:assegnaMetodoMovimento,
 onStripeMovement:(item:{id:string;importo:number})=>setStripeMovement(item),stripeAvailable,loyalty:(id:string)=><LoyaltyCheckoutReminder movementId={id} workspaceId={salonWorkspace.id}/>,
 disabled:displayedCashSectionDisabled,onToggleDisabled:handleCashSectionToggle,toggling:isCashSectionTogglePending,onExport:exportCashReport,exporting:exportingReport,comparison,
 shop:<ShopEntry workspaceId={salonWorkspace.id} compact entryPoint="checkout" renderTrigger={(onPress,needsAttention)=><CashShopTrigger onPress={onPress} needsAttention={needsAttention}/>}/>,
 panels:{
 payments:<CashStripePanel inlineCheckout key={`stripe-${salonWorkspace.id}-${salonAccountEmail}`} pendingMovements={movimenti.filter(item=>!item.metodo&&!isLegacyAutoCashout(item))} onSelectMovement={setStripeMovement} movement={stripeMovement} onClose={()=>setStripeMovement(null)} active={active} onAvailabilityChange={setStripeAvailable}/>,
 refunds:<AppointmentRefundSummary workspaceId={salonWorkspace.id} active={active}/>,
 policy:<BookingPaymentPolicyEditor standalone key={`booking-payments-${salonWorkspace.id}-${salonAccountEmail}`} workspaceId={salonWorkspace.id} active={active}/>,
 fiscal:<CashFiscalPanel inline key={`fiscal-${salonWorkspace.id}-${salonAccountEmail}`}/>,
 archive:<CashFiscalArchive inline key={`archive-${salonWorkspace.id}-${salonAccountEmail}`}/>,
 expenses:<MonthlyFinancialReport inline workspaceId={salonWorkspace.id} email={salonAccountEmail||'mail del titolare'}/>,
 }
 };
  if(access) return IS_WEB?<CashWebWorkspace access={access} model={premiumCashModel}/>:<CashNativeWorkspace access={access} model={premiumCashModel}/>;

  return (
    <View style={styles.container}>
      <NativeDatePickerModal visible={datePicker !== null} title={datePicker === 'start' ? 'Data iniziale' : 'Data finale'} initialValue={datePicker === 'start' ? reportStart : reportEnd} onClose={() => setDatePicker(null)} onConfirm={value => { if(datePicker === 'start'){setReportStart(value);if(value>reportEnd)setReportEnd(value);}else{setReportEnd(value);if(value<reportStart)setReportStart(value);}setDatePicker(null); }} />
      <FlatList
        ref={listRef}
        data={displayedCashSectionDisabled || cashDataLoading ? [] : visibleMovements}
        keyExtractor={keyExtractor}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        updateCellsBatchingPeriod={80}
        windowSize={7}
        removeClippedSubviews={IS_ANDROID}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={handleCashListScrollBeginDrag}
        ListHeaderComponent={
          <View onLayout={event => { movementHeaderHeight.current = event.nativeEvent.layout.height; }} style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="cassa"
                title={tApp(appLanguage, 'tab_cash')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                iconOffsetY={2}
                onNativeCashBackPress={onClose}
              />

              <View style={styles.periodBar}>
                {([['all', 'Storico'], ['today', 'Oggi'], ['month', 'Questo mese'], ['custom', 'Periodo']] as const).map(([value, label]) => (
                  <HapticTouchable key={value} accessibilityRole="button" accessibilityState={{ selected: cashPeriod === value }} onPress={() => setCashPeriod(value)} style={[styles.periodButton, cashPeriod === value && styles.periodButtonSelected]}>
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={[styles.periodText, cashPeriod === value && styles.periodTextSelected]}>{label}</Text>
                  </HapticTouchable>
                ))}
              </View>
              {cashPeriod === 'custom' ? <View style={styles.dateFields}>
                {(['start','end'] as const).map(edge => <HapticTouchable key={edge} accessibilityRole="button" accessibilityLabel={edge === 'start' ? 'Scegli data iniziale' : 'Scegli data finale'} style={styles.dateField} onPress={() => setDatePicker(edge)}>
                  <Text style={styles.dateFieldLabel}>{edge === 'start' ? 'Dal' : 'Al'}</Text>
                  <View style={styles.dateFieldValueRow}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.dateFieldValue}>{formatCashDate(edge === 'start' ? reportStart : reportEnd)}</Text><Ionicons name="calendar-outline" size={17} color="#526781" /></View>
                </HapticTouchable>)}
              </View> : null}
              {IS_WEB ? <View style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                  {[
                    { label: 'Incassi confermati', value: totale, caption: 'Totale incassato', color: '#18745B', background: '#EAF7F0', icon: 'checkmark-circle-outline' as const },
                    { label: 'Carta', value: incassoCarta, caption: 'Compresi nel totale', color: '#3265AB', background: '#EDF4FF', icon: 'card-outline' as const },
                    { label: 'Contanti', value: incassoContanti, caption: 'Compresi nel totale', color: '#956A23', background: '#FFF6E8', icon: 'cash-outline' as const },
                    { label: 'Da chiudere', value: daChiudere, caption: 'Ancora da saldare', color: '#AC4D61', background: '#FFF0F2', icon: 'time-outline' as const },
                  ].map(metric => <View key={metric.label} style={{ flexGrow: 1, flexBasis: responsive.isDesktop ? '22%' : '45%', minWidth: 0, minHeight: 134, borderRadius: 20, padding: 18, gap: 8, backgroundColor: metric.background }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name={metric.icon} size={19} color={metric.color} /><Text style={{ color: metric.color, fontSize: 13, fontWeight: '600', flex: 1 }}>{metric.label}</Text></View>
                    <OwnerDataLoading loading={cashDataLoading}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: '#0F172A', fontSize: 28, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatCash(metric.value)}</Text></OwnerDataLoading>
                    <Text style={{ color: '#617086', fontSize: 12 }}>{metric.caption}</Text>
                  </View>)}
                </View>
              </View> : <>
              <View style={styles.heroStatsRow}>
                <Animated.View
                  style={styles.heroStatCardMint}
                  entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                >
                  <OwnerDataLoading loading={cashDataLoading}><Text style={styles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit={false}>{formatCash(totale)}</Text></OwnerDataLoading>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>Incassi confermati</Text>
                </Animated.View>

                <Animated.View
                  style={styles.heroStatCardBlue}
                  entering={FadeIn.duration(150).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(170).easing(Easing.out(Easing.cubic))}
                >
                  <OwnerDataLoading loading={cashDataLoading}><Text style={styles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit={false}>{formatCash(incassoCarta)}</Text></OwnerDataLoading>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{tApp(appLanguage, 'cash_card_payments')}</Text>
                </Animated.View>
              </View>

              <View style={styles.heroStatsRowBottom}>
                <Animated.View
                  style={[styles.heroMiniChip, styles.heroMiniChipCash]}
                  entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                >
                  <OwnerDataLoading loading={cashDataLoading}><Text style={styles.heroMiniChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_cash_chip')} {formatCash(incassoContanti)}</Text></OwnerDataLoading>
                </Animated.View>
                <Animated.View
                  style={[styles.heroMiniChip, styles.heroMiniChipPending]}
                  entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                >
                  <OwnerDataLoading loading={cashDataLoading}><Text style={styles.heroMiniChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_to_close_chip')} {formatCash(daChiudere)}</Text></OwnerDataLoading>
                </Animated.View>

              </View>
              </>}
            </View>

            <View style={styles.cashAreaHeading}>
              <Text accessibilityRole="header" style={styles.cashAreaTitle}>Incassi e pagamenti</Text>
            </View>

            <View style={[styles.settingsRow, Platform.OS === 'web' && showCashSettings && styles.settingsRowExpanded]}>
            <HapticTouchable
              accessibilityRole="button"
              accessibilityLabel={`Gestione Cassa, ${displayedCashSectionDisabled ? 'disattivata' : 'attiva'}`}
              accessibilityHint={showCashSettings ? 'Chiude le opzioni di attivazione' : 'Mostra le opzioni di attivazione'}
              accessibilityState={{ expanded: showCashSettings }}
              onPress={() => setShowCashSettings(value => !value)}
              hapticType="light"
              pressScale={0.985}
              pressOpacity={0.94}
              webHoverLift={false}
              style={[styles.settingsLabel, { paddingVertical: 0 }]}
            >
              <View style={styles.settingsIconTile}><Ionicons name="options-outline" size={23} color={'#62718C'} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Text style={styles.settingsText}>Gestione Cassa</Text>
                <View style={[styles.settingsStatus, displayedCashSectionDisabled && { backgroundColor: '#F1F5F9' }]}>
                  <View style={[styles.settingsStatusDot, displayedCashSectionDisabled && { backgroundColor: '#8491A3' }]} />
                  <Text style={[styles.settingsStatusText, displayedCashSectionDisabled && { color: '#64748B' }]}>{displayedCashSectionDisabled ? 'Disattivata' : 'Attiva'}</Text>
                </View>
              </View>
            </HapticTouchable>
              <PremiumExpandButton salon compact expanded={showCashSettings} onPress={() => setShowCashSettings(value => !value)} accessibilityLabel={showCashSettings ? 'Chiudi gestione Cassa' : 'Apri gestione Cassa'} />
            </View>
            {showCashSettings ? <CashSettingsPopup onClose={() => setShowCashSettings(false)}>
            <View
              style={[
                styles.cashDisableCard,
                Platform.OS !== 'web' && { marginTop: 0, marginBottom: 0, padding: 0, borderWidth: 0, shadowOpacity: 0, elevation: 0 },
                displayedCashSectionDisabled && styles.cashDisableCardActive,
              ]}
            >
              <View style={styles.cashDisableHeader}>
                <Text style={styles.cashDisableEyebrow}>Visibilità sezione</Text>
                <Text style={styles.cashDisableTitle}>
                  {displayedCashSectionDisabled
                    ? 'Sezione Cassa disabilitata'
                    : 'Sezione Cassa attiva'}
                </Text>
                <View
                  style={[
                    styles.cashDisableBadge,
                    displayedCashSectionDisabled
                      ? styles.cashDisableBadgeActive
                      : styles.cashDisableBadgeIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.cashDisableBadgeText,
                      displayedCashSectionDisabled
                        ? styles.cashDisableBadgeTextActive
                        : styles.cashDisableBadgeTextIdle,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.76}
                  >
                    {displayedCashSectionDisabled ? 'Disabilitata' : 'Attiva'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cashDisableText}>
                Gestisci gli incassi in contanti e quelli già ricevuti sul tuo POS.
                {stripeAvailable ? ' Stripe permette di incassare con QR o link. Nascondere la Cassa non annulla i link già creati.' : ' Puoi nascondere la sezione conservando i movimenti.'}
              </Text>

              <HapticTouchable
                style={[
                  styles.cashDisableButton,
                  displayedCashSectionDisabled && styles.cashDisableButtonActive,
                  isCashSectionTogglePending && styles.cashDisableButtonDisabled,
                ]}
                onPress={handleCashSectionToggle}
                disabled={isCashSectionTogglePending}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text
                  style={[
                    styles.cashDisableButtonText,
                    displayedCashSectionDisabled && styles.cashDisableButtonTextActive,
                  ]}
                >
                  {isCashSectionTogglePending
                    ? 'Aggiornamento...'
                    : displayedCashSectionDisabled
                      ? 'Riabilita Cassa'
                      : 'Disabilita Cassa'}
                </Text>
              </HapticTouchable>
            </View>
            </CashSettingsPopup> : null}

            <ShopEntry workspaceId={salonWorkspace.id} compact entryPoint="checkout" />
            <MonthlyFinancialReport workspaceId={salonWorkspace.id} email={salonAccountEmail || "mail del titolare"} />

            <View style={styles.card}>
              <CashSectionHeading title="Report e statistiche" icon="stats-chart-outline" />
              
              <OwnerDataLoading loading={cashDataLoading} lines={2}>
              <View style={styles.reportCountRow}>
                <Text style={styles.reportCount}>{periodMovements.filter(item => item.metodo && !isLegacyAutoCashout(item)).length} incassi confermati</Text>
                <Text style={styles.reportCount}>{periodMovements.length} movimenti</Text>
              </View>
              {comparison ? <View style={styles.reportComparison}>
                <Text style={styles.reportCaption}>Periodo precedente</Text>
                <Text style={styles.reportDates}>{comparison.label}</Text>
                <View style={styles.reportMetricRow}>
                  <View style={styles.reportMetric}><Text style={styles.reportMetricLabel}>Incassi precedenti</Text><Text style={styles.reportMetricValue}>{formatCash(previousTotal)}</Text></View>
                  <View style={styles.reportMetric}><Text style={styles.reportMetricLabel}>Variazione</Text><Text style={styles.reportMetricValue}>{formatCash(totale-previousTotal)}</Text></View>
                </View>
                <Text style={styles.reportFootnote}>{previousTotal ? `${((totale-previousTotal)/previousTotal*100).toFixed(1).replace('.', ',')}% rispetto al periodo precedente` : 'Nessun incasso nel periodo precedente.'}</Text>
              </View> : null}
              </OwnerDataLoading>
              <View style={styles.reportActions}>
                <HapticTouchable accessibilityRole="button" disabled={exportingReport || cashDataLoading} onPress={() => exportCashReport(true)} style={[styles.reportButton, exportingReport && styles.buttonDisabled]}><Ionicons name="document-text-outline" size={20} color="#FFFFFF" /><Text style={styles.reportButtonText}>{exportingReport ? 'Preparazione…' : 'PDF / Stampa'}</Text></HapticTouchable>
                <HapticTouchable accessibilityRole="button" disabled={exportingReport || cashDataLoading} onPress={() => exportCashReport(false)} style={[styles.reportButton, styles.reportButtonSecondary, exportingReport && styles.buttonDisabled]}><Ionicons name="download-outline" size={20} color="#20364D" /><Text style={[styles.reportButtonText, styles.reportButtonSecondaryText]}>{exportingReport ? 'Preparazione…' : 'Scarica Excel'}</Text></HapticTouchable>
              </View>
            </View>

            <CashStripePanel key={`stripe-${salonWorkspace.id}-${salonAccountEmail}`} pendingMovements={movimenti.filter(item => !item.metodo && !isLegacyAutoCashout(item))} onSelectMovement={setStripeMovement} movement={stripeMovement} onClose={() => setStripeMovement(null)} active={active} onAvailabilityChange={setStripeAvailable} />
            <AppointmentRefundSummary workspaceId={salonWorkspace.id} active={active} />
            <BookingPaymentPolicyEditor key={`booking-payments-${salonWorkspace.id}-${salonAccountEmail}`} workspaceId={salonWorkspace.id} active={active} />
            <CashFiscalPanel key={`fiscal-${salonWorkspace.id}-${salonAccountEmail}`} />
            <CashFiscalArchive key={`archive-${salonWorkspace.id}-${salonAccountEmail}`} />


            {displayedCashSectionDisabled ? (
              <View style={styles.cashHiddenCard}>
                <Text style={styles.cashHiddenTitle}>Contenuto Cassa nascosto</Text>
                <Text style={styles.cashHiddenText}>
                  Il tab resta visibile, ma questa sezione è stata disabilitata per questo salone.
                  Puoi riattivarla aprendo il pannello Cassa sopra Report e statistiche.
                </Text>
              </View>
            ) : null}

            {!displayedCashSectionDisabled ? (
              <View
                style={[
                  styles.desktopTopGrid,
                  IS_WEB && responsive.isDesktop && styles.webCashGrid,
                  !responsive.isDesktop && styles.desktopTopGridStack,
                ]}
              >
                <View style={[styles.desktopLeftPane, !responsive.isDesktop && styles.desktopPaneStack, IS_WEB && responsive.isDesktop && styles.webEntryRow]}>
                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded, IS_WEB && responsive.isDesktop && styles.webEntryCard]}>
                  <CashSectionHeading title={tApp(appLanguage, 'cash_new_income_title')} icon="add-outline" />
                  <Text style={styles.cardHint}>
                    Registra un pagamento già ricevuto.
                  </Text>

                  <Text style={styles.fieldLabel}>Servizio o descrizione</Text>
                  <TextInput
                    ref={incomeDescriptionRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_description_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={descrizione}
                    onChangeText={(value) => setDescrizione(formatLeadingCapitalizedValue(value))}
                    onFocus={() => {
                      scrollToField(incomeDescriptionRef);
                      setCampoAttivo('descrizione');
                    }}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  {campoAttivo === 'descrizione' && suggerimentiDescrizione.length > 0 ? (
                    <View style={styles.suggestionBox}>
                      {suggerimentiDescrizione.map((item) => (
                        <HapticTouchable
                          key={item.id}
                          style={styles.suggestionItem}
                          onPress={() => selezionaSuggerimentoDescrizione(item)}
                          pressScale={0.985}
                          pressOpacity={0.98}
                        >
                          <Text style={styles.suggestionText}>{item.label}</Text>
                        </HapticTouchable>
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.fieldLabel}>Importo</Text>
                  <HapticTouchable
                    style={[styles.input, styles.numericPickerField]}
                    onPress={() => setShowAmountPicker(true)}
                    pressScale={0.98}
                    pressOpacity={0.98}
                  >
                    <Text
                      style={[
                        styles.numericPickerFieldText,
                        !importo && styles.numericPickerFieldPlaceholder,
                      ]}
                    >
                      {importo ? `Importo € ${importo}` : tApp(appLanguage, 'cash_amount_placeholder')}
                    </Text>
                  </HapticTouchable>

                  <Text style={styles.fieldLabel}>Metodo di pagamento</Text>
                  <View style={styles.methodsRow}>
                    {METODI_PAGAMENTO.map((item) => {
                      const selected = item === metodoPagamento;

                      return (
                        <HapticTouchable
                          key={item}
                          style={[styles.methodChip, item === 'Carta' && { flex: 1.22 }, selected && styles.methodChipActive]}
                          onPress={() => setMetodoPagamento(item)}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
                          <Ionicons name={item === 'Contanti' ? 'cash-outline' : item === 'Carta' ? 'card-outline' : 'business-outline'} size={15} color={selected ? '#FFFFFF' : '#526781'} />
                          <Text
                            style={[styles.methodChipText, selected && styles.methodChipTextActive]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.72}
                          >
                            {metodoPagamentoLabels[item]}
                          </Text>
                        </HapticTouchable>
                      );
                    })}
                  </View>

                  {metodoPagamento === 'Carta' ? (
                    <View style={styles.autoCardBox}>
                      <Text style={styles.autoCardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                        Pagamento ricevuto sul tuo POS
                      </Text>
                      <Text style={styles.autoCardText}>
                        Registra qui solo un pagamento già ricevuto. Non servono i dati della carta del cliente.
                      </Text>
                    </View>
                  ) : null}

                  <HapticTouchable
                    style={[styles.buttonDark, !canAdd && styles.buttonDisabled]}
                    onPress={aggiungiMovimento}
                    disabled={!canAdd}
                    pressScale={0.975}
                    pressOpacity={0.98}
                  >
                    <Text style={styles.buttonDarkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_register_income')}</Text>
                  </HapticTouchable>
                  </View>

                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded, IS_WEB && responsive.isDesktop && styles.webEntryCard]}>
                    <CashSectionHeading title={tApp(appLanguage, 'cash_quick_services')} icon="flash-outline" />

                  <View style={premiumFilterStyles.panel}>
                    <View style={premiumFilterStyles.icon}><Ionicons name="filter-outline" size={21} color="#526781" /></View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={premiumFilterStyles.viewport} contentContainerStyle={premiumFilterStyles.row}>
                      {quickRoles.map(role => {
                        const selected = quickRole === role.key;
                        const accent = resolveServiceAccent({ roleName: role.label, roleColorOverrides: roleCardColorOverrides, preferRoleColor: true });
                        return <HapticTouchable key={role.key} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`${role.label}, ${role.count} servizi`} style={[premiumFilterStyles.card, selected && premiumFilterStyles.selected]} onPress={() => { setQuickRole(role.key); quickServicesRef.current?.scrollTo({ x: 0, y: 0, animated: false }); }}>
                          {role.key !== 'all' ? <View style={[premiumFilterStyles.marker, { backgroundColor: accent.border }]} /> : null}
                          <Text style={[styles.quickServiceChipText, selected && premiumFilterStyles.selectedText]}>{role.label}</Text>
                          {selected ? <Ionicons name="checkmark" size={15} color="#FFFFFF" /> : null}
                          <View style={[premiumFilterStyles.count, selected && premiumFilterStyles.selectedCount]}><Text style={[styles.movementRoleText, selected && premiumFilterStyles.selectedText]}>{role.count}</Text></View>
                        </HapticTouchable>;
                      })}
                    </ScrollView>
                  </View>

                  <HorizontalCardScrollView
                    ref={quickServicesRef}
                    horizontal={!(IS_WEB && responsive.isDesktop)}
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={IS_WEB && responsive.isDesktop}
                    style={IS_WEB && responsive.isDesktop ? { maxHeight: 270 } : undefined}
                    contentContainerStyle={[styles.quickServicesRow, IS_WEB && responsive.isDesktop && styles.quickServicesWebGrid]}
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={closeActiveSuggestions}
                  >
                    {quickServices.map((item) => {
                      const accent = resolveServiceAccent({
                        serviceId: item.id,
                        serviceName: item.nome,
                        roleName: item.mestiereRichiesto,
                        serviceColorOverrides: serviceCardColorOverrides,
                        roleColorOverrides: roleCardColorOverrides,
                      });

                      const roleAccent = resolveServiceAccent({ roleName: item.mestiereRichiesto, roleColorOverrides: roleCardColorOverrides, preferRoleColor: true });
                      return (
                        <HapticTouchable
                          key={item.id}
                          style={[
                            styles.quickServiceChip,
                            IS_WEB && responsive.isDesktop && styles.quickServiceWebChip,
                            {
                              backgroundColor: '#F8FAFC',
                              borderColor: '#E2E8F0',
                            },
                          ]}
                          onPress={() => selezionaServizio(item.nome, item.prezzo)}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
                          {item.mestiereRichiesto ? (
                            <View style={[styles.movementRole, { marginBottom: 0, backgroundColor: blendServiceAccentWithWhite(roleAccent.bg, 0.78), borderColor: blendServiceAccentWithWhite(roleAccent.border, 0.65) }]}>
                              <Text style={styles.movementRoleText}>{item.mestiereRichiesto}</Text>
                            </View>
                          ) : null}
                          <Text
                            style={[styles.quickServiceChipText, { color: accent.text }]}
                          >
                            {item.nome}
                          </Text>
                          <Text style={styles.quickServicePrice}>{formatCash(item.prezzo)}</Text>
                        </HapticTouchable>
                      );
                    })}
                  </HorizontalCardScrollView>
                  </View>
                </View>

                <View style={[styles.desktopRightPane, !responsive.isDesktop && styles.desktopPaneStack, IS_WEB && responsive.isDesktop && styles.webSearchPane]}>
                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded, !responsive.isDesktop && styles.cardEmbeddedLast]}>
                  <CashSectionHeading title={tApp(appLanguage, 'cash_search_movement')} icon="search-outline" />

                  <TextInput
                    ref={searchMovementRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_search_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={ricerca}
                    onChangeText={setRicerca}
                    onFocus={() => {
                      scrollToField(searchMovementRef);
                      setCampoAttivo('ricerca');
                    }}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  {campoAttivo === 'ricerca' && suggerimentiRicerca.length > 0 ? (
                    <View style={styles.suggestionBox}>
                      {suggerimentiRicerca.map((item) => (
                        <HapticTouchable
                          key={`ricerca-${item.id}`}
                          style={styles.suggestionItem}
                          onPress={() => {
                            setRicerca(item.descrizione);
                            setCampoAttivo(null);
                          }}
                          pressScale={0.985}
                          pressOpacity={0.98}
                        >
                          <Text style={styles.suggestionText}>
                            {item.descrizione} · {formatCash(item.importo)}
                          </Text>
                        </HapticTouchable>
                      ))}
                    </View>
                  ) : null}
                  </View>

                  <HapticTouchable accessibilityRole="button" accessibilityState={{ expanded: showCardReferences }} onPress={() => setShowCardReferences(value => !value)} style={{ padding: 12, alignItems: 'center' }}><Text style={{ color: '#526781' }}>Riferimenti carta facoltativi ({carteCollegate.length}) {showCardReferences ? '⌃' : '⌄'}</Text></HapticTouchable>
                  {showCardReferences ? <>
                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded]}>
                  <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_linked_card_title')}</Text>
                  <Text style={styles.cardHint}>
                    {tApp(appLanguage, 'cash_linked_card_hint')}
                  </Text>

                  <TextInput
                    ref={cardNameRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_card_name_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={nomeCarta}
                    onChangeText={(value) => setNomeCarta(formatLeadingCapitalizedValue(value))}
                    onFocus={() => scrollToField(cardNameRef)}
                    returnKeyType="next"
                    onSubmitEditing={() => focusField(cardCircuitRef)}
                    blurOnSubmit={false}
                  />

                  <TextInput
                    ref={cardCircuitRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_card_circuit_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={circuitoCarta}
                    onChangeText={(value) => setCircuitoCarta(formatLeadingCapitalizedValue(value))}
                    onFocus={() => scrollToField(cardCircuitRef)}
                    returnKeyType="next"
                    onSubmitEditing={() => focusField(cardLast4Ref)}
                    blurOnSubmit={false}
                  />

                  <TextInput
                    ref={cardLast4Ref}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_card_last4_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={ultime4}
                    onChangeText={setUltime4}
                    onFocus={() => scrollToField(cardLast4Ref)}
                    keyboardType="numeric"
                    maxLength={4}
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />

                  <HapticTouchable
                    style={[styles.buttonDark, !canSaveCard && styles.buttonDisabled]}
                    onPress={salvaCarta}
                    disabled={!canSaveCard}
                    pressScale={0.975}
                    pressOpacity={0.98}
                  >
                    <Text style={styles.buttonDarkText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_connect_card')}</Text>
                  </HapticTouchable>

                  {carteCollegate.length > 0 ? (
                    <HorizontalCardScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.cardsRow}
                      keyboardDismissMode="on-drag"
                      onScrollBeginDrag={closeActiveSuggestions}
                    >
                      {carteCollegate.map((item) => {
                        const active = cartaAttiva?.id === item.id;

                        return (
                          <HapticTouchable
                            key={item.id}
                            style={[styles.linkedCard, active && styles.linkedCardActive]}
                            onPress={() => impostaCartaPredefinita(item.id)}
                            pressScale={0.98}
                            pressOpacity={0.98}
                          >
                            <Text style={styles.linkedCardCircuit} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{item.circuito}</Text>
                            <Text style={styles.linkedCardName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{item.nome}</Text>
                            <Text style={styles.linkedCardDigits} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>•••• {item.ultime4}</Text>
                            <Text style={styles.linkedCardHint}>
                              {item.predefinita
                                ? tApp(appLanguage, 'cash_card_default')
                                : tApp(appLanguage, 'cash_card_tap_to_activate')}
                            </Text>
                            <HapticTouchable
                              style={styles.linkedCardDelete}
                              onPress={() => eliminaCarta(item.id)}
                              pressScale={0.98}
                              pressOpacity={0.98}
                            >
                              <Text style={styles.linkedCardDeleteText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                                {tApp(appLanguage, 'cash_remove_card')}
                              </Text>
                            </HapticTouchable>
                          </HapticTouchable>
                        );
                      })}
                    </HorizontalCardScrollView>
                  ) : null}
                  </View>

                  </> : null}
                  <Text style={[styles.listTitle, !responsive.isDesktop && styles.listTitleEmbedded]}>{tApp(appLanguage, 'cash_movements')}{cashDataLoading ? '' : ` (${movimentiOrdinati.length})`}</Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={renderCashMovementItem}
        ListEmptyComponent={cashDataLoading ? <View style={{ padding: 20 }}><OwnerDataLoading loading lines={5}>{null}</OwnerDataLoading></View> :
          salonWorkspace.cashSectionDisabled ? null :
          <View
            style={[
              styles.emptyCard,
              styles.itemCardShell,
              { maxWidth: responsive.contentMaxWidth },
            ]}
          >
            <Text style={styles.emptyTitle}>{tApp(appLanguage, 'cash_no_movements')}</Text>
            <Text style={styles.emptyText}>
              Prova a cambiare ricerca oppure registra un nuovo incasso.
            </Text>
          </View>
        }
        ListFooterComponent={<View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
          {!displayedCashSectionDisabled && pageCount > 1 ? (
          <View style={styles.pagination}>
            <Text style={styles.paginationLabel}>Pagina {currentPage + 1} di {pageCount} · {movimentiOrdinati.length} movimenti</Text>
            <View style={styles.paginationButtons}>
              <HapticTouchable accessibilityRole="button" disabled={currentPage === 0} onPress={() => changeMovementPage(currentPage - 1)} style={[styles.pageButton, currentPage === 0 && styles.buttonDisabled]}><Text style={styles.pageButtonText}>Precedenti</Text></HapticTouchable>
              <HapticTouchable accessibilityRole="button" disabled={currentPage === pageCount - 1} onPress={() => changeMovementPage(currentPage + 1)} style={[styles.pageButton, currentPage === pageCount - 1 && styles.buttonDisabled]}><Text style={styles.pageButtonText}>Successivi</Text></HapticTouchable>
            </View>
          </View>
          ) : null}
        </View>}
      />

      <Modal supportedOrientations={TABLET_MODAL_ORIENTATIONS}
        visible={active && showCashIntroModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          void dismissCashIntroModal();
        }}
      >
        <View style={styles.cashIntroBackdrop}>
          <DockedSheetSurface style={styles.cashIntroCard}>
            <View style={styles.cashIntroIconWrap}>
              <Text style={styles.cashIntroIconText}>€</Text>
            </View>
            <Text style={styles.cashIntroEyebrow}>Prima apertura Cassa</Text>
            <Text style={styles.cashIntroTitle}>La cassa del tuo salone</Text>
            <Text style={styles.cashIntroText}>
              Tieni sotto controllo incassi e appuntamenti da saldare. Registra i
              pagamenti in contanti o già ricevuti sul tuo POS esterno.
            </Text>
            <Text style={styles.cashIntroText}>
              {stripeAvailable ? 'Collega Stripe per i pagamenti con QR o link; Tap to Pay richiede un dispositivo e una configurazione compatibili. ' : ''}In Ricevute fiscali puoi configurare il collegamento per i documenti fiscali: controlla lo stato prima di usarlo. La modalità prova non emette documenti fiscali reali.
            </Text>
            <View style={styles.cashIntroActions}>
              {!displayedCashSectionDisabled ? (
                <HapticTouchable
                  style={[styles.cashIntroSecondaryButton, isCashSectionTogglePending && styles.cashDisableButtonDisabled]}
                  onPress={handleCashIntroDisable}
                  disabled={isCashSectionTogglePending}
                  pressScale={0.98}
                  pressOpacity={0.92}
                >
                  <Text style={styles.cashIntroSecondaryButtonText}>
                    Disabilita Cassa
                  </Text>
                </HapticTouchable>
              ) : null}
              <HapticTouchable
                style={styles.cashIntroPrimaryButton}
                onPress={() => {
                  void dismissCashIntroModal();
                }}
                pressScale={0.98}
                pressOpacity={0.96}
              >
                <Text style={styles.cashIntroPrimaryButtonText}>Ho capito</Text>
              </HapticTouchable>
            </View>
          </DockedSheetSurface>
        </View>
      </Modal>

      <NumberPickerModal
        visible={active && showAmountPicker}
        title="Importo incasso"
        initialValue={importo ? Number(importo.replace(',', '.')) : 25}
        onClose={() => setShowAmountPicker(false)}
        onConfirm={(value) => {
          setImporto(value);
          setShowAmountPicker(false);
        }}
        min={0}
        max={1000}
        step={1}
        gridStep={1}
        suffix=" €"
        presets={[10, 15, 20, 25, 30, 35, 40, 50, 60, 80, 100]}
      />
      <KeyboardNextToolbar onNext={handleKeyboardNext} label="Next" />
    </View>
  );
}

export function CassaScreen(props:{onClose?:()=>void;active?:boolean}={}){
 return <CashWebScreen {...props}/>;
}
function CashWebScreen(props:{onClose?:()=>void;active?:boolean}){
 const {salonWorkspace,salonAccountEmail}=useAppContext();
 const scope=salonWorkspace.id&&salonAccountEmail?`${salonWorkspace.id}:${salonAccountEmail.toLowerCase()}`:'';
 return <CashDeviceGate scope={scope} email={salonAccountEmail} active={props.active??true}>{access=><CassaContent key={scope} {...props} access={access}/>}</CashDeviceGate>;
}

export default CassaScreen;

const styles = StyleSheet.create({
  dateFields: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  dateField: { flex: 1, minWidth: 0, padding: 12, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', gap: 5 },
  dateFieldLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  dateFieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dateFieldValue: { flex: 1, fontSize: 13, color: '#20364D', fontWeight: '600' },
  reportCaption: { fontSize: 13, lineHeight: 19, color: '#64748B' },
  reportCountRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 0, marginBottom: 14 },
  reportCount: { fontSize: 12, fontWeight: '500', color: '#526781', paddingVertical: 2 },
  reportComparison: { paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#E8EDF3', marginBottom: 4, gap: 5 },
  reportDates: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#334B65' },
  reportMetricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 5 },
  reportMetric: { flexGrow: 1, flexBasis: 120, minWidth: 0, gap: 4, backgroundColor: '#F6F8FB', padding: 12, borderRadius: 14 },
  reportMetricLabel: { color: '#64748B', fontSize: 12, lineHeight: 18 },
  reportMetricValue: { color: '#0F172A', fontSize: 19, lineHeight: 25, fontWeight: '700' },
  reportFootnote: { fontSize: 11, lineHeight: 16, color: '#64748B' },
  reportActions: { gap: 10 },
  reportButton: { minHeight: 48, paddingHorizontal: 16, paddingVertical: 13, borderRadius: 16, backgroundColor: '#0F172A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  reportButtonText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '700', flexShrink: 1 },
  reportButtonSecondary: { backgroundColor: '#EFF4F9', borderWidth: 1, borderColor: '#DCE5EF' },
  reportButtonSecondaryText: { color: '#20364D' },
  pagination: { alignItems: 'center', paddingVertical: 18, gap: 12 },
  paginationLabel: { color: '#64748B', fontSize: 13, fontWeight: '600' },
  paginationButtons: { flexDirection: 'row', gap: 12 },
  pageButton: { backgroundColor: '#20364D', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 14 },
  pageButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 14 },
  sectionIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: '#EFF4F9', alignItems: 'center', justifyContent: 'center' },
  sectionHeadingText: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '800', color: '#0F172A' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#526781', marginBottom: 7 },
  periodBar: { alignSelf: 'stretch', minWidth: 0, flexDirection: 'row', backgroundColor: '#F1F5F9', padding: 4, borderRadius: 16, marginVertical: 12, gap: 2 },
  periodButton: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, minHeight: 42, paddingVertical: 10, borderRadius: 12 },
  periodButtonSelected: { backgroundColor: '#20364D' },
  periodText: { maxWidth: '100%', flexShrink: 1, textAlign: 'center', fontSize: 12, fontWeight: '700', color: '#526781' },
  periodTextSelected: { color: '#FFFFFF' },
  settingsRow: { backgroundColor: '#FFFFFF', borderRadius: 24, paddingHorizontal: 18, paddingVertical: 15, marginBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#E7EDF4' },
  settingsRowExpanded: { backgroundColor: '#F8FAFD', borderColor: '#CCD9E8' },
  settingsIconTile: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EFF4F9', alignItems: 'center', justifyContent: 'center' },
  settingsChevron: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF4F9', alignItems: 'center', justifyContent: 'center' },
  settingsStatus: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EAF7EF', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3 },
  settingsStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22A66A' },
  settingsStatusText: { fontSize: 11, fontWeight: '600', color: '#176843' },
  settingsLabel: { flex: 1, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingsText: { color: '#20364D', fontWeight: '600', fontSize: 16 },
  quickServicePrice: { color: '#526781', fontSize: 13, fontWeight: '700' },

  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    paddingTop: Platform.OS === 'web' ? 8 : 54,
    paddingBottom: 140,
  },
  cashAreaHeading: { marginTop: 6, marginBottom: 16, paddingHorizontal: 4 },
  cashAreaTitle: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: '#172B43' },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  webCashGrid: { flexDirection: 'column', flexGrow: 0, flexShrink: 0, gap: 4 },
  webEntryRow: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%', marginRight: 0, flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  webEntryCard: { flex: 1, minWidth: 0 },
  webSearchPane: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', width: '100%' },
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopTopGridStack: { flexDirection: 'column', flexGrow: 0, flexShrink: 0, marginBottom: 12 },
  desktopLeftPane: {
    flex: 0.95,
    marginRight: 16,
  },
  desktopRightPane: {
    flex: 1.05,
  },
  desktopPaneStack: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    marginRight: 0,
    width: '100%',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingHorizontal: IS_ANDROID ? 28 : 16,
    paddingTop: 0,
    paddingBottom: 20,
    marginBottom: 16,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  overline: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: '#9a6b32',
    marginBottom: 8,
  },
  screenHeaderRow: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
    gap: 4,
  },
  screenBrandChip: {
    maxWidth: '88%',
    marginTop: 4,
    marginBottom: 6,
    alignItems: 'center',
  },
  screenBrandChipText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1.6,
    color: '#52627a',
    textAlign: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  subtitle: {
    maxWidth: 320,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginTop: 0,
    marginBottom: 2,
    textAlign: 'center',
    alignSelf: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 12,
    gap: 12,
  },
  heroStatsRowBottom: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 4,
  },
  heroStatCardMint: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#EAF7F0',
    borderRadius: 28,
    minHeight: 126,
    paddingHorizontal: IS_ANDROID ? 16 : 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatCardBlue: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#EAF1FB',
    borderRadius: 28,
    minHeight: 126,
    paddingHorizontal: IS_ANDROID ? 16 : 18,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatNumber: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 9,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    alignSelf: 'stretch',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  heroStatLabel: {
    width: '100%',
    fontSize: 15,
    lineHeight: 19,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  heroMiniChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  heroMiniChipText: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
  },
  heroMiniChipCash: {
    backgroundColor: '#FFF7ED',
  },
  heroMiniChipPending: {
    backgroundColor: '#FDECEC',
  },
  heroMiniChipCards: {
    backgroundColor: '#FDF2F8',
  },
  cashIntroBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 24, paddingBottom: 0 },
  cashIntroCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 22 },
    elevation: 14,
  },
  cashIntroIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 22,
    backgroundColor: '#EEF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#D8E7F7',
  },
  cashIntroIconText: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
    color: '#0F172A',
  },
  cashIntroEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 8,
  },
  cashIntroTitle: {
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
  },
  cashIntroText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  cashIntroActions: {
    width: '100%',
    gap: 10,
    marginTop: 6,
  },
  cashIntroPrimaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  cashIntroPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  cashIntroSecondaryButton: {
    width: '100%',
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cashIntroSecondaryButtonText: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
  },
  cashDisableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 10,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  cashDisableCardActive: {
    backgroundColor: '#FFFFFF',
  },
  cashDisableHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cashDisableEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: '#64748B',
    textAlign: 'center',
  },
  cashDisableTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 25,
  },
  cashDisableBadge: {
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 16 : 12,
    paddingVertical: 8,
    borderWidth: 0,
  },
  cashDisableBadgeIdle: {
    backgroundColor: '#EAF7F0',
  },
  cashDisableBadgeActive: {
    backgroundColor: '#FDECEC',
  },
  cashDisableBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
  },
  cashDisableBadgeTextIdle: {
    color: '#0F172A',
  },
  cashDisableBadgeTextActive: {
    color: '#B91C1C',
  },
  cashDisableText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  cashDisableButton: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    ...Platform.select({
      web: {
        alignSelf: 'center',
        width: '100%',
        maxWidth: 680,
      },
    }),
  },
  cashDisableButtonActive: {
    backgroundColor: '#16A34A',
    borderWidth: 1,
    borderColor: '#15803D',
    shadowColor: '#16A34A',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  cashDisableButtonDisabled: {
    opacity: 0.7,
  },
  cashDisableButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
  },
  cashDisableButtonTextActive: {
    color: '#FFFFFF',
  },
  cashHiddenCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: IS_ANDROID ? 22 : 18,
    marginBottom: 10,
    borderWidth: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  cashHiddenTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 8,
  },
  cashHiddenText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    borderWidth: 0,
  },
  cardEmbedded: { width: '100%' },
  cardEmbeddedLast: { marginBottom: 12 },
  wideCard: {
    maxWidth: 980,
    alignSelf: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  cardHint: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 18,
    fontWeight: '500',
    textAlign: 'left',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 15,
    fontSize: 15,
    marginBottom: 10,
    color: '#0F172A',
    textAlign: 'left',
    borderWidth: 1,
    borderColor: '#E4EAF1',
  },
  numericPickerField: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  numericPickerFieldText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  numericPickerFieldPlaceholder: {
    color: '#9a9a9a',
    fontWeight: '500',
  },
  buttonDark: {
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  buttonDarkText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  cardsRow: {
    paddingTop: 8,
    paddingRight: 6,
    alignItems: 'center',
  },
  linkedCard: {
    width: 184,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: IS_ANDROID ? 18 : 14,
    marginRight: 12,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  itemCardShell: {
    ...(IS_WEB ? { alignSelf: 'center' as const } : {}),
    width: '100%',
  },
  linkedCardActive: {
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  linkedCardCircuit: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  linkedCardName: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  linkedCardDigits: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  linkedCardHint: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  linkedCardDelete: {
    alignSelf: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  linkedCardDeleteText: {
    color: '#0F172A',
    fontSize: 12,
    fontWeight: '800',
  },
  methodsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 6,
    marginBottom: 20,
  },
  methodChip: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  methodChipActive: {
    backgroundColor: '#20364D',
    borderColor: '#20364D',
  },
  methodChipText: {
    flexShrink: 1,
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  methodChipTextActive: {
    color: '#FFFFFF',
  },
  autoCardBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  autoCardTitle: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '800',
    marginBottom: 6,
    textAlign: 'center',
  },
  autoCardText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  quickServicesWebGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 8, paddingRight: 8 },
  quickServiceWebChip: { maxWidth: '100%', marginRight: 0, marginBottom: 0 },
  quickServicesRow: {
    paddingRight: 6,
    alignItems: 'center',
  },
  quickServiceChip: {
    backgroundColor: '#F8FAFC',
    maxWidth: 240,
    minWidth: 150,
    gap: 8,
    borderRadius: 16,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 14,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  quickServiceChipText: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  suggestionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: -4,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  suggestionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15, 23, 42, 0.06)',
  },
  suggestionText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'center',
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 6,
    marginBottom: 10,
    textAlign: 'center',
  },
  listTitleEmbedded: {
    marginTop: 2,
    marginBottom: 2,
  },
  sectionLabelWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
  },
  dateSectionWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  dateSectionPill: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  dateSectionText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  movementServiceHeader: {
    marginBottom: 12,
  },
  movementRole: {
    alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10,
    paddingVertical: 4, borderWidth: 1, marginBottom: 8,
  },
  movementRoleText: { fontSize: 11, fontWeight: '800', color: '#334155' },
  movementCustomer: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: '#475569' },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    borderWidth: 0,
  },
  itemCardPending: {
    backgroundColor: '#FFFFFF',
  },
  itemCardCash: {
    backgroundColor: '#FFFFFF',
  },
  itemCardCard: {
    backgroundColor: '#FFFFFF',
  },
  itemCardTransfer: {
    backgroundColor: '#FFFFFF',
  },
  itemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EFF3F7',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 10,
  },
  itemMainInfo: {
    flex: 1,
    minWidth: 130,
    justifyContent: 'center',
  },
  itemDescription: {
    flexShrink: 1,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'left',
    marginBottom: 10,
  },
  itemAmountWrap: {
    minWidth: IS_ANDROID ? 126 : 110,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  itemAmountEyebrow: {
    fontSize: 10,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'right',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemAmountEyebrowDone: {
    color: '#64748B',
  },
  itemAmountEyebrowPending: {
    color: '#F97316',
  },
  itemAmount: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'right',
  },
  itemAmountPending: {
    color: '#F97316',
  },
  itemAmountCash: {
    color: '#0F172A',
  },
  itemAmountCard: {
    color: '#0F172A',
  },
  itemAmountTransfer: {
    color: '#0F172A',
  },
  itemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 6,
  },
  itemMetaBadge: {
    borderRadius: 12,
    paddingHorizontal: IS_ANDROID ? 13 : 9,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemMetaBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  itemMetaBadgePending: {
    backgroundColor: '#FFF7ED',
  },
  itemMetaBadgePendingText: {
    color: '#F97316',
  },
  itemMetaBadgeCash: {
    backgroundColor: '#F8FAFC',
  },
  itemMetaBadgeCashText: {
    color: '#64748B',
  },
  itemMetaBadgeBlue: {
    backgroundColor: '#EAF7F0',
  },
  itemMetaBadgeBlueText: {
    color: '#0F172A',
  },
  itemMetaBadgeViolet: {
    backgroundColor: '#F8FAFC',
  },
  itemMetaBadgeVioletText: {
    color: '#64748B',
  },
  itemMetaBadgeInk: {
    backgroundColor: '#F8FAFC',
  },
  itemMetaBadgeInkText: {
    color: '#64748B',
  },
  itemMetaBadgeStamp: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  itemMetaBadgeStampText: {
    color: '#64748B',
  },
  pendingMethodsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    justifyContent: 'flex-start',
  },
  pendingMethodChip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 7,
    marginRight: 6,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  pendingMethodChipText: {
    color: '#0F172A',
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: IS_ANDROID ? 24 : 20,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    borderWidth: 0,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    lineHeight: 20,
    textAlign: 'center',
  },
});
