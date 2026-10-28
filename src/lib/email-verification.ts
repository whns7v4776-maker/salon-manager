import { supabase, publicSupabase } from "./supabase";
import { withClientDeadline } from './client-request-deadline';

export type EmailOtpPurpose =
  | "owner_registration"
  | "client_registration"
  | "client_email_completion"
  | "client_password_activation"
  | "client_password_reset";
export type EmailOtpProviderReason =
  | "sender_not_verified"
  | "invalid_recipient"
  | "provider_rate_limited"
  | "provider_auth_failed"
  | "provider_transient"
  | "provider_rejected";

type EmailOtpRequestFailure = {
  ok: false;
  error: string;
  providerReason?: EmailOtpProviderReason;
  providerStatus?: number;
  requestId?: string;
  retryAfterSeconds?: number;
};

export const EMAIL_OTP_TTL_MS = 15 * 60_000;
const EMAIL_OTP_REQUEST_TIMEOUT_MS = 22_000;

export function buildEmailOtpVerificationErrorMessage(error: string) {
  if (error === 'code_expired') return 'Codice OTP scaduto. Premi «Invia di nuovo» qui sotto per riceverne un altro.';
  if (error === 'too_many_attempts') return 'Troppi tentativi. Premi «Invia di nuovo» qui sotto per ricevere un nuovo codice OTP.';
  if (error === 'code_not_found') return 'Codice OTP non più disponibile. Premi «Invia di nuovo» qui sotto.';
  if (error === 'request_timeout') return 'La verifica sta impiegando troppo tempo. Controlla la connessione e riprova.';
  if (/network|fetch|connection|offline|abort/i.test(error)) return 'Connessione assente o instabile. Controlla la rete e riprova.';
  if (error === 'invalid_code') return 'Codice OTP non corretto. Controlla le 6 cifre e riprova.';
  return 'Non riesco a verificare il codice OTP adesso. Controlla la connessione e riprova.';
}

const normalizeEmail = (value: string) => value.trim().toLowerCase();
const normalizeSalonCode = (value?: string | null) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

export function parseEmailOtpExpiresAt(value?: string | null) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now() + EMAIL_OTP_TTL_MS;
}

