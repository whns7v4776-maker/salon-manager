import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Reanimated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { OnboardingModal } from '../../components/onboarding-modal';
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { KeyboardNextToolbar } from '../../components/ui/keyboard-next-toolbar';
import { useAppContext } from '../../src/context/AppContext';
import { salonNameFontOptions } from '../../src/lib/fonts';
import { focusNextInput, useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { tApp } from '../../src/lib/i18n';
import { formatSalonAddress, normalizeSalonCode } from '../../src/lib/platform';
import { useResponsiveLayout } from '../../src/lib/responsive';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../../src/lib/validators';

const getTodayDateString = () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateString?: string) => {
  if (!dateString) return '—';
  const [year, month, day] = dateString.split('-');
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
};

const formatMinutes = (value?: number) => {
  if (!value) return '—';
  if (value === 30) return '30 min';
  if (value === 60) return '1 ora';

  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }

  return hours > 0 ? `${hours}h` : `${minutes} min`;
};

const normalizeOperatorNameKey = (value?: string) =>
  (value ?? '').trim().toLocaleLowerCase('it-IT');

const isSameOperatorIdentity = (
  item: { operatoreId?: string; operatoreNome?: string },
  operator: { id: string; nome: string }
) => {
  const appointmentOperatorId = item.operatoreId?.trim() ?? '';
  const appointmentOperatorName = normalizeOperatorNameKey(item.operatoreNome);
  const operatorId = operator.id.trim();
  const operatorName = normalizeOperatorNameKey(operator.nome);

  if (appointmentOperatorId && operatorId && appointmentOperatorId === operatorId) {
    return true;
  }

  if (appointmentOperatorName && operatorName && appointmentOperatorName === operatorName) {
    return true;
  }

  return false;
};

const normalizeCustomerNameKey = (value?: string) =>
  (value ?? '').trim().toLocaleLowerCase('it-IT');

const isSameCustomerIdentity = (
  appointment: { cliente?: string },
  customer: { nome: string }
) => normalizeCustomerNameKey(appointment.cliente) === normalizeCustomerNameKey(customer.nome);

const buildClientInviteMessage = ({
  brandName,
  salonClientLink,
}: {
  brandName: string;
  salonClientLink: string;
}) => {
  return `Apri l'app di ${brandName} e accedi direttamente all'area cliente.\n\nLink diretto: ${salonClientLink}`;
};

const toUppercaseField = (value: string) => value.toLocaleUpperCase('it-IT');
const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';
const IS_ANDROID = Platform.OS === 'android';
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parsePublicClientBaseUrl = (value: string) => {
  if (!value) return null;

  try {
    const normalizedValue = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(normalizedValue);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');

    return url;
  } catch {
    return null;
  }
};

const buildSalonClientLink = (baseUrl: URL | null, salonCode: string) => {
  if (!salonCode) {
    return '';
  }

  if (!baseUrl) {
    return '';
  }

  return `${baseUrl.toString()}/join/${encodeURIComponent(salonCode)}`;
};

const getPublicClientLinkStatus = ({
  baseUrl,
  salonCode,
  salonClientLink,
}: {
  baseUrl: URL | null;
  salonCode: string;
  salonClientLink: string;
}) => {
  if (!salonCode) {
    return {
      status: 'missing-salon-code' as const,
      canShare: false,
      message:
        "Il link cliente verra generato appena il salone ha un codice valido per aprire l'app nella pagina giusta.",
    };
  }

  if (!salonClientLink) {
    return {
      status: 'invalid-link' as const,
      canShare: false,
      message:
        "Non sono riuscito a costruire il deep link dell'app cliente. Controlla il codice salone e riprova.",
    };
  }

  return {
    status: 'ready' as const,
    canShare: true,
    message:
      "Link app pronto: il QR apre direttamente l'area cliente del salone nell'app.",
  };
};

