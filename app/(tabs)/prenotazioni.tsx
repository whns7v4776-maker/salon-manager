import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, LayoutAnimation, Linking, Platform, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { useAppContext } from '../../src/context/AppContext';
import { formatDateLong, getTodayDateString } from '../../src/lib/booking';
import { haptic } from '../../src/lib/haptics';
import { tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
const buildWhatsappUrl = (value: string) => {
  const normalized = buildDialablePhone(value).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}` : '';
};
const buildInstagramUrl = (value?: string) => {
  const handle = value?.replace(/^@+/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
};

const formatRequestDateKey = (value: string) => value || getTodayDateString();
const AUTO_ACCEPT_DELAY_MS = 15000;
const IS_ANDROID = Platform.OS === 'android';

type RequestGroup = {
  date: string;
  items: ReturnType<typeof useAppContext>['richiestePrenotazione'];
};

function AccordionChevron({
  expanded,
  accent,
}: {
  expanded: boolean;
  accent: 'default' | 'danger';
}) {
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, progress]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 180}deg` }],
  }));

  return (
    <Animated.View
      style={[
        styles.accordionChevronWrap,
        accent === 'danger' && styles.accordionChevronWrapDanger,
        chevronStyle,
      ]}
    >
      <Ionicons
        name="chevron-down"
        size={16}
        color={accent === 'danger' ? '#b91c1c' : '#475569'}
      />
    </Animated.View>
  );
}

