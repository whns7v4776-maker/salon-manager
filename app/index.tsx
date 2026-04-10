import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect, useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Keyboard,
    KeyboardAvoidingView,
    LayoutChangeEvent,
    NativeSyntheticEvent,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TextInputSubmitEditingEventData,
    View,
} from 'react-native';
import { AppWordmark } from '../components/app-wordmark';
import { WebImmediateTouchableOpacity as TouchableOpacity } from '../components/ui/web-immediate-touchable-opacity';
import { useAppContext } from '../src/context/AppContext';
import { useKeyboardAwareScroll } from '../src/lib/form-navigation';
import { useResponsiveLayout } from '../src/lib/responsive';

const normalizeSalonCodeInput = (value: string) => value.trim();
const OWNER_ROUTE = '/proprietario' as Href;
const BACKOFFICE_ROUTE = '/(tabs)' as Href;
const FRONTEND_PROFILE_KEY = 'salon_manager_frontend_cliente_profile';
const FRONTEND_LAST_SALON_CODE_KEY = 'salon_manager_frontend_last_salon_code';

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => value.replace(/\D+/g, '');

export default function PublicClientLandingScreen() {
  const router = useRouter();
  const responsive = useResponsiveLayout();
  const { isAuthenticated, isLoaded, hasInitializedAuth } = useAppContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const accessEmailRef = useRef<TextInput | null>(null);
  const accessPhoneRef = useRef<TextInput | null>(null);
  const salonCodeRef = useRef<TextInput | null>(null);
  const [salonCode, setSalonCode] = useState('');
  const [codeSectionY, setCodeSectionY] = useState(0);
  const [codeTouched, setCodeTouched] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [savedProfileEmail, setSavedProfileEmail] = useState('');
  const [savedProfilePhone, setSavedProfilePhone] = useState('');
  const [savedSalonCode, setSavedSalonCode] = useState('');
  const [hasSavedClientProfile, setHasSavedClientProfile] = useState(false);
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPhone, setAccessPhone] = useState('');
  const [accessError, setAccessError] = useState('');
  const { scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: 28,
  });

  const normalizedSalonCode = useMemo(() => normalizeSalonCodeInput(salonCode), [salonCode]);
  const showCodeError = codeTouched && normalizedSalonCode === '';

  useEffect(() => {
    const loadSavedClientSession = async () => {
      try {
        const [savedProfileRaw, savedSalonRaw] = await Promise.all([
          AsyncStorage.getItem(FRONTEND_PROFILE_KEY),
          AsyncStorage.getItem(FRONTEND_LAST_SALON_CODE_KEY),
        ]);

        const normalizedSalon = normalizeSalonCodeInput(savedSalonRaw ?? '');
        setSavedSalonCode(normalizedSalon);

        if (!savedProfileRaw) {
          return;
        }

        const parsed = JSON.parse(savedProfileRaw) as {
          email?: string;
          telefono?: string;
          nome?: string;
          cognome?: string;
        };

        const email = normalizeEmail(parsed.email ?? '');
        const phone = normalizePhone(parsed.telefono ?? '');
        const hasValidProfile =
          Boolean((parsed.nome ?? '').trim()) &&
          Boolean((parsed.cognome ?? '').trim()) &&
          Boolean(email) &&
          Boolean(phone);

        if (!hasValidProfile) {
          return;
        }

        setHasSavedClientProfile(true);
        setSavedProfileEmail(email);
        setSavedProfilePhone(phone);
      } catch (error) {
        console.log('Errore caricamento accesso rapido cliente:', error);
      }
    };

    void loadSavedClientSession();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ''));
    const hasRecoveryPayload =
      searchParams.get('recovery') === '1' ||
      hashParams.get('recovery') === '1' ||
      searchParams.has('code') ||
      hashParams.has('access_token') ||
      hashParams.has('refresh_token') ||
      searchParams.has('token_hash') ||
      hashParams.has('token_hash') ||
      searchParams.get('type') === 'recovery' ||
      hashParams.get('type') === 'recovery';

    if (!hasRecoveryPayload || currentUrl.pathname === '/reset-password') {
      return;
    }

    const nextPath = `/reset-password${currentUrl.search}${currentUrl.hash}`;
    router.replace(nextPath as Href);
  }, [router]);

  if (!hasInitializedAuth || !isLoaded) {
    return (
      <View style={styles.nativeRedirectFallback}>
        <ActivityIndicator size="large" color="#111111" />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href={BACKOFFICE_ROUTE} />;
  }

  const scrollToCodeSection = () => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: Math.max(codeSectionY - 18, 0), animated: true });
    });
  };

  const handleCodeSectionLayout = (event: LayoutChangeEvent) => {
    setCodeSectionY(event.nativeEvent.layout.y);
  };

  const navigateToHref = (href: Href) => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (typeof href === 'string') {
        window.location.assign(href);
        return;
      }

      let nextPath = href.pathname;
      const params = new URLSearchParams();
      Object.entries(href.params ?? {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        const token = `[${key}]`;
        if (nextPath.includes(token)) {
          nextPath = nextPath.replace(token, encodeURIComponent(String(value)));
          return;
        }
        params.set(key, String(value));
      });

      const nextUrl = params.size > 0 && !nextPath.includes('?') ? `${nextPath}?${params.toString()}` : nextPath;
      window.location.assign(nextUrl);
      return;
    }

    router.push(href);
  };

  const openJoinWithCode = () => {
    if (!normalizedSalonCode) {
      setCodeTouched(true);
      scrollToCodeSection();
      return;
    }

    navigateToHref({
      pathname: '/join/[code]',
      params: { code: normalizedSalonCode },
    });
  };

  const handleCodeSubmit = (_event?: NativeSyntheticEvent<TextInputSubmitEditingEventData>) => {
    setCodeTouched(true);
    openJoinWithCode();
  };

  const handleCodePress = () => {
    handleCodeSubmit();
  };

  const openClientArea = () => {
    navigateToHref('/cliente');
  };

  const openOwnerArea = () => {
    navigateToHref(OWNER_ROUTE);
  };

  const openSavedClientAccess = () => {
    if (!hasSavedClientProfile) {
      setAccessError('Non ho trovato un profilo cliente salvato su questo dispositivo.');
      return;
    }

    const emailDraft = normalizeEmail(accessEmail);
    const phoneDraft = normalizePhone(accessPhone);

    if ((emailDraft && emailDraft !== savedProfileEmail) || (phoneDraft && phoneDraft !== savedProfilePhone)) {
      setAccessError('I dati inseriti non corrispondono al profilo salvato su questo dispositivo.');
      return;
    }

    setAccessError('');
    navigateToHref({
      pathname: '/cliente',
      params: {
        salon: savedSalonCode || undefined,
        mode: 'booking',
      },
    });
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={undefined}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <ScrollView
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingHorizontal: responsive.horizontalPadding }]}
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.shell, { maxWidth: Math.min(responsive.contentMaxWidth, 980) }]}> 
          <View style={styles.heroCard}>
            <View style={styles.brandWrap}>
              <View style={styles.heroWordmarkWrap}>
                <AppWordmark />
              </View>
              <View style={styles.heroSalonInlineSection}>
                <Text style={[styles.eyebrow, styles.eyebrowSalon]}>Area salone</Text>
                <Text style={styles.heroSalonInlineText}>
                  Gestisci agenda, clienti, cassa e servizi del tuo salone in un unico back office.
                </Text>
                <TouchableOpacity
                  style={[styles.secondaryButton, styles.heroSecondaryButton, styles.heroSalonButton]}
                  onPress={openOwnerArea}
                  activeOpacity={0.88}
                >
                  <Text style={[styles.secondaryButtonText, styles.heroSalonButtonText]}>
                    Back office salone
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.clientSectionCard}>
            <View style={styles.heroIconRow}>
              <View style={styles.heroIconBadge}>
                <Ionicons name="sparkles" size={18} color="#f8fafc" />
              </View>
              <View style={styles.heroIconBadge}>
                <Ionicons name="calendar-clear" size={18} color="#f8fafc" />
              </View>
              <View style={styles.heroIconBadge}>
                <Ionicons name="phone-portrait" size={17} color="#f8fafc" />
              </View>
            </View>
            <Text style={styles.eyebrow}>Area prenotazioni cliente</Text>
            <Text style={styles.title}>Prenota il tuo appuntamento in pochi secondi</Text>
            <Text style={styles.subtitle}>
              Scegli il tuo salone, prenota il servizio e gestisci facilmente i tuoi appuntamenti.
            </Text>

            <View style={styles.heroActionGroup}>
              <View style={styles.heroActionSection}>
                <Text style={styles.heroActionLabel}>Area cliente</Text>
                <TouchableOpacity
                  style={[styles.primaryButton, styles.heroPrimaryButton]}
                  onPress={openClientArea}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryButtonText}>Apri area cliente</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.accessCard} onLayout={handleCodeSectionLayout}>
              <Text style={[styles.heroActionLabel, styles.accessEyebrow]}>Area cliente</Text>
              <Text style={styles.accessTitle}>Entra nel tuo salone</Text>
              <Text style={styles.accessSubtitle}>
                Inserisci il codice che ti ha dato il salone per aprire la pagina corretta.
              </Text>

              <View style={styles.quickAccessCard}>
                <View style={styles.quickAccessHeader}>
                  <View style={styles.quickAccessIconBadge}>
                    <Ionicons name="person" size={17} color="#f8fafc" />
                  </View>
                  <View style={styles.quickAccessHeaderTextWrap}>
                    <Text style={styles.quickAccessTitle}>Area Accedi</Text>
                    <Text style={styles.quickAccessSubtitle}>
                      Se hai già fatto la registrazione, puoi entrare senza link o QR.
                    </Text>
                  </View>
                </View>

                <TextInput
                  ref={accessEmailRef}
                  style={styles.quickAccessInput}
                  placeholder="Email (opzionale)"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={accessEmail}
                  onChangeText={(value) => {
                    setAccessEmail(value);
                    if (accessError) setAccessError('');
                  }}
                  keyboardType="email-address"
                  onFocus={() => scrollToField(accessEmailRef)}
                />

                <TextInput
                  ref={accessPhoneRef}
                  style={styles.quickAccessInput}
                  placeholder="Telefono (opzionale)"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={accessPhone}
                  onChangeText={(value) => {
                    setAccessPhone(value);
                    if (accessError) setAccessError('');
                  }}
                  keyboardType="phone-pad"
                  onFocus={() => scrollToField(accessPhoneRef)}
                />

                {accessError ? <Text style={styles.quickAccessError}>{accessError}</Text> : null}

                <TouchableOpacity style={styles.quickAccessButton} onPress={openSavedClientAccess} activeOpacity={0.9}>
                  <Text style={styles.quickAccessButtonText}>Accedi con profilo salvato</Text>
                </TouchableOpacity>

                <Text style={styles.quickAccessHint}>
                  Se lasci i campi vuoti, uso il profilo salvato automaticamente su questo dispositivo.
                </Text>
              </View>

              <TextInput
                ref={salonCodeRef}
                style={[styles.codeInput, codeFocused && styles.codeInputFocused, showCodeError && styles.codeInputError]}
                placeholder="Inserisci codice salone (es. ABC123)"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
                value={salonCode}
                onChangeText={(value) => {
                  setSalonCode(value);
                  if (!codeTouched) {
                    return;
                  }

                  setCodeTouched(false);
                }}
                onFocus={() => {
                  setCodeFocused(true);
                  scrollToField(salonCodeRef);
                }}
                onBlur={() => setCodeFocused(false)}
                returnKeyType="go"
                onSubmitEditing={handleCodeSubmit}
              />

              {showCodeError ? (
                <Text style={styles.codeErrorText}>Inserisci un codice salone per continuare.</Text>
              ) : null}

              <TouchableOpacity style={styles.inlineLinkButton} onPress={scrollToCodeSection} activeOpacity={0.8}>
                <Text style={styles.inlineLinkText}>Hai un codice salone? Inseriscilo qui</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.primaryButton, !normalizedSalonCode && styles.primaryButtonDisabled]}
                onPress={handleCodePress}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>Continua</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.benefitsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Tutto quello che ti serve, lato cliente</Text>
              <Text style={styles.sectionSubtitle}>Un ingresso semplice per prenotare e tenere tutto sotto controllo.</Text>
            </View>

            <View style={styles.benefitsGrid}>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="sparkles" size={18} color="#f8fafc" />
                </View>
                <Text style={styles.benefitTitle}>Prenota facilmente</Text>
                <Text style={styles.benefitText}>Apri il salone giusto, scegli il servizio e invia la richiesta in pochi passaggi.</Text>
              </View>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="calendar-clear" size={18} color="#f8fafc" />
                </View>
                <Text style={styles.benefitTitle}>Gestisci gli appuntamenti</Text>
                <Text style={styles.benefitText}>Controlla le tue richieste, lo stato delle conferme e le eventuali modifiche.</Text>
              </View>
              <View style={styles.benefitCard}>
                <View style={styles.benefitIconWrap}>
                  <Ionicons name="chatbubble-ellipses" size={18} color="#f8fafc" />
                </View>
                <Text style={styles.benefitTitle}>Resta collegato al tuo salone</Text>
                <Text style={styles.benefitText}>Tieni a portata di mano i riferimenti del salone e torna nella tua area cliente quando vuoi.</Text>
              </View>
            </View>
          </View>

          <View style={styles.reassuranceCard}>
            <Text style={styles.reassuranceTitle}>Una pagina semplice, pensata per i clienti</Text>
            <Text style={styles.reassuranceText}>
              Nessun gestionale complicato, nessuna configurazione tecnica. Qui puoi solo prenotare e gestire i tuoi appuntamenti nel tuo salone di fiducia.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerLink}>Privacy</Text>
            <Text style={styles.footerLink}>Supporto</Text>
            <Text style={styles.footerLink}>Contatti</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FA',
  },
  content: {
    flexGrow: 1,
    paddingTop: 56,
    paddingBottom: 96,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
  },
  backgroundGlowTop: {
    position: 'absolute',
    top: -100,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 260,
    backgroundColor: 'rgba(14, 116, 144, 0.10)',
  },
  backgroundGlowBottom: {
    position: 'absolute',
    bottom: -120,
    left: -60,
    width: 300,
    height: 300,
    borderRadius: 300,
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 20,
    marginBottom: 18,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  clientSectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 22,
    marginBottom: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  brandWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  heroWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ scale: 1.12 }],
  },
  heroIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
  },
  heroSalonInlineSection: {
    width: '100%',
    maxWidth: 520,
    alignItems: 'center',
    marginTop: -2,
    marginBottom: 0,
  },
  heroSalonInlineText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 10,
    maxWidth: 760,
  },
  eyebrowSalon: {
    color: '#64748B',
    marginBottom: 6,
  },
  heroIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  title: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
    color: '#0f172a',
    marginBottom: 10,
    maxWidth: 760,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#475569',
    marginBottom: 12,
    maxWidth: 760,
    textAlign: 'center',
  },
  heroActionGroup: {
    width: '100%',
    maxWidth: 520,
    gap: 12,
    marginTop: 2,
  },
  heroActionSection: {
    width: '100%',
    alignItems: 'center',
  },
  heroActionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#64748B',
    textTransform: 'uppercase',
    marginBottom: 6,
    textAlign: 'center',
  },
  heroActionLabelSalon: {
    color: '#8A6A08',
  },
  heroPrimaryButton: {
    minWidth: 188,
    width: '100%',
  },
  heroSecondaryButton: {
    minWidth: 188,
    width: '100%',
  },
  heroSalonButton: {
    backgroundColor: '#FFF6D8',
    borderColor: 'rgba(196, 154, 20, 0.24)',
  },
  heroSalonButtonText: {
    color: '#5F4700',
  },
  accessCard: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginTop: 18,
    marginBottom: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 720,
  },
  accessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  accessEyebrow: {
    marginBottom: 4,
  },
  accessSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
    maxWidth: 520,
  },
  quickAccessCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.07)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    alignItems: 'center',
  },
  quickAccessHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    width: '100%',
  },
  quickAccessIconBadge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#020617',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  quickAccessHeaderTextWrap: {
    width: '100%',
    alignItems: 'center',
  },
  quickAccessTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 3,
    textAlign: 'center',
  },
  quickAccessSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: '#475569',
    textAlign: 'center',
  },
  quickAccessInput: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginBottom: 8,
    width: '100%',
    textAlign: 'center',
  },
  quickAccessError: {
    marginBottom: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#b91c1c',
    textAlign: 'center',
  },
  quickAccessButton: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    width: '100%',
  },
  quickAccessButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  quickAccessHint: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#64748b',
    textAlign: 'center',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.10)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
    width: '100%',
    maxWidth: 520,
    shadowColor: '#0f172a',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    textAlign: 'center',
  },
  codeInputFocused: {
    borderColor: '#0F172A',
    backgroundColor: '#ffffff',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  codeInputError: {
    borderColor: '#dc2626',
  },
  codeErrorText: {
    width: '100%',
    maxWidth: 520,
    marginTop: -4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#b91c1c',
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    alignSelf: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  primaryButtonDisabled: {
    opacity: 0.92,
  },
  secondaryButton: {
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    paddingVertical: 15,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
  },
  secondaryButtonText: {
    color: '#0f172a',
    fontSize: 15,
    fontWeight: '800',
  },
  inlineLinkButton: {
    alignSelf: 'center',
    marginTop: 2,
    marginBottom: 12,
    paddingVertical: 4,
  },
  inlineLinkText: {
    fontSize: 13,
    lineHeight: 20,
    color: '#2563eb',
    fontWeight: '700',
    textAlign: 'center',
  },
  benefitsSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 6,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: '#64748b',
    textAlign: 'center',
    maxWidth: 620,
  },
  benefitsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  benefitCard: {
    flexGrow: 1,
    flexBasis: 250,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    minHeight: 188,
    alignItems: 'center',
  },
  benefitIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1120',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 14,
    shadowColor: '#020617',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  benefitTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  benefitText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#475569',
    textAlign: 'center',
  },
  reassuranceCard: {
    backgroundColor: '#0f172a',
    borderRadius: 28,
    paddingHorizontal: 28,
    paddingVertical: 30,
    marginBottom: 24,
    alignItems: 'center',
  },
  reassuranceTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 10,
    textAlign: 'center',
  },
  reassuranceText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#cbd5e1',
    textAlign: 'center',
    maxWidth: 720,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 18,
    paddingBottom: 10,
  },
  footerLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  nativeRedirectFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f6f6f3',
  },
});
