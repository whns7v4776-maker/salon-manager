import { DockedSheetSurface } from '../components/ui/docked-sheet-surface';
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { IosSimpleTouchable as TouchableOpacity } from "../components/ui/ios-simple-touchable";
import { AppWordmark } from "../components/app-wordmark";
import {
  PasswordMatchRequirement,
  PasswordRequirements,
} from "../components/password-requirements";
import { PasswordTextInput } from "../components/ui/password-text-input";
import {
  buildEmailOtpRequestErrorMessage,
  formatEmailOtpCountdown,
  parseEmailOtpExpiresAt,
  requestEmailOtp,
  verifyEmailOtp,
  type EmailOtpPurpose,
} from "../src/lib/email-verification";
import { saveClientPasswordToVault } from "../src/lib/client-password-vault";
import { authenticateCustomerPayment } from "../src/lib/client-payment-session";
import { normalizeSalonCode } from "../src/lib/platform";
import { validateStrongPassword } from "../src/lib/password-policy";
import { supabase } from "../src/lib/supabase";
import { isValidEmail } from "../src/lib/validators";

type CustomerPasswordMode = "activate" | "reset";
type IdentityField = "salon" | "email" | "phone";
type CustomerPasswordSuccessDialog = {
  title: string;
  message: string;
  resolvedPhone: string;
};

const firstParam = (value?: string | string[]) =>
  (Array.isArray(value) ? value[0] : value) ?? "";
const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizePhone = (value: string) => value.replace(/\D+/g, "").slice(-10);
const IS_ANDROID = Platform.OS === "android";
const ANDROID_TEXT_MAX_FONT_MULTIPLIER = IS_ANDROID ? 1 : undefined;

const buildOtpErrorMessage = (error: string) => {
  if (error === "code_expired") return "Codice scaduto. Richiedine uno nuovo.";
  if (error === "too_many_attempts")
    return "Troppi tentativi. Richiedi un nuovo codice.";
  if (error === "code_not_found")
    return "Codice non disponibile. Richiedine uno nuovo.";
  return "Codice non corretto.";
};

