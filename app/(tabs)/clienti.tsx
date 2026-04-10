import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
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
import { ClearableTextInput } from '../../components/ui/clearable-text-input';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { KeyboardNextToolbar } from '../../components/ui/keyboard-next-toolbar';
import { NativeDatePickerModal } from '../../components/ui/native-date-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { focusNextInput, useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { haptic } from '../../src/lib/haptics';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { formatCustomerFullNameValue } from '../../src/lib/customer-name';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../../src/lib/validators';

type ClienteItem = {
  id: string;
  uiKey?: string;
  full_name: string;
  phone: string;
  email?: string | null;
  instagram?: string | null;
  birthday?: string | null;
  is_active?: boolean;
  viewedBySalon?: boolean;
  annullamentiCount?: number;
  maxFutureAppointments?: number | null;
  salon_id: string;
};

type ClienteSection = {
  key: string;
  title: string;
  sortValue: number;
  items: ClienteItem[];
};

const buildDialablePhone = (value: string) => value.replace(/[^\d+]/g, '');
const buildWhatsappUrl = (value: string) => {
  const normalized = buildDialablePhone(value).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}` : '';
};
const buildInstagramUrl = (value?: string | null) => {
  const handle = value?.replace(/^@+/, '').trim();
  return handle ? `https://instagram.com/${handle}` : '';
};
const IS_ANDROID = Platform.OS === 'android';
const DEFAULT_PUBLIC_CLIENT_BASE_URL = 'https://salon-manager-puce.vercel.app';
const CUSTOMER_REMINDER_HOUR_OPTIONS = [0, 1, 2, 3, 6, 12, 24, 48] as const;

const formatReminderHoursLabel = (hours: number) => {
  if (hours <= 0) {
    return 'Disattivati';
  }

  if (hours === 1) {
    return '1 ora prima';
  }

  return `${hours} ore prima`;
};

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

const buildWhatsappTextUrl = (phone: string, text: string) => {
  const normalized = buildDialablePhone(phone).replace(/^\+/, '');
  return normalized ? `https://wa.me/${normalized}?text=${encodeURIComponent(text)}` : '';
};

const normalizeBirthdayValue = (value?: string | null) => {
  const trimmedValue = value?.trim() ?? '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const slashDateMatch = trimmedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDateMatch) {
    const [, day, month, year] = slashDateMatch;
    return `${year}-${month}-${day}`;
  }

  return '';
};

const formatBirthdayLabel = (value?: string | null) => {
  const normalizedValue = normalizeBirthdayValue(value);
  if (!normalizedValue) return '';

  const [year, month, day] = normalizedValue.split('-');
  if (!year || !month || !day) return '';
  return `${day}/${month}/${year}`;
};

const buildClientMonogram = (fullName?: string | null) => {
  const tokens = (fullName ?? '')
    .trim()
    .split(/\s+/)
    .filter((item) => item.length > 0);

  if (tokens.length === 0) return '?';
  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  const nome = tokens[0];
  const cognome = tokens[tokens.length - 1];
  return `${nome.charAt(0)}${cognome.charAt(0)}`.toUpperCase();
};