function AnimatedChevron({
  expanded,
  color,
  size,
}: {
  expanded: boolean;
  color: string;
  size: number;
}) {
  const rotation = useSharedValue(expanded ? 180 : 0);

  useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Reanimated.View style={animatedStyle}>
      <Ionicons name="chevron-down" size={size} color={color} />
    </Reanimated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  const scrollRef = useRef<ScrollView | null>(null);
  const [clientAccessSectionY, setClientAccessSectionY] = useState(0);
  const settingsTapLockRef = useRef(false);
  const salonNameFieldRef = useRef<TextInput | null>(null);
  const activityCategoryFieldRef = useRef<TextInput | null>(null);
  const businessPhoneFieldRef = useRef<TextInput | null>(null);
  const streetLineFieldRef = useRef<TextInput | null>(null);
  const cityFieldRef = useRef<TextInput | null>(null);
  const postalCodeFieldRef = useRef<TextInput | null>(null);
  const accountEmailFieldRef = useRef<TextInput | null>(null);
  const {
    clienti,
    appuntamenti,
    movimenti,
    servizi,
    operatori,
    richiestePrenotazione,
    salonAccountEmail,
    salonWorkspace,
    setSalonWorkspace,
    updateSalonWorkspacePersisted,
    switchSalonAccount,
    appLanguage,
    showOnboarding,
    completeOnboarding,
  } = useAppContext();

  const [loadingSalon, setLoadingSalon] = useState(false);
  const [savingSalon, setSavingSalon] = useState(false);

  const [accountEmailInput, setAccountEmailInput] = useState(salonAccountEmail);
  const [salonNameInput, setSalonNameInput] = useState(salonWorkspace.salonName);
  const [salonNameDisplayStyleInput, setSalonNameDisplayStyleInput] = useState<
    'corsivo' | 'stampatello' | 'minuscolo'
  >(
    salonWorkspace.salonNameDisplayStyle
  );
  const [salonNameFontVariantInput, setSalonNameFontVariantInput] = useState(
    salonWorkspace.salonNameFontVariant
  );
  const [businessPhoneInput, setBusinessPhoneInput] = useState(salonWorkspace.businessPhone);
  const [activityCategoryInput, setActivityCategoryInput] = useState(
    toUppercaseField(salonWorkspace.activityCategory)
  );
  const [streetLineInput, setStreetLineInput] = useState(
    [salonWorkspace.streetType, salonWorkspace.streetName].filter(Boolean).join(' ').trim()
  );
  const [cityInput, setCityInput] = useState(toUppercaseField(salonWorkspace.city));
  const [postalCodeInput, setPostalCodeInput] = useState(salonWorkspace.postalCode);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isEditingSalonProfile, setIsEditingSalonProfile] = useState(false);
  const [showProfileSection, setShowProfileSection] = useState(false);
  const [showFontPicker, setShowFontPicker] = useState(false);
  const [showOperatorAgendaModal, setShowOperatorAgendaModal] = useState(false);
  const [selectedOperatorBoardId, setSelectedOperatorBoardId] = useState<string | null>(null);
  const [showCustomerInsightsModal, setShowCustomerInsightsModal] = useState(false);
  const [selectedCustomerInsightId, setSelectedCustomerInsightId] = useState<string | null>(null);
  const [customerInsightSearchQuery, setCustomerInsightSearchQuery] = useState('');
  const [customerAppointmentFilter, setCustomerAppointmentFilter] = useState<
    'all' | 'today' | 'future' | 'past'
  >('all');
  const [profileFieldErrors, setProfileFieldErrors] = useState<{
    businessPhone?: string;
    accountEmail?: string;
  }>({});
  const { focusField, scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: responsive.isDesktop ? 52 : 32,
  });
  const handleKeyboardNext = useCallback(() => {
    focusNextInput(
      [
        salonNameFieldRef,
        activityCategoryFieldRef,
        businessPhoneFieldRef,
        streetLineFieldRef,
        cityFieldRef,
        postalCodeFieldRef,
        accountEmailFieldRef,
      ],
      focusField
    );
  }, [focusField]);

  const scrollToQrSection = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(
          clientAccessSectionY + (responsive.isDesktop ? 980 : 1260),
          0
        ),
        animated: true,
      });
    });
  }, [clientAccessSectionY, responsive.isDesktop]);

  const oggi = getTodayDateString();
  const numeroClienti = clienti.length;
  const numeroAppuntamenti = appuntamenti.length;

  const incassoTotale = useMemo(
    () => movimenti.reduce((totale, movimento) => totale + movimento.importo, 0),
    [movimenti]
  );

  const appuntamentiOggi = useMemo(
    () =>
      appuntamenti
        .filter((item) => item.data === oggi)
        .sort((first, second) => first.ora.localeCompare(second.ora)),
    [appuntamenti, oggi]
  );

  const appuntamentiIncassati = appuntamenti.filter((item) => item.incassato).length;
  const appuntamentiDaIncassare = appuntamenti.filter((item) => !item.incassato).length;
  const valoreDaIncassare = useMemo(
    () =>
      appuntamenti
        .filter((item) => !item.incassato)
        .reduce((totale, item) => totale + item.prezzo, 0),
    [appuntamenti]
  );

  const prossimoAppuntamento = appuntamentiOggi[0];
  const ultimoCliente = clienti[0];

  const servizioTop = useMemo(() => {
    const counts = appuntamenti.reduce<Record<string, number>>((acc, item) => {
      acc[item.servizio] = (acc[item.servizio] ?? 0) + 1;
      return acc;
    }, {});

    const [nome, count] =
      Object.entries(counts).sort((first, second) => second[1] - first[1])[0] ?? [];
    if (!nome || !count) return null;

    const servizio = servizi.find((item) => item.nome === nome);
    return {
      nome,
      count,
      durataMinuti: servizio?.durataMinuti,
    };
  }, [appuntamenti, servizi]);

  const mediaScontrino = useMemo(() => {
    if (movimenti.length === 0) return 0;
    return incassoTotale / movimenti.length;
  }, [incassoTotale, movimenti.length]);

  const livelloOperativo = useMemo(() => {
    if (appuntamentiOggi.length >= 5) {
      return {
        label: 'Giornata piena',
        tone: styles.statusHot,
        textTone: styles.statusHotText,
      };
    }

    if (appuntamentiOggi.length >= 2) {
      return {
        label: 'Buon ritmo',
        tone: styles.statusWarm,
        textTone: styles.statusWarmText,
      };
    }

    return {
      label: 'Spazio libero',
      tone: styles.statusCalm,
      textTone: styles.statusCalmText,
    };
  }, [appuntamentiOggi.length]);

  const operatorDailyBoards = useMemo(() => {
    const pendingRequestsToday = richiestePrenotazione
      .filter((item) => item.data === oggi && item.stato === 'In attesa')
      .sort((first, second) => first.ora.localeCompare(second.ora));

    return operatori
      .map((operator) => {
        const appointmentsToday = appuntamentiOggi.filter((item) =>
          isSameOperatorIdentity(item, operator)
        );
        const pendingRequests = pendingRequestsToday.filter((item) =>
          isSameOperatorIdentity(item, operator)
        );

        const timeline = [
          ...appointmentsToday.map((item) => ({
            id: `appointment-${item.id}`,
            ora: item.ora,
            title: item.cliente,
            subtitle: `${item.servizio} · € ${item.prezzo.toFixed(2)}`,
            badge: item.nonEffettuato
              ? 'Non effettuato'
              : item.completato
              ? 'Completato'
              : item.incassato
              ? 'Incassato'
              : 'Da fare',
            tone:
              item.nonEffettuato
                ? 'muted'
                : item.completato
                ? 'done'
                : item.incassato
                ? 'cash'
                : 'appointment',
          })),
          ...pendingRequests.map((item) => ({
            id: `request-${item.id}`,
            ora: item.ora,
            title: `${item.nome} ${item.cognome}`.trim(),
            subtitle: `Richiesta · ${item.servizio}`,
            badge: 'In attesa',
            tone: 'request',
          })),
        ].sort((first, second) => first.ora.localeCompare(second.ora));

        const remainingAppointments = appointmentsToday.filter(
          (item) => !item.completato && !item.nonEffettuato
        ).length;

        return {
          operator,
          appointmentsToday,
          pendingRequests,
          timeline,
          totalAssigned: appointmentsToday.length + pendingRequests.length,
          openTasks: remainingAppointments + pendingRequests.length,
          nextItem: timeline[0] ?? null,
        };
      })
      .sort((first, second) => {
        if (second.openTasks !== first.openTasks) {
          return second.openTasks - first.openTasks;
        }

        if (second.totalAssigned !== first.totalAssigned) {
          return second.totalAssigned - first.totalAssigned;
        }

        return first.operator.nome.localeCompare(second.operator.nome, 'it');
      });
  }, [appuntamentiOggi, oggi, operatori, richiestePrenotazione]);

  const operatorsWithWorkToday = operatorDailyBoards.filter((item) => item.totalAssigned > 0).length;
  const totalOperatorOpenTasks = operatorDailyBoards.reduce((total, item) => total + item.openTasks, 0);
  const totalOperatorPendingRequests = operatorDailyBoards.reduce(
    (total, item) => total + item.pendingRequests.length,
    0
  );
  const operatorBoardPreview = operatorDailyBoards.filter((item) => item.totalAssigned > 0).slice(0, 3);
  const visibleOperatorBoards = useMemo(
    () =>
      selectedOperatorBoardId
        ? operatorDailyBoards.filter((item) => item.operator.id === selectedOperatorBoardId)
        : operatorDailyBoards,
    [operatorDailyBoards, selectedOperatorBoardId]
  );

  const openOperatorAgendaModalForAll = useCallback(() => {
    setSelectedOperatorBoardId(null);
    setShowOperatorAgendaModal(true);
  }, []);

  const openOperatorAgendaModalForOperator = useCallback((operatorId: string) => {
    setSelectedOperatorBoardId(operatorId);
    setShowOperatorAgendaModal(true);
  }, []);

  const selectedOperatorBoard = useMemo(
    () => operatorDailyBoards.find((item) => item.operator.id === selectedOperatorBoardId) ?? null,
    [operatorDailyBoards, selectedOperatorBoardId]
  );

  const customerInsightBoards = useMemo(() => {
    return clienti
      .map((customer) => {
        const customerAppointments = appuntamenti
          .filter((item) => isSameCustomerIdentity(item, customer))
          .sort((first, second) => {
            const firstDate = first.data ?? oggi;
            const secondDate = second.data ?? oggi;

            if (firstDate !== secondDate) {
              return secondDate.localeCompare(firstDate);
            }

            return second.ora.localeCompare(first.ora);
          });

        const pastAppointments = customerAppointments.filter((item) => (item.data ?? oggi) < oggi);
        const todayAppointments = customerAppointments.filter((item) => (item.data ?? oggi) === oggi);
        const futureAppointments = customerAppointments.filter((item) => (item.data ?? oggi) > oggi);
        const deliveredAppointments = customerAppointments.filter((item) => !item.nonEffettuato);
        const completedAppointments = customerAppointments.filter((item) => item.completato);
        const incassatoAppointments = customerAppointments.filter((item) => item.incassato);
        const totalSpent = deliveredAppointments.reduce((total, item) => total + item.prezzo, 0);
        const collectedSpent = incassatoAppointments.reduce((total, item) => total + item.prezzo, 0);
        const averageTicket =
          deliveredAppointments.length > 0 ? totalSpent / deliveredAppointments.length : 0;
        const nextAppointment =
          [...todayAppointments, ...futureAppointments]
            .sort((first, second) => {
              const firstDate = first.data ?? oggi;
              const secondDate = second.data ?? oggi;

              if (firstDate !== secondDate) {
                return firstDate.localeCompare(secondDate);
              }

              return first.ora.localeCompare(second.ora);
            })[0] ?? null;
        const latestAppointment = customerAppointments[0] ?? null;
        const serviceStats = Object.entries(
          deliveredAppointments.reduce<Record<string, { count: number; total: number }>>(
            (accumulator, item) => {
              const current = accumulator[item.servizio] ?? { count: 0, total: 0 };
              accumulator[item.servizio] = {
                count: current.count + 1,
                total: current.total + item.prezzo,
              };
              return accumulator;
            },
            {}
          )
        )
          .map(([serviceName, stats]) => ({
            serviceName,
            count: stats.count,
            total: stats.total,
          }))
          .sort((first, second) => {
            if (second.count !== first.count) {
              return second.count - first.count;
            }

            return second.total - first.total;
          });

        const timeline = customerAppointments.map((item) => {
          const appointmentDate = item.data ?? oggi;
          const dateLabel = formatDateLabel(appointmentDate);
          const phase =
            appointmentDate > oggi ? 'Futuro' : appointmentDate < oggi ? 'Passato' : 'Oggi';
          const badge = item.nonEffettuato
            ? 'Non effettuato'
            : item.completato
            ? 'Completato'
            : item.incassato
            ? 'Incassato'
            : appointmentDate > oggi
            ? 'Prenotato'
            : appointmentDate < oggi
            ? 'Svolto'
            : 'In corso';
          const tone =
            phase === 'Futuro'
              ? 'future'
              : phase === 'Oggi'
              ? 'today'
              : item.nonEffettuato
              ? 'muted'
              : 'past';

          return {
            id: item.id,
            dateLabel,
            ora: item.ora,
            title: item.servizio,
            subtitle: `€ ${item.prezzo.toFixed(2)}${item.operatoreNome ? ` · ${item.operatoreNome}` : ''}`,
            badge,
            phase,
            tone,
          };
        });

        return {
          customer,
          customerAppointments,
          timeline,
          totalAppointments: customerAppointments.length,
          pastAppointments: pastAppointments.length,
          todayAppointments: todayAppointments.length,
          futureAppointments: futureAppointments.length,
          completedAppointments: completedAppointments.length,
          collectedAppointments: incassatoAppointments.length,
          totalSpent,
          collectedSpent,
          averageTicket,
          nextAppointment,
          latestAppointment,
          serviceStats,
        };
      })
      .filter((item) => item.totalAppointments > 0)
      .sort((first, second) => {
        if (second.futureAppointments !== first.futureAppointments) {
          return second.futureAppointments - first.futureAppointments;
        }

        if (second.totalSpent !== first.totalSpent) {
          return second.totalSpent - first.totalSpent;
        }

        return first.customer.nome.localeCompare(second.customer.nome, 'it');
      });
  }, [appuntamenti, clienti, oggi]);

  const customerBoardsWithFuture = customerInsightBoards.filter((item) => item.futureAppointments > 0).length;
  const totalCustomerDeliveredSpend = customerInsightBoards.reduce(
    (total, item) => total + item.totalSpent,
    0
  );
  const customerInsightPreview = customerInsightBoards.slice(0, 3);
  const filteredCustomerInsightBoards = useMemo(() => {
    const query = customerInsightSearchQuery.trim().toLocaleLowerCase('it-IT');

    if (!query) {
      return customerInsightBoards;
    }

    return customerInsightBoards.filter(({ customer, serviceStats }) => {
      const searchableParts = [
        customer.nome,
        customer.telefono,
        customer.email ?? '',
        customer.instagram ?? '',
        ...serviceStats.map((item) => item.serviceName),
      ]
        .join(' ')
        .toLocaleLowerCase('it-IT');

      return searchableParts.includes(query);
    });
  }, [customerInsightBoards, customerInsightSearchQuery]);

  const selectedCustomerInsightBoard = useMemo(
    () =>
      filteredCustomerInsightBoards.find((item) => item.customer.id === selectedCustomerInsightId) ??
      customerInsightBoards.find((item) => item.customer.id === selectedCustomerInsightId) ??
      filteredCustomerInsightBoards[0] ??
      null,
    [customerInsightBoards, filteredCustomerInsightBoards, selectedCustomerInsightId]
  );

  const customerAppointmentFilterOptions = useMemo(
    () =>
      selectedCustomerInsightBoard
        ? [
            { key: 'all' as const, label: 'Tutti', count: selectedCustomerInsightBoard.totalAppointments },
            { key: 'today' as const, label: 'Oggi', count: selectedCustomerInsightBoard.todayAppointments },
            { key: 'future' as const, label: 'Futuri', count: selectedCustomerInsightBoard.futureAppointments },
            { key: 'past' as const, label: 'Passati', count: selectedCustomerInsightBoard.pastAppointments },
          ]
        : [],
    [selectedCustomerInsightBoard]
  );

  const visibleCustomerTimeline = useMemo(() => {
    if (!selectedCustomerInsightBoard) {
      return [];
    }

    return selectedCustomerInsightBoard.timeline.filter((entry) => {
      if (customerAppointmentFilter === 'today') return entry.phase === 'Oggi';
      if (customerAppointmentFilter === 'future') return entry.phase === 'Futuro';
      if (customerAppointmentFilter === 'past') return entry.phase === 'Passato';
      return true;
    });
  }, [customerAppointmentFilter, selectedCustomerInsightBoard]);

  useEffect(() => {
    if (filteredCustomerInsightBoards.length === 0) {
      if (selectedCustomerInsightId !== null) {
        setSelectedCustomerInsightId(null);
      }
      return;
    }

    if (
      !selectedCustomerInsightId ||
      !filteredCustomerInsightBoards.some((item) => item.customer.id === selectedCustomerInsightId)
    ) {
      setSelectedCustomerInsightId(filteredCustomerInsightBoards[0].customer.id);
    }
  }, [filteredCustomerInsightBoards, selectedCustomerInsightId]);

  useEffect(() => {
    setCustomerAppointmentFilter('all');
  }, [selectedCustomerInsightId]);

  const openCustomerInsightsModalForAll = useCallback(() => {
    setCustomerInsightSearchQuery('');
    setCustomerAppointmentFilter('all');
    setSelectedCustomerInsightId(customerInsightBoards[0]?.customer.id ?? null);
    setShowCustomerInsightsModal(true);
  }, [customerInsightBoards]);

  const openCustomerInsightsModalForCustomer = useCallback((customerId: string) => {
    setCustomerInsightSearchQuery('');
    setCustomerAppointmentFilter('all');
    setSelectedCustomerInsightId(customerId);
    setShowCustomerInsightsModal(true);
  }, []);

  const buildOperatorAgendaPdfHtml = useCallback(() => {
    const boards = visibleOperatorBoards;
    const title = selectedOperatorBoard
      ? `Appuntamenti di ${selectedOperatorBoard.operator.nome}`
      : 'Appuntamenti per operatore';

    const sectionsHtml = boards
      .map((board) => {
        const timelineHtml =
          board.timeline.length === 0
            ? '<div class="empty">Agenda libera oggi</div>'
            : board.timeline
                .map(
                  (entry) => `
                    <div class="row">
                      <div class="time">${escapeHtml(entry.ora)}</div>
                      <div class="content">
                        <div class="top">
                          <div class="title">${escapeHtml(entry.title)}</div>
                          <div class="badge">${escapeHtml(entry.badge)}</div>
                        </div>
                        <div class="subtitle">${escapeHtml(entry.subtitle)}</div>
                      </div>
                    </div>
                  `
                )
                .join('');

        return `
          <section class="board">
            <div class="board-header">
              <div>
                <div class="name">${escapeHtml(board.operator.nome)}</div>
                <div class="role">${escapeHtml(board.operator.mestiere)}</div>
              </div>
              <div class="counters">
                <div class="counter strong">${board.openTasks} da fare</div>
                <div class="counter">${board.totalAssigned} totali</div>
              </div>
            </div>
            ${timelineHtml}
          </section>
        `;
      })
      .join('');

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; color: #0f172a; }
            h1 { margin: 0 0 6px; font-size: 28px; }
            .meta { margin-bottom: 24px; color: #64748b; font-size: 14px; }
            .board { border: 1px solid #dbe4ef; border-radius: 18px; padding: 16px; margin-bottom: 16px; }
            .board-header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
            .name { font-size: 20px; font-weight: 800; }
            .role { font-size: 13px; color: #64748b; font-weight: 700; }
            .counters { text-align: right; }
            .counter { font-size: 12px; color: #475569; margin-bottom: 4px; font-weight: 700; }
            .counter.strong { color: #14532d; font-size: 13px; font-weight: 800; }
            .row { display: flex; gap: 10px; margin-bottom: 10px; }
            .time { min-width: 72px; border: 1px solid #dbe4ef; border-radius: 12px; padding: 10px 8px; text-align: center; font-weight: 800; background: #f8fafc; }
            .content { flex: 1; border: 1px solid #dbe4ef; border-radius: 14px; padding: 10px 12px; background: #f8fafc; }
            .top { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; align-items: center; }
            .title { font-size: 15px; font-weight: 800; }
            .subtitle { font-size: 12px; color: #64748b; font-weight: 700; }
            .badge { font-size: 11px; font-weight: 800; color: #0c4a6e; background: #e0f2fe; border-radius: 999px; padding: 6px 10px; white-space: nowrap; }
            .empty { border: 1px dashed #cbd5e1; border-radius: 14px; padding: 14px; color: #64748b; font-weight: 700; text-align: center; background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(title)}</h1>
          <div class="meta">${escapeHtml(formatDateLabel(oggi))} · ${escapeHtml(salonWorkspace.salonName || 'Salon Pro')}</div>
          ${sectionsHtml}
        </body>
      </html>
    `;
  }, [oggi, salonWorkspace.salonName, selectedOperatorBoard, visibleOperatorBoards]);

  const exportOperatorAgendaPdf = useCallback(async () => {
    if (visibleOperatorBoards.length === 0) {
      Alert.alert('Niente da esportare', 'Non ci sono appuntamenti operatori da esportare in questo momento.');
      return;
    }

    try {
      const html = buildOperatorAgendaPdfHtml();
      const result = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType: 'application/pdf',
          dialogTitle: selectedOperatorBoard
            ? `Condividi agenda di ${selectedOperatorBoard.operator.nome}`
            : 'Condividi agenda operatori',
          UTI: 'com.adobe.pdf',
        });
      } else {
        await Share.share({ message: result.uri });
      }
    } catch {
      Alert.alert('Export non riuscito', 'Non sono riuscito a creare il PDF. Riprova tra qualche secondo.');
    }
  }, [buildOperatorAgendaPdfHtml, selectedOperatorBoard, visibleOperatorBoards.length]);

  const printOperatorAgenda = useCallback(async () => {
    if (visibleOperatorBoards.length === 0) {
      Alert.alert('Niente da stampare', 'Non ci sono appuntamenti operatori da stampare in questo momento.');
      return;
    }

    try {
      await Print.printAsync({ html: buildOperatorAgendaPdfHtml() });
    } catch {
      Alert.alert('Stampa non riuscita', 'Non sono riuscito ad aprire l’anteprima di stampa.');
    }
  }, [buildOperatorAgendaPdfHtml, visibleOperatorBoards.length]);

  useEffect(() => {
    setAccountEmailInput(salonAccountEmail);
  }, [salonAccountEmail]);

  useEffect(() => {
    if (isEditingSalonProfile) {
      return;
    }

    setSalonNameInput(salonWorkspace.salonName);
    setSalonNameDisplayStyleInput(salonWorkspace.salonNameDisplayStyle);
    setSalonNameFontVariantInput(salonWorkspace.salonNameFontVariant);
    setBusinessPhoneInput(salonWorkspace.businessPhone);
    setActivityCategoryInput(toUppercaseField(salonWorkspace.activityCategory));
    setStreetLineInput(
      [salonWorkspace.streetType, salonWorkspace.streetName].filter(Boolean).join(' ').trim()
    );
    setCityInput(toUppercaseField(salonWorkspace.city));
    setPostalCodeInput(salonWorkspace.postalCode);
  }, [
    salonWorkspace.activityCategory,
    salonWorkspace.businessPhone,
    salonWorkspace.city,
    salonWorkspace.postalCode,
    salonWorkspace.salonName,
    salonWorkspace.salonNameDisplayStyle,
    salonWorkspace.salonNameFontVariant,
    salonWorkspace.streetName,
    salonWorkspace.streetType,
    isEditingSalonProfile,
  ]);

  const salvaDatiSalone = async () => {
    if (
      !salonNameInput.trim() ||
      !activityCategoryInput.trim() ||
      !businessPhoneInput.trim() ||
      !streetLineInput.trim() ||
      !cityInput.trim() ||
      !postalCodeInput.trim()
    ) {
      Alert.alert(
        'Profilo salone incompleto',
        'Compila nome salone, categoria attività, cellulare azienda, via e nome strada, comune e CAP prima di salvare.'
      );
      return;
    }

    const invalidFields: string[] = [];

    if (!isValidPhone10(businessPhoneInput)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
    }

    if (accountEmailInput.trim() && !isValidEmail(accountEmailInput)) {
      invalidFields.push('Email non valida');
    }

    if (invalidFields.length > 0) {
      setProfileFieldErrors({
        businessPhone: !isValidPhone10(businessPhoneInput)
          ? 'Numero di telefono errato (deve avere 10 cifre)'
          : undefined,
        accountEmail:
          accountEmailInput.trim() && !isValidEmail(accountEmailInput)
            ? 'Email non valida'
            : undefined,
      });
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setProfileFieldErrors({});

    try {
      setSavingSalon(true);

      const formattedAddress = formatSalonAddress({
        streetType: '',
        streetName: streetLineInput,
        streetNumber: '',
        city: cityInput,
        postalCode: postalCodeInput,
        salonAddress: '',
      });

      await updateSalonWorkspacePersisted((current) => ({
        ...current,
        salonName: salonNameInput.trim(),
        salonNameDisplayStyle: salonNameDisplayStyleInput,
        salonNameFontVariant: salonNameFontVariantInput,
        ownerEmail: accountEmailInput.trim().toLowerCase(),
        businessPhone: businessPhoneInput.trim(),
        activityCategory: toUppercaseField(activityCategoryInput.trim()),
        streetType: '',
        streetName: toUppercaseField(streetLineInput.trim()),
        streetNumber: '',
        city: toUppercaseField(cityInput.trim()),
        postalCode: postalCodeInput.trim(),
        salonAddress: formattedAddress,
        updatedAt: new Date().toISOString(),
      }));

      setSavingSalon(false);

      Alert.alert(
        'Profilo salvato',
        'Dati salone aggiornati. La pubblicazione verso il portale cliente avviene automaticamente.'
      );
      setIsEditingSalonProfile(false);
      setShowProfileSection(false);
    } catch (e: any) {
      setSavingSalon(false);
      Alert.alert('Errore generale', e.message ?? 'Errore durante il salvataggio');
    }
  };

  const salvaAccountSalone = async () => {
    if (!isValidEmail(accountEmailInput)) {
      setProfileFieldErrors((current) => ({ ...current, accountEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setProfileFieldErrors((current) => ({ ...current, accountEmail: undefined }));

    const success = await switchSalonAccount(accountEmailInput);

    if (!success) {
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    Alert.alert(
      'Account aggiornato',
      `Ora l'app usa il profilo ${accountEmailInput.trim().toLowerCase()}.`
    );
  };

  const aggiornaStatoWorkspace = (
    status: 'active' | 'suspended' | 'expired',
    plan: 'starter' | 'pro' =
      salonWorkspace.subscriptionPlan === 'pro' ? 'pro' : 'starter'
  ) => {
    const formattedAddress = formatSalonAddress({
      streetType: '',
      streetName: streetLineInput,
      streetNumber: '',
      city: cityInput,
      postalCode: postalCodeInput,
      salonAddress: '',
    });

    void updateSalonWorkspacePersisted((current) => ({
      ...current,
      ownerEmail: accountEmailInput.trim().toLowerCase(),
      businessPhone: businessPhoneInput.trim(),
      activityCategory: toUppercaseField(activityCategoryInput.trim()),
      streetType: '',
      streetName: toUppercaseField(streetLineInput.trim()),
      streetNumber: '',
      city: toUppercaseField(cityInput.trim()),
      postalCode: postalCodeInput.trim(),
      salonAddress: formattedAddress,
      subscriptionStatus: status,
      subscriptionPlan: plan,
      updatedAt: new Date().toISOString(),
    }));
  };

  const profiloSaloneCompleto =
    salonNameInput.trim() !== '' &&
    activityCategoryInput.trim() !== '' &&
    businessPhoneInput.trim() !== '' &&
    streetLineInput.trim() !== '' &&
    cityInput.trim() !== '' &&
    postalCodeInput.trim().length >= 5;

  const salonPreviewName = salonNameInput.trim() || 'Nome salone';
  const salonPreviewAddress = formatSalonAddress({
    streetType: '',
    streetName: streetLineInput,
    streetNumber: '',
    city: cityInput,
    postalCode: postalCodeInput,
    salonAddress: '',
  });
  const requiredFieldsFilled = [
    salonNameInput,
    activityCategoryInput,
    businessPhoneInput,
    streetLineInput,
    cityInput,
    postalCodeInput,
  ].filter((value) => value.trim() !== '').length;

  const profileSections = [
    {
      key: 'identity',
      title: 'Identita salone',
      subtitle: 'Nome, categoria e insegna del salone.',
      completed:
        salonNameInput.trim() !== '' &&
        activityCategoryInput.trim() !== '' &&
        salonNameFontVariantInput.trim() !== '',
    },
    {
      key: 'contacts',
      title: 'Contatti',
      subtitle: 'Numero aziendale per clienti e comunicazioni.',
      completed: businessPhoneInput.trim() !== '',
    },
    {
      key: 'address',
      title: 'Indirizzo',
      subtitle: 'Via, citta e CAP del salone.',
      completed:
        streetLineInput.trim() !== '' && cityInput.trim() !== '' && postalCodeInput.trim() !== '',
    },
    {
      key: 'account',
      title: 'Account e stato',
      subtitle: 'Profilo attivo e stato workspace.',
      completed: accountEmailInput.trim() !== '' && Boolean(salonWorkspace.subscriptionStatus),
    },
  ];

  const completedProfileSections = profileSections.filter((item) => item.completed).length;

  const brandName =
  salonNameInput.trim() ? toUppercaseField(salonNameInput) : 'SALON PRO';

const publicClientBaseUrl = useMemo(() => {
  const expoExtra =
    (Constants.expoConfig?.extra as { publicClientBaseUrl?: string } | undefined) ??
    undefined;
  const manifestExtra =
    ((Constants as typeof Constants & {
      manifest?: { extra?: { publicClientBaseUrl?: string } };
    }).manifest?.extra as { publicClientBaseUrl?: string } | undefined) ?? undefined;
  const manifest2Extra =
    ((Constants as typeof Constants & {
      manifest2?: { extra?: { expoClient?: { extra?: { publicClientBaseUrl?: string } } } };
    }).manifest2?.extra?.expoClient?.extra as { publicClientBaseUrl?: string } | undefined) ??
    undefined;

  const configuredBaseUrl =
    expoExtra?.publicClientBaseUrl ??
    manifestExtra?.publicClientBaseUrl ??
    manifest2Extra?.publicClientBaseUrl ??
    DEFAULT_PUBLIC_CLIENT_BASE_URL;

  return configuredBaseUrl.trim().replace(/\/+$/, '');
}, []);

const parsedPublicClientBaseUrl = useMemo(
  () => parsePublicClientBaseUrl(publicClientBaseUrl),
  [publicClientBaseUrl]
);
const normalizedSalonCode = useMemo(
  () => normalizeSalonCode(salonWorkspace.salonCode),
  [salonWorkspace.salonCode]
);
const clientAccessDisplayName = useMemo(
  () => {
    const explicitSalonName = salonWorkspace.salonName.trim();
    return explicitSalonName ? toUppercaseField(explicitSalonName) : brandName;
  },
  [brandName, salonWorkspace.salonName]
);

const canEditSalonProfile = isEditingSalonProfile;

const salonClientLink = useMemo(
  () => buildSalonClientLink(parsedPublicClientBaseUrl, normalizedSalonCode),
  [normalizedSalonCode, parsedPublicClientBaseUrl]
);
const publicClientLinkStatus = useMemo(
  () =>
    getPublicClientLinkStatus({
      baseUrl: parsedPublicClientBaseUrl,
      salonCode: normalizedSalonCode,
      salonClientLink,
    }),
  [normalizedSalonCode, parsedPublicClientBaseUrl, salonClientLink]
);
const publicClientLinkHealth = publicClientLinkStatus.status;
const clientQrValue =
  publicClientLinkHealth === 'ready'
    ? salonClientLink
    : 'https://configura-public-client-base-url.invalid';
const canShareClientAccess = publicClientLinkStatus.canShare;
const clientAccessStatusCopy = publicClientLinkStatus.message;

const openFrontendPreviewForAdmin = useCallback(() => {
  router.push({
    pathname: '/cliente',
    params: { salon: salonWorkspace.salonCode },
  });
}, [router, salonWorkspace.salonCode]);

const openQrPrintPreview = useCallback(() => {
  if (!salonClientLink || !canShareClientAccess) {
    Alert.alert('QR non pronto', clientAccessStatusCopy);
    return;
  }

  router.push({
    pathname: '/stampa-qr',
    params: {
      salon: salonWorkspace.salonCode,
      name: clientAccessDisplayName,
      link: salonClientLink,
    },
  });
}, [
  canShareClientAccess,
  clientAccessDisplayName,
  clientAccessStatusCopy,
  router,
  salonClientLink,
  salonWorkspace.salonCode,
]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
        setShowProfileSection(false);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      };
    }, [])
  );

  const condividiAccessoCliente = async () => {
    if (!salonClientLink || !canShareClientAccess) {
      Alert.alert(
        'Link cliente non pronto',
        clientAccessStatusCopy
      );
      return;
    }

    try {
      await Share.share({
        title: `Prenota da ${brandName}`,
        message: buildClientInviteMessage({
          brandName: clientAccessDisplayName,
          salonClientLink,
        }),
      });
    } catch (error) {
      Alert.alert(
        'Condivisione non riuscita',
        'Non è stato possibile aprire la condivisione. Riprova tra qualche secondo.'
      );
    }
  };

  if (loadingSalon) {
    return (
      <View style={styles.container}>
        <View style={[styles.content, styles.loadingWrap]}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Caricamento salone...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
        <View style={styles.heroCard}>
          <ModuleHeroHeader
            moduleKey="index"
            title={tApp(appLanguage, 'tab_home')}
            salonName={salonNameInput || salonWorkspace.salonName}
            salonNameDisplayStyle={salonNameDisplayStyleInput}
            salonNameFontVariant={salonNameFontVariantInput}
            onTitleLongPress={() => setShowAdminPanel((current) => !current)}
            rightAccessory={
              <HapticTouchable
                style={styles.settingsButton}
                onPress={() => {
                  if (settingsTapLockRef.current) {
                    return;
                  }

                  settingsTapLockRef.current = true;
                  Haptics.selectionAsync().catch(() => null);
                  router.push('/impostazioni');
                  setTimeout(() => {
                    settingsTapLockRef.current = false;
                  }, 420);
                }}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Image
                  source={require('../../assets/header-impostazioni-icon.png')}
                  style={styles.settingsIconImage}
                  resizeMode="contain"
                />
              </HapticTouchable>
            }
          />

          <View style={styles.heroTopRow}>
            <View style={[styles.heroMetaCard, styles.heroMetaCardToday]}>
              <Text style={[styles.heroDateLabel, styles.heroDateLabelToday]}>{tApp(appLanguage, 'common_today')}</Text>
              <Text
                style={[styles.heroDateValue, styles.heroDateValueToday]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {formatDateLabel(oggi)}
              </Text>
            </View>

            <View style={[styles.heroMetaCard, styles.heroStatusCard, livelloOperativo.tone]}>
              <Text
                style={[styles.statusPillText, livelloOperativo.textTone]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.74}
              >
                {livelloOperativo.label}
              </Text>
            </View>
          </View>

          <View style={styles.heroMetricsRow}>
            <View style={styles.heroMetricCardBlue}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={[styles.heroMetricNumber, styles.heroMetricNumberBlue]}
              >
                {appuntamentiOggi.length}
              </Text>
              <Text
                style={[styles.heroMetricLabel, styles.heroMetricLabelBlue]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.68}
              >
                {tApp(appLanguage, 'home_appointments_today')}
              </Text>
            </View>

            <View style={styles.heroMetricCardRose}>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
                style={[styles.heroMetricNumber, styles.heroMetricNumberRose]}
              >
                € {valoreDaIncassare.toFixed(0)}
              </Text>
              <Text
                style={[styles.heroMetricLabel, styles.heroMetricLabelRose]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.68}
              >
                {tApp(appLanguage, 'home_to_collect')}
              </Text>
            </View>
          </View>

          <Text style={styles.subtitle}>{tApp(appLanguage, 'home_subtitle')}</Text>
        </View>

        <View style={styles.insightGrid}>
          <View
            style={[
              styles.insightCard,
              responsive.isTablet && styles.halfWidthCard,
              responsive.isDesktop && styles.desktopThirdCard,
            ]}
          >
            <Text style={[styles.insightTitle, styles.insightTitlePlum]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{tApp(appLanguage, 'tab_clients')}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[styles.insightNumber, styles.insightNumberPlum]}
            >
              {numeroClienti}
            </Text>
            <Text style={[styles.insightHint, styles.insightHintPlum]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64}>
              {ultimoCliente
                ? `Ultimo: ${ultimoCliente.nome}`
                : tApp(appLanguage, 'home_no_customer')}
            </Text>
          </View>

          <View
            style={[
              styles.insightCardMint,
              responsive.isTablet && styles.halfWidthCard,
              responsive.isDesktop && styles.desktopThirdCard,
            ]}
          >
            <Text style={[styles.insightTitle, styles.insightTitleMint]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{tApp(appLanguage, 'home_total_income')}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[styles.insightNumber, styles.insightNumberMint]}
            >
              € {incassoTotale.toFixed(0)}
            </Text>
            <Text style={[styles.insightHint, styles.insightHintMint]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.64}>
              {tApp(appLanguage, 'home_registered_movements')}
            </Text>
          </View>
        </View>

        <View style={[styles.priorityCard, responsive.isDesktop && styles.desktopPriorityCard]}>
          <Text style={styles.priorityEyebrow}>{tApp(appLanguage, 'home_next_priority')}</Text>
          <Text
            style={styles.priorityTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
            ellipsizeMode="clip"
          >
            {prossimoAppuntamento
              ? `${prossimoAppuntamento.ora} · ${prossimoAppuntamento.cliente}`
              : tApp(appLanguage, 'home_no_appointment_today')}
          </Text>
          <Text
            style={styles.priorityText}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.76}
            ellipsizeMode="clip"
          >
            {prossimoAppuntamento
              ? `${prossimoAppuntamento.servizio} · € ${prossimoAppuntamento.prezzo.toFixed(2)}`
              : tApp(appLanguage, 'home_free_today')}
          </Text>
        </View>

        <View style={styles.sectionRow}>
          <View style={[styles.infoCardSun, responsive.isTablet && styles.infoCardResponsive]}>
            <Text style={[styles.infoLabel, styles.infoLabelSun]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>{tApp(appLanguage, 'home_collected')}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[styles.infoValue, styles.infoValueSun]}
            >
              {appuntamentiIncassati}
            </Text>
          </View>

          <View
            style={[styles.infoCardLavender, responsive.isTablet && styles.infoCardResponsive]}
          >
            <Text style={[styles.infoLabel, styles.infoLabelLavender]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>{tApp(appLanguage, 'home_bookings')}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[styles.infoValue, styles.infoValueLavender]}
            >
              {numeroAppuntamenti}
            </Text>
          </View>

          <View style={[styles.infoCardPeach, responsive.isTablet && styles.infoCardResponsive]}>
            <Text style={[styles.infoLabel, styles.infoLabelPeach]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.58}>{tApp(appLanguage, 'home_to_collect')}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[styles.infoValue, styles.infoValuePeach]}
            >
              {appuntamentiDaIncassare}
            </Text>
          </View>
        </View>

        <HapticTouchable
          style={[
            styles.qrJumpButton,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
          onPress={scrollToQrSection}
          pressScale={0.985}
          pressOpacity={0.98}
        >
          <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
          <Text style={styles.qrJumpButtonText}>Vai alla sezione condividi QR-code</Text>
        </HapticTouchable>

        <View
          style={[
            styles.sectionCard,
            styles.operatorAgendaCard,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
        >
          <View style={styles.operatorAgendaCardHeader}>
            <View style={styles.operatorAgendaCardTextWrap}>
              <Text style={styles.operatorAgendaCardTitle}>Appuntamenti per operatore</Text>
              <Text style={styles.operatorAgendaCardText}>
                Quadro live del lavoro di oggi. Tocca la card per aprire il popup dettagliato.
              </Text>
            </View>
            <HapticTouchable
              style={styles.operatorAgendaCardAction}
              onPress={openOperatorAgendaModalForAll}
              pressScale={0.98}
              pressOpacity={0.96}
            >
              <Text style={styles.operatorAgendaCardActionText}>Apri</Text>
              <Ionicons name="chevron-forward" size={18} color="#1E293B" />
            </HapticTouchable>
          </View>

          <View style={styles.operatorAgendaStatsRow}>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillSky]}>
              <Text style={styles.operatorAgendaStatValue}>{operatorsWithWorkToday}</Text>
              <Text style={styles.operatorAgendaStatLabel}>Operatori attivi</Text>
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillMint]}>
              <Text style={styles.operatorAgendaStatValue}>{totalOperatorOpenTasks}</Text>
              <Text style={styles.operatorAgendaStatLabel}>Lavori aperti</Text>
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillLavender]}>
              <Text style={styles.operatorAgendaStatValue}>{totalOperatorPendingRequests}</Text>
              <Text style={styles.operatorAgendaStatLabel}>Richieste live</Text>
            </View>
          </View>

          {operatori.length === 0 ? (
            <View style={styles.operatorAgendaEmptyState}>
              <Text style={styles.operatorAgendaEmptyTitle}>Nessun operatore configurato</Text>
              <Text style={styles.operatorAgendaEmptyText}>
                Aggiungi gli operatori nella sezione servizi e qui vedrai subito carico e appuntamenti.
              </Text>
            </View>
          ) : operatorBoardPreview.length === 0 ? (
            <View style={styles.operatorAgendaEmptyState}>
              <Text style={styles.operatorAgendaEmptyTitle}>Agenda operatori libera oggi</Text>
              <Text style={styles.operatorAgendaEmptyText}>
                La sezione resta live: se arriva o viene accettata una prenotazione, qui si aggiorna in tempo reale.
              </Text>
            </View>
          ) : (
            <View style={styles.operatorAgendaPreviewStack}>
              {operatorBoardPreview.map((item) => (
                <HapticTouchable
                  key={item.operator.id}
                  style={styles.operatorAgendaPreviewRow}
                  onPress={() => openOperatorAgendaModalForOperator(item.operator.id)}
                  pressScale={0.987}
                  pressOpacity={0.98}
                >
                  <View style={styles.operatorAgendaPreviewIdentity}>
                    <View style={styles.operatorAgendaPreviewTextWrap}>
                      <Text style={styles.operatorAgendaPreviewName}>{item.operator.nome}</Text>
                      <Text style={styles.operatorAgendaPreviewRole}>{item.operator.mestiere}</Text>
                    </View>
                  </View>

                  <View style={styles.operatorAgendaPreviewMetrics}>
                    <Text style={styles.operatorAgendaPreviewMetric}>{item.openTasks} da fare</Text>
                    <Text style={styles.operatorAgendaPreviewMetricSoft}>
                      {item.nextItem ? `${item.nextItem.ora} prossimo` : 'nessun orario'}
                    </Text>
                  </View>
                  <View style={styles.operatorAgendaPreviewAvatar}>
                    {item.operator.fotoUri ? (
                      <Image source={{ uri: item.operator.fotoUri }} style={styles.operatorAgendaPreviewAvatarImage} />
                    ) : (
                      <Ionicons name="person" size={18} color="#1E293B" />
                    )}
                  </View>
                </HapticTouchable>
              ))}
            </View>
          )}
        </View>

        <View
          style={[
            styles.sectionCard,
            styles.customerInsightsCard,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
        >
          <View style={styles.operatorAgendaCardHeader}>
            <View style={styles.operatorAgendaCardTextWrap}>
              <Text style={styles.operatorAgendaCardTitle}>Appuntamenti per cliente</Text>
              <Text style={styles.operatorAgendaCardText}>
                Cerca un cliente e apri il suo storico completo: passati, oggi, futuri e totale servizi.
              </Text>
            </View>
            <HapticTouchable
              style={styles.operatorAgendaCardAction}
              onPress={openCustomerInsightsModalForAll}
              pressScale={0.98}
              pressOpacity={0.96}
            >
              <Text style={styles.operatorAgendaCardActionText}>Apri</Text>
              <Ionicons name="chevron-forward" size={18} color="#1E293B" />
            </HapticTouchable>
          </View>

          <View style={styles.operatorAgendaStatsRow}>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillPlum]}>
              <Text style={styles.operatorAgendaStatValue}>{customerInsightBoards.length}</Text>
              <Text style={styles.operatorAgendaStatLabel}>Clienti con storico</Text>
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillSun]}>
              <Text style={styles.operatorAgendaStatValue}>{customerBoardsWithFuture}</Text>
              <Text style={styles.operatorAgendaStatLabel}>Clienti con futuro</Text>
            </View>
            <View style={[styles.operatorAgendaStatPill, styles.operatorAgendaStatPillRose]}>
              <Text style={styles.operatorAgendaStatValue}>€ {totalCustomerDeliveredSpend.toFixed(0)}</Text>
              <Text style={styles.operatorAgendaStatLabel}>Servizi fruiti</Text>
            </View>
          </View>

          {customerInsightBoards.length === 0 ? (
            <View style={styles.operatorAgendaEmptyState}>
              <Text style={styles.operatorAgendaEmptyTitle}>Nessun cliente con appuntamenti</Text>
              <Text style={styles.operatorAgendaEmptyText}>
                Appena registri i primi appuntamenti, qui troverai storico e valore per ogni cliente.
              </Text>
            </View>
          ) : (
            <View style={styles.operatorAgendaPreviewStack}>
              {customerInsightPreview.map((item) => (
                <HapticTouchable
                  key={item.customer.id}
                  style={styles.customerInsightPreviewRow}
                  onPress={() => openCustomerInsightsModalForCustomer(item.customer.id)}
                  pressScale={0.987}
                  pressOpacity={0.98}
                >
                  <View style={styles.customerInsightPreviewMain}>
                    <Text style={styles.operatorAgendaPreviewName}>{item.customer.nome}</Text>
                    <Text style={styles.customerInsightPreviewMeta}>
                      {item.nextAppointment
                        ? `${formatDateLabel(item.nextAppointment.data ?? oggi)} · ${item.nextAppointment.ora} prossimo`
                        : item.latestAppointment
                        ? `${formatDateLabel(item.latestAppointment.data ?? oggi)} · ${item.latestAppointment.ora} ultimo`
                        : 'Nessun dettaglio'}
                    </Text>
                  </View>

                  <View style={styles.customerInsightPreviewMetrics}>
                    <Text style={styles.customerInsightPreviewMetric}>
                      {item.totalAppointments} appunt.
                    </Text>
                    <Text style={styles.customerInsightPreviewMetricSoft}>
                      € {item.totalSpent.toFixed(2)}
                    </Text>
                  </View>
                </HapticTouchable>
              ))}
            </View>
          )}
        </View>

        <View
          style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}
          onLayout={(event) => {
            setClientAccessSectionY(event.nativeEvent.layout.y);
          }}
        >
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>
            {tApp(appLanguage, 'home_smart_indicators')}
          </Text>

          <View style={[styles.smartItem, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_top_service')}
            </Text>
            <Text
              style={[styles.smartValue, styles.smartTextCentered]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.74}
              ellipsizeMode="clip"
            >
              {servizioTop
                ? `${servizioTop.nome} · ${servizioTop.count} volte`
                : 'Ancora nessun dato'}
            </Text>
          </View>

          <View style={[styles.smartItem, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_top_duration')}
            </Text>
            <Text
              style={[styles.smartValue, styles.smartTextCentered]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              ellipsizeMode="clip"
            >
              {servizioTop ? formatMinutes(servizioTop.durataMinuti) : '—'}
            </Text>
          </View>

          <View style={[styles.smartItemLast, styles.smartItemCentered]}>
            <Text style={[styles.smartLabel, styles.smartTextCentered]}>
              {tApp(appLanguage, 'home_average_ticket')}
            </Text>
            <Text
              style={[styles.smartValue, styles.smartTextCentered]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              ellipsizeMode="clip"
            >
              € {mediaScontrino.toFixed(2)}
            </Text>
          </View>
        </View>

        <View style={[styles.sectionCardDark, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitleDark, styles.sectionTitleCentered]}>
            {tApp(appLanguage, 'home_quick_focus')}
          </Text>
          <Text style={[styles.sectionTextDark, styles.sectionTextCentered]}>
            {appuntamentiDaIncassare > 0
              ? `Hai ${appuntamentiDaIncassare} appuntamenti ancora da incassare. La priorita operativa è chiudere € ${valoreDaIncassare.toFixed(2)}.`
              : 'Tutti gli appuntamenti risultano già incassati. Puoi concentrarti su nuove prenotazioni e clienti.'}
          </Text>
        </View>

        <View
          style={[
            styles.sectionCard,
            responsive.isDesktop && styles.desktopWideCard,
          ]}
        >
          <HapticTouchable
            style={styles.profileAccordionButton}
            onPress={() => {
              Haptics.selectionAsync().catch(() => null);
              setShowProfileSection((current) => {
                const nextValue = !current;
                setIsEditingSalonProfile(nextValue);
                return nextValue;
              });
            }}
            pressScale={0.985}
            pressOpacity={0.98}
          >
            <View style={styles.profileAccordionTextWrap}>
              <Text
                style={[
                  styles.sectionTitle,
                  styles.profileAccordionTitle,
                ]}
              >
                Profilo salone
              </Text>
              <Text
                style={[
                  styles.sectionSubtext,
                  styles.profileAccordionSubtext,
                ]}
              >
                Moduli piu compatti per compilare tutto senza perdersi in un form lungo.
              </Text>
            </View>
            <View style={styles.profileAccordionIconWrap}>
              <AnimatedChevron expanded={showProfileSection} size={30} color="#334155" />
            </View>
          </HapticTouchable>

          <View style={styles.profilePreviewCard}>
            <View style={styles.profilePreviewHeader}>
              <Text style={styles.profilePreviewEyebrow}>Preview salone</Text>
              <Text style={styles.profilePreviewProgress}>
                {profiloSaloneCompleto
                  ? `${completedProfileSections}/4 moduli completi`
                  : `${requiredFieldsFilled}/6 campi obbligatori`}
              </Text>
            </View>
            <Text
              style={[
                styles.profilePreviewName,
                salonNameDisplayStyleInput === 'minuscolo' && styles.profilePreviewNameLower,
                salonNameDisplayStyleInput === 'stampatello' && styles.profilePreviewNameUpper,
                {
                  fontFamily: salonNameFontOptions.find(
                    (item) => item.key === salonNameFontVariantInput
                  )?.family,
                },
              ]}
            >
              {salonPreviewName}
            </Text>
            <Text style={styles.profilePreviewMeta}>
              {activityCategoryInput.trim() || 'Categoria libera'}
            </Text>
            <View style={styles.profileProgressRow}>
              {profileSections.map((section) => (
                <View key={section.key} style={styles.profileProgressItem}>
                  <Reanimated.View
                    style={[
                      styles.profileProgressDot,
                      section.completed && styles.profileProgressDotCompleted,
                    ]}
                    entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                    layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                  />
                  <Text style={styles.profileProgressLabel}>{section.title}</Text>
                </View>
              ))}
            </View>
            <View style={styles.profilePreviewInfoRow}>
              <View style={styles.profilePreviewInfoPill}>
                <Ionicons name="call-outline" size={14} color="#475569" />
                <Text style={styles.profilePreviewInfoText}>
                  {businessPhoneInput.trim() || 'Telefono'}
                </Text>
              </View>
              <View style={styles.profilePreviewInfoPill}>
                <Ionicons name="location-outline" size={14} color="#475569" />
                <Text style={styles.profilePreviewInfoText} numberOfLines={1}>
                  {salonPreviewAddress || 'Indirizzo salone'}
                </Text>
              </View>
            </View>

          </View>

          {showProfileSection ? (
            <Reanimated.View
              style={styles.profileEditorCard}
              entering={FadeIn.duration(185).easing(Easing.out(Easing.cubic))}
              exiting={FadeOut.duration(130).easing(Easing.out(Easing.cubic))}
              layout={LinearTransition.duration(210).easing(Easing.out(Easing.cubic))}
            >
              <Text style={styles.profileEditorTitle}>Compila il profilo del salone</Text>
              <Text style={styles.profileEditorCaption}>
                Blocchi separati, campi piu compatti e salvataggio chiaro. Tutto qui, senza dispersione.
              </Text>

              <View style={styles.profileModuleStack}>
                <View style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleTitle}>Identita salone</Text>
                      <Text style={styles.profileModuleCaption}>Nome, categoria e insegna.</Text>
                    </View>
                    <Reanimated.View
                      style={styles.profileModuleBadge}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text style={styles.profileModuleBadgeText}>
                        {profileSections[0]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Nome salone</Text>
                    <ClearableTextInput
                      ref={salonNameFieldRef}
                      style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                      value={salonNameInput}
                      onChangeText={setSalonNameInput}
                      onFocus={() => scrollToField(salonNameFieldRef)}
                      placeholder={tApp(appLanguage, 'auth_salon_name_placeholder')}
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(activityCategoryFieldRef)}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Categoria attivita</Text>
                    <ClearableTextInput
                      ref={activityCategoryFieldRef}
                      style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                      value={activityCategoryInput}
                      onChangeText={(value) => setActivityCategoryInput(toUppercaseField(value))}
                      onFocus={() => scrollToField(activityCategoryFieldRef)}
                      placeholder="Categoria attivita"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      autoCapitalize="characters"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(businessPhoneFieldRef)}
                      blurOnSubmit={false}
                    />
                  </View>

                  <HapticTouchable
                    style={styles.fontDropdownButton}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => null);
                      setShowFontPicker((current) => !current);
                    }}
                    pressScale={0.985}
                    pressOpacity={0.98}
                  >
                    <View style={styles.fontDropdownTextWrap}>
                      <Text style={styles.profileSectionTitle}>Font insegna</Text>
                      <Text style={styles.profileSectionCaption}>
                        {salonNameFontOptions.find((item) => item.key === salonNameFontVariantInput)?.label}
                      </Text>
                    </View>
                    <View style={styles.profileAccordionIconWrap}>
                      <AnimatedChevron expanded={showFontPicker} size={20} color="#334155" />
                    </View>
                  </HapticTouchable>

                  {showFontPicker ? (
                    <Reanimated.View
                      style={styles.profileFontSelectorGrid}
                      entering={FadeIn.duration(170).easing(Easing.out(Easing.cubic))}
                      exiting={FadeOut.duration(120).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(190).easing(Easing.out(Easing.cubic))}
                    >
                      {salonNameFontOptions.map((option) => (
                        <HapticTouchable
                          key={option.key}
                          style={[
                            styles.profileFontChip,
                            salonNameFontVariantInput === option.key && styles.profileFontChipActive,
                          ]}
                          onPress={() => setSalonNameFontVariantInput(option.key)}
                          disabled={!canEditSalonProfile}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
                          <Text
                            style={[
                              styles.profileFontChipText,
                              { fontFamily: option.family },
                              salonNameFontVariantInput === option.key && styles.profileFontChipTextActive,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </HapticTouchable>
                      ))}
                    </Reanimated.View>
                  ) : null}
                </View>

                <View style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleTitle}>Contatti</Text>
                      <Text style={styles.profileModuleCaption}>Numero aziendale chiaro e pronto all&apos;uso.</Text>
                    </View>
                    <Reanimated.View
                      style={styles.profileModuleBadge}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text style={styles.profileModuleBadgeText}>
                        {profileSections[1]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Cellulare azienda</Text>
                    <ClearableTextInput
                      ref={businessPhoneFieldRef}
                      style={[
                        styles.accountInput,
                        profileFieldErrors.businessPhone && styles.accountInputError,
                        !canEditSalonProfile && styles.accountInputLocked,
                      ]}
                      value={businessPhoneInput}
                      onChangeText={(value) => {
                        setBusinessPhoneInput(limitPhoneToTenDigits(value));
                        if (profileFieldErrors.businessPhone) {
                          setProfileFieldErrors((current) => ({
                            ...current,
                            businessPhone: undefined,
                          }));
                        }
                      }}
                      onFocus={() => scrollToField(businessPhoneFieldRef)}
                      placeholder="Cellulare azienda"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      keyboardType="phone-pad"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(streetLineFieldRef)}
                      blurOnSubmit={false}
                    />
                    {profileFieldErrors.businessPhone ? (
                      <Text style={styles.fieldErrorText}>{profileFieldErrors.businessPhone}</Text>
                    ) : null}
                  </View>
                </View>

                <View style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleTitle}>Indirizzo</Text>
                      <Text style={styles.profileModuleCaption}>Via, citta e CAP in un blocco compatto.</Text>
                    </View>
                    <Reanimated.View
                      style={styles.profileModuleBadge}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text style={styles.profileModuleBadgeText}>
                        {profileSections[2]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Via, nome strada e civico</Text>
                    <ClearableTextInput
                      ref={streetLineFieldRef}
                      style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                      value={streetLineInput}
                      onChangeText={(value) => setStreetLineInput(toUppercaseField(value))}
                      onFocus={() => scrollToField(streetLineFieldRef)}
                      placeholder="Via Roma 1"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      autoCapitalize="characters"
                      returnKeyType="next"
                      onSubmitEditing={() => focusField(cityFieldRef)}
                      blurOnSubmit={false}
                    />
                  </View>

                  <View style={styles.formRow}>
                    <View style={styles.formColumn}>
                      <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_city')}</Text>
                      <ClearableTextInput
                        ref={cityFieldRef}
                        style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                        value={cityInput}
                        onChangeText={(value) => setCityInput(toUppercaseField(value))}
                        onFocus={() => scrollToField(cityFieldRef)}
                        placeholder={tApp(appLanguage, 'common_city')}
                        placeholderTextColor="#8f8f8f"
                        editable={canEditSalonProfile}
                        autoCapitalize="characters"
                        returnKeyType="next"
                        onSubmitEditing={() => focusField(postalCodeFieldRef)}
                        blurOnSubmit={false}
                      />
                    </View>

                    <View style={[styles.formColumn, styles.formColumnCompact]}>
                      <Text style={styles.fieldLabel}>{tApp(appLanguage, 'common_postal_code')}</Text>
                      <ClearableTextInput
                        ref={postalCodeFieldRef}
                        style={[styles.accountInput, !canEditSalonProfile && styles.accountInputLocked]}
                        value={postalCodeInput}
                        onChangeText={setPostalCodeInput}
                        onFocus={() => scrollToField(postalCodeFieldRef)}
                        placeholder={tApp(appLanguage, 'common_postal_code')}
                        keyboardType="number-pad"
                        placeholderTextColor="#8f8f8f"
                        editable={canEditSalonProfile}
                        returnKeyType="done"
                        onSubmitEditing={Keyboard.dismiss}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.profileModuleCard}>
                  <View style={styles.profileModuleHeader}>
                    <View style={styles.profileModuleTextWrap}>
                      <Text style={styles.profileModuleTitle}>Account e stato</Text>
                      <Text style={styles.profileModuleCaption}>Email di lavoro e workspace sempre allineati.</Text>
                    </View>
                    <Reanimated.View
                      style={styles.profileModuleBadge}
                      entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                    >
                      <Text style={styles.profileModuleBadgeText}>
                        {profileSections[3]?.completed ? 'Completo' : 'Da finire'}
                      </Text>
                    </Reanimated.View>
                  </View>

                  <View style={styles.compactFieldBlock}>
                    <Text style={styles.fieldLabel}>Email account</Text>
                    <ClearableTextInput
                      ref={accountEmailFieldRef}
                      style={[
                        styles.accountInput,
                        profileFieldErrors.accountEmail && styles.accountInputError,
                        !canEditSalonProfile && styles.accountInputLocked,
                      ]}
                      value={accountEmailInput}
                      onChangeText={(value) => {
                        setAccountEmailInput(value);
                        if (profileFieldErrors.accountEmail) {
                          setProfileFieldErrors((current) => ({
                            ...current,
                            accountEmail: undefined,
                          }));
                        }
                      }}
                      onFocus={() => scrollToField(accountEmailFieldRef)}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholder="email@salone.it"
                      placeholderTextColor="#8f8f8f"
                      editable={canEditSalonProfile}
                      returnKeyType="done"
                      onSubmitEditing={Keyboard.dismiss}
                    />
                    {profileFieldErrors.accountEmail ? (
                      <Text style={styles.fieldErrorText}>{profileFieldErrors.accountEmail}</Text>
                    ) : null}
                  </View>

                </View>
              </View>

              <HapticTouchable
                style={[styles.previewButton, styles.profileSaveButton, savingSalon && styles.buttonDisabled]}
                onPress={salvaDatiSalone}
                disabled={savingSalon}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text style={styles.profileSaveButtonEyebrow}>{completedProfileSections}/4 moduli pronti</Text>
                <Text style={styles.previewButtonText}>
                  {savingSalon ? 'Salvataggio...' : 'Salva modifiche'}
                </Text>
              </HapticTouchable>
            </Reanimated.View>
          ) : null}
        </View>

        {showAdminPanel ? (
          <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
            <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Admin account</Text>
            <Text style={[styles.sectionSubtext, styles.sectionSubtextCentered]}>
              Pannello nascosto: qui puoi cambiare il profilo dati del salone senza mostrarlo agli utenti.
            </Text>

            <TextInput
              ref={accountEmailFieldRef}
              style={[styles.accountInput, profileFieldErrors.accountEmail && styles.accountInputError]}
              value={accountEmailInput}
              onChangeText={(value) => {
                setAccountEmailInput(value);
                if (profileFieldErrors.accountEmail) {
                  setProfileFieldErrors((current) => ({
                    ...current,
                    accountEmail: undefined,
                  }));
                }
              }}
              onFocus={() => scrollToField(accountEmailFieldRef)}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="email@salone.it"
              placeholderTextColor="#8f8f8f"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            {profileFieldErrors.accountEmail ? (
              <Text style={styles.fieldErrorText}>{profileFieldErrors.accountEmail}</Text>
            ) : null}

            <TextInput
              style={[styles.accountInput, styles.accountInputLocked]}
              value={formatSalonAddress({
                streetType: '',
                streetName: streetLineInput,
                streetNumber: '',
                city: cityInput,
                postalCode: postalCodeInput,
                salonAddress: salonWorkspace.salonAddress,
              })}
              editable={false}
              placeholder="Indirizzo salone"
              placeholderTextColor="#8f8f8f"
            />

            <HapticTouchable
              style={styles.previewButton}
              onPress={salvaAccountSalone}
              pressScale={0.975}
              pressOpacity={0.98}
            >
              <Text style={styles.previewButtonText}>Salva account attivo</Text>
            </HapticTouchable>

            <HapticTouchable
              style={styles.previewButton}
              onPress={openFrontendPreviewForAdmin}
              pressScale={0.975}
              pressOpacity={0.98}
            >
              <Text style={styles.previewButtonText}>Anteprima frontend cliente (admin)</Text>
            </HapticTouchable>

            <Text style={styles.accountHint}>Attuale: {salonAccountEmail}</Text>
            <Text style={styles.accountHint}>Portale cliente: sincronizzazione automatica attiva</Text>
            <Text style={styles.accountHint}>Workspace: {salonWorkspace.id}</Text>
            <Text style={styles.accountHint}>
              Mail unica abbonamento: {salonWorkspace.ownerEmail}
            </Text>
            <Text style={styles.accountHint}>
              Salone: {salonNameInput || salonWorkspace.salonName}
            </Text>
            <Text style={styles.accountHint}>
              Categoria attività: {activityCategoryInput || 'Non impostata'}
            </Text>
            <Text style={styles.accountHint}>
              Cellulare azienda: {businessPhoneInput || 'Non impostato'}
            </Text>
            <Text style={styles.accountHint}>
              Indirizzo:{' '}
              {formatSalonAddress({
                streetType: '',
                streetName: streetLineInput,
                streetNumber: '',
                city: cityInput,
                postalCode: postalCodeInput,
                salonAddress: '',
              }) || 'Non impostato'}
            </Text>
            <Text style={styles.accountHint}>
              Piano/Stato: {salonWorkspace.subscriptionPlan} ·{' '}
              {salonWorkspace.subscriptionStatus}
            </Text>

            <View style={styles.adminStatusRow}>
              <HapticTouchable
                style={styles.adminStatusChip}
                onPress={() => aggiornaStatoWorkspace('active', 'starter')}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.adminStatusChipText}>Attivo</Text>
              </HapticTouchable>

              <HapticTouchable
                style={styles.adminStatusChipDanger}
                onPress={() => aggiornaStatoWorkspace('suspended')}
                pressScale={0.98}
                pressOpacity={0.98}
              >
                <Text style={styles.adminStatusChipDangerText}>Sospeso</Text>
              </HapticTouchable>
            </View>
          </View>
        ) : null}

        <View style={[styles.sectionCard, responsive.isDesktop && styles.desktopWideCard]}>
          <Text style={[styles.sectionTitle, styles.sectionTitleCentered]}>Accesso cliente</Text>
          <Text style={[styles.sectionSubtext, styles.sectionSubtextCentered]}>
            Questo codice collega il frontend cliente direttamente a questo salone. Condividi il link
            oppure fai scansionare il QR al cliente.
          </Text>

          {publicClientLinkHealth !== 'ready' ? (
            <View style={styles.accessWarningCard}>
              <Text style={styles.accessWarningTitle}>
                {publicClientLinkHealth === 'missing-salon-code'
                  ? 'Codice salone non ancora pronto'
                  : 'Accesso cliente non pronto'}
              </Text>
              <Text style={styles.accessWarningText}>
                {clientAccessStatusCopy}
              </Text>
            </View>
          ) : null}

          <View style={styles.accessCard}>
            <View style={styles.accessCardGlow} />
            <Text style={styles.accessLabel}>Link web cliente</Text>
            <Text style={styles.accessCode}>{clientAccessDisplayName}</Text>
            <View style={styles.accessLinkPlate}>
              <Text style={styles.accessLink} numberOfLines={2}>
                {salonClientLink || 'Configura publicClientBaseUrl per generare il link pubblico.'}
              </Text>
            </View>
            <Reanimated.View
              style={[
                styles.accessHealthBadge,
                publicClientLinkHealth === 'ready'
                  ? styles.accessHealthBadgeReady
                  : styles.accessHealthBadgeWarning,
              ]}
              entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
              layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
            >
              <Text
                style={[
                  styles.accessHealthText,
                  publicClientLinkHealth === 'ready'
                    ? styles.accessHealthTextReady
                    : styles.accessHealthTextWarning,
                ]}
              >
                {clientAccessStatusCopy}
              </Text>
            </Reanimated.View>
          </View>

          <View style={[styles.qrCard, responsive.isTablet && styles.qrCardResponsive]}>
            <View style={styles.qrCardGlow} />
            <View style={styles.qrFrame}>
              <View style={styles.qrPlate}>
                <QRCode
                  value={clientQrValue}
                  size={170}
                  color="#111111"
                  backgroundColor="#ffffff"
                />
              </View>
            </View>
            <View style={styles.qrSalonBadge}>
              <Text
                style={styles.qrSalonBadgeText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
                ellipsizeMode="tail"
              >
                {salonWorkspace.salonCode || salonNameInput.trim() || salonWorkspace.salonName || 'Salon Pro'}
              </Text>
            </View>
            <Text
              style={styles.qrTitle}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.76}
              ellipsizeMode="clip"
            >
              QR cliente del salone
            </Text>
            <Text
              style={styles.qrText}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              ellipsizeMode="clip"
            >
              {publicClientLinkHealth === 'ready'
                ? "Questo QR apre direttamente l'area cliente del tuo salone nell'app."
                : "Il QR resta bloccato finché il salone non ha un codice valido da aprire nell'app."}
            </Text>
          </View>

          <HapticTouchable
            style={[styles.resetButton, !canShareClientAccess && styles.buttonDisabled]}
            onPress={condividiAccessoCliente}
            disabled={!canShareClientAccess}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Text style={styles.resetButtonText}>Condividi link cliente</Text>
          </HapticTouchable>

          <HapticTouchable
            style={[styles.secondaryActionButton, !canShareClientAccess && styles.buttonDisabled]}
            onPress={openQrPrintPreview}
            disabled={!canShareClientAccess}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Text style={styles.secondaryActionButtonText}>Stampa QR code salone</Text>
          </HapticTouchable>
        </View>

        </View>
      </ScrollView>

      <Modal
        visible={showOperatorAgendaModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowOperatorAgendaModal(false);
          setSelectedOperatorBoardId(null);
        }}
      >
        <View style={styles.operatorModalBackdrop}>
          <View style={styles.operatorModalCard}>
            <View style={styles.operatorModalHeader}>
              <View style={styles.operatorModalHeaderTextWrap}>
                <Text style={styles.operatorModalEyebrow}>Live operatori</Text>
                <Text style={styles.operatorModalTitle}>
                  {selectedOperatorBoard
                    ? `Appuntamenti di ${selectedOperatorBoard.operator.nome}`
                    : 'Appuntamenti per operatore'}
                </Text>
                <Text style={styles.operatorModalText}>
                  {selectedOperatorBoard
                    ? 'Vista dedicata del singolo operatore, con appuntamenti, richieste in attesa e lavoro da chiudere.'
                    : 'Situazione aggiornata in tempo reale: appuntamenti, richieste in attesa e lavoro ancora da chiudere.'}
                </Text>
              </View>

              <HapticTouchable
                style={styles.operatorModalCloseButton}
                onPress={() => {
                  setShowOperatorAgendaModal(false);
                  setSelectedOperatorBoardId(null);
                }}
                pressScale={0.97}
                pressOpacity={0.96}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </HapticTouchable>
            </View>

            <View style={styles.operatorModalToolbar}>
              <HapticTouchable
                style={styles.operatorModalToolbarButton}
                onPress={exportOperatorAgendaPdf}
                pressScale={0.98}
                pressOpacity={0.96}
              >
                <Ionicons name="document-text-outline" size={16} color="#0F172A" />
                <Text style={styles.operatorModalToolbarButtonText}>PDF</Text>
              </HapticTouchable>
              <HapticTouchable
                style={styles.operatorModalToolbarButton}
                onPress={printOperatorAgenda}
                pressScale={0.98}
                pressOpacity={0.96}
              >
                <Ionicons name="print-outline" size={16} color="#0F172A" />
                <Text style={styles.operatorModalToolbarButtonText}>Stampa</Text>
              </HapticTouchable>
            </View>

            <ScrollView
              style={styles.operatorModalScroll}
              contentContainerStyle={styles.operatorModalScrollContent}
              showsVerticalScrollIndicator
              indicatorStyle="black"
            >
              {visibleOperatorBoards.length === 0 ? (
                <View style={styles.operatorModalEmptyCard}>
                  <Text style={styles.operatorModalEmptyTitle}>Nessun operatore disponibile</Text>
                  <Text style={styles.operatorModalEmptyText}>
                    Appena aggiungi gli operatori in servizi, qui comparira il loro punto operativo live.
                  </Text>
                </View>
              ) : (
                visibleOperatorBoards.map((item) => (
                  <View key={item.operator.id} style={styles.operatorModalBoard}>
                    <View style={styles.operatorModalBoardHeader}>
                      <View style={styles.operatorModalBoardIdentity}>
                        <View style={styles.operatorModalBoardAvatar}>
                          {item.operator.fotoUri ? (
                            <Image source={{ uri: item.operator.fotoUri }} style={styles.operatorModalBoardAvatarImage} />
                          ) : (
                            <Ionicons name="person" size={18} color="#1E293B" />
                          )}
                        </View>
                        <View style={styles.operatorModalBoardTextWrap}>
                          <Text style={styles.operatorModalBoardName}>{item.operator.nome}</Text>
                          <Text style={styles.operatorModalBoardRole}>{item.operator.mestiere}</Text>
                        </View>
                      </View>

                      <View style={styles.operatorModalBoardCounters}>
                        <View style={styles.operatorModalCounterPill}>
                          <Text style={styles.operatorModalCounterValue}>{item.openTasks}</Text>
                          <Text style={styles.operatorModalCounterLabel}>da fare</Text>
                        </View>
                        <View style={styles.operatorModalCounterPillSoft}>
                          <Text style={styles.operatorModalCounterValueSoft}>{item.totalAssigned}</Text>
                          <Text style={styles.operatorModalCounterLabelSoft}>totali</Text>
                        </View>
                      </View>
                    </View>

                    {item.timeline.length === 0 ? (
                      <View style={styles.operatorModalBoardEmpty}>
                        <Text style={styles.operatorModalBoardEmptyTitle}>Agenda libera oggi</Text>
                        <Text style={styles.operatorModalBoardEmptyText}>
                          Nessun appuntamento o richiesta assegnata in questa giornata.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.operatorModalTimeline}>
                        {item.timeline.map((entry) => (
                          <View key={entry.id} style={styles.operatorModalTimelineRow}>
                            <View style={styles.operatorModalTimeBadge}>
                              <Text style={styles.operatorModalTimeBadgeText}>{entry.ora}</Text>
                            </View>

                            <View style={styles.operatorModalTimelineContent}>
                              <View style={styles.operatorModalTimelineTopRow}>
                                <Text style={styles.operatorModalTimelineTitle}>{entry.title}</Text>
                                <View
                                  style={[
                                    styles.operatorModalStatusPill,
                                    entry.tone === 'request' && styles.operatorModalStatusPillRequest,
                                    entry.tone === 'done' && styles.operatorModalStatusPillDone,
                                    entry.tone === 'cash' && styles.operatorModalStatusPillCash,
                                    entry.tone === 'muted' && styles.operatorModalStatusPillMuted,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.operatorModalStatusPillText,
                                      entry.tone === 'request' && styles.operatorModalStatusPillTextRequest,
                                      entry.tone === 'done' && styles.operatorModalStatusPillTextDone,
                                      entry.tone === 'cash' && styles.operatorModalStatusPillTextCash,
                                      entry.tone === 'muted' && styles.operatorModalStatusPillTextMuted,
                                    ]}
                                  >
                                    {entry.badge}
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.operatorModalTimelineSubtitle}>{entry.subtitle}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showCustomerInsightsModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowCustomerInsightsModal(false);
          setCustomerInsightSearchQuery('');
        }}
      >
        <View style={styles.operatorModalBackdrop}>
          <View style={styles.customerInsightModalCard}>
            <View style={styles.operatorModalHeader}>
              <View style={styles.operatorModalHeaderTextWrap}>
                <Text style={styles.operatorModalEyebrow}>Focus clienti</Text>
                <Text style={styles.operatorModalTitle}>Dettagli appuntamenti clienti</Text>
                <Text style={styles.operatorModalText}>
                  Cerca il cliente e consulta storico, agenda attiva, spesa totale e servizi più richiesti.
                </Text>
              </View>

              <HapticTouchable
                style={styles.operatorModalCloseButton}
                onPress={() => {
                  setShowCustomerInsightsModal(false);
                  setCustomerInsightSearchQuery('');
                  setCustomerAppointmentFilter('all');
                }}
                pressScale={0.97}
                pressOpacity={0.96}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </HapticTouchable>
            </View>

            <ClearableTextInput
              style={styles.customerInsightSearchInput}
              placeholder="Cerca cliente, telefono, email o servizio"
              placeholderTextColor="#8A94A6"
              value={customerInsightSearchQuery}
              onChangeText={setCustomerInsightSearchQuery}
              autoCapitalize="words"
              returnKeyType="search"
            />

            <ScrollView
              horizontal
              style={styles.customerInsightPickerScroll}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.customerInsightPickerRow}
            >
              {filteredCustomerInsightBoards.map((item) => {
                const selected = item.customer.id === selectedCustomerInsightBoard?.customer.id;

                return (
                  <HapticTouchable
                    key={item.customer.id}
                    style={[
                      styles.customerInsightPickerChip,
                      selected && styles.customerInsightPickerChipActive,
                    ]}
                    onPress={() => setSelectedCustomerInsightId(item.customer.id)}
                    pressScale={0.98}
                    pressOpacity={0.98}
                  >
                    <Text
                      style={[
                        styles.customerInsightPickerChipTitle,
                        selected && styles.customerInsightPickerChipTitleActive,
                      ]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.78}
                      allowFontScaling={false}
                    >
                      {item.customer.nome}
                    </Text>
                    <Text
                      style={[
                        styles.customerInsightPickerChipMeta,
                        selected && styles.customerInsightPickerChipMetaActive,
                      ]}
                      numberOfLines={1}
                      allowFontScaling={false}
                    >
                      {item.totalAppointments} appunt.
                    </Text>
                  </HapticTouchable>
                );
              })}
            </ScrollView>

            <ScrollView
              style={styles.operatorModalScroll}
              contentContainerStyle={styles.operatorModalScrollContent}
              showsVerticalScrollIndicator
              indicatorStyle="black"
            >
              {!selectedCustomerInsightBoard ? (
                <View style={styles.operatorModalEmptyCard}>
                  <Text style={styles.operatorModalEmptyTitle}>Nessun cliente trovato</Text>
                  <Text style={styles.operatorModalEmptyText}>
                    Prova con nome, telefono, email o uno dei servizi già fatti.
                  </Text>
                </View>
              ) : (
                <View style={styles.customerInsightBoard}>
                  <View style={styles.customerInsightBoardHeader}>
                    <View style={styles.customerInsightBoardIdentity}>
                      <Text style={styles.customerInsightBoardName}>
                        {selectedCustomerInsightBoard.customer.nome}
                      </Text>
                      <Text style={styles.customerInsightBoardContacts}>
                        {[
                          selectedCustomerInsightBoard.customer.telefono,
                          selectedCustomerInsightBoard.customer.email ?? '',
                          selectedCustomerInsightBoard.customer.instagram
                            ? `@${selectedCustomerInsightBoard.customer.instagram}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Contatti non disponibili'}
                      </Text>
                    </View>
                    <View style={styles.customerInsightSpendBadge}>
                      <Text style={styles.customerInsightSpendBadgeValue}>
                        € {selectedCustomerInsightBoard.totalSpent.toFixed(2)}
                      </Text>
                      <Text style={styles.customerInsightSpendBadgeLabel}>spesa servizi</Text>
                    </View>
                  </View>

                  <View style={styles.customerInsightStatsGrid}>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.pastAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Passati</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.todayAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Oggi</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.futureAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Futuri</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        € {selectedCustomerInsightBoard.averageTicket.toFixed(0)}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Ticket medio</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        {selectedCustomerInsightBoard.completedAppointments}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Completati</Text>
                    </View>
                    <View style={styles.customerInsightStatCard}>
                      <Text style={styles.customerInsightStatValue}>
                        € {selectedCustomerInsightBoard.collectedSpent.toFixed(0)}
                      </Text>
                      <Text style={styles.customerInsightStatLabel}>Incassato</Text>
                    </View>
                  </View>

                  <View style={styles.customerInsightHighlightsRow}>
                    <View style={styles.customerInsightHighlightCard}>
                      <Text style={styles.customerInsightHighlightLabel}>Prossimo</Text>
                      <Text style={styles.customerInsightHighlightValue}>
                        {selectedCustomerInsightBoard.nextAppointment
                          ? `${formatDateLabel(
                              selectedCustomerInsightBoard.nextAppointment.data ?? oggi
                            )} · ${selectedCustomerInsightBoard.nextAppointment.ora}`
                          : 'Nessun futuro'}
                      </Text>
                      <Text style={styles.customerInsightHighlightSubvalue}>
                        {selectedCustomerInsightBoard.nextAppointment?.servizio ?? '—'}
                      </Text>
                    </View>

                    <View style={styles.customerInsightHighlightCard}>
                      <Text style={styles.customerInsightHighlightLabel}>Ultimo</Text>
                      <Text style={styles.customerInsightHighlightValue}>
                        {selectedCustomerInsightBoard.latestAppointment
                          ? `${formatDateLabel(
                              selectedCustomerInsightBoard.latestAppointment.data ?? oggi
                            )} · ${selectedCustomerInsightBoard.latestAppointment.ora}`
                          : 'Nessuno storico'}
                      </Text>
                      <Text style={styles.customerInsightHighlightSubvalue}>
                        {selectedCustomerInsightBoard.latestAppointment?.servizio ?? '—'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.customerInsightServicesCard}>
                    <Text style={styles.customerInsightSectionTitle}>Servizi fruiti</Text>
                    {selectedCustomerInsightBoard.serviceStats.length === 0 ? (
                      <Text style={styles.customerInsightSectionEmpty}>
                        Nessun servizio completato registrato.
                      </Text>
                    ) : (
                      <View style={styles.customerInsightServiceList}>
                        {selectedCustomerInsightBoard.serviceStats.slice(0, 6).map((item) => (
                          <View key={`${selectedCustomerInsightBoard.customer.id}-${item.serviceName}`} style={styles.customerInsightServiceRow}>
                            <Text style={styles.customerInsightServiceName}>{item.serviceName}</Text>
                            <Text style={styles.customerInsightServiceMeta}>
                              {item.count}x · € {item.total.toFixed(2)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>

                  <View style={styles.customerInsightTimelineCard}>
                    <Text style={styles.customerInsightSectionTitle}>Lista appuntamenti</Text>
                    <View style={styles.customerInsightFilterRow}>
                      {customerAppointmentFilterOptions.map((option) => {
                        const active = customerAppointmentFilter === option.key;

                        return (
                          <HapticTouchable
                            key={`${selectedCustomerInsightBoard.customer.id}-${option.key}`}
                            style={[
                              styles.customerInsightFilterChip,
                              active && styles.customerInsightFilterChipActive,
                            ]}
                            onPress={() => setCustomerAppointmentFilter(option.key)}
                            pressScale={0.98}
                            pressOpacity={0.98}
                          >
                            <Text
                              style={[
                                styles.customerInsightFilterChipText,
                                active && styles.customerInsightFilterChipTextActive,
                              ]}
                            >
                              {option.label}
                            </Text>
                            <Text
                              style={[
                                styles.customerInsightFilterChipCount,
                                active && styles.customerInsightFilterChipCountActive,
                              ]}
                            >
                              {option.count}
                            </Text>
                          </HapticTouchable>
                        );
                      })}
                    </View>

                    {visibleCustomerTimeline.length === 0 ? (
                      <Text style={styles.customerInsightSectionEmpty}>
                        Nessun appuntamento in questo filtro.
                      </Text>
                    ) : (
                    <View style={styles.customerInsightTimeline}>
                      {visibleCustomerTimeline.map((entry) => (
                        <View key={`${selectedCustomerInsightBoard.customer.id}-${entry.id}`} style={styles.customerInsightTimelineRow}>
                          <View style={styles.customerInsightDateBadge}>
                            <Text style={styles.customerInsightDateBadgeDay}>{entry.dateLabel}</Text>
                            <Text style={styles.customerInsightDateBadgeTime}>{entry.ora}</Text>
                          </View>

                          <View style={styles.customerInsightTimelineContent}>
                            <View style={styles.customerInsightTimelineTopRow}>
                              <Text style={styles.customerInsightTimelineTitle}>{entry.title}</Text>
                              <View
                                style={[
                                  styles.customerInsightPhasePill,
                                  entry.tone === 'future' && styles.customerInsightPhasePillFuture,
                                  entry.tone === 'today' && styles.customerInsightPhasePillToday,
                                  entry.tone === 'past' && styles.customerInsightPhasePillPast,
                                  entry.tone === 'muted' && styles.customerInsightPhasePillMuted,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.customerInsightPhasePillText,
                                    entry.tone === 'future' && styles.customerInsightPhasePillTextFuture,
                                    entry.tone === 'today' && styles.customerInsightPhasePillTextToday,
                                    entry.tone === 'past' && styles.customerInsightPhasePillTextPast,
                                    entry.tone === 'muted' && styles.customerInsightPhasePillTextMuted,
                                  ]}
                                >
                                  {entry.phase}
                                </Text>
                              </View>
                            </View>
                            <Text style={styles.customerInsightTimelineSubtitle}>{entry.subtitle}</Text>
                            <Text style={styles.customerInsightTimelineStatus}>{entry.badge}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <OnboardingModal
        visible={showOnboarding}
        onClose={completeOnboarding}
        onComplete={completeOnboarding}
      />

      <KeyboardNextToolbar onNext={handleKeyboardNext} label="Next" />

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    flexGrow: 1,
    paddingTop: 54,
    paddingBottom: 140,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#475569',
    fontWeight: '700',
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 0,
    paddingBottom: 20,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  settingsButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    marginTop: 14,
  },
  settingsIconImage: {
    width: 28,
    height: 28,
  },
  settingsIcon: {
    textShadowColor: 'transparent',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 0,
  },
  heroTopRow: {
    flexDirection: 'row',
    marginTop: 10,
    marginBottom: 10,
    gap: 10,
  },
  heroMetaCard: {
    flex: 1,
    backgroundColor: '#F6F3EE',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E6DDD0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#8A7963',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  heroMetaCardToday: {
    backgroundColor: '#FFF1BF',
    borderColor: '#E6C86A',
  },
  heroStatusCard: {
    backgroundColor: '#E4F0FF',
    borderColor: '#BBD5FF',
  },
  heroDateLabelToday: {
    color: '#8A6B12',
  },
  heroDateValueToday: {
    color: '#463616',
  },
  heroDateLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  heroDateValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  statusPillText: {
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusHot: {
    backgroundColor: '#FEF2F2',
    borderColor: 'transparent',
    borderTopColor: 'transparent',
  },
  statusWarm: {
    backgroundColor: '#ECFDF5',
    borderColor: 'transparent',
    borderTopColor: 'transparent',
  },
  statusCalm: {
    backgroundColor: '#DDEBFF',
    borderColor: '#BBD5FF',
    borderTopColor: '#BBD5FF',
  },
  statusHotText: {
    color: '#b42318',
  },
  statusWarmText: {
    color: '#166534',
  },
  statusCalmText: {
    color: '#1E5FCF',
  },
  heroMetricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  heroMetricCardBlue: {
    flex: 1,
    backgroundColor: '#F9E1F2',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: IS_ANDROID ? 20 : 10,
    borderWidth: 1,
    borderColor: '#EDB9DD',
    alignItems: 'center',
    shadowColor: '#B45095',
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroMetricCardRose: {
    flex: 1,
    backgroundColor: '#F4E4D7',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: IS_ANDROID ? 20 : 10,
    borderWidth: 1,
    borderColor: '#DFC2AA',
    alignItems: 'center',
    shadowColor: '#9D7655',
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  heroMetricNumber: {
    fontSize: IS_ANDROID ? 26 : 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  heroMetricNumberBlue: {
    color: '#B01F7C',
  },
  heroMetricNumberRose: {
    color: '#5E3B20',
  },
  heroMetricLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  heroMetricLabelBlue: {
    color: '#B05C93',
  },
  heroMetricLabelRose: {
    color: '#6F4A2C',
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 2,
  },
  insightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  insightCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#EEE7FF',
    borderRadius: 20,
    paddingHorizontal: IS_ANDROID ? 24 : 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#D7C8F5',
    alignItems: 'center',
    shadowColor: '#9C8BCF',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  insightCardMint: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#EDF5DB',
    borderRadius: 20,
    paddingHorizontal: IS_ANDROID ? 24 : 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#D6E2B2',
    alignItems: 'center',
    shadowColor: '#738247',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  halfWidthCard: {
    minWidth: '48%',
  },
  desktopThirdCard: {
    minWidth: '48%',
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  insightTitlePlum: {
    color: '#6F58A8',
  },
  insightTitleMint: {
    color: '#667B31',
  },
  insightNumber: {
    fontSize: IS_ANDROID ? 30 : 28,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  insightNumberPlum: {
    color: '#5B3FA2',
  },
  insightNumberMint: {
    color: '#304415',
  },
  insightHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  insightHintPlum: {
    color: '#7B68AA',
  },
  insightHintMint: {
    color: '#6D7F38',
  },
  priorityCard: {
    backgroundColor: '#243245',
    borderRadius: 26,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingVertical: 20,
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#324763',
    shadowColor: '#1B2635',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  desktopPriorityCard: {
    alignSelf: 'stretch',
  },
  priorityEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: '#CBD5E1',
    letterSpacing: IS_ANDROID ? 1.6 : 2.8,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  priorityTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E2E8F0',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  sectionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  infoCardSun: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#EEF4D3',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 24 : 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#D5E0A8',
    alignItems: 'center',
    shadowColor: '#6C8042',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  infoCardLavender: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#FFE7D6',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 24 : 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#F0C4A0',
    alignItems: 'center',
    shadowColor: '#C07A3C',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  infoCardPeach: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: '#FBE1E1',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 24 : 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#F0BDBD',
    alignItems: 'center',
    shadowColor: '#B85F5F',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  infoCardResponsive: {
    minWidth: '31%',
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  infoLabelSun: {
    color: '#66792E',
  },
  infoLabelLavender: {
    color: '#C26A22',
  },
  infoLabelPeach: {
    color: '#B94A4A',
  },
  infoValue: {
    fontSize: IS_ANDROID ? 26 : 24,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  infoValueSun: {
    color: '#334615',
  },
  infoValueLavender: {
    color: '#A84D14',
  },
  infoValuePeach: {
    color: '#A53232',
  },
  operatorAgendaCard: {
    marginTop: 0,
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  customerInsightsCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    shadowColor: '#0F172A',
    shadowOpacity: 0.11,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  operatorAgendaCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 14,
    marginBottom: 14,
  },
  operatorAgendaCardTextWrap: {
    flex: 1,
  },
  operatorAgendaCardTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 5,
    letterSpacing: -0.3,
  },
  operatorAgendaCardText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#4E5A68',
    fontWeight: '700',
  },
  operatorAgendaCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D8D7D1',
    shadowColor: '#A8A096',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  operatorAgendaCardActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorAgendaStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  operatorAgendaStatPill: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#DDDAD2',
    alignItems: 'center',
    shadowColor: '#C2B9AD',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  operatorAgendaStatPillSky: {
    backgroundColor: '#ECFEFF',
    borderColor: '#A5F3FC',
  },
  operatorAgendaStatPillMint: {
    backgroundColor: '#ECFDF5',
    borderColor: '#BBF7D0',
  },
  operatorAgendaStatPillLavender: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  operatorAgendaStatPillPlum: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  operatorAgendaStatPillSun: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FDE68A',
  },
  operatorAgendaStatPillRose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  operatorAgendaStatValue: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  operatorAgendaStatLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#5E6876',
    textAlign: 'center',
  },
  operatorAgendaPreviewStack: {
    gap: 10,
  },
  operatorAgendaPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DFD8CE',
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 12,
    shadowColor: '#C6BCB0',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  operatorAgendaPreviewIdentity: {
    flex: 1,
  },
  operatorAgendaPreviewAvatar: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#FBF8F2',
    borderWidth: 1,
    borderColor: '#E7DFD2',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  operatorAgendaPreviewAvatarImage: {
    width: '100%',
    height: '100%',
  },
  operatorAgendaPreviewTextWrap: {
    flex: 1,
  },
  operatorAgendaPreviewName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  operatorAgendaPreviewRole: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6C6F78',
  },
  operatorAgendaPreviewMetrics: {
    alignItems: 'flex-end',
    marginRight: 2,
  },
  customerInsightPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E1D7C8',
    paddingLeft: 14,
    paddingRight: 12,
    paddingVertical: 12,
    shadowColor: '#CBBEAA',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  qrJumpButton: {
    marginTop: 6,
    marginBottom: 14,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  qrJumpButtonText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  customerInsightPreviewMain: {
    flex: 1,
  },
  customerInsightPreviewMeta: {
    fontSize: 11,
    fontWeight: '800',
    color: '#696960',
    marginTop: 3,
  },
  customerInsightPreviewMetrics: {
    alignItems: 'flex-end',
  },
  customerInsightPreviewMetric: {
    fontSize: 13,
    fontWeight: '900',
    color: '#6D5338',
    marginBottom: 2,
  },
  customerInsightPreviewMetricSoft: {
    fontSize: 11,
    fontWeight: '800',
    color: '#756858',
  },
  operatorAgendaPreviewMetric: {
    fontSize: 13,
    fontWeight: '900',
    color: '#33577d',
    marginBottom: 2,
  },
  operatorAgendaPreviewMetricSoft: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  operatorAgendaEmptyState: {
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderWidth: 1,
    borderColor: '#DFD8CE',
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#C4B8AA',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  operatorAgendaEmptyTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  operatorAgendaEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#475569',
    textAlign: 'center',
    fontWeight: '700',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 16,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  sectionCardMandatory: {
    backgroundColor: '#FFFBEB',
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  sectionCardDark: {
    backgroundColor: '#1f2937',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2b3647',
  },
  desktopWideCard: {
    alignSelf: 'stretch',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 8,
  },
  sectionTitleCentered: {
    textAlign: 'center',
  },
  sectionTitleDark: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 6,
  },
  sectionSubtext: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    marginBottom: 14,
  },
  sectionSubtextCentered: {
    textAlign: 'center',
  },
  sectionTextDark: {
    fontSize: 14,
    lineHeight: 20,
    color: '#e2e8f0',
  },
  sectionTextCentered: {
    textAlign: 'center',
  },
  smartItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
  },
  smartItemLast: {
    paddingTop: 10,
  },
  smartItemCentered: {
    alignItems: 'center',
  },
  smartLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 4,
    paddingHorizontal: IS_ANDROID ? 8 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  smartValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111111',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  smartTextCentered: {
    textAlign: 'center',
  },
  operatorModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.44)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  operatorModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '88%',
    minHeight: 420,
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  customerInsightModalCard: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '90%',
    minHeight: 520,
    backgroundColor: '#F8FAFC',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 16 },
    elevation: 14,
  },
  customerInsightSearchInput: {
    minHeight: 50,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 12,
  },
  customerInsightPickerScroll: {
    flexGrow: 0,
    minHeight: 82,
    marginBottom: 4,
  },
  customerInsightPickerRow: {
    gap: 10,
    alignItems: 'stretch',
    paddingBottom: 12,
    paddingRight: 8,
  },
  customerInsightPickerChip: {
    minWidth: 138,
    minHeight: 70,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  customerInsightPickerChipActive: {
    backgroundColor: '#EAF4EA',
    borderColor: '#BFD2C0',
  },
  customerInsightPickerChipTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  customerInsightPickerChipTitleActive: {
    color: '#163624',
  },
  customerInsightPickerChipMeta: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  customerInsightPickerChipMetaActive: {
    color: '#335b41',
  },
  customerInsightBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  customerInsightBoardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  customerInsightBoardIdentity: {
    flex: 1,
  },
  customerInsightBoardName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  customerInsightBoardContacts: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  customerInsightSpendBadge: {
    minWidth: 108,
    backgroundColor: '#ECFDF3',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#CDEAD7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  customerInsightSpendBadgeValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#166534',
    marginBottom: 2,
  },
  customerInsightSpendBadgeLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#3F6B4B',
    textAlign: 'center',
  },
  customerInsightStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  customerInsightStatCard: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  customerInsightStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  customerInsightStatLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  customerInsightHighlightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  customerInsightHighlightCard: {
    flex: 1,
    minWidth: '47%',
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  customerInsightHighlightLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#64748B',
    marginBottom: 5,
  },
  customerInsightHighlightValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 3,
  },
  customerInsightHighlightSubvalue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  customerInsightServicesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  customerInsightSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  customerInsightSectionEmpty: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  customerInsightServiceList: {
    gap: 8,
  },
  customerInsightServiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5EBF2',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerInsightServiceName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  customerInsightServiceMeta: {
    fontSize: 11,
    fontWeight: '900',
    color: '#33577D',
  },
  customerInsightTimelineCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  customerInsightFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  customerInsightFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  customerInsightFilterChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  customerInsightFilterChipText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#334155',
  },
  customerInsightFilterChipTextActive: {
    color: '#FFFFFF',
  },
  customerInsightFilterChipCount: {
    minWidth: 20,
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
    backgroundColor: '#EEF2F7',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  customerInsightFilterChipCountActive: {
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
  },
  customerInsightTimeline: {
    gap: 10,
  },
  customerInsightTimelineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  customerInsightDateBadge: {
    width: 78,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerInsightDateBadgeDay: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
    textAlign: 'center',
  },
  customerInsightDateBadgeTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  customerInsightTimelineContent: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  customerInsightTimelineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  customerInsightTimelineTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  customerInsightTimelineSubtitle: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 4,
  },
  customerInsightTimelineStatus: {
    fontSize: 11,
    fontWeight: '800',
    color: '#33577D',
  },
  customerInsightPhasePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  customerInsightPhasePillFuture: {
    backgroundColor: '#E0F2FE',
  },
  customerInsightPhasePillToday: {
    backgroundColor: '#FEF3C7',
  },
  customerInsightPhasePillPast: {
    backgroundColor: '#ECFDF3',
  },
  customerInsightPhasePillMuted: {
    backgroundColor: '#F1F5F9',
  },
  customerInsightPhasePillText: {
    fontSize: 10,
    fontWeight: '900',
  },
  customerInsightPhasePillTextFuture: {
    color: '#0C4A6E',
  },
  customerInsightPhasePillTextToday: {
    color: '#92400E',
  },
  customerInsightPhasePillTextPast: {
    color: '#166534',
  },
  customerInsightPhasePillTextMuted: {
    color: '#64748B',
  },
  operatorModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  operatorModalToolbar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  operatorModalToolbarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DDE6F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  operatorModalToolbarButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalHeaderTextWrap: {
    flex: 1,
  },
  operatorModalEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#64748B',
    marginBottom: 6,
  },
  operatorModalTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  operatorModalText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748B',
    fontWeight: '700',
  },
  operatorModalCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorModalScroll: {
    flexGrow: 0,
    maxHeight: '100%',
  },
  operatorModalScrollContent: {
    gap: 12,
    paddingBottom: 18,
  },
  operatorModalEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: 'center',
  },
  operatorModalEmptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  operatorModalEmptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '700',
  },
  operatorModalBoard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  operatorModalBoardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 14,
  },
  operatorModalBoardIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  operatorModalBoardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#EAF2FB',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  operatorModalBoardAvatarImage: {
    width: '100%',
    height: '100%',
  },
  operatorModalBoardTextWrap: {
    flex: 1,
  },
  operatorModalBoardName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 2,
  },
  operatorModalBoardRole: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },
  operatorModalBoardCounters: {
    flexDirection: 'row',
    gap: 8,
  },
  operatorModalCounterPill: {
    minWidth: 64,
    backgroundColor: '#EAFBF1',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  operatorModalCounterPillSoft: {
    minWidth: 64,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  operatorModalCounterValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#166534',
  },
  operatorModalCounterLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#3F7A52',
    textTransform: 'uppercase',
  },
  operatorModalCounterValueSoft: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalCounterLabelSoft: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  operatorModalBoardEmpty: {
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  operatorModalBoardEmptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 5,
  },
  operatorModalBoardEmptyText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '700',
  },
  operatorModalTimeline: {
    gap: 10,
  },
  operatorModalTimelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  operatorModalTimeBadge: {
    width: 62,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    alignItems: 'center',
  },
  operatorModalTimeBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalTimelineContent: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  operatorModalTimelineTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 5,
  },
  operatorModalTimelineTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  operatorModalTimelineSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
  },
  operatorModalStatusPill: {
    borderRadius: 999,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  operatorModalStatusPillRequest: {
    backgroundColor: '#FEF3C7',
  },
  operatorModalStatusPillDone: {
    backgroundColor: '#DCFCE7',
  },
  operatorModalStatusPillCash: {
    backgroundColor: '#E0E7FF',
  },
  operatorModalStatusPillMuted: {
    backgroundColor: '#E5E7EB',
  },
  operatorModalStatusPillText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#075985',
    textTransform: 'uppercase',
  },
  operatorModalStatusPillTextRequest: {
    color: '#92400E',
  },
  operatorModalStatusPillTextDone: {
    color: '#166534',
  },
  operatorModalStatusPillTextCash: {
    color: '#3730A3',
  },
  operatorModalStatusPillTextMuted: {
    color: '#4B5563',
  },
  profileAccordionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  mandatoryIntroCard: {
    position: 'relative',
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingTop: 16,
    paddingBottom: 16,
    marginTop: 14,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  mandatoryIntroGlow: {
    position: 'absolute',
    top: -18,
    width: 180,
    height: 80,
    borderRadius: 999,
    backgroundColor: 'rgba(251, 191, 36, 0.16)',
  },
  mandatoryIntroBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  mandatoryIntroEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: IS_ANDROID ? 1 : 2.8,
    color: '#9a6700',
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  mandatoryIntroTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 8,
  },
  mandatoryIntroText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#64748b',
    textAlign: 'center',
  },
  profileAccordionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  profileAccordionTitle: {
    marginBottom: 4,
  },
  profileAccordionSubtext: {
    marginBottom: 0,
  },
  profileAccordionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  profileEditorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  profileEditorTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  profileEditorCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 14,
  },
  profileModuleStack: {
    gap: 14,
  },
  profileModuleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  profileModuleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  profileModuleTextWrap: {
    flex: 1,
  },
  profileModuleTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#182235',
    marginBottom: 3,
    letterSpacing: IS_ANDROID ? 0 : 0.3,
    includeFontPadding: true,
  },
  profileModuleCaption: {
    fontSize: 11,
    lineHeight: 16,
    color: '#6a7384',
    fontWeight: '700',
  },
  profileModuleBadge: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileModuleBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#516173',
    letterSpacing: IS_ANDROID ? 0 : 0.2,
    includeFontPadding: true,
  },
  compactFieldBlock: {
    width: '100%',
    marginBottom: 2,
  },
  profileSectionDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.05)',
    marginVertical: 18,
  },
  profileSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 4,
  },
  profileSectionCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    textAlign: 'center',
  },
  profileEditorWrap: {
    gap: 14,
  },
  profilePreviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginTop: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  profilePreviewHeader: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  profilePreviewEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: IS_ANDROID ? 1 : 3.2,
    color: '#8b98ab',
    textTransform: 'uppercase',
    textAlign: 'center',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  profilePreviewProgress: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748b',
    textAlign: 'center',
  },
  profilePreviewName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  profilePreviewNameUpper: {
    textTransform: 'uppercase',
    letterSpacing: IS_ANDROID ? 0.2 : 0.8,
  },
  profilePreviewNameLower: {
    textTransform: 'lowercase',
  },
  profilePreviewMeta: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748b',
    marginBottom: 14,
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 0.2 : 0.8,
    includeFontPadding: true,
  },
  profileProgressRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 12,
  },
  profileProgressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 999,
  },
  profileProgressDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#cbd5e1',
  },
  profileProgressDotCompleted: {
    backgroundColor: '#0f766e',
  },
  profileProgressLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#344257',
  },
  profilePreviewInfoRow: {
    width: '100%',
    gap: 8,
    alignItems: 'center',
  },
  profilePreviewInfoPill: {
    width: '100%',
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  profilePreviewInfoText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  formGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginTop: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  formGroupTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 4,
    textAlign: 'center',
  },
  formGroupCaption: {
    fontSize: 13,
    lineHeight: 20,
    color: '#64748b',
    marginBottom: 4,
    textAlign: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginTop: 10,
    marginBottom: 5,
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  fontDropdownButton: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  fontDropdownTextWrap: {
    flex: 1,
    alignItems: 'flex-start',
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  formColumn: {
    flex: 1,
    minWidth: 160,
  },
  formColumnCompact: {
    width: 120,
    minWidth: 120,
  },
  accountInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe4ec',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '700',
    color: '#111111',
    marginTop: 0,
    width: '100%',
    textAlign: 'left',
    textAlignVertical: IS_ANDROID ? 'center' : 'auto',
    includeFontPadding: true,
  },
  accountInputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'left',
    alignSelf: 'flex-start',
  },
  accountInputLocked: {
    opacity: 0.65,
  },
  profileFontSelectorGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    justifyContent: 'center',
  },
  profileFontChip: {
    flex: 1,
    minWidth: 96,
    backgroundColor: '#e8eef5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d2dbe5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  profileFontChipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  profileFontChipText: {
    fontSize: 13,
    color: '#334155',
  },
  profileFontChipTextActive: {
    color: '#ffffff',
  },
  previewButton: {
    marginTop: 12,
    backgroundColor: '#111827',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
  profileSaveButton: {
    marginTop: 14,
    paddingVertical: 13,
  },
  profileSaveButtonEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#cbd5e1',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  accessWarningCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: 18,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  accessWarningTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#9a3412',
    textAlign: 'center',
    marginBottom: 4,
  },
  accessWarningText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#9a3412',
    textAlign: 'center',
  },
  resetButton: {
    marginTop: 8,
    backgroundColor: '#eef2f7',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
  },
  secondaryActionButton: {
    marginTop: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
  secondaryActionButtonText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1E293B',
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  accountHint: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    lineHeight: 20,
    marginTop: 8,
    textAlign: 'center',
  },
  adminStatusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  adminStatusChip: {
    backgroundColor: '#e8eef5',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#d2dbe5',
  },
  adminStatusChipText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#334155',
  },
  adminStatusChipDanger: {
    backgroundColor: '#fee2e2',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  adminStatusChipDangerText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#b91c1c',
  },
  accessCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    borderWidth: 0,
    borderColor: 'transparent',
    marginTop: 14,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    position: 'relative',
  },
  accessCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 128,
    backgroundColor: 'rgba(239, 246, 255, 0.95)',
  },
  accessLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 1 : 3,
    textTransform: 'uppercase',
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  accessCode: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 16,
    textAlign: 'center',
    letterSpacing: IS_ANDROID ? 0 : 0.2,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  accessLinkPlate: {
    width: '100%',
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  accessLink: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 22,
    color: '#334155',
    textAlign: 'center',
  },
  accessHealthBadge: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 0,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accessHealthBadgeReady: {
    backgroundColor: '#ECFDF5',
    borderColor: 'transparent',
  },
  accessHealthBadgeWarning: {
    backgroundColor: '#FFF7ED',
    borderColor: 'transparent',
  },
  accessHealthText: {
    fontSize: 12,
    lineHeight: 19,
    fontWeight: '900',
    textAlign: 'center',
  },
  accessHealthTextReady: {
    color: '#166534',
  },
  accessHealthTextChecking: {
    color: '#0c4a6e',
  },
  accessHealthTextWarning: {
    color: '#9a3412',
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    borderWidth: 0,
    borderColor: 'transparent',
    marginTop: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    position: 'relative',
  },
  qrCardGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 136,
    backgroundColor: 'rgba(245, 243, 255, 0.92)',
  },
  qrCardResponsive: {
    alignSelf: 'center',
  },
  qrFrame: {
    borderRadius: 20,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  qrPlate: {
    borderRadius: 30,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  qrSalonBadge: {
    marginTop: 16,
    marginBottom: 4,
    borderRadius: 999,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 8,
    paddingHorizontal: 16,
    minWidth: 148,
    maxWidth: '88%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrSalonBadgeText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '900',
    color: '#1E3A8A',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  qrTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 22,
    marginBottom: 10,
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  qrText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    fontWeight: '700',
    paddingHorizontal: IS_ANDROID ? 10 : 0,
    width: IS_ANDROID ? '100%' : undefined,
    alignSelf: IS_ANDROID ? 'stretch' : undefined,
  },
  mandatoryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  mandatoryOverlayCard: {
    width: '100%',
    maxWidth: 390,
    backgroundColor: '#ffffff',
    borderRadius: 34,
    paddingHorizontal: 26,
    paddingTop: 26,
    paddingBottom: 22,
    borderWidth: 1,
    borderColor: '#eef2f7',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    elevation: 10,
    overflow: IS_ANDROID ? 'visible' : 'hidden',
    alignItems: 'center',
  },
  mandatoryOverlayAccent: {
    position: 'absolute',
    top: -36,
    width: 210,
    height: 110,
    borderRadius: 999,
    backgroundColor: 'rgba(96, 165, 250, 0.16)',
  },
  mandatoryOverlayBadge: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  mandatoryOverlayEyebrow: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: IS_ANDROID ? 1 : 2.6,
    color: '#64748b',
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 8,
    includeFontPadding: true,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  mandatoryOverlayTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 12,
  },
  mandatoryOverlayText: {
    fontSize: 15,
    lineHeight: 24,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 22,
  },
  mandatoryOverlayButton: {
    width: '100%',
    backgroundColor: '#111827',
    borderRadius: 22,
    paddingVertical: 17,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#111827',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  mandatoryOverlayButtonText: {
    fontSize: 17,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
  },
});