export function formatEmailOtpCountdown(expiresAtMs: number, nowMs: number) {
  const totalSeconds = Math.max(0, Math.ceil((expiresAtMs - nowMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export async function requestEmailOtp({
  email,
  purpose,
  salonCode,
  customerPhone,
}: {
  email: string;
  purpose: EmailOtpPurpose;
  salonCode?: string | null;
  customerPhone?: string | null;
}) {
  let data: Record<string, unknown> | null = null;
  let error: {
    message?: string;
    context?: { json?: () => Promise<unknown> };
  } | null = null;
  const requestController = new AbortController();
  const requestTimeout = setTimeout(
    () => requestController.abort(),
    EMAIL_OTP_REQUEST_TIMEOUT_MS,
  );
  try {
    const otpClient = purpose === 'client_password_activation' ? publicSupabase : supabase;
    const invocation = await withClientDeadline(otpClient.functions.invoke("send-email-otp", {
      signal: requestController.signal,
      body: {
        email: normalizeEmail(email),
        purpose,
        salonCode: normalizeSalonCode(salonCode),
        customerPhone: String(customerPhone ?? "")
          .replace(/\D+/g, "")
        .slice(-10),
      },
    }));
    data =
      invocation.data &&
      typeof invocation.data === "object" &&
      !Array.isArray(invocation.data)
        ? (invocation.data as Record<string, unknown>)
        : null;
    error = invocation.error;
  } catch (requestError) {
    return {
      ok: false as const,
      error: requestController.signal.aborted || (requestError instanceof Error && requestError.message==='request_timeout')
        ? "request_timeout"
        : "network_error",
      providerReason: "provider_transient" as const,
      requestId:
        requestError instanceof Error ? requestError.name : undefined,
    } satisfies EmailOtpRequestFailure;
  } finally {
    clearTimeout(requestTimeout);
  }

  if (error) {
    const maybeContext = error as {
      context?: {
        json?: () => Promise<unknown>;
      };
    };
    const contextPayload = await maybeContext.context
      ?.json?.()
      .catch(() => null);

    if (
      contextPayload &&
      typeof contextPayload === "object" &&
      !Array.isArray(contextPayload)
    ) {
      const record = contextPayload as Record<string, unknown>;
      return {
        ok: false as const,
        error: String(record.error ?? error.message ?? "otp_request_failed"),
        providerReason:
          typeof record.providerReason === "string"
            ? (record.providerReason as EmailOtpProviderReason)
            : undefined,
        providerStatus:
          typeof record.providerStatus === "number"
            ? record.providerStatus
            : undefined,
        requestId:
          typeof record.requestId === "string" ? record.requestId : undefined,
        retryAfterSeconds:
          typeof record.retryAfterSeconds === "number"
            ? record.retryAfterSeconds
            : undefined,
      } satisfies EmailOtpRequestFailure;
    }

    return {
      ok: false as const,
      error: requestController.signal.aborted ? 'request_timeout' : 'network_error',
    } satisfies EmailOtpRequestFailure;
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      error: String(data?.error ?? "otp_request_failed"),
      providerReason:
        typeof data?.providerReason === "string"
          ? (data.providerReason as EmailOtpProviderReason)
          : undefined,
      providerStatus:
        typeof data?.providerStatus === "number"
          ? data.providerStatus
          : undefined,
      requestId:
        typeof data?.requestId === "string" ? data.requestId : undefined,
      retryAfterSeconds:
        typeof data?.retryAfterSeconds === "number"
          ? data.retryAfterSeconds
          : undefined,
    } satisfies EmailOtpRequestFailure;
  }

  return {
    ok: true as const,
    expiresAt: String(data.expiresAt ?? ""),
    requestId: typeof data?.requestId === "string" ? data.requestId : undefined,
  };
}

export function buildEmailOtpRequestErrorMessage({
  error,
  providerReason,
  retryAfterSeconds,
}: {
  error?: string;
  providerReason?: EmailOtpProviderReason;
  retryAfterSeconds?: number;
}) {
  if (error === "rate_limited") {
    return `Codice gia inviato. Riprova tra ${retryAfterSeconds ?? 45} secondi.`;
  }

  if (error === "missing_email_provider") {
    return "Invio email non configurato. Controlla RESEND_API_KEY su Supabase.";
  }

  if (error === "missing_supabase_env") {
    return "Invio email non configurato. Controlla le variabili Supabase della funzione OTP.";
  }

  if (error === "invalid_request") {
    return "Dati email non validi. Controlla indirizzo email e salone collegato.";
  }

  if (error === "invalid_customer_password_request") {
    return "I dati non corrispondono a un profilo cliente abilitato per questa operazione.";
  }

  if (error === "invalid_customer_email_completion_request") {
    return "Non posso completare l’email per questi dati. Controlla cellulare, email e salone.";
  }

  if (error === "otp_store_failed" || error === "cooldown_check_failed") {
    return "Non riesco a preparare il codice OTP. Riprova tra qualche secondo.";
  }

  if (error === "email_send_failed") {
    if (providerReason === "sender_not_verified") {
      return "Invio email bloccato: il dominio mittente non e verificato su Resend.";
    }
    if (providerReason === "invalid_recipient") {
      return "Questa email non sembra accettata dal provider. Controlla l’indirizzo o usa un’altra mail.";
    }
    if (providerReason === "provider_rate_limited") {
      return "Il provider email sta limitando gli invii. Riprova tra qualche minuto.";
    }
    if (providerReason === "provider_auth_failed") {
      return "Invio email bloccato: credenziali Resend non valide.";
    }
    if (providerReason === "provider_transient") {
      return "Invio email temporaneamente non disponibile. Riprova tra qualche secondo.";
    }
    return "Il provider email ha rifiutato l’invio. Riprova o usa un’altra mail.";
  }

  if (error === "unexpected_error") {
    return "Errore temporaneo durante l’invio OTP. Riprova tra qualche secondo.";
  }

  if (error === "network_error") {
    return "Connessione assente o instabile. Controlla la rete e riprova. Se il codice è già arrivato, inseriscilo: i dati restano in questa schermata.";
  }

  if (error === "request_timeout") {
    return "Non ho ricevuto conferma dell’invio. Controlla la posta: se il codice è arrivato puoi inserirlo, altrimenti riprova con una connessione stabile.";
  }

  return "Non riesco a inviare il codice email in questo momento.";
}

export async function verifyEmailOtp({
  email,
  purpose,
  code,
  salonCode,
}: {
  email: string;
  purpose: EmailOtpPurpose;
  code: string;
  salonCode?: string | null;
}) {
  let verification: Awaited<ReturnType<typeof supabase.rpc>>;
  const verificationController = new AbortController();
  const verificationTimeout = setTimeout(
    () => verificationController.abort(),
    EMAIL_OTP_REQUEST_TIMEOUT_MS,
  );
  try {
    const otpClient = purpose === 'client_password_activation' ? publicSupabase : supabase;
    verification = await withClientDeadline(otpClient
      .rpc("verify_email_otp", {
        p_email: normalizeEmail(email),
        p_purpose: purpose,
        p_code: code.replace(/\D+/g, ""),
        p_salon_code: normalizeSalonCode(salonCode) || null,
      })
      .abortSignal(verificationController.signal));
  } catch {
    return {
      ok: false as const,
      error: verificationController.signal.aborted
        ? "request_timeout"
        : "network_error",
    };
  } finally {
    clearTimeout(verificationTimeout);
  }

  const { data, error } = verification;

  if (error) {
    return { ok: false as const, error: error.message || "otp_verify_failed" };
  }

  if (!data?.ok) {
    return {
      ok: false as const,
      error: String(data?.error ?? "otp_verify_failed"),
    };
  }

  return { ok: true as const, token: String(data.token ?? "") };
}