function AnimatedChevron({ expanded }: { expanded: boolean }) {
  const rotation = useSharedValue(expanded ? 180 : 0);

  React.useEffect(() => {
    rotation.value = withTiming(expanded ? 180 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name="chevron-down" size={16} color="#475569" />
    </Animated.View>
  );
}

export default function ClientiScreen() {
  const responsive = useResponsiveLayout();
  const {
    salonWorkspace,
    setSalonWorkspace,
    salonAccountEmail,
    clienti: localClienti,
    setClienti: setLocalClienti,
    updateClientePersisted,
    deleteClientePersisted,
  } = useAppContext();
  const listContainerRef = useRef<View | null>(null);
  const listRef = useRef<FlatList<{ key: string; sections: ClienteSection[] }> | null>(null);
  const clientCardRefs = useRef<Record<string, any | null>>({});
  const swipeableRefs = useRef<Record<string, Swipeable | null>>({});
  const visibilityCheckFrameRef = useRef<number | null>(null);
  const deleteUndoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleVisibleFrontendClientsCheckRef = useRef<() => void>(() => {});
  const nameInputRef = useRef<TextInput | null>(null);
  const phoneInputRef = useRef<TextInput | null>(null);
  const emailInputRef = useRef<TextInput | null>(null);
  const instagramInputRef = useRef<TextInput | null>(null);

  const [clienteInModifica, setClienteInModifica] = useState<ClienteItem | null>(null);

  const [nome, setNome] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [birthday, setBirthday] = useState('');
  const [showBirthdayPicker, setShowBirthdayPicker] = useState(false);
  const [ricerca, setRicerca] = useState('');

  const [loadingInit, setLoadingInit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDeletedClient, setPendingDeletedClient] = useState<{
    item: (typeof localClienti)[number];
    previousIndex: number;
  } | null>(null);
  const [showRubricaExpanded, setShowRubricaExpanded] = useState(true);
  const [formErrors, setFormErrors] = useState<{
    nome?: string;
    telefono?: string;
    email?: string;
  }>({});
  const { focusField, scrollToField } = useKeyboardAwareScroll(listRef, {
    topOffset: responsive.isDesktop ? 40 : 24,
  });
  const handleKeyboardNext = useCallback(() => {
    focusNextInput([nameInputRef, phoneInputRef, emailInputRef, instagramInputRef], focusField);
  }, [focusField]);
  const canSubmitClienteRequired = nome.trim() !== '' && telefono.trim() !== '';

  const mapLocalClientsToScreen = useCallback(
    (items: typeof localClienti, fallbackSalonId: string) =>
      items.map((item) => ({
        id: item.id,
        full_name: item.nome,
        phone: item.telefono,
        email: item.email ?? null,
        instagram: item.instagram ?? null,
        birthday: item.birthday ?? null,
        is_active: item.inibito !== true,
        viewedBySalon: item.viewedBySalon,
        annullamentiCount: item.annullamentiCount ?? 0,
        maxFutureAppointments:
          typeof item.maxFutureAppointments === 'number' && item.maxFutureAppointments >= 0
            ? item.maxFutureAppointments
            : null,
        salon_id: fallbackSalonId,
      })),
    []
  );

  const clienti = useMemo(
    () => mapLocalClientsToScreen(localClienti, salonWorkspace.id),
    [localClienti, mapLocalClientsToScreen, salonWorkspace.id]
  );

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

  const publicBookingLink = useMemo(
    () => buildSalonClientLink(parsedPublicClientBaseUrl, salonWorkspace.salonCode),
    [parsedPublicClientBaseUrl, salonWorkspace.salonCode]
  );
  const customerReminderHoursBefore = Math.max(
    0,
    Math.min(168, Math.round(salonWorkspace.customerReminderHoursBefore ?? 24))
  );

  const updateCustomerReminderHours = useCallback(
    (hours: number) => {
      const normalizedHours = Math.max(0, Math.min(168, Math.round(hours)));
      setSalonWorkspace((current) => ({
        ...current,
        customerReminderHoursBefore: normalizedHours,
        updatedAt: new Date().toISOString(),
      }));
    },
    [setSalonWorkspace]
  );

  const unreadFrontendClientIds = useMemo(
    () =>
      localClienti
        .filter((item) => item.fonte === 'frontend' && item.viewedBySalon !== true)
        .map((item) => item.id),
    [localClienti]
  );

  const buildClientViewKey = useCallback((item: (typeof localClienti)[number]) => {
    const normalizedEmail = (item.email ?? '').trim().toLowerCase();
    if (normalizedEmail) return `email:${normalizedEmail}`;

    const normalizedPhone = (item.telefono ?? '').replace(/\D+/g, '');
    if (normalizedPhone) return `phone:${normalizedPhone}`;

    const normalizedName = (item.nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalizedName) return `name:${normalizedName}`;

    return `id:${item.id}`;
  }, []);

  const matchesClientIdentity = useCallback(
    (
      candidate: (typeof localClienti)[number],
      target: {
        id?: string | null;
        nome?: string | null;
        telefono?: string | null;
        email?: string | null;
      }
    ) => {
      const normalizedTargetId = (target.id ?? '').trim();
      if (normalizedTargetId && candidate.id === normalizedTargetId) {
        return true;
      }

      const candidateEmail = (candidate.email ?? '').trim().toLowerCase();
      const targetEmail = (target.email ?? '').trim().toLowerCase();
      if (candidateEmail && targetEmail && candidateEmail === targetEmail) {
        return true;
      }

      const candidatePhone = (candidate.telefono ?? '').replace(/\D+/g, '');
      const targetPhone = (target.telefono ?? '').replace(/\D+/g, '');
      if (candidatePhone && targetPhone && candidatePhone === targetPhone) {
        return true;
      }

      const candidateName = (candidate.nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      const targetName = (target.nome ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
      return !!candidateName && !!targetName && candidateName === targetName;
    },
    []
  );

  const markFrontendClientsAsViewed = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;

      const idsSet = new Set(ids);
      const normalizedEmail = salonAccountEmail.trim().toLowerCase();
      const viewedKeys = Array.from(
        new Set(
          localClienti
            .filter(
              (item) =>
                item.fonte === 'frontend' &&
                item.viewedBySalon !== true &&
                idsSet.has(item.id)
            )
            .map((item) => buildClientViewKey(item))
            .filter((item) => item.length > 0)
        )
      );

      setLocalClienti((current) => {
        let hasChanges = false;

        const nextClients = current.map((item) => {
          if (
            item.fonte === 'frontend' &&
            item.viewedBySalon !== true &&
            idsSet.has(item.id)
          ) {
            hasChanges = true;
            return { ...item, viewedBySalon: true };
          }

          return item;
        });

        return hasChanges ? nextClients : current;
      });

      if (!normalizedEmail) {
        return;
      }

      const storageKey = `salon_manager_viewed_client_ids__${normalizedEmail}`;
      const storageKeyByFields = `salon_manager_viewed_client_keys__${normalizedEmail}`;

      Promise.all([AsyncStorage.getItem(storageKey), AsyncStorage.getItem(storageKeyByFields)])
        .then(([raw, rawByFields]) => {
          const parsed = raw ? (JSON.parse(raw) as unknown) : [];
          const parsedByFields = rawByFields ? (JSON.parse(rawByFields) as unknown) : [];
          const currentIds = Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === 'string')
            : [];
          const currentKeys = Array.isArray(parsedByFields)
            ? parsedByFields.filter((item): item is string => typeof item === 'string')
            : [];
          const merged = Array.from(new Set([...currentIds, ...ids]));
          const mergedKeys = Array.from(new Set([...currentKeys, ...viewedKeys]));

          return Promise.all([
            AsyncStorage.setItem(storageKey, JSON.stringify(merged)),
            AsyncStorage.setItem(storageKeyByFields, JSON.stringify(mergedKeys)),
          ]);
        })
        .catch(() => {
          // Non bloccare UX notifiche in caso di errore storage locale.
        });
    },
    [buildClientViewKey, localClienti, salonAccountEmail, setLocalClienti]
  );

  const clearScheduledVisibilityCheck = useCallback(() => {
    if (visibilityCheckFrameRef.current !== null) {
      cancelAnimationFrame(visibilityCheckFrameRef.current);
      visibilityCheckFrameRef.current = null;
    }
  }, []);

  const checkVisibleFrontendClients = useCallback(() => {
    if (unreadFrontendClientIds.length === 0) return;

    const listContainer = listContainerRef.current;
    if (!listContainer) return;

    listContainer.measureInWindow((containerX, containerY, containerWidth, containerHeight) => {
      if (containerWidth <= 0 || containerHeight <= 0) return;

      const visibleTop = containerY + 16;
      const visibleBottom = containerY + containerHeight - 16;
      const idsToMark: string[] = [];
      let pendingMeasures = unreadFrontendClientIds.length;

      const finishMeasure = () => {
        pendingMeasures -= 1;

        if (pendingMeasures === 0 && idsToMark.length > 0) {
          markFrontendClientsAsViewed(idsToMark);
        }
      };

      unreadFrontendClientIds.forEach((clientId) => {
        const cardRef = clientCardRefs.current[clientId];

        if (!cardRef) {
          finishMeasure();
          return;
        }

        cardRef.measureInWindow((x: number, y: number, width: number, height: number) => {
          if (width > 0 && height > 0) {
            const cardMidpoint = y + height / 2;

            if (cardMidpoint >= visibleTop && cardMidpoint <= visibleBottom) {
              idsToMark.push(clientId);
            }
          }

          finishMeasure();
        });
      });
    });
  }, [markFrontendClientsAsViewed, unreadFrontendClientIds]);

  const scheduleVisibleFrontendClientsCheck = useCallback(() => {
    clearScheduledVisibilityCheck();

    if (unreadFrontendClientIds.length === 0) return;

    visibilityCheckFrameRef.current = requestAnimationFrame(() => {
      visibilityCheckFrameRef.current = null;
      checkVisibleFrontendClients();
    });
  }, [checkVisibleFrontendClients, clearScheduledVisibilityCheck, unreadFrontendClientIds.length]);

  React.useEffect(() => clearScheduledVisibilityCheck, [clearScheduledVisibilityCheck]);

  React.useEffect(() => {
    return () => {
      if (deleteUndoTimeoutRef.current) {
        clearTimeout(deleteUndoTimeoutRef.current);
        deleteUndoTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    scheduleVisibleFrontendClientsCheckRef.current = scheduleVisibleFrontendClientsCheck;
  }, [scheduleVisibleFrontendClientsCheck]);

  React.useEffect(() => {
    scheduleVisibleFrontendClientsCheck();
  }, [scheduleVisibleFrontendClientsCheck, localClienti, ricerca]);

  useFocusEffect(
    useCallback(() => {
      requestAnimationFrame(() => {
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
        scheduleVisibleFrontendClientsCheckRef.current();
      });

      Object.values(swipeableRefs.current).forEach((ref) => ref?.close());

      return () => {
        clearScheduledVisibilityCheck();
      };
    }, [clearScheduledVisibilityCheck])
  );

  const pulisciCampi = () => {
    setNome('');
    setTelefono('');
    setEmail('');
    setInstagram('');
    setBirthday('');
    setFormErrors({});
    setClienteInModifica(null);
  };

  const preparaModificaCliente = (cliente: ClienteItem) => {
    setClienteInModifica(cliente);
    setNome(cliente.full_name ?? '');
    setTelefono(cliente.phone ?? '');
    setEmail(cliente.email ?? '');
    setInstagram(cliente.instagram ?? '');
    setBirthday(normalizeBirthdayValue(cliente.birthday));
  };

  const apriModificaCliente = useCallback((cliente: ClienteItem) => {
    swipeableRefs.current[cliente.id]?.close();
    preparaModificaCliente(cliente);
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      focusField(nameInputRef);
    });
  }, [focusField]);

  const impostaLimiteAppuntamentiCliente = useCallback((cliente: ClienteItem) => {
    swipeableRefs.current[cliente.id]?.close();

    const applyLimit = (nextLimit: number | null) => {
      setLocalClienti((current) =>
        current.map((item) =>
          item.id === cliente.id
            ? {
                ...item,
                maxFutureAppointments: nextLimit,
              }
            : item
        )
      );
    };

    Alert.alert(
      'Limite appuntamenti futuri',
      `Imposta quanti appuntamenti futuri online puo avere ${cliente.full_name}.`,
      [
        { text: 'Annulla', style: 'cancel' },
        { text: 'Nessun limite', onPress: () => applyLimit(null) },
        { text: 'Massimo 1', onPress: () => applyLimit(1) },
        { text: 'Massimo 3', onPress: () => applyLimit(3) },
      ]
    );
  }, [setLocalClienti]);

  const salvaCliente = async () => {
    const invalidFields: string[] = [];
    const nextErrors: {
      nome?: string;
      telefono?: string;
      email?: string;
    } = {};

    if (!nome.trim()) {
      invalidFields.push('Nome e cognome obbligatorio');
      nextErrors.nome = 'Nome e cognome obbligatorio';
    }

    if (!telefono.trim()) {
      invalidFields.push('Numero di telefono obbligatorio');
      nextErrors.telefono = 'Numero di telefono obbligatorio';
    } else if (!isValidPhone10(telefono)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
      nextErrors.telefono = 'Numero di telefono errato (deve avere 10 cifre)';
    }

    if (email.trim() && !isValidEmail(email)) {
      invalidFields.push('Email non valida');
      nextErrors.email = 'Email non valida';
    }

    if (invalidFields.length > 0) {
      setFormErrors(nextErrors);
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setFormErrors({});

    try {
      setSaving(true);
      const normalizedFullName = formatCustomerFullNameValue(nome);
      const normalizedPhone = telefono.trim();
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedInstagram = instagram.trim();
      const normalizedBirthday = birthday.trim();

      if (clienteInModifica) {
        const result = await updateClientePersisted(
          {
            id: clienteInModifica.id,
            nome: clienteInModifica.full_name,
            telefono: clienteInModifica.phone,
            email: clienteInModifica.email ?? '',
          },
          {
            nome: normalizedFullName,
            telefono: normalizedPhone,
            email: normalizedEmail || '',
            instagram: normalizedInstagram || '',
            birthday: normalizedBirthday || '',
          }
        );

        if (!result.ok) {
          setSaving(false);
          Alert.alert('Errore', result.error || 'Non sono riuscito ad aggiornare il cliente.');
          return;
        }

        setSaving(false);
        pulisciCampi();
        Alert.alert('OK', 'Cliente aggiornato');
        return;
      }

      setLocalClienti((current) => [
        {
          id: `cliente-${Date.now()}`,
          nome: normalizedFullName,
          telefono: normalizedPhone,
          email: normalizedEmail || '',
          instagram: normalizedInstagram || '',
          birthday: normalizedBirthday || '',
          nota: '',
          fonte: 'salone',
          viewedBySalon: true,
          annullamentiCount: 0,
          inibito: false,
          maxFutureAppointments: 3,
        },
        ...current,
      ]);

      setSaving(false);

      pulisciCampi();
      Alert.alert('OK', 'Cliente aggiunto');
    } catch (e: any) {
      setSaving(false);
      Alert.alert('Errore generale', e.message);
    }
  };

  const eliminaCliente = async (id: string, nomeCliente: string) => {
    Alert.alert('Conferma', `Vuoi eliminare ${nomeCliente}?`, [
      { text: 'Annulla', style: 'cancel' },
      {
        text: 'Elimina',
        style: 'destructive',
        onPress: async () => {
          const previousIndex = localClienti.findIndex((item) => item.id === id);
          if (previousIndex < 0) {
            return;
          }

          const item = localClienti[previousIndex];
          setPendingDeletedClient({ item, previousIndex });

          if (deleteUndoTimeoutRef.current) {
            clearTimeout(deleteUndoTimeoutRef.current);
            deleteUndoTimeoutRef.current = null;
          }
          setLocalClienti((current) => current.filter((entry) => entry.id !== id));

          deleteUndoTimeoutRef.current = setTimeout(() => {
            void deleteClientePersisted({
              id,
              nome: item.nome,
              telefono: item.telefono,
              email: item.email,
            }).then((result) => {
              if (!result.ok) {
                setLocalClienti((current) => {
                  if (current.some((entry) => entry.id === item.id)) {
                    return current;
                  }

                  const next = [...current];
                  const insertIndex = Math.max(0, Math.min(previousIndex, next.length));
                  next.splice(insertIndex, 0, item);
                  return next;
                });
                Alert.alert('Errore', result.error || 'Non sono riuscito a eliminare il cliente.');
              }
            });

            setPendingDeletedClient(null);
            deleteUndoTimeoutRef.current = null;
          }, 3000);

          if (clienteInModifica?.id === id) {
            pulisciCampi();
          }
        },
      },
    ]);
  };

  const annullaEliminazioneCliente = useCallback(() => {
    if (!pendingDeletedClient) {
      return;
    }

    if (deleteUndoTimeoutRef.current) {
      clearTimeout(deleteUndoTimeoutRef.current);
      deleteUndoTimeoutRef.current = null;
    }

    setLocalClienti((current) => {
      if (current.some((item) => item.id === pendingDeletedClient.item.id)) {
        return current;
      }

      const next = [...current];
      const insertIndex = Math.max(0, Math.min(pendingDeletedClient.previousIndex, next.length));
      next.splice(insertIndex, 0, pendingDeletedClient.item);
      return next;
    });

    setPendingDeletedClient(null);
  }, [pendingDeletedClient, setLocalClienti]);

  const toggleInibizioneCliente = async (cliente: ClienteItem) => {
    const isCurrentlyActive = cliente.is_active ?? true;
    const nextIsActive = !isCurrentlyActive;
    const actionLabel = nextIsActive ? 'sbloccare' : 'inibire';

    Alert.alert(
      'Conferma',
      nextIsActive
        ? `${cliente.full_name} tornerà a vedere gli slot disponibili e potrà prenotare di nuovo.`
        : `${cliente.full_name} vedrà tutti gli slot occupati finché non lo sblocchi.`,
      [
        { text: 'Annulla', style: 'cancel' },
        {
          text: nextIsActive ? 'Sblocca' : 'Inibisci',
          style: nextIsActive ? 'default' : 'destructive',
          onPress: async () => {
            try {
              swipeableRefs.current[cliente.id]?.close();
              const targetClient = localClienti.find((item) => item.id === cliente.id);
              setLocalClienti((current) =>
                current.map((item) =>
                  matchesClientIdentity(item, {
                    id: cliente.id,
                    nome: targetClient?.nome ?? cliente.full_name,
                    telefono: targetClient?.telefono ?? cliente.phone,
                    email: targetClient?.email ?? cliente.email ?? '',
                  })
                    ? { ...item, inibito: !nextIsActive }
                    : item
                )
              );
            } catch (error: any) {
              Alert.alert('Errore', error?.message || `Non sono riuscito a ${actionLabel} il cliente.`);
            }
          },
        },
      ]
    );
  };

  const clientiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) return clienti;

    return clienti.filter((item) => {
      const nomeMatch = item.full_name?.toLowerCase().includes(testo);
      const telefonoMatch = item.phone?.toLowerCase().includes(testo);
      const emailMatch = item.email?.toLowerCase().includes(testo);
      const instagramMatch = item.instagram?.toLowerCase().includes(testo);
      return nomeMatch || telefonoMatch || emailMatch || instagramMatch;
    });
  }, [clienti, ricerca]);

  const clientiSections = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('it-IT', {
      month: 'long',
      year: 'numeric',
    });

    const parseAddedDate = (item: ClienteItem) => {
      const timestampMatch = item.id.match(/(\d{13}|\d{10})$/);
      if (!timestampMatch) return null;

      const raw = Number(timestampMatch[1]);
      if (Number.isNaN(raw) || raw <= 0) return null;

      const milliseconds = timestampMatch[1].length === 10 ? raw * 1000 : raw;
      const date = new Date(milliseconds);
      if (Number.isNaN(date.getTime())) return null;
      return date;
    };

    const monthKeyFromDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      return `${year}-${month}`;
    };

    const titleFromDate = (date: Date) => {
      const localized = formatter.format(date);
      return localized.charAt(0).toUpperCase() + localized.slice(1);
    };

    const bySection = new Map<string, ClienteSection>();

    clientiFiltrati.forEach((item) => {
      const addedAt = parseAddedDate(item);
      const currentYear = new Date().getFullYear();
      const isCurrentYear = !!addedAt && addedAt.getFullYear() === currentYear;
      const sectionKey = addedAt
        ? isCurrentYear
          ? monthKeyFromDate(addedAt)
          : `year-${addedAt.getFullYear()}`
        : 'unknown';
      const sectionTitle = addedAt
        ? isCurrentYear
          ? titleFromDate(addedAt)
          : `Clienti ${addedAt.getFullYear()}`
        : 'Data non disponibile';
      const sectionSort = addedAt
        ? isCurrentYear
          ? addedAt.getFullYear() * 100 + (addedAt.getMonth() + 1)
          : addedAt.getFullYear() * 100
        : -1;

      const current = bySection.get(sectionKey);
      if (!current) {
        bySection.set(sectionKey, {
          key: sectionKey,
          title: sectionTitle,
          sortValue: sectionSort,
          items: [item],
        });
        return;
      }

      current.items.push(item);
    });

    return Array.from(bySection.values())
      .sort((left, right) => right.sortValue - left.sortValue)
      .map((section) => ({
        ...section,
        items: section.items
          .sort((left, right) => left.full_name.localeCompare(right.full_name))
          .map((item, index) => ({
            ...item,
            uiKey: [
              section.key,
              item.id,
              item.phone?.trim() ?? '',
              item.email?.trim().toLowerCase() ?? '',
              index,
            ].join('::'),
          })),
      }));
  }, [clientiFiltrati]);

  const clientiUnifiedList = useMemo(
    () => (clientiSections.length > 0 ? [{ key: 'rubrica-unificata', sections: clientiSections }] : []),
    [clientiSections]
  );

  const cancellationAlertsCount = useMemo(
    () => clienti.reduce((total, item) => total + (item.annullamentiCount ?? 0), 0),
    [clienti]
  );

  const renderClienteCard = (item: ClienteItem) => {
    const isInibito = (item.is_active ?? true) === false;
    const instagramHandle = item.instagram?.replace(/^@+/, '') ?? '';
    const canOpenInstagram = instagramHandle.trim() !== '';
    const cancellationCount = item.annullamentiCount ?? 0;
    const hasCancellationAlert = cancellationCount > 0;
    const clientBookingInviteText = publicBookingLink
      ? `Ciao ${item.full_name.split(' ')[0] || ''}, per prenotare dal frontend usa questo link: ${publicBookingLink}`
      : '';
    const qrShareUrl =
      publicBookingLink && item.phone
        ? buildWhatsappTextUrl(item.phone, clientBookingInviteText)
        : '';

    const renderLeftActions = () => (
      <View style={styles.swipeActionsRowLeft}>
        <HapticTouchable
          style={[styles.swipeActionButton, styles.swipeActionEdit]}
          onPress={() => apriModificaCliente(item)}
          activeOpacity={0.92}
        >
          <Text style={styles.swipeActionLabel}>Modifica</Text>
        </HapticTouchable>
        <HapticTouchable
          style={[styles.swipeActionButton, styles.swipeActionLimit]}
          onPress={() => impostaLimiteAppuntamentiCliente(item)}
          activeOpacity={0.92}
        >
          <Text
            style={[styles.swipeActionLabel, styles.swipeActionLabelLimit]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.68}
          >
            {typeof item.maxFutureAppointments === 'number'
              ? `Limite\n${item.maxFutureAppointments} pren.`
              : 'Limite\nprenotazioni'}
          </Text>
        </HapticTouchable>
        <HapticTouchable
          style={[
            styles.swipeActionButton,
            isInibito ? styles.swipeActionUnlock : styles.swipeActionBlock,
          ]}
          onPress={() => toggleInibizioneCliente(item)}
          activeOpacity={0.92}
        >
          <Text
            style={[
              styles.swipeActionLabel,
              isInibito ? styles.swipeActionLabelUnlock : styles.swipeActionLabelBlock,
            ]}
          >
            {isInibito ? 'Sblocca' : 'Inibisci'}
          </Text>
        </HapticTouchable>
      </View>
    );

    const renderRightActions = () => (
      <HapticTouchable
        style={[styles.swipeActionButton, styles.swipeActionDelete]}
        onPress={() => {
          swipeableRefs.current[item.id]?.close();
          eliminaCliente(item.id, item.full_name);
        }}
        activeOpacity={0.92}
      >
        <Text style={[styles.swipeActionLabel, styles.swipeActionLabelDelete]}>Elimina</Text>
      </HapticTouchable>
    );

    return (
      <Swipeable
        ref={(ref) => {
          swipeableRefs.current[item.id] = ref;
        }}
        renderLeftActions={renderLeftActions}
        renderRightActions={renderRightActions}
        friction={1.04}
        overshootLeft={false}
        overshootRight={false}
        overshootFriction={10}
        dragOffsetFromLeftEdge={10}
        dragOffsetFromRightEdge={10}
        leftThreshold={18}
        rightThreshold={18}
      >
        <HapticTouchable
          activeOpacity={1}
          hapticType="none"
          pressScale={0.985}
          pressOpacity={0.985}
          style={[
            styles.clienteCard,
            clienteInModifica?.id === item.id && styles.clienteCardSelected,
          ]}
        >
          <View style={styles.clienteMain}>
            <View style={styles.clienteTopRow}>
              <View style={styles.clienteInitialBadge}>
                <Text style={styles.clienteInitialText}>{buildClientMonogram(item.full_name)}</Text>
              </View>
              <View style={styles.clienteNomeWrap}>
                <Text style={styles.clienteNome} numberOfLines={1}>
                  {item.full_name}
                </Text>
              </View>
              {hasCancellationAlert ? (
                <Animated.View
                  style={styles.statusBadgeCancelledFloating}
                  entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                >
                  <Text
                    style={styles.statusBadgeCancelledText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.74}
                  >
                    Annullati: {cancellationCount}
                  </Text>
                </Animated.View>
              ) : null}
            </View>

            {typeof item.maxFutureAppointments === 'number' ? (
              <View style={styles.statusBadgeLimit}>
                <Text style={styles.statusBadgeLimitText}>
                  Max futuri: {item.maxFutureAppointments}
                </Text>
              </View>
            ) : null}

            <View style={styles.clienteContactStack}>
              <Text
                style={styles.clienteTelefono}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {item.phone}
              </Text>
              <Text
                style={styles.clienteEmailCompact}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {item.email || 'Nessuna email'}
              </Text>
            </View>

            <View style={styles.quickActionsRow}>
                <HapticTouchable
                  style={styles.quickActionChip}
                  onPress={() => Linking.openURL(`tel:${buildDialablePhone(item.phone)}`).catch(() => null)}
                  pressScale={0.97}
                  pressOpacity={0.97}
                >
                  <Text
                    style={styles.quickActionText}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.76}
                  >
                    Chiama
                  </Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.quickActionChip, styles.quickActionChipWhatsapp]}
                  onPress={() => Linking.openURL(buildWhatsappUrl(item.phone)).catch(() => null)}
                  pressScale={0.97}
                  pressOpacity={0.97}
                >
                  <Text
                    style={[styles.quickActionText, styles.quickActionTextWhatsapp]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    WhatsApp
                  </Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.quickActionChip, styles.quickActionChipInstagram, !canOpenInstagram && styles.quickActionChipDisabled]}
                  onPress={() => {
                    if (!canOpenInstagram) return;
                    Linking.openURL(buildInstagramUrl(item.instagram) || '').catch(() => null);
                  }}
                  pressScale={0.97}
                  pressOpacity={0.97}
                  disabled={!canOpenInstagram}
                >
                  <Text
                    style={[styles.quickActionText, styles.quickActionTextInstagram]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.72}
                  >
                    Instagram
                  </Text>
                </HapticTouchable>
                <HapticTouchable
                  style={[styles.quickActionChip, styles.quickActionChipQr, (!qrShareUrl || isInibito) && styles.quickActionChipDisabled]}
                  onPress={() => {
                    if (!qrShareUrl || isInibito) return;
                    Linking.openURL(qrShareUrl).catch(() => null);
                  }}
                  pressScale={0.97}
                  pressOpacity={0.97}
                  disabled={!qrShareUrl || isInibito}
                >
                  <Text
                    style={[styles.quickActionText, styles.quickActionTextQr]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.66}
                  >
                    Invio QR
                  </Text>
                </HapticTouchable>
            </View>

            <View style={styles.cardTrailingMeta}>
              <View style={styles.cardTrailingMetaHintRow}>
                <View style={styles.cardTrailingMetaHintPill}>
                  <Ionicons name="swap-horizontal" size={16} color="#8f2d2d" />
                  <Text style={styles.cardTrailingMetaHint}>Scorri per azioni rapide</Text>
                </View>
              </View>
            </View>
          </View>
        </HapticTouchable>
      </Swipeable>
    );
  };

  return (
    <View
      ref={listContainerRef}
      style={styles.container}
      onLayout={scheduleVisibleFrontendClientsCheck}
    >
      <FlatList
        ref={listRef}
        data={clientiUnifiedList}
        keyExtractor={(item) => item.key}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.listContent,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={() => {
          Keyboard.dismiss();
          Object.values(swipeableRefs.current).forEach((ref) => ref?.close());
        }}
        onScroll={scheduleVisibleFrontendClientsCheck}
        onMomentumScrollEnd={scheduleVisibleFrontendClientsCheck}
        onScrollEndDrag={scheduleVisibleFrontendClientsCheck}
        onContentSizeChange={scheduleVisibleFrontendClientsCheck}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="clienti"
                title="Clienti"
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                subtitle="Gestisci i clienti del tuo salone, aggiungili rapidamente e tieni tutto ordinato."
              />
            </View>

            <View style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <View style={styles.bookingHeaderLeft}>
                  <View style={styles.bookingHeadingRow}>
                    <Text
                      style={styles.bookingHeading}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                    >
                      {clienteInModifica ? 'Modifica cliente' : 'Nuovo cliente'}
                    </Text>
                  </View>
                  <Text style={styles.searchSubtitle}>
                    {loadingInit
                      ? 'Caricamento salone...'
                      : clienteInModifica
                      ? 'Stai modificando un cliente esistente.'
                        : 'Aggiungi o aggiorna rapidamente la rubrica del salone.'}
                  </Text>
                </View>

                <View style={styles.bookingBadgeRow}>
                  <Animated.View
                    style={[styles.bookingBadge, styles.bookingBadgeSuccess]}
                    entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                    layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                  >
                    <Text style={[styles.bookingBadgeText, styles.bookingBadgeSuccessText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>{clienti.length} clienti</Text>
                  </Animated.View>
                  <Animated.View
                    style={[styles.bookingBadge, styles.bookingBadgeAlert]}
                    entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                    layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                  >
                    <Text style={[styles.bookingBadgeText, styles.bookingBadgeAlertText]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.76}>
                      annullati {cancellationAlertsCount}
                    </Text>
                  </Animated.View>
                </View>
              </View>
                <>
                  <View style={styles.formFieldsWrap}>
                    <ClearableTextInput
                      ref={nameInputRef}
                      placeholder="Inserisci nome e cognome"
                      placeholderTextColor="#9a9a9a"
                      value={nome}
                      onChangeText={(value) => {
                        setNome(value);
                        if (formErrors.nome) {
                          setFormErrors((current) => ({ ...current, nome: undefined }));
                        }
                      }}
                      onFocus={() => scrollToField(nameInputRef)}
                      editable={!saving && !loadingInit}
                      style={[styles.input, formErrors.nome && styles.inputError]}
                      returnKeyType="next"
                      enterKeyHint="next"
                      onSubmitEditing={() => focusField(phoneInputRef)}
                      blurOnSubmit={false}
                    />
                    {formErrors.nome ? (
                      <Text style={styles.fieldErrorText}>{formErrors.nome}</Text>
                    ) : null}

                    <ClearableTextInput
                      ref={phoneInputRef}
                      placeholder="Inserisci numero di telefono"
                      placeholderTextColor="#9a9a9a"
                      value={telefono}
                      onChangeText={(value) => {
                        setTelefono(limitPhoneToTenDigits(value));
                        if (formErrors.telefono) {
                          setFormErrors((current) => ({ ...current, telefono: undefined }));
                        }
                      }}
                      onFocus={() => scrollToField(phoneInputRef)}
                      editable={!saving && !loadingInit}
                      keyboardType="phone-pad"
                      style={[styles.input, formErrors.telefono && styles.inputError]}
                      returnKeyType="next"
                      enterKeyHint="next"
                      onSubmitEditing={() => focusField(emailInputRef)}
                      blurOnSubmit={false}
                    />
                    {formErrors.telefono ? (
                      <Text style={styles.fieldErrorText}>{formErrors.telefono}</Text>
                    ) : null}

                    <ClearableTextInput
                      ref={emailInputRef}
                      placeholder="Email (Opzionale)"
                      placeholderTextColor="#9a9a9a"
                      value={email}
                      onChangeText={(value) => {
                        setEmail(value);
                        if (formErrors.email) {
                          setFormErrors((current) => ({ ...current, email: undefined }));
                        }
                      }}
                      onFocus={() => scrollToField(emailInputRef)}
                      editable={!saving && !loadingInit}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      style={[styles.input, formErrors.email && styles.inputError]}
                      returnKeyType="next"
                      enterKeyHint="next"
                      onSubmitEditing={() => focusField(instagramInputRef)}
                      blurOnSubmit={false}
                    />
                    {formErrors.email ? (
                      <Text style={styles.fieldErrorText}>{formErrors.email}</Text>
                    ) : null}

                    <ClearableTextInput
                      ref={instagramInputRef}
                      placeholder="Instagram (Opzionale)"
                      placeholderTextColor="#9a9a9a"
                      value={instagram}
                      onChangeText={setInstagram}
                      onFocus={() => scrollToField(instagramInputRef)}
                      editable={!saving && !loadingInit}
                      autoCapitalize="none"
                      style={styles.input}
                      returnKeyType="done"
                      enterKeyHint="done"
                      onSubmitEditing={() => {
                        Keyboard.dismiss();
                        requestAnimationFrame(() => {
                          setShowBirthdayPicker(true);
                        });
                      }}
                      blurOnSubmit={false}
                    />

                    <HapticTouchable
                      style={[
                        styles.input,
                        styles.dateInputButton,
                        (saving || loadingInit) && styles.primaryButtonDisabled,
                      ]}
                      onPress={() => {
                        Keyboard.dismiss();
                        setShowBirthdayPicker(true);
                      }}
                      disabled={saving || loadingInit}
                      pressScale={0.98}
                      pressOpacity={0.98}
                    >
                      <Text
                        style={[
                          styles.dateInputText,
                          !birthday && styles.dateInputPlaceholder,
                        ]}
                      >
                        {formatBirthdayLabel(birthday) || 'Compleanno / Data (Opzionale)'}
                      </Text>
                    </HapticTouchable>

                    {birthday ? (
                      <HapticTouchable
                        style={styles.clearDateChip}
                        onPress={() => setBirthday('')}
                        disabled={saving || loadingInit}
                        pressScale={0.98}
                        pressOpacity={0.98}
                      >
                        <Text style={styles.clearDateChipText}>Rimuovi data</Text>
                      </HapticTouchable>
                    ) : null}
                  </View>

                  <Text style={styles.requiredFieldsHint}>
                    Obbligatori: nome e cognome, numero di telefono.
                  </Text>

                  <View style={styles.actionRow}>
                    <HapticTouchable
                      style={[styles.secondaryButton, (saving || loadingInit) && styles.primaryButtonDisabled]}
                      onPress={pulisciCampi}
                      disabled={saving || loadingInit}
                      pressScale={0.975}
                      pressOpacity={0.98}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {clienteInModifica ? 'Annulla modifica' : 'Svuota'}
                      </Text>
                    </HapticTouchable>

                    <HapticTouchable
                      style={[
                        styles.primaryButtonInline,
                        (saving || loadingInit || !canSubmitClienteRequired) &&
                          styles.primaryButtonDisabled,
                      ]}
                      onPress={salvaCliente}
                      disabled={saving || loadingInit || !canSubmitClienteRequired}
                      pressScale={0.975}
                      pressOpacity={0.98}
                    >
                      <Text style={styles.primaryButtonText}>
                        {saving
                          ? 'Salvataggio...'
                          : clienteInModifica
                          ? 'Salva modifiche'
                          : 'Aggiungi cliente'}
                      </Text>
                    </HapticTouchable>
                  </View>
                </>
            </View>

            <View style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <Text style={styles.reminderTitle}>Promemoria push clienti</Text>
                <View
                  style={[
                    styles.reminderStatusBadge,
                    customerReminderHoursBefore > 0
                      ? styles.reminderStatusBadgeActive
                      : styles.reminderStatusBadgeMuted,
                  ]}
                >
                  <Text
                    style={[
                      styles.reminderStatusBadgeText,
                      customerReminderHoursBefore > 0
                        ? styles.reminderStatusBadgeTextActive
                        : styles.reminderStatusBadgeTextMuted,
                    ]}
                  >
                    {formatReminderHoursLabel(customerReminderHoursBefore)}
                  </Text>
                </View>
              </View>

              <Text style={styles.reminderDescription}>
                Il salone decide una sola regola per tutti gli appuntamenti. Il push memo parte
                solo per i clienti che hanno gia registrato il loro device.
              </Text>

              <View style={styles.reminderOptionsRow}>
                {CUSTOMER_REMINDER_HOUR_OPTIONS.map((hours) => {
                  const isActive = customerReminderHoursBefore === hours;
                  return (
                    <HapticTouchable
                      key={`reminder-hours-${hours}`}
                      style={[
                        styles.reminderOptionChip,
                        isActive && styles.reminderOptionChipActive,
                      ]}
                      onPress={() => updateCustomerReminderHours(hours)}
                      pressScale={0.98}
                      pressOpacity={0.96}
                    >
                      <Text
                        style={[
                          styles.reminderOptionChipText,
                          isActive && styles.reminderOptionChipTextActive,
                        ]}
                      >
                        {hours === 0 ? 'Off' : `${hours}h`}
                      </Text>
                    </HapticTouchable>
                  );
                })}
              </View>

              <View
                style={[
                  styles.reminderSummaryCard,
                  customerReminderHoursBefore > 0
                    ? styles.reminderSummaryCardActive
                    : styles.reminderSummaryCardMuted,
                ]}
              >
                <Text
                  style={[
                    styles.reminderSummaryText,
                    customerReminderHoursBefore > 0
                      ? styles.reminderSummaryTextActive
                      : styles.reminderSummaryTextMuted,
                  ]}
                >
                  {customerReminderHoursBefore > 0
                    ? `Promemoria push attivi: ${formatReminderHoursLabel(customerReminderHoursBefore)}`
                    : 'Promemoria push disattivati per tutti gli appuntamenti'}
                </Text>
              </View>

              <Text style={styles.reminderHint}>
                Template usato: promemoria cliente standard del salone. Se imposti Off, il memo
                push non viene inviato.
              </Text>
            </View>

          </View>
        }
        ListEmptyComponent={
          !loadingInit ? (
            <View style={[styles.emptyCard, { maxWidth: responsive.contentMaxWidth, alignSelf: 'center' }]}>
              <Text style={styles.emptyTitle}>
                {ricerca.trim() ? 'Nessun risultato trovato' : 'Nessun cliente presente'}
              </Text>
              <Text style={styles.emptyText}>
                {ricerca.trim()
                  ? 'Prova a cambiare ricerca.'
                  : 'Aggiungi il primo cliente usando il modulo qui sopra.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[styles.pageShell, styles.daySectionCardShell, { maxWidth: responsive.contentMaxWidth }]}> 
            <View style={styles.searchCard}>
              <View style={styles.searchHeaderRow}>
                <Text style={styles.searchTitle}>Rubrica clienti</Text>
                <HapticTouchable
                  style={[
                    styles.searchChevronWrap,
                    showRubricaExpanded && styles.searchChevronWrapExpanded,
                  ]}
                  onPress={() => {
                    haptic.light();
                    setShowRubricaExpanded((current) => !current);
                  }}
                  pressScale={0.985}
                  pressOpacity={0.98}
                  accessibilityRole="button"
                  accessibilityLabel={showRubricaExpanded ? 'Chiudi rubrica clienti' : 'Apri rubrica clienti'}
                >
                  <AnimatedChevron expanded={showRubricaExpanded} />
                </HapticTouchable>
              </View>
              <Text style={styles.searchSubtitle}>
                Swipe laterale per modificare, inibire o eliminare senza perdere spazio utile.
              </Text>

              {showRubricaExpanded ? (
                <Animated.View
                  entering={FadeIn.duration(185).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOut.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(210).easing(Easing.out(Easing.cubic))}
                >
                  <ClearableTextInput
                    placeholder="Cerca per nome, telefono, email o Instagram"
                    placeholderTextColor="#8f8f8f"
                    value={ricerca}
                    onChangeText={setRicerca}
                    style={[styles.input, styles.searchInput]}
                  />

                  <View style={styles.clientSectionsWrap}>
                    {item.sections.map((section) => (
                      <View key={section.key} style={styles.clientMonthSection}>
                        <View style={styles.clientMonthSectionHeader}>
                          <Animated.Text
                            style={styles.clientMonthSectionTitle}
                            entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                            layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                          >
                            {section.title}
                          </Animated.Text>
                        </View>
                        {section.items.map((clienteItem) => (
                          <Animated.View
                            key={clienteItem.uiKey ?? clienteItem.id}
                            ref={(node) => {
                              const refKey = clienteItem.uiKey ?? clienteItem.id;
                              clientCardRefs.current[refKey] = node;
                              clientCardRefs.current[clienteItem.id] = node;
                            }}
                            onLayout={scheduleVisibleFrontendClientsCheck}
                            layout={LinearTransition.duration(170).easing(Easing.out(Easing.cubic))}
                            entering={FadeIn.duration(145).easing(Easing.out(Easing.cubic))}
                            exiting={FadeOut.duration(120).easing(Easing.out(Easing.cubic))}
                          >
                            {renderClienteCard(clienteItem)}
                          </Animated.View>
                        ))}
                      </View>
                    ))}
                  </View>
                </Animated.View>
              ) : null}
            </View>
          </View>
        )}
        ListFooterComponent={<View style={{ height: 24 }} />}
      />

      <NativeDatePickerModal
        visible={showBirthdayPicker}
        title="Compleanno / Data (Opzionale)"
        initialValue={birthday || undefined}
        onClose={() => setShowBirthdayPicker(false)}
        onConfirm={(value) => {
          setBirthday(value);
          setShowBirthdayPicker(false);
        }}
      />

      {pendingDeletedClient ? (
        <View style={styles.deleteUndoBanner}>
          <Text style={styles.deleteUndoBannerText}>Cliente eliminato definitivamente tra 3s</Text>
          <HapticTouchable
            style={styles.deleteUndoButton}
            onPress={annullaEliminazioneCliente}
            pressScale={0.98}
            pressOpacity={0.98}
          >
            <Text style={styles.deleteUndoButtonText}>Annulla</Text>
          </HapticTouchable>
        </View>
      ) : null}

      <KeyboardNextToolbar onNext={handleKeyboardNext} label="Next" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  listContent: {
    paddingTop: 54,
    paddingBottom: 128,
  },
  pageShell: {
    width: '100%',
    alignSelf: 'center',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: IS_ANDROID ? 28 : 22,
    paddingTop: 0,
    paddingBottom: 4,
    marginBottom: 0,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 12,
    marginTop: 0,
    shadowColor: '#000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 0,
  },
  reminderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 24 : 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  reminderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  reminderTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  reminderDescription: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  reminderStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  reminderStatusBadgeActive: {
    backgroundColor: '#DCFCE7',
  },
  reminderStatusBadgeMuted: {
    backgroundColor: '#E2E8F0',
  },
  reminderStatusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  reminderStatusBadgeTextActive: {
    color: '#166534',
  },
  reminderStatusBadgeTextMuted: {
    color: '#475569',
  },
  reminderOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 14,
  },
  reminderOptionChip: {
    minWidth: 66,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#D7E0EA',
    alignItems: 'center',
  },
  reminderOptionChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  reminderOptionChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  reminderOptionChipTextActive: {
    color: '#FFFFFF',
  },
  reminderSummaryCard: {
    marginTop: 14,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  reminderSummaryCardActive: {
    backgroundColor: '#ECFDF3',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  reminderSummaryCardMuted: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  reminderSummaryText: {
    fontSize: 13,
    lineHeight: 20,
    fontWeight: '900',
    textAlign: 'center',
  },
  reminderSummaryTextActive: {
    color: '#166534',
  },
  reminderSummaryTextMuted: {
    color: '#475569',
  },
  reminderHint: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'center',
  },
  bookingHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  bookingHeaderLeft: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bookingHeadingRow: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  bookingHeading: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.4,
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 8 : 0,
  },
  bookingBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 16 : 12,
    paddingVertical: 6,
    flexShrink: 0,
    marginTop: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  bookingBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  bookingBadgeAlert: {
    backgroundColor: '#FDECEC',
    marginTop: 0,
  },
  bookingBadgeSuccess: {
    backgroundColor: '#DCFCE7',
    marginTop: 0,
  },
  bookingBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  bookingBadgeSuccessText: {
    color: '#15803D',
  },
  bookingBadgeAlertText: {
    color: '#B91C1C',
  },
  formToggleChip: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c1cfde',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 8,
  },
  formToggleChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textAlign: 'center',
  },
  formFieldsWrap: {
    marginTop: 6,
  },
  sectionBlock: {
    marginBottom: 8,
    backgroundColor: '#e8eef5',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 14,
    borderWidth: 1.85,
    borderColor: '#869fbc',
    borderTopWidth: 2.35,
    borderTopColor: '#dde7f2',
    shadowColor: '#0f172a',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#111111',
    textAlign: 'center',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 13,
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    marginBottom: 8,
  },
  inputError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: -4,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
    textAlign: 'center',
  },
  searchInput: {
    marginTop: 10,
  },
  dateInputButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateInputText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111111',
    textAlign: 'center',
  },
  dateInputPlaceholder: {
    color: '#9a9a9a',
  },
  clearDateChip: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  clearDateChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
    textAlign: 'center',
  },
  requiredFieldsHint: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  primaryButtonInline: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: IS_ANDROID ? 14 : 0,
    alignItems: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  secondaryButton: {
    width: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: IS_ANDROID ? 14 : 0,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  secondaryButtonText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  searchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 16,
    marginBottom: 10,
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
    alignItems: 'stretch',
  },
  searchTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 0,
    textAlign: 'center',
  },
  searchHeaderRow: {
    position: 'relative',
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  searchChevronWrap: {
    position: 'absolute',
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  searchChevronWrapExpanded: {
    shadowOpacity: 0.18,
  },
  searchSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
  },
  daySectionCardShell: {
    width: '100%',
  },
  clientSectionsWrap: {
    marginTop: 10,
    gap: 10,
  },
  clientMonthSection: {
    width: '100%',
  },
  clientMonthSectionHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 6,
  },
  clientMonthSectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  clienteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 14 : 16,
    paddingVertical: 9,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.05)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 4,
  },
  clienteCardSelected: {
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  clienteMain: {
    width: '100%',
    position: 'relative',
    paddingHorizontal: 0,
    gap: 3,
  },
  clienteTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    gap: 8,
  },
  clienteInitialBadge: {
    width: 40,
    height: 40,
    borderRadius: 999,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  clienteInitialText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
  clienteInfo: {
    width: '100%',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  clienteTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    minWidth: 0,
  },
  clienteNomeWrap: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    minHeight: 40,
    justifyContent: 'center',
    paddingTop: 3,
  },
  clienteNome: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 0,
    textAlign: 'left',
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    paddingTop: 0,
    paddingRight: 2,
  },
  clienteContactStack: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    width: '100%',
    minWidth: 0,
    marginTop: -1,
  },
  clienteTelefono: {
    fontSize: IS_ANDROID ? 10.6 : 11.2,
    color: '#0F172A',
    fontWeight: '800',
    textAlign: 'center',
    width: '100%',
    minWidth: 0,
    paddingRight: 0,
  },
  clienteMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'wrap',
    gap: IS_ANDROID ? 3 : 6,
    marginTop: 4,
    width: '100%',
    minWidth: 0,
  },
  clienteEmailCompact: {
    fontSize: IS_ANDROID ? 9.2 : 9.8,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
    flexShrink: 1,
    minWidth: 0,
    flexGrow: 0,
    maxWidth: '100%',
    paddingRight: 0,
  },
  clienteInstagramCompact: {
    fontSize: IS_ANDROID ? 10 : 11,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: IS_ANDROID ? '34%' : undefined,
    paddingRight: IS_ANDROID ? 1 : 0,
  },
  clienteBirthdayCompact: {
    fontSize: IS_ANDROID ? 10 : 11,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'left',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: IS_ANDROID ? '34%' : undefined,
  },
  quickActionsRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'flex-start',
    gap: 4,
    marginTop: 0,
    width: '100%',
  },
  quickActionsRowCompact: {
    gap: 5,
    marginTop: 5,
  },
  quickActionChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 11,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderWidth: 0,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
    flexGrow: 1,
    flexBasis: 0,
  },
  quickActionChipCompact: {
    minWidth: IS_ANDROID ? 86 : 72,
    paddingHorizontal: IS_ANDROID ? 14 : 10,
    paddingVertical: 8,
    borderRadius: 12,
  },
  quickActionChipWhatsapp: {
    backgroundColor: '#EAF7F0',
  },
  quickActionChipInstagram: {
    backgroundColor: '#F2ECFB',
  },
  quickActionChipQr: {
    backgroundColor: '#EEE8DC',
  },
  quickActionChipDisabled: {
    opacity: 0.44,
  },
  quickActionText: {
    fontSize: IS_ANDROID ? 7.9 : 8.6,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    paddingHorizontal: 0,
    width: '100%',
  },
  quickActionTextCompact: {
    fontSize: IS_ANDROID ? 9 : 8,
  },
  quickActionTextWhatsapp: {
    color: '#0F172A',
  },
  quickActionTextInstagram: {
    color: '#0F172A',
  },
  quickActionTextQr: {
    color: '#6B4A2F',
  },
  cardTrailingMeta: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    paddingTop: 3,
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: 'rgba(15, 23, 42, 0.06)',
  },
  cardTrailingMetaText: {
    fontSize: IS_ANDROID ? 10 : 11,
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
    width: '100%',
  },
  cardTrailingMetaHint: {
    fontSize: 10,
    fontWeight: '900',
    color: '#b91c1c',
    textAlign: 'center',
    width: 'auto',
    flexShrink: 1,
    letterSpacing: 0.15,
  },
  cardTrailingMetaHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
  },
  cardTrailingMetaHintPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFF7F7',
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.14)',
    shadowColor: '#7f1d1d',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  swipeActionsRowLeft: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 6,
    gap: 0,
  },
  swipeActionButton: {
    minWidth: 72,
    borderRadius: 14,
    marginBottom: 6,
    marginRight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 9,
  },
  swipeActionEdit: {
    backgroundColor: '#dbeafe',
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  swipeActionLimit: {
    backgroundColor: '#ede9fe',
    borderWidth: 1,
    borderColor: '#c4b5fd',
    minWidth: 90,
    marginHorizontal: 2,
  },
  swipeActionBlock: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fdba74',
  },
  swipeActionUnlock: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  swipeActionDelete: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#d8b1b7',
    minWidth: 92,
    marginBottom: 8,
  },
  swipeActionLabel: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#1e3a8a',
    textAlign: 'center',
  },
  swipeActionLabelBlock: {
    color: '#c2410c',
  },
  swipeActionLabelLimit: {
    color: '#6d28d9',
    lineHeight: 11.5,
  },
  swipeActionLabelUnlock: {
    color: '#166534',
  },
  swipeActionLabelDelete: {
    color: '#b91c1c',
  },
  statusBadgeBlockedCentered: {
    backgroundColor: '#F8FAFC',
    borderRadius: 999,
    borderWidth: 0,
    paddingHorizontal: IS_ANDROID ? 14 : 9,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    marginBottom: 4,
    minWidth: IS_ANDROID ? 78 : undefined,
  },
  statusBadgeBlockedText: {
    fontSize: IS_ANDROID ? 9.5 : 10,
    fontWeight: '900',
    color: '#64748B',
    width: '100%',
    textAlign: 'center',
  },
  statusBadgeCancelled: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  statusBadgeCancelledFloating: {
    minHeight: 22,
    borderRadius: 999,
    backgroundColor: '#FDECEC',
    borderWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    flexShrink: 0,
    minWidth: 0,
    maxWidth: '39%',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    alignSelf: 'flex-start',
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 'auto',
  },
  statusBadgeCancelledText: {
    fontSize: IS_ANDROID ? 7.7 : 8.2,
    fontWeight: '900',
    color: '#B91C1C',
    letterSpacing: 0.2,
    width: '100%',
    textAlign: 'center',
  },
  statusBadgeLimit: {
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: '#F3E8FF',
    borderWidth: 1,
    borderColor: 'rgba(109, 40, 217, 0.14)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  statusBadgeLimitText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#6d28d9',
    textAlign: 'center',
  },
  deleteUndoBanner: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8b1b7',
    backgroundColor: '#f6e3e5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  deleteUndoBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
    color: '#991b1b',
    textAlign: 'left',
  },
  deleteUndoButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ef4444',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteUndoButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#dc2626',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: IS_ANDROID ? 20 : 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
    borderWidth: 0,
    marginTop: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
    textAlign: 'center',
  },
});