export default function ClientePasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode?: string | string[];
    salon?: string | string[];
    email?: string | string[];
    phone?: string | string[];
    returnToPayment?: string | string[];
  }>();
  const returnToPayment = firstParam(params.returnToPayment) === "1";
  const mode: CustomerPasswordMode =
    firstParam(params.mode) === "reset" ? "reset" : "activate";
  const [salonCode, setSalonCode] = useState(() =>
    normalizeSalonCode(firstParam(params.salon)),
  );
  const [email, setEmail] = useState(() =>
    normalizeEmail(firstParam(params.email)),
  );
  const [phone, setPhone] = useState(() =>
    normalizePhone(firstParam(params.phone)),
  );
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verifiedOtpToken, setVerifiedOtpToken] = useState("");
  const [otpSentTo, setOtpSentTo] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [otpRetryAfterAt, setOtpRetryAfterAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busyAction, setBusyAction] = useState<"send" | "save" | null>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success" | null>(
    null,
  );
  const [messageScope, setMessageScope] = useState<
    "identity" | "password" | null
  >(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<IdentityField, string>>
  >({});
  const [identityFieldsInvalid, setIdentityFieldsInvalid] = useState(false);
  const [successDialog, setSuccessDialog] =
    useState<CustomerPasswordSuccessDialog | null>(null);

  const purpose: EmailOtpPurpose =
    mode === "activate"
      ? "client_password_activation"
      : "client_password_reset";
  const normalizedSalonCode = normalizeSalonCode(salonCode);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const passwordPolicy = validateStrongPassword(password);
  const credentialsReady =
    Boolean(normalizedSalonCode) &&
    isValidEmail(normalizedEmail) &&
    (mode === "reset" || normalizedPhone.length >= 9);
  const showSalonCodeField =
    mode === "activate" || !Boolean(normalizedSalonCode);
  const passwordReady = passwordPolicy.valid && password === confirmPassword;
  const otpSent = otpSentTo === normalizedEmail && otpExpiresAt > 0;
  const otpExpired = otpSent && now >= otpExpiresAt;
  const otpCountdown = otpSent
    ? formatEmailOtpCountdown(otpExpiresAt, now)
    : "";
  const retryCountdown =
    otpRetryAfterAt > now ? formatEmailOtpCountdown(otpRetryAfterAt, now) : "";

  const copy = useMemo(
    () =>
      mode === "activate"
        ? {
            title: "Attiva password cliente",
            subtitle:
              "La password protegge il tuo profilo. Dopo l’attivazione potrai accedere anche con Face ID o impronta.",
            action: "Attiva password",
            success:
              "Password attivata. Da ora protegge gli accessi al profilo cliente.",
          }
        : {
            title: "Recupera password cliente",
            subtitle:
              "Inserisci l’email associata al profilo: riceverai un codice per scegliere subito una nuova password.",
            action: "Salva nuova password",
            success:
              "Password aggiornata. Ora puoi entrare con la nuova password.",
          },
    [mode],
  );

  useEffect(() => {
    if (!otpSent || otpExpiresAt <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [otpExpiresAt, otpSent]);

  const clearIdentityFeedback = (field: IdentityField) => {
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setIdentityFieldsInvalid(false);
    if (messageScope === "identity") {
      setMessage("");
      setMessageTone(null);
      setMessageScope(null);
    }
  };

  const showError = (
    value: string,
    scope: "identity" | "password" = "identity",
  ) => {
    setMessage(value);
    setMessageTone("error");
    setMessageScope(scope);
  };

  const validateIdentity = () => {
    const nextErrors: Partial<Record<IdentityField, string>> = {};
    if (!normalizedSalonCode) {
      nextErrors.salon = "Inserisci il codice del salone.";
    }
    if (!isValidEmail(normalizedEmail)) {
      nextErrors.email = normalizedEmail
        ? "Controlla il formato dell’email."
        : "Inserisci l’email del profilo cliente.";
    }
    if (mode === "activate" && normalizedPhone.length < 9) {
      nextErrors.phone = normalizedPhone
        ? "Il numero di cellulare è troppo corto."
        : "Inserisci il cellulare del profilo cliente.";
    }

    setFieldErrors(nextErrors);
    setIdentityFieldsInvalid(false);
    if (Object.keys(nextErrors).length > 0) {
      showError("Correggi i campi evidenziati.", "identity");
      return false;
    }

    return true;
  };

  const validatePassword = () => {
    if (!passwordPolicy.valid) {
      showError(passwordPolicy.message, "password");
      return false;
    }
    if (password !== confirmPassword) {
      showError("Le due password non coincidono.", "password");
      return false;
    }
    return true;
  };

  const navigateAfterPasswordSuccess = (resolvedPhone = "") => {
    if (returnToPayment && router.canGoBack()) {
      router.back();
      return;
    }
    if (Platform.OS === "web") {
      router.replace({
        pathname: "/",
        params: {
          side: "client",
          salon: normalizedSalonCode,
          passwordReset: mode === "reset" ? "1" : undefined,
        },
      });
      return;
    }

    if (mode === "reset") {
      router.replace({
        pathname: "/cliente",
        params: {
          salon: normalizedSalonCode,
          mode: "booking",
        },
      });
      return;
    }

    router.replace({
      pathname: "/cliente",
      params: {
        salon: normalizedSalonCode,
        mode: "booking",
        autologin: "1",
        email: normalizedEmail,
        phone: resolvedPhone || undefined,
      },
    });
  };

  const handleBack = () => {
    // Cancel recovery by returning to the existing client screen. Replacing it
    // with the post-reset route remounts booking and loses the settings context.
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (mode === "reset") {
      navigateAfterPasswordSuccess();
      return;
    }

    router.back();
  };

  const handleSuccessContinue = () => {
    if (!successDialog) return;
    const { resolvedPhone } = successDialog;
    setSuccessDialog(null);
    navigateAfterPasswordSuccess(resolvedPhone);
  };

  const handleSendOtp = async () => {
    if (busyAction || !validateIdentity()) return;

    setBusyAction("send");
    setMessage("");
    setMessageTone(null);
    setMessageScope(null);
    const result = await requestEmailOtp({
      email: normalizedEmail,
      purpose,
      salonCode: normalizedSalonCode,
      customerPhone: mode === "activate" ? normalizedPhone : null,
    });
    setBusyAction(null);

    if (!result.ok) {
      if (result.error === "rate_limited" && result.retryAfterSeconds) {
        setOtpRetryAfterAt(Date.now() + result.retryAfterSeconds * 1000);
      }
      if (result.error === "invalid_customer_password_request") {
        setIdentityFieldsInvalid(true);
      }
      showError(
        buildEmailOtpRequestErrorMessage({
          error: result.error,
          providerReason: result.providerReason,
          retryAfterSeconds: result.retryAfterSeconds,
        }),
        "identity",
      );
      return;
    }

    setOtpSentTo(normalizedEmail);
    setOtpCode("");
    setVerifiedOtpToken("");
    setOtpExpiresAt(parseEmailOtpExpiresAt(result.expiresAt));
    setOtpRetryAfterAt(Date.now() + 45_000);
    setNow(Date.now());
    setMessage(`Codice inviato a ${normalizedEmail}.`);
    setMessageTone("success");
    setMessageScope("identity");
  };

  const handleSavePassword = async () => {
    if (busyAction || !validateIdentity() || !validatePassword()) return;
    if (!otpSent || otpExpired) {
      showError(
        otpExpired
          ? "Codice scaduto. Richiedine uno nuovo."
          : "Richiedi prima il codice email.",
        "password",
      );
      return;
    }
    if (otpCode.replace(/\D+/g, "").length !== 6) {
      showError(
        "Inserisci il codice a 6 cifre ricevuto via email.",
        "password",
      );
      return;
    }

    setBusyAction("save");
    setMessage("");
    setMessageTone(null);
    setMessageScope(null);

    let otpToken = verifiedOtpToken;
    if (!otpToken) {
      const verification = await verifyEmailOtp({
        email: normalizedEmail,
        purpose,
        code: otpCode,
        salonCode: normalizedSalonCode,
      });

      if (!verification.ok) {
        setBusyAction(null);
        showError(buildOtpErrorMessage(verification.error), "password");
        return;
      }

      otpToken = verification.token;
      setVerifiedOtpToken(otpToken);
    }

    const rpcName =
      mode === "activate"
        ? "activate_public_customer_password"
        : "reset_public_customer_password";
    const { data, error } = await supabase.rpc(rpcName, {
      p_salon_code: normalizedSalonCode,
      p_customer_email: normalizedEmail,
      p_customer_phone: mode === "activate" ? normalizedPhone : "",
      p_customer_password: password,
      p_otp_token: otpToken,
    });

    if (error || !data?.ok) {
      setBusyAction(null);
      const detail = String(error?.message ?? "");
      if (detail.includes("customer_password_already_enabled")) {
        showError(
          "La password è già attiva. Usa “Password dimenticata?” per cambiarla.",
          "password",
        );
      } else if (detail.includes("customer_password_not_enabled")) {
        showError(
          "Questo profilo non ha ancora una password: puoi accedere senza oppure attivarla dalle impostazioni.",
          "password",
        );
      } else if (detail.includes("invalid_customer_credentials")) {
        showError(
          mode === "reset"
            ? "L’email non corrisponde a un unico profilo cliente di questo salone."
            : "Email e cellulare non appartengono allo stesso cliente di questo salone.",
          "password",
        );
      } else if (detail.includes("customer_password_otp_invalid")) {
        showError(
          "Verifica scaduta o già utilizzata. Richiedi un nuovo codice.",
          "password",
        );
      } else {
        showError(
          "Non riesco a salvare la password in questo momento. Riprova.",
          "password",
        );
      }
      return;
    }

    const resolvedPhone = normalizePhone(
      String(data?.telefono ?? normalizedPhone),
    );
    const paymentIdentity = {
      salonCode: normalizedSalonCode,
      email: normalizedEmail,
      phone: resolvedPhone,
    };
    if (returnToPayment) {
      // The OTP already changed the password. A storage or payment outage must
      // not invite another password reset or lose the original booking draft.
      await saveClientPasswordToVault({ ...paymentIdentity, password }).catch(() => undefined);
    } else {
      await saveClientPasswordToVault({ ...paymentIdentity, password });
    }
    let paymentAccessReady = false;
    if (returnToPayment) {
      try {
        await authenticateCustomerPayment(paymentIdentity, password);
        paymentAccessReady = true;
      } catch {
        // Return to the same checkout, where access can be verified again.
      }
    }

    setBusyAction(null);
    setPassword("");
    setConfirmPassword("");
    setOtpCode("");
    setVerifiedOtpToken("");
    setMessage("");
    setMessageTone(null);
    setMessageScope(null);
    setSuccessDialog({
      title:
        mode === "reset"
          ? "Password cambiata correttamente"
          : "Password attivata correttamente",
      message: returnToPayment
        ? paymentAccessReady
          ? "Password salvata e accesso verificato. Puoi riprendere il pagamento dalla tua prenotazione."
          : "Password salvata. La verifica del pagamento non è ancora riuscita: torna alla prenotazione e riprova con la nuova password. Non serve cambiarla di nuovo."
        : copy.success,
      resolvedPhone,
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.shell}>
          <View style={styles.hero}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Indietro"
              style={styles.backButton}
              onPress={handleBack}
              hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={22} color="#111827" />
            </TouchableOpacity>
            <AppWordmark />
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>
          </View>

          <View style={styles.card}>
            <Text
              maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
              style={[
                styles.sectionTitle,
                IS_ANDROID && styles.sectionTitleAndroid,
              ]}
            >
              {mode === "reset" ? "Inserisci la tua email" : "Identifica il profilo"}
            </Text>
            {showSalonCodeField ? (
              <View style={styles.fieldGroup}>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[
                    styles.fieldLabel,
                    IS_ANDROID && styles.fieldLabelAndroid,
                  ]}
                >
                  Codice salone
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    IS_ANDROID && styles.inputAndroid,
                    (fieldErrors.salon || identityFieldsInvalid) &&
                      styles.inputError,
                  ]}
                  value={salonCode}
                  editable={!returnToPayment}
                  onChangeText={(value) => {
                    setSalonCode(value);
                    setOtpSentTo("");
                    setVerifiedOtpToken("");
                    clearIdentityFeedback("salon");
                  }}
                  placeholder="Es. ABC123"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                />
                {fieldErrors.salon ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.salon}</Text>
                ) : null}
              </View>
            ) : null}
            <View style={styles.fieldGroup}>
              <Text
                maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                style={[
                  styles.fieldLabel,
                  IS_ANDROID && styles.fieldLabelAndroid,
                ]}
              >
                Email cliente
              </Text>
              <TextInput
                style={[
                  styles.input,
                  IS_ANDROID && styles.inputAndroid,
                  (fieldErrors.email || identityFieldsInvalid) &&
                    styles.inputError,
                ]}
                value={email}
                editable={!returnToPayment}
                onChangeText={(value) => {
                  setEmail(value);
                  setOtpSentTo("");
                  setVerifiedOtpToken("");
                  clearIdentityFeedback("email");
                }}
                placeholder="nome@email.it"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
              />
              {fieldErrors.email ? (
                <Text style={styles.fieldErrorText}>{fieldErrors.email}</Text>
              ) : null}
            </View>
            {mode === "activate" ? (
              <View style={styles.fieldGroup}>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[
                    styles.fieldLabel,
                    IS_ANDROID && styles.fieldLabelAndroid,
                  ]}
                >
                  Cellulare cliente
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    IS_ANDROID && styles.inputAndroid,
                    (fieldErrors.phone || identityFieldsInvalid) &&
                      styles.inputError,
                  ]}
                  value={phone}
                  editable={!returnToPayment}
                  onChangeText={(value) => {
                    setPhone(normalizePhone(value));
                    clearIdentityFeedback("phone");
                  }}
                  placeholder="Es. 333 123 4567"
                  placeholderTextColor="#94a3b8"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                />
                {fieldErrors.phone ? (
                  <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text>
                ) : null}
              </View>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={
                otpSent ? "Reinvia codice email" : "Invia codice email"
              }
              style={[
                styles.secondaryButton,
                (busyAction !== null || Boolean(retryCountdown)) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleSendOtp}
              disabled={busyAction !== null || Boolean(retryCountdown)}
              activeOpacity={0.88}
            >
              {busyAction === "send" ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[
                    styles.secondaryButtonText,
                    IS_ANDROID && styles.buttonTextAndroid,
                  ]}
                >
                  {retryCountdown
                    ? `Reinvia tra ${retryCountdown}`
                    : otpSent
                      ? "Reinvia codice email"
                      : "Invia codice email"}
                </Text>
              )}
            </TouchableOpacity>
            {message && messageScope === "identity" ? (
              <Text
                style={[
                  styles.message,
                  IS_ANDROID && styles.messageAndroid,
                  messageTone === "success" && styles.messageSuccess,
                ]}
                maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
              >
                {message}
              </Text>
            ) : null}
          </View>

          {otpSent ? (
            <View style={styles.card}>
              <Text
                maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                style={[
                  styles.sectionTitle,
                  IS_ANDROID && styles.sectionTitleAndroid,
                ]}
              >
                Verifica e scegli la password
              </Text>
              <View style={styles.otpBox}>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[styles.otpTitle, IS_ANDROID && styles.otpTitleAndroid]}
                >
                  Codice di verifica
                </Text>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[styles.otpHint, IS_ANDROID && styles.otpHintAndroid]}
                >
                  {otpExpired ? "Codice scaduto" : `Scade tra ${otpCountdown}`}
                </Text>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={styles.otpDescription}
                >
                  Inserisci il codice OTP ricevuto via email
                </Text>
                <TextInput
                  style={[
                    styles.input,
                    styles.otpInput,
                    IS_ANDROID && styles.inputAndroid,
                    IS_ANDROID && styles.otpInputAndroid,
                  ]}
                  value={otpCode}
                  onChangeText={(value) => {
                    const numericValue = value.replace(/\D+/g, "").slice(0, 6);
                    // Ignore labels suggested by Mail/keyboard (for example "SalonPro")
                    // so they cannot erase a code that the customer is already entering.
                    if (value.length > 0 && numericValue.length === 0) return;
                    setOtpCode(numericValue);
                    setVerifiedOtpToken("");
                    if (messageScope === "password") {
                      setMessage("");
                      setMessageTone(null);
                      setMessageScope(null);
                    }
                  }}
                  placeholder="000000"
                  keyboardType="number-pad"
                  textContentType={Platform.OS === "ios" ? "oneTimeCode" : undefined}
                  autoComplete={Platform.OS === "ios" ? "one-time-code" : "off"}
                  importantForAutofill={IS_ANDROID ? "no" : undefined}
                  maxLength={6}
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                />
              </View>
              <View style={styles.fieldGroup}>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[
                    styles.fieldLabel,
                    IS_ANDROID && styles.fieldLabelAndroid,
                  ]}
                >
                  Nuova password
                </Text>
                <PasswordTextInput
                  style={[styles.input, IS_ANDROID && styles.inputAndroid]}
                  compactHorizontalPadding={IS_ANDROID}
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (messageScope === "password") {
                      setMessage("");
                      setMessageTone(null);
                      setMessageScope(null);
                    }
                  }}
                  placeholder="Inserisci una password sicura"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                />
              </View>
              <PasswordRequirements
                password={password}
                compact={IS_ANDROID}
                alignLeft
              />
              <View style={styles.fieldGroup}>
                <Text
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                  style={[
                    styles.fieldLabel,
                    IS_ANDROID && styles.fieldLabelAndroid,
                  ]}
                >
                  Conferma password
                </Text>
                <PasswordTextInput
                  style={[styles.input, IS_ANDROID && styles.inputAndroid]}
                  compactHorizontalPadding={IS_ANDROID}
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    if (messageScope === "password") {
                      setMessage("");
                      setMessageTone(null);
                      setMessageScope(null);
                    }
                  }}
                  placeholder="Ripeti la nuova password"
                  placeholderTextColor="#94a3b8"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  textContentType="newPassword"
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                />
              </View>
              <PasswordMatchRequirement
                password={password}
                confirmPassword={confirmPassword}
                compact={IS_ANDROID}
                alignLeft
              />

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={copy.action}
                style={[
                  styles.primaryButton,
                  (!credentialsReady ||
                    !passwordReady ||
                    otpExpired ||
                    busyAction !== null) &&
                    styles.buttonDisabled,
                ]}
                onPress={handleSavePassword}
                disabled={
                  !credentialsReady ||
                  !passwordReady ||
                  otpExpired ||
                  busyAction !== null
                }
                activeOpacity={0.9}
              >
                {busyAction === "save" ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text
                    maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                    style={[
                      styles.primaryButtonText,
                      IS_ANDROID && styles.buttonTextAndroid,
                    ]}
                  >
                    {copy.action}
                  </Text>
                )}
              </TouchableOpacity>
              {message && messageScope === "password" ? (
                <Text
                  style={[
                    styles.message,
                    IS_ANDROID && styles.messageAndroid,
                    messageTone === "success" && styles.messageSuccess,
                  ]}
                  maxFontSizeMultiplier={ANDROID_TEXT_MAX_FONT_MULTIPLIER}
                >
                  {message}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <Modal
        animationType="fade"
        transparent
        visible={successDialog !== null}
        onRequestClose={handleSuccessContinue}
      >
        <View style={styles.successModalBackdrop}>
          <DockedSheetSurface webDocked={false} accessibilityRole="alert" style={styles.successModalCard}>
            <View style={styles.successModalIcon}>
              <Ionicons name="checkmark" size={28} color="#ffffff" />
            </View>
            <Text style={styles.successModalTitle}>{successDialog?.title ?? ""}</Text>
            <Text style={styles.successModalText}>{successDialog?.message ?? ""}</Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Conferma password aggiornata"
              style={styles.successModalButton}
              onPress={handleSuccessContinue}
              activeOpacity={0.86}
            >
              <Text style={styles.successModalButtonText}>{returnToPayment ? "Torna alla prenotazione" : "OK"}</Text>
            </TouchableOpacity>
          </DockedSheetSurface>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#edf2f6",
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 80,
  },
  shell: {
    width: "100%",
    maxWidth: 680,
    alignSelf: "center",
    gap: 16,
  },
  hero: {
    position: "relative",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 30,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 26,
    shadowColor: "#0f172a",
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 9 },
    elevation: 7,
  },
  backButton: {
    position: "absolute",
    left: 18,
    top: 18,
    zIndex: 20,
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: "#eef2f7",
    alignItems: "center",
    justifyContent: "center",
    cursor: Platform.OS === "web" ? "pointer" : "auto",
    elevation: 10,
  },
  title: {
    marginTop: 18,
    color: "#111827",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 9,
    color: "#64748b",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
    textAlign: "center",
    maxWidth: 520,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 26,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 5,
    gap: 12,
  },
  sectionTitle: {
    color: "#111827",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 2,
  },
  sectionTitleAndroid: {
    fontSize: 17,
    lineHeight: 21,
  },
  fieldGroup: {
    width: "100%",
    gap: 7,
  },
  fieldLabel: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  fieldLabelAndroid: {
    fontSize: 12,
    lineHeight: 15,
  },
  fieldErrorText: {
    color: "#b42318",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    paddingHorizontal: 4,
  },
  input: {
    width: "100%",
    minHeight: 60,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: "#94a3b8",
    backgroundColor: "#ffffff",
    color: "#111827",
    fontSize: 16,
    fontWeight: "700",
    fontStyle: "normal",
    letterSpacing: 0,
    paddingHorizontal: 16,
    textAlign: "left",
    shadowColor: "#64748b",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  inputAndroid: {
    minHeight: 54,
    fontSize: 14,
    paddingHorizontal: 14,
  },
  inputError: {
    borderColor: "#dc2626",
    backgroundColor: "#fff7f7",
    shadowColor: "#dc2626",
    shadowOpacity: 0.12,
  },
  otpBox: {
    marginTop: 2,
    borderRadius: 20,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#dbe4ee",
    padding: 16,
    gap: 8,
    alignItems: "center",
  },
  otpTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "900",
  },
  otpTitleAndroid: {
    fontSize: 14,
  },
  otpHint: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  otpHintAndroid: {
    fontSize: 12,
  },
  otpDescription: {
    color: "#475569",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  otpInput: {
    fontSize: 22,
    letterSpacing: 8,
    backgroundColor: "#ffffff",
  },
  otpInputAndroid: {
    fontSize: 19,
    letterSpacing: 6,
  },
  secondaryButton: {
    minHeight: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#0f172a",
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 4,
    shadowColor: "#0f172a",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
    elevation: 6,
  },
  secondaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    marginTop: 2,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  buttonTextAndroid: {
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.48,
  },
  message: {
    color: "#b91c1c",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  messageAndroid: {
    fontSize: 11.5,
    lineHeight: 16,
  },
  messageSuccess: {
    color: "#047857",
  },
  successModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    alignItems: "center",
    justifyContent: 'flex-end',
    paddingHorizontal: 24, paddingBottom: 0 },
  successModalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.28)",
    paddingHorizontal: 24,
    paddingTop: 26,
    paddingBottom: 22,
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  successModalIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  successModalTitle: {
    color: "#0f172a",
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "900",
    textAlign: "center",
  },
  successModalText: {
    color: "#475569",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    textAlign: "center",
    marginTop: 9,
  },
  successModalButton: {
    width: "100%",
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 22,
    cursor: Platform.OS === "web" ? "pointer" : "auto",
  },
  successModalButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
});