export default function PrenotazioniScreen() {
  const responsive = useResponsiveLayout();
  const scrollRef = useRef<ScrollView | null>(null);
  const requestSnapshotsRef = useRef<
    Record<
      string,
      {
        stato: 'In attesa' | 'Accettata' | 'Rifiutata' | 'Annullata';
        viewedByCliente?: boolean;
        viewedBySalon?: boolean;
        cancellationSource?: 'cliente' | 'salone';
      }
    >
  >({});
  const collapsedSections = useCallback(
    () => ({
      pending: false,
      cancelled: false,
      accepted: false,
      salonDeclined: false,
    }),
    []
  );
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(collapsedSections);
  const {
    richiestePrenotazione,
    setRichiestePrenotazione,
    availabilitySettings,
    setAvailabilitySettings,
    salonWorkspace,
    updateSalonWorkspacePersisted,
    salonAccountEmail,
    appLanguage,
    updateBookingRequestStatusForSalon,
  } = useAppContext();
  const [pendingStatusRequestIds, setPendingStatusRequestIds] = useState<string[]>([]);
  const autoAcceptTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const guidedSlotsEnabled = availabilitySettings.guidedSlotsEnabled;
  const guidedSlotsStrategy = availabilitySettings.guidedSlotsStrategy;
  const guidedSlotsVisibility = availabilitySettings.guidedSlotsVisibility;

  const updateGuidedSlotsSettings = useCallback(
    (
      updater: (current: typeof availabilitySettings) => typeof availabilitySettings
    ) => {
      setAvailabilitySettings((current) => updater(current));
      void haptic.light().catch(() => null);
    },
    [setAvailabilitySettings]
  );

  useEffect(() => {
    if (Platform.OS === 'android') {
      UIManager.setLayoutAnimationEnabledExperimental?.(true);
    }
  }, []);

  const isCancelledBySalon = useCallback(
    (item: (typeof richiestePrenotazione)[number]) =>
      item.stato === 'Annullata' && item.cancellationSource === 'salone',
    []
  );

  const richiesteInAttesa = useMemo(
    () =>
      richiestePrenotazione
        .filter(
          (item) =>
            (item.origine ?? 'frontend') === 'frontend' &&
            (item.stato === 'In attesa' || (item.stato === 'Annullata' && item.viewedBySalon !== true))
        )
        .sort((left, right) => {
          if (left.stato === 'Annullata' && right.stato !== 'Annullata') return -1;
          if (left.stato !== 'Annullata' && right.stato === 'Annullata') return 1;
          return 0;
        }),
    [richiestePrenotazione]
  );
  const richiesteAnnullateCliente = useMemo(
    () =>
      richiestePrenotazione.filter(
        (item) =>
          (item.origine ?? 'frontend') === 'frontend' &&
          item.stato === 'Annullata' &&
          !isCancelledBySalon(item)
      ),
    [isCancelledBySalon, richiestePrenotazione]
  );
  const richiesteDaAccettare = useMemo(
    () => richiesteInAttesa.filter((item) => item.stato === 'In attesa'),
    [richiesteInAttesa]
  );
  const richiesteGestite = useMemo(
    () =>
      richiestePrenotazione.filter(
        (item) => (item.origine ?? 'frontend') === 'frontend' && item.stato !== 'In attesa'
      ),
    [richiestePrenotazione]
  );
  const richiesteAccettate = useMemo(
    () =>
      richiesteGestite.filter((item) => item.stato === 'Accettata'),
    [richiesteGestite]
  );
  const richiesteCancellateORifiutateDalSalone = useMemo(
    () =>
      richiestePrenotazione.filter(
        (item) => item.stato === 'Rifiutata' || isCancelledBySalon(item)
      ),
    [isCancelledBySalon, richiestePrenotazione]
  );

  const buildGroupedRequests = useCallback(
    (items: typeof richiestePrenotazione): RequestGroup[] => {
      const byDate = new Map<string, typeof richiestePrenotazione>();

      items.forEach((item) => {
        const key = formatRequestDateKey(item.data);
        const current = byDate.get(key) ?? [];
        current.push(item);
        byDate.set(key, current);
      });

      return Array.from(byDate.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, groupedItems]) => ({
          date,
          items: groupedItems.sort((left, right) => left.ora.localeCompare(right.ora)),
        }));
    },
    []
  );

  const groupedPending = useMemo(() => buildGroupedRequests(richiesteInAttesa), [buildGroupedRequests, richiesteInAttesa]);
  const groupedCancelled = useMemo(() => buildGroupedRequests(richiesteAnnullateCliente), [buildGroupedRequests, richiesteAnnullateCliente]);
  const groupedAccepted = useMemo(() => buildGroupedRequests(richiesteAccettate), [buildGroupedRequests, richiesteAccettate]);
  const groupedSalonDeclined = useMemo(
    () => buildGroupedRequests(richiesteCancellateORifiutateDalSalone),
    [buildGroupedRequests, richiesteCancellateORifiutateDalSalone]
  );

  const persistViewedRequestIds = useCallback(
    async (ids: string[]) => {
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      if (!normalizedEmail || ids.length === 0) return;

      const storageKey = `salon_manager_viewed_request_ids__${normalizedEmail}`;

      try {
        const raw = await AsyncStorage.getItem(storageKey);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        const currentIds = Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === 'string')
          : [];
        const merged = Array.from(new Set([...currentIds, ...ids]));
        await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
      } catch {
        // Non bloccare UX notifiche in caso di errore storage locale.
      }
    },
    [salonAccountEmail]
  );

  const markFrontendRequestsAsViewed = useCallback(() => {
    const markedIds = richiestePrenotazione
      .filter(
        (item) =>
          (item.origine ?? 'frontend') === 'frontend' &&
          (item.stato === 'In attesa' || item.stato === 'Annullata') &&
          item.viewedBySalon !== true
      )
      .map((item) => item.id);

    if (markedIds.length > 0) {
      void persistViewedRequestIds(markedIds);
    }
  }, [persistViewedRequestIds, richiestePrenotazione]);

  useEffect(() => {
    if (expandedSections.pending) {
      markFrontendRequestsAsViewed();
    }
  }, [expandedSections.pending, markFrontendRequestsAsViewed]);

  const markCancelledRequestsAsViewed = useCallback(() => {
    const markedCancelledIds = richiestePrenotazione
      .filter(
        (item) =>
          (item.origine ?? 'frontend') === 'frontend' &&
          item.stato === 'Annullata' &&
          item.viewedBySalon !== true
      )
      .map((item) => item.id);

    if (markedCancelledIds.length > 0) {
      void persistViewedRequestIds(markedCancelledIds);
    }
  }, [persistViewedRequestIds, richiestePrenotazione]);

  useEffect(() => {
    if (expandedSections.cancelled) {
      markCancelledRequestsAsViewed();
    }
  }, [expandedSections.cancelled, markCancelledRequestsAsViewed]);

  const toggleSection = useCallback((sectionKey: string) => {
    LayoutAnimation.configureNext({
      duration: 210,
      create: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
      update: {
        type: LayoutAnimation.Types.easeInEaseOut,
      },
      delete: {
        type: LayoutAnimation.Types.easeInEaseOut,
        property: LayoutAnimation.Properties.opacity,
      },
    });

    if (sectionKey === 'pending' && !expandedSections.pending) {
      markFrontendRequestsAsViewed();
    }
    if (sectionKey === 'cancelled' && !expandedSections.cancelled) {
      markCancelledRequestsAsViewed();
    }

    setExpandedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey],
    }));
  }, [expandedSections.cancelled, expandedSections.pending, markCancelledRequestsAsViewed, markFrontendRequestsAsViewed]);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      });

      setExpandedSections({
        pending: richiesteDaAccettare.length > 0,
        cancelled: false,
        accepted: false,
        salonDeclined: false,
      });

      return () => {
        setExpandedSections(collapsedSections());
      };
    }, [collapsedSections, richiesteDaAccettare.length])
  );

  const aggiornaStatoRichiesta = async (
    id: string,
    stato: 'Accettata' | 'Rifiutata',
    ignoreConflicts = false
  ) => {
    return updateBookingRequestStatusForSalon({
      salonCode: salonWorkspace.salonCode,
      requestId: id,
      status: stato,
      ignoreConflicts,
    });
  };

  const clearAutoAcceptTimer = useCallback((id: string) => {
    const timer = autoAcceptTimersRef.current[id];
    if (!timer) return;
    clearTimeout(timer);
    delete autoAcceptTimersRef.current[id];
  }, []);

  const clearAllAutoAcceptTimers = useCallback(() => {
    Object.values(autoAcceptTimersRef.current).forEach((timer) => clearTimeout(timer));
    autoAcceptTimersRef.current = {};
  }, []);

  const accettaRichiesta = useCallback((id: string) => {
    if (pendingStatusRequestIds.includes(id)) return;

    const currentRequest = richiestePrenotazione.find((item) => item.id === id);
    if (!currentRequest) return;

    requestSnapshotsRef.current[id] = {
      stato: currentRequest.stato,
      viewedByCliente: currentRequest.viewedByCliente,
      viewedBySalon: currentRequest.viewedBySalon,
      cancellationSource: currentRequest.cancellationSource,
    };

    setPendingStatusRequestIds((current) => [...current, id]);
    clearAutoAcceptTimer(id);

    aggiornaStatoRichiesta(id, 'Accettata').then((result) => {
      if (!result?.ok) {
        const errorText = (result?.error ?? '').toLowerCase();
        if (/accavalla|sovrapp|conflitt/.test(errorText)) {
          Alert.alert(
            'Conflitto orario',
            result?.error ?? 'Questa richiesta si accavalla con un appuntamento esistente.',
            [
              {
                text: 'Annulla',
                style: 'cancel',
                onPress: () => {
                  const snapshot = requestSnapshotsRef.current[id];
                },
              },
              {
                text: 'Accetta comunque',
                style: 'destructive',
                onPress: () => {
                  void aggiornaStatoRichiesta(id, 'Accettata', true).then((forcedResult) => {
                    if (!forcedResult?.ok) {
                      Alert.alert(
                        'Aggiornamento non riuscito',
                        forcedResult?.error ?? 'Non sono riuscito ad accettare la richiesta.'
                      );
                    }
                  });
                },
              },
            ]
          );
          return;
        }

        Alert.alert('Aggiornamento non riuscito', result?.error ?? 'Non sono riuscito ad accettare la richiesta.');
      }
    }).catch(() => null).finally(() => {
      delete requestSnapshotsRef.current[id];
      setPendingStatusRequestIds((current) => current.filter((item) => item !== id));
    });
  }, [
    clearAutoAcceptTimer,
    pendingStatusRequestIds,
    richiestePrenotazione,
    setRichiestePrenotazione,
    updateBookingRequestStatusForSalon,
    salonWorkspace.salonCode,
  ]);

  const rifiutaRichiesta = (id: string) => {
    if (pendingStatusRequestIds.includes(id)) return;

    Alert.alert('Rifiuta richiesta', 'Vuoi davvero rifiutare questa richiesta di prenotazione?', [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Rifiuta',
        style: 'destructive',
        onPress: () => {
          clearAutoAcceptTimer(id);
          const currentRequest = richiestePrenotazione.find((item) => item.id === id);
          if (!currentRequest) return;

          requestSnapshotsRef.current[id] = {
            stato: currentRequest.stato,
            viewedByCliente: currentRequest.viewedByCliente,
            viewedBySalon: currentRequest.viewedBySalon,
            cancellationSource: currentRequest.cancellationSource,
          };

          setPendingStatusRequestIds((current) => [...current, id]);

          aggiornaStatoRichiesta(id, 'Rifiutata')
            .then((result) => {
              if (!result?.ok) {
                Alert.alert('Aggiornamento non riuscito', result?.error ?? 'Non sono riuscito a rifiutare la richiesta.');
              }
            })
            .catch(() => null)
            .finally(() => {
              delete requestSnapshotsRef.current[id];
              setPendingStatusRequestIds((current) => current.filter((item) => item !== id));
            });
        },
      },
    ]);
  };

  useEffect(() => {
    if (!salonWorkspace.autoAcceptBookingRequests) {
      clearAllAutoAcceptTimers();
      return;
    }

    const pendingIds = new Set(richiesteDaAccettare.map((item) => item.id));

    richiesteDaAccettare.forEach((item) => {
      if (pendingStatusRequestIds.includes(item.id)) return;
      if (autoAcceptTimersRef.current[item.id]) return;

      autoAcceptTimersRef.current[item.id] = setTimeout(() => {
        delete autoAcceptTimersRef.current[item.id];
        accettaRichiesta(item.id);
      }, AUTO_ACCEPT_DELAY_MS);
    });

    Object.keys(autoAcceptTimersRef.current).forEach((id) => {
      if (!pendingIds.has(id)) {
        clearAutoAcceptTimer(id);
      }
    });
  }, [
    accettaRichiesta,
    clearAllAutoAcceptTimers,
    clearAutoAcceptTimer,
    pendingStatusRequestIds,
    richiesteDaAccettare,
    salonWorkspace.autoAcceptBookingRequests,
  ]);

  useEffect(() => () => {
    clearAllAutoAcceptTimers();
  }, [clearAllAutoAcceptTimers]);

  const openExternalUrl = useCallback(async (url: string) => {
    if (!url) return;
    const supported = await Linking.canOpenURL(url);
    if (!supported) return;
    Linking.openURL(url).catch(() => null);
  }, []);

  React.useEffect(() => {
    return () => {
      Keyboard.dismiss();
    };
  }, []);

  const renderDateGroups = (
    groups: RequestGroup[],
    variant: 'pending' | 'history'
  ) => (
    <View style={styles.groupedList}>
      {groups.map((group) => (
        <View key={group.date} style={styles.dateGroup}>
          <Text style={styles.dateGroupTitle}>{formatDateLong(group.date)}</Text>
          <View style={styles.dateGroupCards}>
            {group.items.map((item) =>
              variant === 'pending' ? (
                <Animated.View
                  key={item.id}
                  layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
                  entering={FadeIn.duration(150).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOut.duration(130).easing(Easing.out(Easing.cubic))}
                  style={[styles.requestCard, responsive.isDesktop && styles.wideCard]}
                >
                  <View style={styles.requestTopRow}>
                    <View style={styles.requestHeaderText}>
                      <Text style={styles.requestName}>
                        {item.nome} {item.cognome}
                      </Text>
                      <Text style={styles.requestMeta}>{item.ora}</Text>
                    </View>
                    <Animated.View
                      style={[
                        styles.pendingBadge,
                        item.stato === 'Annullata' && styles.pendingBadgeCancelled,
                      ]}
                      entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                    >
                      <Text
                        style={[
                          styles.pendingBadgeText,
                          item.stato === 'Annullata' && styles.pendingBadgeTextCancelled,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.76}
                      >
                        {item.stato === 'Annullata'
                          ? 'Annullata'
                          : tApp(appLanguage, 'requests_pending')}
                      </Text>
                    </Animated.View>
                  </View>

                  <View style={styles.infoGrid}>
                    <View style={styles.infoBox}>
                      <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_service')}</Text>
                      <Text style={styles.infoValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.66}>{item.servizio}</Text>
                    </View>
                    <View style={styles.infoBox}>
                      <Text style={styles.infoLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_price')}</Text>
                      <Text style={styles.infoValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>€ {item.prezzo.toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.contactPanel}>
                    {item.operatoreNome ? (
                      <Text style={styles.contactLine}>Operatore: {item.operatoreNome}</Text>
                    ) : null}
                    <Text style={styles.contactLine}>{tApp(appLanguage, 'requests_phone')}: {item.telefono}</Text>
                    <Text style={styles.contactLine}>{tApp(appLanguage, 'common_email')}: {item.email}</Text>
                    {item.instagram ? <Text style={styles.contactLine}>Instagram: @{item.instagram}</Text> : null}
                  </View>
                  <View style={styles.quickActionsRow}>
                    <HapticTouchable
                      style={styles.quickActionChip}
                      onPress={() => openExternalUrl(`tel:${buildDialablePhone(item.telefono)}`)}
                      pressScale={0.97}
                      pressOpacity={0.97}
                    >
                      <Text style={styles.quickActionChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>Chiama</Text>
                    </HapticTouchable>
                    <HapticTouchable
                      style={[styles.quickActionChip, styles.quickActionChipWhatsapp]}
                      onPress={() => openExternalUrl(buildWhatsappUrl(item.telefono))}
                      pressScale={0.97}
                      pressOpacity={0.97}
                    >
                      <Text style={[styles.quickActionChipText, styles.quickActionChipWhatsappText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                        WhatsApp
                      </Text>
                    </HapticTouchable>
                    {item.instagram ? (
                      <HapticTouchable
                        style={[styles.quickActionChip, styles.quickActionChipInstagram]}
                        onPress={() => openExternalUrl(buildInstagramUrl(item.instagram))}
                        pressScale={0.97}
                        pressOpacity={0.97}
                      >
                        <Text style={[styles.quickActionChipText, styles.quickActionChipInstagramText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                          Instagram
                        </Text>
                      </HapticTouchable>
                    ) : null}
                  </View>
                  {item.note ? <Text style={styles.noteText}>{tApp(appLanguage, 'requests_note')}: {item.note}</Text> : null}
                  {item.stato !== 'Annullata' ? (
                    <View style={styles.actionsRow}>
                      <HapticTouchable
                        style={[styles.acceptButton, pendingStatusRequestIds.includes(item.id) && styles.actionButtonDisabled]}
                        onPress={() => accettaRichiesta(item.id)}
                        disabled={pendingStatusRequestIds.includes(item.id)}
                        pressScale={0.975}
                        pressOpacity={0.98}
                      >
                        <Text style={styles.acceptButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{tApp(appLanguage, 'requests_accept')}</Text>
                      </HapticTouchable>
                      <HapticTouchable
                        style={[styles.rejectButton, pendingStatusRequestIds.includes(item.id) && styles.actionButtonDisabled]}
                        onPress={() => rifiutaRichiesta(item.id)}
                        disabled={pendingStatusRequestIds.includes(item.id)}
                        pressScale={0.975}
                        pressOpacity={0.98}
                      >
                        <Text style={styles.rejectButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{tApp(appLanguage, 'requests_reject')}</Text>
                      </HapticTouchable>
                    </View>
                  ) : null}
                </Animated.View>
              ) : (
                <Animated.View
                  key={item.id}
                  layout={LinearTransition.duration(180).easing(Easing.out(Easing.cubic))}
                  entering={FadeIn.duration(145).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOut.duration(125).easing(Easing.out(Easing.cubic))}
                  style={[styles.historyCard, responsive.isDesktop && styles.wideCard]}
                >
                  <View style={styles.historyHeaderRow}>
                    <View style={styles.historyHeaderText}>
                      <Text style={styles.historyTitle}>
                        {item.nome} {item.cognome}
                      </Text>
                      <Text style={styles.historyMeta}>{item.ora}</Text>
                    </View>
                    <Animated.View
                      style={[
                        styles.historyBadge,
                        item.stato === 'Accettata' ? styles.historyBadgeAccepted : styles.historyBadgeRejected,
                      ]}
                      entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                      layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                    >
                      <Text
                        style={[
                          styles.historyBadgeText,
                          item.stato === 'Accettata'
                            ? styles.historyBadgeTextAccepted
                            : styles.historyBadgeTextRejected,
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {item.stato === 'Annullata'
                          ? isCancelledBySalon(item)
                            ? 'Annullata dal salone'
                            : 'Annullata dal cliente'
                          : item.stato}
                      </Text>
                    </Animated.View>
                  </View>
                  <View style={styles.historySummaryRow}>
                    <View style={styles.historySummaryChip}>
                      <Text style={styles.historySummaryLabel}>Servizio</Text>
                      <Text style={styles.historySummaryValue}>{item.servizio}</Text>
                    </View>
                    <View style={styles.historySummaryChip}>
                      <Text style={styles.historySummaryLabel}>Prezzo</Text>
                      <Text style={styles.historySummaryValue}>€ {item.prezzo.toFixed(2)}</Text>
                    </View>
                  </View>
                  <View style={styles.contactPanel}>
                    {item.operatoreNome ? (
                      <Text style={styles.contactLine}>Operatore: {item.operatoreNome}</Text>
                    ) : null}
                    <Text style={styles.contactLine}>{tApp(appLanguage, 'requests_phone')}: {item.telefono}</Text>
                    <Text style={styles.contactLine}>{tApp(appLanguage, 'common_email')}: {item.email}</Text>
                  </View>
                  <View style={styles.quickActionsRow}>
                    <HapticTouchable
                      style={styles.quickActionChip}
                      onPress={() => openExternalUrl(`tel:${buildDialablePhone(item.telefono)}`)}
                      pressScale={0.97}
                      pressOpacity={0.97}
                    >
                      <Text style={styles.quickActionChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>Chiama</Text>
                    </HapticTouchable>
                    <HapticTouchable
                      style={[styles.quickActionChip, styles.quickActionChipWhatsapp]}
                      onPress={() => openExternalUrl(buildWhatsappUrl(item.telefono))}
                      pressScale={0.97}
                      pressOpacity={0.97}
                    >
                      <Text style={[styles.quickActionChipText, styles.quickActionChipWhatsappText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                        WhatsApp
                      </Text>
                    </HapticTouchable>
                    {item.instagram ? (
                      <HapticTouchable
                        style={[styles.quickActionChip, styles.quickActionChipInstagram]}
                        onPress={() => openExternalUrl(buildInstagramUrl(item.instagram))}
                        pressScale={0.97}
                        pressOpacity={0.97}
                      >
                        <Text style={[styles.quickActionChipText, styles.quickActionChipInstagramText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                          Instagram
                        </Text>
                      </HapticTouchable>
                    ) : null}
                  </View>
                </Animated.View>
              )
            )}
          </View>
        </View>
      ))}
    </View>
  );

  const renderAccordionSection = ({
    sectionKey,
    title,
    count,
    groups,
    variant,
    emptyText,
    emptyHint,
    accent = 'default',
    titleStyle,
  }: {
    sectionKey: string;
    title: string;
    count: number;
    groups: RequestGroup[];
    variant: 'pending' | 'history';
    emptyText: string;
    emptyHint: string;
    accent?: 'default' | 'danger';
    titleStyle?: object;
  }) => {
    const expanded = expandedSections[sectionKey] ?? false;

    return (
      <View style={[styles.accordionSection, responsive.isDesktop && styles.wideCard]}>
        <HapticTouchable
          style={styles.accordionHeader}
          onPress={() => {
            haptic.light();
            toggleSection(sectionKey);
          }}
          pressScale={0.985}
          pressOpacity={0.98}
        >
          <View style={styles.accordionHeaderText}>
            <Text
              style={[styles.accordionTitle, titleStyle]}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {title}
            </Text>
            <Animated.Text
              style={[
                styles.accordionCount,
                accent === 'danger' && styles.accordionCountDanger,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
              layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
            >
              {count}
            </Animated.Text>
          </View>
          <AccordionChevron expanded={expanded} accent={accent} />
        </HapticTouchable>

        {expanded ? (
          count === 0 ? (
            <View style={styles.accordionEmpty}>
              <Text style={styles.emptyTitle}>{emptyText}</Text>
              <Text style={styles.emptyText}>{emptyHint}</Text>
            </View>
          ) : (
            renderDateGroups(groups, variant)
          )
        ) : null}
      </View>
    );
  };

  return (
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
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
      <View style={styles.heroCard}>
        <ModuleHeroHeader
          moduleKey="prenotazioni"
          title={tApp(appLanguage, 'tab_requests')}
          salonName={salonWorkspace.salonName}
          salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
          salonNameFontVariant={salonWorkspace.salonNameFontVariant}
        />

        <View style={styles.heroStatsGrid}>
          <View style={styles.heroStatsColumn}>
            <View style={[styles.heroStatCard, styles.heroStatCardBlue]}>
              <Text style={styles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{richiesteDaAccettare.length}</Text>
              <Text style={styles.heroStatLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_pending')}</Text>
            </View>
            <View style={[styles.heroStatCard, styles.heroStatCardOrange]}>
              <Text style={styles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{richiesteCancellateORifiutateDalSalone.length}</Text>
              <Text style={[styles.heroStatLabel, styles.heroStatLabelSalon]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.72}>
                Rifiutate/Annullate Salone
              </Text>
            </View>
          </View>
          <View style={styles.heroStatsColumn}>
            <View style={[styles.heroStatCard, styles.heroStatCardMint]}>
              <Text style={styles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{richiesteGestite.length}</Text>
              <Text style={styles.heroStatLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'requests_handled')}</Text>
            </View>
            <View style={[styles.heroStatCard, styles.heroStatCardRed]}>
              <Text style={styles.heroStatNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{richiesteAnnullateCliente.length}</Text>
              <Text style={[styles.heroStatLabel, styles.heroStatLabelRed]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.68}>Annullate dal cliente</Text>
            </View>
          </View>
        </View>
        <Text style={styles.subtitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.82}>{tApp(appLanguage, 'requests_subtitle')}</Text>

        <View style={styles.autoAcceptCard}>
          <View style={styles.autoAcceptHeaderRow}>
            <View style={styles.autoAcceptHeaderTextWrap}>
              <Text style={styles.autoAcceptTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.82}>Accettazione automatica richieste</Text>
              <Text style={styles.autoAcceptHint} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.82}>
                Se attiva, ogni richiesta in attesa viene accettata automaticamente dopo 15 secondi.
              </Text>
            </View>
            <View
              style={[
                styles.autoAcceptBadge,
                salonWorkspace.autoAcceptBookingRequests
                  ? styles.autoAcceptBadgeOn
                  : styles.autoAcceptBadgeOff,
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={[
                  styles.autoAcceptBadgeText,
                  salonWorkspace.autoAcceptBookingRequests
                    ? styles.autoAcceptBadgeTextOn
                    : styles.autoAcceptBadgeTextOff,
                ]}
              >
                {salonWorkspace.autoAcceptBookingRequests ? 'Auto ON' : 'Manuale'}
              </Text>
            </View>
          </View>

          <HapticTouchable
            style={[
              styles.autoAcceptToggle,
              salonWorkspace.autoAcceptBookingRequests
                ? styles.autoAcceptToggleOn
                : styles.autoAcceptToggleOff,
            ]}
            onPress={() => {
              const nextValue = !salonWorkspace.autoAcceptBookingRequests;
              const title = nextValue
                ? 'Attivare accettazione automatica?'
                : 'Disattivare accettazione automatica?';
              const body = nextValue
                ? 'Le nuove richieste in attesa verranno accettate automaticamente dopo 15 secondi.'
                : 'Le richieste torneranno in gestione manuale e non verranno piu accettate in automatico.';

              Alert.alert(title, body, [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: nextValue ? 'Attiva' : 'Disattiva',
                  style: nextValue ? 'default' : 'destructive',
                  onPress: () => {
                    void updateSalonWorkspacePersisted((current) => ({
                      ...current,
                      autoAcceptBookingRequests: nextValue,
                    }));
                    if (!nextValue) {
                      clearAllAutoAcceptTimers();
                    }
                    haptic.light().catch(() => null);
                  },
                },
              ]);
            }}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={[
                styles.autoAcceptToggleText,
                salonWorkspace.autoAcceptBookingRequests
                  ? styles.autoAcceptToggleTextOn
                  : styles.autoAcceptToggleTextOff,
              ]}
            >
              {salonWorkspace.autoAcceptBookingRequests
                ? 'Disattiva accettazione automatica'
                : 'Attiva accettazione automatica (15s)'}
            </Text>
          </HapticTouchable>
        </View>

        <View style={styles.autoAcceptCard}>
          <View style={styles.autoAcceptHeaderRow}>
            <View style={styles.autoAcceptHeaderTextWrap}>
              <Text
                style={styles.autoAcceptTitle}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                Slot guidati
              </Text>
              <Text
                style={styles.autoAcceptHint}
                numberOfLines={4}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                Mostra prima gli orari migliori per ogni servizio, proteggendo gli slot piu utili
                per i trattamenti lunghi e incastrando meglio quelli brevi.
              </Text>
            </View>
            <View
              style={[
                styles.autoAcceptBadge,
                guidedSlotsEnabled ? styles.autoAcceptBadgeOn : styles.autoAcceptBadgeOff,
              ]}
            >
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                style={[
                  styles.autoAcceptBadgeText,
                  guidedSlotsEnabled
                    ? styles.autoAcceptBadgeTextOn
                    : styles.autoAcceptBadgeTextOff,
                ]}
              >
                {guidedSlotsEnabled ? 'Guidati ON' : 'Guidati OFF'}
              </Text>
            </View>
          </View>

          <HapticTouchable
            style={[
              styles.autoAcceptToggle,
              guidedSlotsEnabled ? styles.autoAcceptToggleOn : styles.autoAcceptToggleOff,
            ]}
            onPress={() => {
              const nextValue = !guidedSlotsEnabled;
              const title = nextValue ? 'Attivare slot guidati?' : 'Disattivare slot guidati?';
              const body = nextValue
                ? 'Il cliente vedra prima gli orari consigliati per proteggere meglio i servizi lunghi e usare i buchi per quelli brevi.'
                : 'Il cliente tornera a vedere il comportamento orari standard senza suggerimenti guidati.';

              Alert.alert(title, body, [
                { text: 'Annulla', style: 'cancel' },
                {
                  text: nextValue ? 'Attiva' : 'Disattiva',
                  style: nextValue ? 'default' : 'destructive',
                  onPress: () => {
                    updateGuidedSlotsSettings((current) => ({
                      ...current,
                      guidedSlotsEnabled: nextValue,
                    }));
                  },
                },
              ]);
            }}
            pressScale={0.975}
            pressOpacity={0.98}
          >
            <Text
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              style={[
                styles.autoAcceptToggleText,
                guidedSlotsEnabled ? styles.autoAcceptToggleTextOn : styles.autoAcceptToggleTextOff,
              ]}
            >
              {guidedSlotsEnabled ? 'Disattiva slot guidati' : 'Attiva slot guidati'}
            </Text>
          </HapticTouchable>

          <View style={styles.guidedSlotOptionGroup}>
            <Text style={styles.guidedSlotOptionLabel}>Strategia</Text>
            <View style={styles.guidedSlotChipRow}>
              {[
                { key: 'balanced', label: 'Equilibrata' },
                { key: 'protect_long_services', label: 'Proteggi lunghi' },
                { key: 'fill_gaps', label: 'Riempi buchi' },
              ].map((option) => {
                const active = guidedSlotsStrategy === option.key;
                return (
                  <HapticTouchable
                    key={option.key}
                    style={[
                      styles.guidedSlotChip,
                      active && styles.guidedSlotChipActive,
                      !guidedSlotsEnabled && styles.guidedSlotChipDisabled,
                    ]}
                    onPress={() => {
                      if (!guidedSlotsEnabled) return;
                      updateGuidedSlotsSettings((current) => ({
                        ...current,
                        guidedSlotsStrategy: option.key as typeof guidedSlotsStrategy,
                      }));
                    }}
                    pressScale={0.98}
                    pressOpacity={0.95}
                  >
                    <Text
                      style={[
                        styles.guidedSlotChipText,
                        active && styles.guidedSlotChipTextActive,
                        !guidedSlotsEnabled && styles.guidedSlotChipTextDisabled,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </HapticTouchable>
                );
              })}
            </View>
          </View>

          <View style={[styles.guidedSlotOptionGroup, styles.guidedSlotOptionGroupTight]}>
            <Text style={styles.guidedSlotOptionLabel}>Visibilita orari</Text>
            <View style={styles.guidedSlotChipRow}>
              {[
                { key: 'recommended_first', label: 'Consigliati prima' },
                { key: 'recommended_only', label: 'Solo consigliati' },
              ].map((option) => {
                const active = guidedSlotsVisibility === option.key;
                return (
                  <HapticTouchable
                    key={option.key}
                    style={[
                      styles.guidedSlotChip,
                      styles.guidedSlotChipWide,
                      active && styles.guidedSlotChipActive,
                      !guidedSlotsEnabled && styles.guidedSlotChipDisabled,
                    ]}
                    onPress={() => {
                      if (!guidedSlotsEnabled) return;
                      updateGuidedSlotsSettings((current) => ({
                        ...current,
                        guidedSlotsVisibility: option.key as typeof guidedSlotsVisibility,
                      }));
                    }}
                    pressScale={0.98}
                    pressOpacity={0.95}
                  >
                    <Text
                      style={[
                        styles.guidedSlotChipText,
                        active && styles.guidedSlotChipTextActive,
                        !guidedSlotsEnabled && styles.guidedSlotChipTextDisabled,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </HapticTouchable>
                );
              })}
            </View>
          </View>
        </View>
      </View>

        <View
          style={[
            styles.desktopColumns,
            !responsive.isDesktop && styles.desktopColumnsStack,
          ]}
        >
        <View style={[styles.desktopColumnLeft, !responsive.isDesktop && styles.desktopColumnStack]}>
          {renderAccordionSection({
            sectionKey: 'pending',
            title: 'Richieste in attesa',
            count: richiesteInAttesa.filter((item) => item.stato === 'In attesa').length,
            groups: groupedPending.filter((group) =>
              group.items.some((item) => item.stato === 'In attesa')
            ),
            variant: 'pending',
            emptyText: tApp(appLanguage, 'requests_no_pending'),
            emptyHint: tApp(appLanguage, 'requests_no_pending_text'),
          })}
          {renderAccordionSection({
            sectionKey: 'accepted',
            title: 'Richieste accettate',
            count: richiesteAccettate.length,
            groups: groupedAccepted,
            variant: 'history',
            emptyText: 'Nessuna richiesta accettata',
            emptyHint: 'Quando accetti una richiesta, la trovi qui.',
          })}
          {renderAccordionSection({
            sectionKey: 'cancelled',
            title: 'Annullate dal cliente',
            count: richiesteAnnullateCliente.length,
            groups: groupedCancelled,
            variant: 'pending',
            emptyText: 'Nessun annullamento cliente',
            emptyHint: 'Qui compaiono solo gli appuntamenti annullati dal cliente.',
            accent: 'danger',
          })}
        </View>

        <View style={[styles.desktopColumnRight, !responsive.isDesktop && styles.desktopColumnStack]}>
          {renderAccordionSection({
            sectionKey: 'salonDeclined',
            title: 'Rifiutate/Annullate Salone',
            count: richiesteCancellateORifiutateDalSalone.length,
            groups: groupedSalonDeclined,
            variant: 'history',
            emptyText: 'Nessuna cancellazione dal salone',
            emptyHint: 'Qui trovi le richieste che hai rifiutato o annullato tu.',
            accent: 'danger',
          })}
        </View>
      </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    paddingTop: 54,
    paddingBottom: 140,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  desktopColumns: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopColumnsStack: {
    flexDirection: 'column',
  },
  desktopColumnLeft: {
    flex: 1.08,
    marginRight: 16,
  },
  desktopColumnRight: {
    flex: 0.92,
  },
  desktopColumnStack: {
    flex: undefined,
    width: '100%',
    marginRight: 0,
  },
  accordionSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: IS_ANDROID ? 22 : 18,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minHeight: 42,
    position: 'relative',
  },
  accordionHeaderText: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1,
    minHeight: 34,
    paddingRight: IS_ANDROID ? 34 : 38,
  },
  accordionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
    flex: 1,
    textAlign: 'left',
  },
  accordionTitleDanger: {
    color: '#0F172A',
  },
  accordionCount: {
    minWidth: 28,
    paddingHorizontal: IS_ANDROID ? 16 : 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '900',
    textAlign: 'center',
    maxWidth: IS_ANDROID ? 74 : undefined,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  accordionCountDanger: {
    backgroundColor: '#FDECEC',
    color: '#0F172A',
  },
  accordionChevronWrap: {
    position: 'absolute',
    right: 0,
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  accordionChevronWrapDanger: {
    backgroundColor: '#FDECEC',
    borderColor: 'transparent',
  },
  accordionChevronWrapExpanded: {
    shadowOpacity: 0.18,
  },
  accordionEmpty: {
    paddingTop: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupedList: {
    marginTop: 8,
    gap: 6,
  },
  dateGroup: {
    gap: 5,
  },
  dateGroupTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#455a78',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  dateGroupCards: {
    gap: 6,
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: IS_ANDROID ? 28 : 22,
    paddingTop: 0,
    paddingBottom: 14,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
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
    color: '#64748B',
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  subtitle: {
    maxWidth: 360,
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    marginTop: 14,
    marginBottom: 2,
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  autoAcceptCard: {
    marginTop: 14,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.04)',
    paddingHorizontal: IS_ANDROID ? 22 : 18,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    alignItems: 'center',
  },
  autoAcceptHeaderRow: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  autoAcceptHeaderTextWrap: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  autoAcceptTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  autoAcceptHint: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 360,
    width: '100%',
  },
  autoAcceptBadge: {
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 18 : 12,
    paddingVertical: 6,
    minWidth: IS_ANDROID ? 104 : 92,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  autoAcceptBadgeOn: {
    backgroundColor: '#EAF7F0',
    borderColor: 'transparent',
  },
  autoAcceptBadgeOff: {
    backgroundColor: '#FCEFE6',
    borderColor: 'transparent',
  },
  autoAcceptBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.2,
    width: '100%',
    textAlign: 'center',
  },
  autoAcceptBadgeTextOn: {
    color: '#0F172A',
  },
  autoAcceptBadgeTextOff: {
    color: '#0F172A',
  },
  autoAcceptToggle: {
    marginTop: 14,
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 26 : 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: IS_ANDROID ? 296 : 270,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  autoAcceptToggleOn: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
    borderWidth: 1,
    shadowColor: '#16A34A',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  autoAcceptToggleOff: {
    backgroundColor: '#0F172A',
    borderColor: 'transparent',
  },
  autoAcceptToggleText: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    width: '100%',
  },
  autoAcceptToggleTextOn: {
    color: '#FFFFFF',
  },
  autoAcceptToggleTextOff: {
    color: '#FFFFFF',
  },
  guidedSlotOptionGroup: {
    width: '100%',
    marginTop: 16,
    alignItems: 'center',
  },
  guidedSlotOptionGroupTight: {
    marginTop: 12,
  },
  guidedSlotOptionLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: '#475569',
    textAlign: 'center',
    marginBottom: 10,
  },
  guidedSlotChipRow: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  guidedSlotChip: {
    minHeight: 38,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#D9E2EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guidedSlotChipWide: {
    minWidth: 150,
  },
  guidedSlotChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  guidedSlotChipDisabled: {
    opacity: 0.45,
  },
  guidedSlotChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  guidedSlotChipTextActive: {
    color: '#FFFFFF',
  },
  guidedSlotChipTextDisabled: {
    color: '#64748B',
  },
  heroStatsGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 10,
    marginBottom: 6,
    gap: IS_ANDROID ? 10 : 12,
  },
  heroStatsColumn: {
    flex: 1,
    gap: 12,
  },
  heroStatCard: {
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 20 : 14,
    paddingVertical: 14,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatCardBlue: {
    backgroundColor: '#EAF1FB',
    borderColor: 'transparent',
  },
  heroStatCardMint: {
    backgroundColor: '#EAF7F0',
    borderColor: 'transparent',
  },
  heroStatCardOrange: {
    backgroundColor: '#FCEFE6',
    borderColor: 'transparent',
  },
  heroStatCardRed: {
    backgroundColor: '#FDECEC',
    borderColor: 'transparent',
  },
  heroStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    width: '100%',
    textAlign: 'center',
  },
  heroStatLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
    width: '100%',
  },
  heroStatLabelSalon: {
    color: '#0F172A',
  },
  heroStatLabelRed: {
    color: '#0F172A',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1a1816',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#e8eef5',
    borderRadius: 26,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.85,
    borderColor: '#869fbc',
    borderTopWidth: 2.35,
    borderTopColor: '#dde7f2',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#666666',
    textAlign: 'center',
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: IS_ANDROID ? 20 : 16,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  wideCard: {
    maxWidth: 980,
    alignSelf: 'center',
    width: '100%',
  },
  requestTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  requestHeaderText: {
    flex: 1,
    paddingRight: 4,
    alignItems: 'flex-start',
  },
  requestName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'left',
    width: '100%',
  },
  requestMeta: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'left',
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: '#EAF1FB',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 16 : 10,
    paddingVertical: 5,
    minWidth: 74,
    maxWidth: IS_ANDROID ? '48%' : '44%',
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBadgeCancelled: {
    backgroundColor: '#FDECEC',
    borderColor: 'transparent',
  },
  pendingBadgeText: {
    color: '#0F172A',
    fontSize: 11,
    fontWeight: '900',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
    width: '100%',
    textAlign: 'center',
  },
  pendingBadgeTextCancelled: {
    color: '#B91C1C',
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  infoBox: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 13,
    lineHeight: 16,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    lineHeight: 20,
    color: '#0F172A',
    fontWeight: '600',
    textAlign: 'left',
  },
  contactPanel: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: 8,
  },
  contactLine: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748B',
    textAlign: 'left',
    marginTop: 4,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    alignItems: 'center',
    columnGap: 10,
    rowGap: 8,
    marginTop: 10,
  },
  quickActionChip: {
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 10,
    borderWidth: 0,
    borderColor: 'transparent',
    minWidth: 112,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionChipWhatsapp: {
    backgroundColor: '#EAF7F0',
    borderColor: 'transparent',
  },
  quickActionChipInstagram: {
    backgroundColor: '#F8FAFC',
    borderColor: 'transparent',
  },
  quickActionChipText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    paddingHorizontal: IS_ANDROID ? 4 : 0,
  },
  quickActionChipWhatsappText: {
    color: '#166534',
  },
  quickActionChipInstagramText: {
    color: '#0F172A',
  },
  noteText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#64748B',
    marginTop: 8,
    textAlign: 'left',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  acceptButton: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 0,
    borderColor: 'transparent',
  },
  acceptButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#FDECEC',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonDisabled: {
    opacity: 0.58,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: IS_ANDROID ? 20 : 16,
    marginBottom: 14,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18,
    elevation: 4,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 4,
  },
  historyHeaderText: {
    flex: 1,
    paddingRight: 4,
  },
  historyTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'left',
    width: '100%',
  },
  historyMeta: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'left',
    marginTop: 2,
  },
  historySummaryRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
  },
  historySummaryChip: {
    flex: 1,
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'flex-start',
  },
  historySummaryLabel: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  historySummaryValue: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: '#0F172A',
  },
  historyBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: IS_ANDROID ? 16 : 10,
    paddingVertical: 5,
    maxWidth: IS_ANDROID ? '48%' : '44%',
    borderWidth: 0,
  },
  historyBadgeAccepted: {
    backgroundColor: '#EAF7F0',
    borderColor: 'transparent',
  },
  historyBadgeRejected: {
    backgroundColor: '#FDECEC',
    borderColor: 'transparent',
  },
  historyBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    width: '100%',
    textAlign: 'center',
  },
  historyBadgeTextAccepted: {
    color: '#166534',
  },
  historyBadgeTextRejected: {
    color: '#B91C1C',
  },
});
