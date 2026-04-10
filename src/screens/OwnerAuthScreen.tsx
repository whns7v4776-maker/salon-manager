import React, { useRef, useState } from 'react';
import {
    Alert,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { AppWordmark } from '../../components/app-wordmark';
import { useAppContext } from '../context/AppContext';
import { useKeyboardAwareScroll } from '../lib/form-navigation';
import {
    buildInvalidFieldsMessage,
    isValidEmail,
    isValidPhone10,
    limitPhoneToTenDigits,
} from '../lib/validators';

const EMPTY_LOGIN = {
  email: '',
  password: '',
};

const EMPTY_REGISTER = {
  firstName: '',
  lastName: '',
  salonName: '',
  businessPhone: '',
  streetLine: '',
  city: '',
  postalCode: '',
  activityCategory: '',
  email: '',
  password: '',
};

export default function OwnerAuthScreen() {
  const { loginOwnerAccount, registerOwnerAccount, requestOwnerPasswordReset } = useAppContext();
  const scrollRef = useRef<ScrollView | null>(null);
  const loginEmailRef = useRef<TextInput | null>(null);
  const loginPasswordRef = useRef<TextInput | null>(null);
  const resetEmailRef = useRef<TextInput | null>(null);
  const registerFirstNameRef = useRef<TextInput | null>(null);
  const registerLastNameRef = useRef<TextInput | null>(null);
  const registerSalonNameRef = useRef<TextInput | null>(null);
  const registerEmailRef = useRef<TextInput | null>(null);
  const registerBusinessPhoneRef = useRef<TextInput | null>(null);
  const registerActivityCategoryRef = useRef<TextInput | null>(null);
  const registerPasswordRef = useRef<TextInput | null>(null);
  const [login, setLogin] = useState(EMPTY_LOGIN);
  const [register, setRegister] = useState(EMPTY_REGISTER);
  const [resetEmail, setResetEmail] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [formErrors, setFormErrors] = useState<{
    loginEmail?: string;
    resetEmail?: string;
    registerEmail?: string;
    registerBusinessPhone?: string;
  }>({});
  const { focusField, scrollToField } = useKeyboardAwareScroll(scrollRef, {
    topOffset: 32,
  });

  const handleLogin = async () => {
    if (!isValidEmail(login.email)) {
      setFormErrors((current) => ({ ...current, loginEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setFormErrors((current) => ({ ...current, loginEmail: undefined }));

    const result = await loginOwnerAccount(login.email, login.password);
    if (!result.ok) {
      Alert.alert('Accesso non riuscito', result.error ?? 'Controlla i dati e riprova.');
      return;
    }
  };

  const handleRegister = async () => {
    const invalidFields: string[] = [];
    const nextErrors: {
      registerEmail?: string;
      registerBusinessPhone?: string;
    } = {};

    if (!isValidPhone10(register.businessPhone)) {
      invalidFields.push('Numero di telefono errato (deve avere 10 cifre)');
      nextErrors.registerBusinessPhone = 'Numero di telefono errato (deve avere 10 cifre)';
    }

    if (!isValidEmail(register.email)) {
      invalidFields.push('Email non valida');
      nextErrors.registerEmail = 'Email non valida';
    }

    if (invalidFields.length > 0) {
      setFormErrors((current) => ({ ...current, ...nextErrors }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(invalidFields));
      return;
    }

    setFormErrors((current) => ({
      ...current,
      registerEmail: undefined,
      registerBusinessPhone: undefined,
    }));

    const result = await registerOwnerAccount(register);
    if (!result.ok) {
      Alert.alert('Registrazione non riuscita', result.error ?? 'Controlla i dati e riprova.');
      return;
    }
  };

  const handleReset = async () => {
    if (!isValidEmail(resetEmail)) {
      setFormErrors((current) => ({ ...current, resetEmail: 'Email non valida' }));
      Alert.alert('Campi non validi', buildInvalidFieldsMessage(['Email non valida']));
      return;
    }

    setFormErrors((current) => ({ ...current, resetEmail: undefined }));

    const result = await requestOwnerPasswordReset(resetEmail);
    if (!result.ok) {
      Alert.alert('Recupero password', result.error ?? 'Controlla la mail e riprova.');
      return;
    }

    if (result.backendRequired) {
      Alert.alert(
        'Recupero password',
        'La schermata è pronta, ma l’invio reale della mail si attiverà quando colleghiamo il backend.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.appEyebrow}>SALON PRO</Text>
          <View style={styles.appWordmarkWrap}>
            <AppWordmark />
          </View>
          <Text style={styles.appSubtitle}>
            Gestisci il tuo salone da un’unica app: agenda, clienti, cassa e prenotazioni.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Accedi</Text>
          <TextInput
            ref={loginEmailRef}
            style={[styles.input, formErrors.loginEmail && styles.inputError]}
            placeholder="Email"
            placeholderTextColor="#9a9a9a"
            autoCapitalize="none"
            keyboardType="email-address"
            value={login.email}
            onChangeText={(value) => {
              setLogin((current) => ({ ...current, email: value }));
              if (formErrors.loginEmail) {
                setFormErrors((current) => ({ ...current, loginEmail: undefined }));
              }
            }}
            onFocus={() => scrollToField(loginEmailRef)}
            returnKeyType="next"
            onSubmitEditing={() => focusField(loginPasswordRef)}
            blurOnSubmit={false}
          />
          {formErrors.loginEmail ? (
            <Text style={styles.fieldErrorText}>{formErrors.loginEmail}</Text>
          ) : null}
          <TextInput
            ref={loginPasswordRef}
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#9a9a9a"
            secureTextEntry
            value={login.password}
            onChangeText={(value) => setLogin((current) => ({ ...current, password: value }))}
            onFocus={() => scrollToField(loginPasswordRef)}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} activeOpacity={0.9}>
            <Text style={styles.primaryButtonText}>Accedi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.linkButton}
            onPress={() => {
              setShowReset((current) => !current);
              if (!showReset) {
                setShowRegister(false);
              }
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.linkButtonText}>Password dimenticata?</Text>
          </TouchableOpacity>
        </View>

        {showReset ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Recupera password</Text>
            <Text style={styles.helperText}>
              Inserisci la mail dell’account. Il flusso mail reale lo collegheremo al backend finale.
            </Text>
            <TextInput
              ref={resetEmailRef}
              style={[styles.input, formErrors.resetEmail && styles.inputError]}
              placeholder="Email account"
              placeholderTextColor="#9a9a9a"
              autoCapitalize="none"
              keyboardType="email-address"
              value={resetEmail}
              onChangeText={(value) => {
                setResetEmail(value);
                if (formErrors.resetEmail) {
                  setFormErrors((current) => ({ ...current, resetEmail: undefined }));
                }
              }}
              onFocus={() => scrollToField(resetEmailRef)}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
            {formErrors.resetEmail ? (
              <Text style={styles.fieldErrorText}>{formErrors.resetEmail}</Text>
            ) : null}
            <TouchableOpacity style={styles.secondaryButton} onPress={handleReset} activeOpacity={0.9}>
              <Text style={styles.secondaryButtonText}>Invia richiesta</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.card}>
          <TouchableOpacity
            style={styles.registerToggle}
            onPress={() => {
              setShowRegister((current) => !current);
              if (!showRegister) {
                setShowReset(false);
              }
            }}
            activeOpacity={0.9}
          >
            <Text style={styles.cardTitle}>Registrati</Text>
            <Text style={styles.toggleText}>{showRegister ? 'Chiudi' : 'Apri'}</Text>
          </TouchableOpacity>

          {showRegister ? (
            <>
              <TextInput
                ref={registerFirstNameRef}
                style={styles.input}
                placeholder="Nome"
                placeholderTextColor="#9a9a9a"
                value={register.firstName}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, firstName: value }))
                }
                onFocus={() => scrollToField(registerFirstNameRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(registerLastNameRef)}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerLastNameRef}
                style={styles.input}
                placeholder="Cognome"
                placeholderTextColor="#9a9a9a"
                value={register.lastName}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, lastName: value }))
                }
                onFocus={() => scrollToField(registerLastNameRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(registerSalonNameRef)}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerSalonNameRef}
                style={styles.input}
                placeholder="Nome salone"
                placeholderTextColor="#9a9a9a"
                value={register.salonName}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, salonName: value }))
                }
                onFocus={() => scrollToField(registerSalonNameRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(registerActivityCategoryRef)}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerActivityCategoryRef}
                style={styles.input}
                placeholder="Categoria attività"
                placeholderTextColor="#9a9a9a"
                value={register.activityCategory}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, activityCategory: value }))
                }
                autoCapitalize="characters"
                onFocus={() => scrollToField(registerActivityCategoryRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(registerEmailRef)}
                blurOnSubmit={false}
              />
              <TextInput
                ref={registerEmailRef}
                style={[styles.input, formErrors.registerEmail && styles.inputError]}
                placeholder="Mail"
                placeholderTextColor="#9a9a9a"
                autoCapitalize="none"
                keyboardType="email-address"
                value={register.email}
                onChangeText={(value) => {
                  setRegister((current) => ({ ...current, email: value }));
                  if (formErrors.registerEmail) {
                    setFormErrors((current) => ({ ...current, registerEmail: undefined }));
                  }
                }}
                onFocus={() => scrollToField(registerEmailRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(registerBusinessPhoneRef)}
                blurOnSubmit={false}
              />
              {formErrors.registerEmail ? (
                <Text style={styles.fieldErrorText}>{formErrors.registerEmail}</Text>
              ) : null}
              <TextInput
                ref={registerBusinessPhoneRef}
                style={[styles.input, formErrors.registerBusinessPhone && styles.inputError]}
                placeholder="Numero cellulare azienda"
                placeholderTextColor="#9a9a9a"
                keyboardType="phone-pad"
                value={register.businessPhone}
                onChangeText={(value) =>
                  {
                    setRegister((current) => ({
                      ...current,
                      businessPhone: limitPhoneToTenDigits(value),
                    }));
                    if (formErrors.registerBusinessPhone) {
                      setFormErrors((current) => ({
                        ...current,
                        registerBusinessPhone: undefined,
                      }));
                    }
                  }
                }
                onFocus={() => scrollToField(registerBusinessPhoneRef)}
                returnKeyType="next"
                onSubmitEditing={() => focusField(registerPasswordRef)}
                blurOnSubmit={false}
              />
              {formErrors.registerBusinessPhone ? (
                <Text style={styles.fieldErrorText}>{formErrors.registerBusinessPhone}</Text>
              ) : null}
              <TextInput
                ref={registerPasswordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#9a9a9a"
                secureTextEntry
                value={register.password}
                onChangeText={(value) =>
                  setRegister((current) => ({ ...current, password: value }))
                }
                onFocus={() => scrollToField(registerPasswordRef)}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleRegister}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryButtonText}>Crea account</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.helperText}>
              Nome, cognome, nome salone e mail sono obbligatori. Dopo la registrazione entri
              direttamente nell’app.
            </Text>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e6edf3',
  },
  content: {
    padding: 20,
    paddingTop: 44,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#fbfdff',
    borderRadius: 32,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  appEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: '#9a6b32',
    marginBottom: 10,
  },
  appWordmarkWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginBottom: 6,
  },
  appSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 20,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#94acc8',
    borderTopWidth: 2,
    borderTopColor: '#eef6ff',
    shadowColor: '#0f172a',
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111111',
    marginBottom: 14,
  },
  input: {
    backgroundColor: '#f8fbfe',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    marginBottom: 10,
    color: '#0f172a',
    borderWidth: 1,
    borderColor: '#d8e4f3',
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#fca5a5',
    backgroundColor: '#fff7f7',
  },
  fieldErrorText: {
    marginTop: -6,
    marginBottom: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#b91c1c',
  },
  primaryButton: {
    backgroundColor: '#0f766e',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: '#161616',
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 6,
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  linkButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  linkButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f766e',
  },
  helperText: {
    fontSize: 14,
    lineHeight: 21,
    color: '#6d6257',
  },
  registerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f766e',
  },
});
