import { useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Keyboard,
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
import { ModuleHeroHeader } from '../../components/module-hero-header';
import { HapticTouchable } from '../../components/ui/haptic-touchable';
import { KeyboardNextToolbar } from '../../components/ui/keyboard-next-toolbar';
import { NumberPickerModal } from '../../components/ui/number-picker-modal';
import { useAppContext } from '../../src/context/AppContext';
import { focusNextInput, useKeyboardAwareScroll } from '../../src/lib/form-navigation';
import { tApp } from '../../src/lib/i18n';
import { useResponsiveLayout } from '../../src/lib/responsive';
import { resolveServiceAccent } from '../../src/lib/service-accents';

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

const resolveMovementDate = (movement: { id: string; createdAt?: string }) => {
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

export default function CassaScreen() {
  const responsive = useResponsiveLayout();
  const {
    movimenti,
    setMovimenti,
    servizi,
    clienti,
    carteCollegate,
    setCarteCollegate,
    serviceCardColorOverrides,
    roleCardColorOverrides,
    salonWorkspace,
    updateSalonWorkspacePersisted,
    appLanguage,
  } = useAppContext();

  const [descrizione, setDescrizione] = useState('');
  const [importo, setImporto] = useState('');
  const [ricerca, setRicerca] = useState('');
  const [metodoPagamento, setMetodoPagamento] = useState<MetodoPagamento>('Contanti');
  const [cartaSelezionataId, setCartaSelezionataId] = useState<string | null>(null);
  const [showAmountPicker, setShowAmountPicker] = useState(false);
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
    topOffset: responsive.isDesktop ? 44 : 28,
  });
  const handleKeyboardNext = useCallback(() => {
    focusNextInput(
      [cardNameRef, cardCircuitRef, cardLast4Ref, incomeDescriptionRef, searchMovementRef],
      focusField
    );
  }, [focusField]);
  const metodoPagamentoLabels: Record<MetodoPagamento, string> = {
    Contanti: tApp(appLanguage, 'payment_method_cash'),
    Carta: tApp(appLanguage, 'payment_method_card'),
    Bonifico: tApp(appLanguage, 'payment_method_transfer'),
  };

  const cartaPredefinita = useMemo(
    () => carteCollegate.find((item) => item.predefinita) ?? carteCollegate[0] ?? null,
    [carteCollegate]
  );

  const cartaAttiva = useMemo(() => {
    if (!cartaSelezionataId) return cartaPredefinita;
    return carteCollegate.find((item) => item.id === cartaSelezionataId) ?? cartaPredefinita;
  }, [cartaPredefinita, cartaSelezionataId, carteCollegate]);

  const totale = useMemo(() => {
    return movimenti.reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const incassoCarta = useMemo(() => {
    return movimenti
      .filter((item) => item.metodo === 'Carta')
      .reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const incassoContanti = useMemo(() => {
    return movimenti
      .filter((item) => item.metodo === 'Contanti')
      .reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const daChiudere = useMemo(() => {
    return movimenti
      .filter((item) => !item.metodo)
      .reduce((sum, item) => sum + item.importo, 0);
  }, [movimenti]);

  const canAdd = useMemo(() => {
    if (descrizione.trim() === '' || importo.trim() === '') return false;
    if (metodoPagamento === 'Carta' && !cartaAttiva) return false;
    return true;
  }, [descrizione, importo, metodoPagamento, cartaAttiva]);

  const canSaveCard = useMemo(() => {
    return (
      nomeCarta.trim() !== '' &&
      circuitoCarta.trim() !== '' &&
      ultime4.trim().length === 4
    );
  }, [nomeCarta, circuitoCarta, ultime4]);

  const movimentiFiltrati = useMemo(() => {
    const testo = ricerca.trim().toLowerCase();

    if (!testo) return movimenti;

    return movimenti.filter((movimento) => {
      return (
        movimento.descrizione.toLowerCase().includes(testo) ||
        movimento.importo.toString().includes(testo) ||
        (movimento.metodo ?? '').toLowerCase().includes(testo) ||
        (movimento.cartaLabel ?? '').toLowerCase().includes(testo)
      );
    });
  }, [movimenti, ricerca]);

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
  }, [movimenti, ricerca]);

  const closeActiveSuggestions = useCallback(() => {
    Keyboard.dismiss();
    setCampoAttivo(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      return () => {
        closeActiveSuggestions();
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      };
    }, [closeActiveSuggestions])
  );

  const aggiungiMovimento = () => {
    if (!canAdd) return;

    const valore = Number(importo.replace(',', '.'));
    if (Number.isNaN(valore)) return;

    const nuovoMovimento = {
      id: Date.now().toString(),
      descrizione: descrizione.trim(),
      importo: valore,
      metodo: metodoPagamento,
      cartaLabel: metodoPagamento === 'Carta' ? cartaAttiva?.nome : undefined,
      createdAt: new Date().toISOString(),
    };

    setMovimenti([nuovoMovimento, ...movimenti]);
    setDescrizione('');
    setImporto('');
    setCampoAttivo(null);
  };

  const salvaCarta = () => {
    if (!canSaveCard) return;

    const nuovaCarta = {
      id: Date.now().toString(),
      nome: nomeCarta.trim(),
      circuito: circuitoCarta.trim(),
      ultime4: ultime4.trim(),
      predefinita: carteCollegate.length === 0,
    };

    setCarteCollegate([nuovaCarta, ...carteCollegate.map((item) => ({ ...item, predefinita: false }))]);
    setCartaSelezionataId(nuovaCarta.id);
    setNomeCarta('');
    setCircuitoCarta('');
    setUltime4('');
  };

  const impostaCartaPredefinita = (id: string) => {
    setCarteCollegate(
      carteCollegate.map((item) => ({
        ...item,
        predefinita: item.id === id,
      }))
    );
    setCartaSelezionataId(id);
  };

  const eliminaCarta = (id: string) => {
    const restante = carteCollegate.filter((item) => item.id !== id);
    const primaRestante = restante[0];

    setCarteCollegate(
      restante.map((item) => ({
        ...item,
        predefinita: primaRestante ? item.id === primaRestante.id : false,
      }))
    );

    if (cartaSelezionataId === id) {
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

  const assegnaMetodoMovimento = (id: string, metodo: MetodoPagamento) => {
    setMovimenti(
      movimenti.map((item) =>
        item.id === id
          ? {
              ...item,
              metodo,
              cartaLabel: metodo === 'Carta' ? cartaAttiva?.nome : undefined,
            }
          : item
      )
    );
  };

  const getMovementTitle = useCallback((description: string) => {
    if (description.startsWith('Incasso automatico fine giornata')) {
      return 'Chiusura giornata';
    }

    return description;
  }, []);

  const handleCashSectionToggle = useCallback(() => {
    const confirmToggle = (
      title: string,
      body: string,
      onConfirm: () => void | Promise<void>
    ) => {
      if (IS_WEB && typeof window !== 'undefined') {
        const confirmed = window.confirm(`${title}\n\n${body}`);
        if (!confirmed) return;
        void onConfirm();
        return;
      }

      Alert.alert(title, body, [
        { text: 'Annulla', style: 'cancel' },
        {
          text: title.toLowerCase().includes('disabilita') ? 'Disabilita Cassa' : 'Riabilita Cassa',
          style: title.toLowerCase().includes('disabilita') ? 'destructive' : 'default',
          onPress: () => {
            void onConfirm();
          },
        },
      ]);
    };

    if (salonWorkspace.cashSectionDisabled) {
      confirmToggle(
        'Riabilita Cassa',
        'Confermando, la sezione Cassa tornerà visibile con tutti i contenuti e i movimenti già registrati.',
        async () => {
          await updateSalonWorkspacePersisted((current) => ({
            ...current,
            cashSectionDisabled: false,
          }));
        }
      );
      return;
    }

    confirmToggle(
      'Disabilita Cassa',
      'Questa schermata non è collegata direttamente a banca o conto corrente. Se usi già un gestionale contabile esterno collegato elettronicamente con la banca, puoi nascondere tutta la sezione Cassa mantenendo visibile solo il tab.',
      async () => {
        await updateSalonWorkspacePersisted((current) => ({
          ...current,
          cashSectionDisabled: true,
        }));
      }
    );
  }, [salonWorkspace.cashSectionDisabled, updateSalonWorkspacePersisted]);

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={salonWorkspace.cashSectionDisabled ? [] : movimentiOrdinati}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator
        indicatorStyle="black"
        scrollIndicatorInsets={{ right: 2 }}
        contentContainerStyle={[
          styles.content,
          { paddingHorizontal: responsive.horizontalPadding },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={closeActiveSuggestions}
        ListHeaderComponent={
          <View style={[styles.pageShell, { maxWidth: responsive.contentMaxWidth }]}>
            <View style={styles.heroCard}>
              <ModuleHeroHeader
                moduleKey="cassa"
                title={tApp(appLanguage, 'tab_cash')}
                salonName={salonWorkspace.salonName}
                salonNameDisplayStyle={salonWorkspace.salonNameDisplayStyle}
                salonNameFontVariant={salonWorkspace.salonNameFontVariant}
                iconOffsetY={2}
              />

              <View style={styles.heroStatsRow}>
                <Animated.View
                  style={styles.heroStatCardMint}
                  entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={styles.heroStatNumber}>€ {totale.toFixed(0)}</Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'cash_total_income')}</Text>
                </Animated.View>

                <Animated.View
                  style={styles.heroStatCardBlue}
                  entering={FadeIn.duration(150).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(170).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={styles.heroStatNumber}>€ {incassoCarta.toFixed(0)}</Text>
                  <Text style={styles.heroStatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{tApp(appLanguage, 'cash_card_payments')}</Text>
                </Animated.View>
              </View>

              <View style={styles.heroStatsRowBottom}>
                <Animated.View
                  style={[styles.heroMiniChip, styles.heroMiniChipCash]}
                  entering={FadeIn.duration(130).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(150).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={styles.heroMiniChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_cash_chip')} € {incassoContanti.toFixed(0)}</Text>
                </Animated.View>
                <Animated.View
                  style={[styles.heroMiniChip, styles.heroMiniChipPending]}
                  entering={FadeIn.duration(140).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(160).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={styles.heroMiniChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_to_close_chip')} € {daChiudere.toFixed(0)}</Text>
                </Animated.View>
                <Animated.View
                  style={[styles.heroMiniChip, styles.heroMiniChipCards]}
                  entering={FadeIn.duration(150).easing(Easing.out(Easing.cubic))}
                  layout={LinearTransition.duration(170).easing(Easing.out(Easing.cubic))}
                >
                  <Text style={styles.heroMiniChipText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
                    {tApp(appLanguage, 'cash_linked_cards_chip')} {carteCollegate.length}
                  </Text>
                </Animated.View>
              </View>
              <Text style={styles.subtitle}>{tApp(appLanguage, 'cash_subtitle')}</Text>
            </View>

            <View
              style={[
                styles.cashDisableCard,
                salonWorkspace.cashSectionDisabled && styles.cashDisableCardActive,
              ]}
            >
              <View style={styles.cashDisableHeader}>
                <Text style={styles.cashDisableEyebrow}>Visibilità sezione</Text>
                <Text style={styles.cashDisableTitle}>
                  {salonWorkspace.cashSectionDisabled
                    ? 'Sezione Cassa disabilitata'
                    : 'Sezione Cassa attiva'}
                </Text>
                <View
                  style={[
                    styles.cashDisableBadge,
                    salonWorkspace.cashSectionDisabled
                      ? styles.cashDisableBadgeActive
                      : styles.cashDisableBadgeIdle,
                  ]}
                >
                  <Text
                    style={[
                      styles.cashDisableBadgeText,
                      salonWorkspace.cashSectionDisabled
                        ? styles.cashDisableBadgeTextActive
                        : styles.cashDisableBadgeTextIdle,
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.76}
                  >
                    {salonWorkspace.cashSectionDisabled ? 'Disabilitata' : 'Attiva'}
                  </Text>
                </View>
              </View>

              <Text style={styles.cashDisableText}>
                Questa sezione non è collegata direttamente alla banca o al conto corrente, quindi
                le registrazioni vanno gestite manualmente. Se usi già un altro gestionale
                contabile collegato elettronicamente con la banca, puoi nascondere tutta questa
                schermata lasciando visibile solo il tab.
              </Text>

              <HapticTouchable
                style={[
                  styles.cashDisableButton,
                  salonWorkspace.cashSectionDisabled && styles.cashDisableButtonActive,
                ]}
                onPress={handleCashSectionToggle}
                pressScale={0.975}
                pressOpacity={0.98}
              >
                <Text
                  style={[
                    styles.cashDisableButtonText,
                    salonWorkspace.cashSectionDisabled && styles.cashDisableButtonTextActive,
                  ]}
                >
                  {salonWorkspace.cashSectionDisabled ? 'Riabilita Cassa' : 'Disabilita Cassa'}
                </Text>
              </HapticTouchable>
            </View>

            {salonWorkspace.cashSectionDisabled ? (
              <View style={styles.cashHiddenCard}>
                <Text style={styles.cashHiddenTitle}>Contenuto Cassa nascosto</Text>
                <Text style={styles.cashHiddenText}>
                  Il tab resta visibile, ma questa sezione è stata disabilitata per questo salone.
                  Puoi riattivarla in qualsiasi momento dal blocco qui sopra.
                </Text>
              </View>
            ) : null}

            {!salonWorkspace.cashSectionDisabled ? (
              <View
                style={[
                  styles.desktopTopGrid,
                  !responsive.isDesktop && styles.desktopTopGridStack,
                ]}
              >
                <View style={[styles.desktopLeftPane, !responsive.isDesktop && styles.desktopPaneStack]}>
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
                    onChangeText={setNomeCarta}
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
                    onChangeText={setCircuitoCarta}
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
                    <ScrollView
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
                    </ScrollView>
                  ) : null}
                  </View>

                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded]}>
                  <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_new_income_title')}</Text>
                  <Text style={styles.cardHint}>
                    {tApp(appLanguage, 'cash_new_income_hint')}
                  </Text>

                  <TextInput
                    ref={incomeDescriptionRef}
                    style={styles.input}
                    placeholder={tApp(appLanguage, 'cash_description_placeholder')}
                    placeholderTextColor="#9a9a9a"
                    value={descrizione}
                    onChangeText={setDescrizione}
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

                  <View style={styles.methodsRow}>
                    {METODI_PAGAMENTO.map((item) => {
                      const selected = item === metodoPagamento;

                      return (
                        <HapticTouchable
                          key={item}
                          style={[styles.methodChip, selected && styles.methodChipActive]}
                          onPress={() => setMetodoPagamento(item)}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
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
                        {tApp(appLanguage, 'cash_auto_card_title')}
                      </Text>
                      <Text style={styles.autoCardText}>
                        {cartaAttiva
                          ? `${cartaAttiva.nome} · ${cartaAttiva.circuito} •••• ${cartaAttiva.ultime4}`
                          : tApp(appLanguage, 'cash_no_card_connected')}
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

                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded]}>
                    <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_quick_services')}</Text>

                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickServicesRow}
                    keyboardDismissMode="on-drag"
                    onScrollBeginDrag={closeActiveSuggestions}
                  >
                    {servizi.map((item) => {
                      const accent = resolveServiceAccent({
                        serviceId: item.id,
                        serviceName: item.nome,
                        roleName: item.mestiereRichiesto,
                        serviceColorOverrides: serviceCardColorOverrides,
                        roleColorOverrides: roleCardColorOverrides,
                      });

                      return (
                        <HapticTouchable
                          key={item.id}
                          style={[
                            styles.quickServiceChip,
                            {
                              backgroundColor: accent.bg,
                              borderColor: accent.border,
                            },
                          ]}
                          onPress={() => selezionaServizio(item.nome, item.prezzo)}
                          pressScale={0.98}
                          pressOpacity={0.98}
                        >
                          <Text
                            style={[styles.quickServiceChipText, { color: accent.text }]}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            minimumFontScale={0.66}
                          >
                            {item.nome} · € {item.prezzo.toFixed(2)}
                          </Text>
                        </HapticTouchable>
                      );
                    })}
                  </ScrollView>
                  </View>
                </View>

                <View style={[styles.desktopRightPane, !responsive.isDesktop && styles.desktopPaneStack]}>
                  <View style={[styles.card, !responsive.isDesktop && styles.cardEmbedded, !responsive.isDesktop && styles.cardEmbeddedLast]}>
                  <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>{tApp(appLanguage, 'cash_search_movement')}</Text>

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
                            {item.descrizione} · € {item.importo.toFixed(2)}
                          </Text>
                        </HapticTouchable>
                      ))}
                    </View>
                  ) : null}
                  </View>

                  <Text style={[styles.listTitle, !responsive.isDesktop && styles.listTitleEmbedded]}>{tApp(appLanguage, 'cash_movements')} ({movimentiOrdinati.length})</Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <>
          {index === 0 || (!!movimentiOrdinati[index - 1]?.metodo !== !!item.metodo) ? (
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
          (!!movimentiOrdinati[index - 1]?.metodo !== !!item.metodo) ||
          getMovementDateKey(movimentiOrdinati[index - 1] ?? { id: '' }) !== getMovementDateKey(item) ? (
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
            <View style={styles.itemTop}>
              <View style={styles.itemMainInfo}>
                <Text
                  style={styles.itemDescription}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {getMovementTitle(item.descrizione)}
                </Text>
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
                      {item.metodo ? metodoPagamentoLabels[item.metodo] : tApp(appLanguage, 'cash_to_close_status')}
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
                      {formatMovementStamp(item)}
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
                  {item.metodo ? 'Registrato' : 'Da assegnare'}
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
                  € {item.importo.toFixed(2)}
                </Text>
              </View>
            </View>

            {!item.metodo ? (
              <View style={styles.pendingMethodsRow}>
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
        )}
        ListEmptyComponent={
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
        ListFooterComponent={<View style={{ height: 18 }} />}
      />

      <NumberPickerModal
        visible={showAmountPicker}
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
  desktopTopGrid: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  desktopTopGridStack: {
    flexDirection: 'column',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingTop: 16,
    paddingBottom: 10,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
  },
  desktopLeftPane: {
    flex: 0.95,
    marginRight: 16,
  },
  desktopRightPane: {
    flex: 1.05,
  },
  desktopPaneStack: {
    flex: undefined,
    marginRight: 0,
    width: '100%',
  },
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingHorizontal: IS_ANDROID ? 28 : 22,
    paddingTop: 0,
    paddingBottom: 14,
    marginBottom: 10,
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
    backgroundColor: '#EAF7F0',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatCardBlue: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    borderRadius: 24,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  heroStatNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    paddingHorizontal: IS_ANDROID ? 6 : 0,
  },
  heroStatLabel: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '700',
    textAlign: 'center',
    paddingHorizontal: IS_ANDROID ? 6 : 0,
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
    borderRadius: 22,
    padding: IS_ANDROID ? 20 : 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 11,
    borderWidth: 0,
  },
  cardEmbedded: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 14,
    marginBottom: 14,
  },
  cardEmbeddedLast: {
    marginBottom: 0,
    paddingBottom: 0,
  },
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
    marginBottom: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 13,
    fontSize: 15,
    marginBottom: 10,
    color: '#0F172A',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  numericPickerField: {
    alignItems: 'center',
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
    flexWrap: 'wrap',
    marginBottom: 10,
    justifyContent: 'center',
  },
  methodChip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: IS_ANDROID ? 16 : 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.06)',
  },
  methodChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  methodChipText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
  },
  methodChipTextActive: {
    color: '#0F172A',
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
  quickServicesRow: {
    paddingRight: 6,
    alignItems: 'center',
  },
  quickServiceChip: {
    backgroundColor: '#EEF2FF',
    borderRadius: 12,
    paddingHorizontal: IS_ANDROID ? 18 : 14,
    paddingVertical: 10,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  quickServiceChipText: {
    color: '#0F172A',
    fontSize: 13,
    fontWeight: '800',
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
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: IS_ANDROID ? 20 : 16,
    paddingVertical: 14,
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
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 10,
  },
  itemMainInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemDescription: {
    flex: 1,
    fontSize: 16,
    fontWeight: '900',
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
