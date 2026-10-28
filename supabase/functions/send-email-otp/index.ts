import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const salonProEmailLogoFilename = "salon-pro-email-otp-logo.png";
let salonProEmailLogoBase64: string | null = null;

const encodeBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const getSalonProEmailLogoBase64 = async () => {
  if (salonProEmailLogoBase64) return salonProEmailLogoBase64;
  const logoBytes = await Deno.readFile(`./${salonProEmailLogoFilename}`);
  salonProEmailLogoBase64 = encodeBase64(logoBytes);
  return salonProEmailLogoBase64;
};

const baseHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: baseHeaders });

const otpFailureResponse = (payload: Record<string, unknown>) =>
  jsonResponse({ ok: false, ...payload });

const getEnvValue = (...keys: string[]) => {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value?.trim()) return value.trim();
  }
  return null;
};

const getEnvValues = (...keys: string[]) => {
  const values: string[] = [];

  keys.forEach((key) => {
    const value = Deno.env.get(key);
    if (!value?.trim()) return;

    value
      .split(/[\n;,]+/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        if (!values.includes(item)) {
          values.push(item);
        }
      });
  });

  return values;
};

const normalizeEmail = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const normalizeSalonCode = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase();
const normalizePhone = (value: unknown) =>
  String(value ?? "")
    .replace(/\D+/g, "")
    .slice(-10);
const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const maskEmail = (value: string) => {
  const [local = "", domain = ""] = value.split("@");
  const safeLocal =
    local.length <= 2
      ? `${local.slice(0, 1)}***`
      : `${local.slice(0, 2)}***${local.slice(-1)}`;
  return domain ? `${safeLocal}@${domain}` : safeLocal;
};

const detectProviderFailureReason = (detail: string) => {
  const value = detail.toLowerCase();
  if (
    value.includes("testing emails") ||
    value.includes("verify a domain") ||
    value.includes("domain is not verified")
  ) {
    return "sender_not_verified";
  }
  if (
    value.includes("invalid") &&
    (value.includes("email") ||
      value.includes("recipient") ||
      value.includes("to"))
  ) {
    return "invalid_recipient";
  }
  if (value.includes("rate limit") || value.includes("too many")) {
    return "provider_rate_limited";
  }
  if (
    value.includes("api key") ||
    value.includes("unauthorized") ||
    value.includes("forbidden")
  ) {
    return "provider_auth_failed";
  }
  return "provider_rejected";
};

const mergeMetadata = (
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
) => ({
  ...base,
  ...extra,
});

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function buildOtpCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % 1000000).padStart(6, "0");
}

async function sendOtpEmailWithFallback({
  resendApiKey,
  fromCandidates,
  email,
  subject,
  text,
  html,
  attachments,
}: {
  resendApiKey: string;
  fromCandidates: string[];
  email: string;
  subject: string;
  text: string;
  html: string;
  attachments?: {
    path?: string;
    content?: string;
    filename: string;
    content_id: string;
  }[];
}) {
  const attempts: {
    from: string;
    providerStatus: number;
    providerReason: string;
    detail: string;
  }[] = [];
  const candidates =
    fromCandidates.length > 0
      ? fromCandidates
      : ["SalonPro <noreply@salonpro.app>"];

  for (const from of candidates) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const emailResult = await fetch("https://api.resend.com/emails", {
          method: "POST",
          signal: AbortSignal.timeout(8_000),
          headers: {
            authorization: `Bearer ${resendApiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [email],
            subject,
            text,
            html,
            ...(attachments?.length ? { attachments } : {}),
          }),
        });

        if (emailResult.ok) {
          const providerPayload = await emailResult.json().catch(() => null);
          return {
            ok: true as const,
            from,
            providerPayload,
            attempts,
          };
        }

        const detail = await emailResult.text().catch(() => "");
        const providerReason =
          emailResult.status >= 500
            ? "provider_transient"
            : detectProviderFailureReason(detail);
        attempts.push({
          from,
          providerStatus: emailResult.status,
          providerReason,
          detail,
        });

        if (providerReason === "provider_transient" && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 650));
          continue;
        }

        if (
          providerReason === "sender_not_verified" &&
          candidates.length > attempts.length
        ) {
          break;
        }

        return {
          ok: false as const,
          providerStatus: emailResult.status,
          providerReason,
          detail,
          attempts,
        };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        attempts.push({
          from,
          providerStatus: 0,
          providerReason: "provider_transient",
          detail,
        });

        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 650));
          continue;
        }

        return {
          ok: false as const,
          providerStatus: 0,
          providerReason: "provider_transient",
          detail,
          attempts,
        };
      }
    }
  }

  const lastAttempt = attempts[attempts.length - 1];
  return {
    ok: false as const,
    providerStatus: lastAttempt?.providerStatus ?? 0,
    providerReason: lastAttempt?.providerReason ?? "provider_rejected",
    detail: lastAttempt?.detail ?? "",
    attempts,
  };
}

Deno.serve(async (request) => {
  try {
    if (request.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: baseHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
    }

    const supabaseUrl = getEnvValue("SUPABASE_URL", "URL");
    const serviceRoleKey = getEnvValue(
      "SUPABASE_SERVICE_ROLE_KEY",
      "SERVICE_ROLE_KEY",
    );
    const resendApiKey = getEnvValue("RESEND_API_KEY");
    const emailFromCandidates = getEnvValues(
      "EMAIL_FROM",
      "RESEND_FROM",
      "EMAIL_FROM_FALLBACKS",
      "RESEND_FROM_FALLBACKS",
    );

    if (!supabaseUrl || !serviceRoleKey) {
      return otpFailureResponse({ error: "missing_supabase_env" });
    }

    if (!resendApiKey) {
      return otpFailureResponse({ error: "missing_email_provider" });
    }

    const body = await request.json().catch(() => ({}));
    const email = normalizeEmail(body?.email);
    const purpose = String(body?.purpose ?? "").trim();
    const salonCode = normalizeSalonCode(body?.salonCode) || null;
    const customerPhone = normalizePhone(body?.customerPhone);
    const isCustomerPasswordPurpose =
      purpose === "client_password_activation" ||
      purpose === "client_password_reset";
    const isCustomerEmailCompletionPurpose =
      purpose === "client_email_completion";

    if (
      !isValidEmail(email) ||
      ![
        "owner_registration",
        "client_registration",
        "client_email_completion",
        "client_password_activation",
        "client_password_reset",
      ].includes(purpose) ||
      ((purpose === "client_password_activation" ||
        isCustomerEmailCompletionPurpose) &&
        (!salonCode || customerPhone.length < 9)) ||
      (purpose === "client_password_reset" && !salonCode)
    ) {
      return otpFailureResponse({ error: "invalid_request" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    if (isCustomerPasswordPurpose) {
      const eligibilityResult = await supabase.rpc(
        "can_request_public_customer_password_otp",
        {
          p_salon_code: salonCode,
          p_customer_email: email,
          p_customer_phone: customerPhone,
          p_purpose: purpose,
        },
      );

      if (eligibilityResult.error || !eligibilityResult.data?.ok) {
        return otpFailureResponse({
          error: "invalid_customer_password_request",
        });
      }
    }

    if (isCustomerEmailCompletionPurpose) {
      const eligibilityResult = await supabase.rpc(
        "can_request_public_customer_email_completion_otp",
        {
          p_salon_code: salonCode,
          p_customer_email: email,
          p_customer_phone: customerPhone,
        },
      );

      if (eligibilityResult.error || !eligibilityResult.data?.ok) {
        return otpFailureResponse({
          error: "invalid_customer_email_completion_request",
        });
      }
    }

    const cooldownSince = new Date(Date.now() - 45_000).toISOString();
    let latestQuery = supabase
      .from("email_otp_verifications")
      .select("last_sent_at")
      .eq("email", email)
      .eq("purpose", purpose)
      .gte("last_sent_at", cooldownSince)
      .order("last_sent_at", { ascending: false })
      .limit(1);

    latestQuery = salonCode
      ? latestQuery.eq("salon_code", salonCode)
      : latestQuery.is("salon_code", null);
    const latestResult = await latestQuery.maybeSingle();

    if (latestResult.error) {
      return otpFailureResponse({ error: "cooldown_check_failed" });
    }

    if (latestResult.data?.last_sent_at) {
      const sentAt = new Date(latestResult.data.last_sent_at).getTime();
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((sentAt + 45_000 - Date.now()) / 1000),
      );
      return otpFailureResponse({ error: "rate_limited", retryAfterSeconds });
    }

    const requestId = crypto.randomUUID();
    const code = buildOtpCode();
    const salt = crypto.randomUUID();
    const codeHash = await sha256(`${code}:${salt}`);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
    const baseMetadata = {
      provider: "resend",
      delivery_status: "pending",
      request_id: requestId,
      ...(isCustomerEmailCompletionPurpose
        ? { customer_phone: customerPhone }
        : {}),
    };
    const title =
      purpose === "owner_registration"
        ? "Codice verifica registrazione salone"
        : purpose === "client_email_completion"
          ? "Completa il tuo accesso cliente"
          : purpose === "client_password_activation"
            ? "Codice attivazione password cliente"
            : purpose === "client_password_reset"
              ? "Codice recupero password cliente"
              : "Codice verifica registrazione cliente";
    const actionDescription =
      purpose === "client_password_activation"
        ? "attivare la password del profilo cliente"
        : purpose === "client_email_completion"
          ? "salvare la tua email e completare il primo accesso"
          : purpose === "client_password_reset"
            ? "reimpostare la password del profilo cliente"
            : "continuare la registrazione";
    const emailBrand = `<div><img src="cid:salonpro-app-logo" alt="SalonPro" width="360" style="display:block;width:360px;max-width:92%;height:auto;margin:0 auto;border:0;border-radius:14px;outline:none;text-decoration:none"></div>`;
    const salonProEmailLogoContent = await getSalonProEmailLogoBase64();

    const insertResult = await supabase
      .from("email_otp_verifications")
      .insert({
        email,
        purpose,
        salon_code: salonCode,
        code_hash: codeHash,
        code_salt: salt,
        expires_at: expiresAt,
        metadata: baseMetadata,
      })
      .select("id")
      .single();

    if (insertResult.error?.message?.includes("otp_send_rate_limited")) {
      const seconds = Number(insertResult.error.details);
      return otpFailureResponse({
        error: "rate_limited",
        retryAfterSeconds: Number.isFinite(seconds) ? Math.max(1, Math.min(45, seconds)) : 45,
        requestId,
      });
    }

    if (insertResult.error || !insertResult.data?.id) {
      console.log("send-email-otp store failed", {
        requestId,
        email: maskEmail(email),
        purpose,
        salonCode,
        error: insertResult.error?.message ?? "missing_insert_id",
      });
      return otpFailureResponse({ error: "otp_store_failed", requestId });
    }

    const otpId = insertResult.data.id;
    const emailResult = await sendOtpEmailWithFallback({
      resendApiKey,
      fromCandidates: emailFromCandidates,
      email,
      subject: `Il tuo codice SalonPro è ${code}`,
      text: `Il tuo codice di verifica SalonPro è ${code}.\n\nUsalo per ${actionDescription}. Scade tra 15 minuti. Se non hai effettuato tu la richiesta, ignora questa email.`,
      html: `<div style="margin:0;padding:32px 16px;background:#eef2f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111827"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">Il tuo codice di verifica SalonPro è ${code}.</div><div style="max-width:560px;margin:0 auto;overflow:hidden;border:1px solid #d8dee6;border-radius:28px;background:#ffffff;box-shadow:0 18px 45px rgba(15,23,42,.12)"><div style="padding:30px 24px 24px;text-align:center;background:linear-gradient(145deg,#f8fafc 0%,#d7d7d7 100%)">${emailBrand}<div style="margin-top:12px;font-size:12px;font-weight:800;letter-spacing:2px;color:#475569">AREA CLIENTE</div></div><div style="padding:30px 24px 32px;text-align:center"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#111827">${title}</h1><p style="margin:14px auto 0;max-width:430px;font-size:15px;line-height:1.6;color:#64748b">Inserisci il codice numerico nell'app per ${actionDescription}.</p><div style="display:inline-block;margin:24px auto 14px;padding:16px 22px;border-radius:18px;background:#111827;color:#ffffff;font-size:32px;font-weight:900;letter-spacing:9px">${code}</div><p style="margin:8px 0 0;font-size:14px;font-weight:700;color:#475569">Il codice scade tra 15 minuti.</p><p style="margin:10px 0 0;font-size:13px;font-weight:700;color:#64748b">Non trovi la mail? Controlla anche Spam o Posta indesiderata.</p><div style="height:1px;margin:26px 0;background:#e2e8f0"></div><p style="margin:0;font-size:12px;line-height:1.55;color:#94a3b8">Se non hai effettuato tu questa richiesta, ignora l'email. Nessuna password viene modificata senza il codice.</p></div></div></div>`,
      attachments: [
        {
          content: salonProEmailLogoContent,
          filename: "salonpro-logo.png",
          content_id: "salonpro-app-logo",
        },
      ],
    });

    if (!emailResult.ok) {
      console.log("send-email-otp email failed", {
        requestId,
        email: maskEmail(email),
        purpose,
        salonCode,
        providerStatus: emailResult.providerStatus,
        providerReason: emailResult.providerReason,
        detail: emailResult.detail,
        attempts: emailResult.attempts,
      });
      await supabase
        .from("email_otp_verifications")
        .update({
          consumed_at: new Date().toISOString(),
          last_sent_at: "1970-01-01T00:00:00.000Z",
          metadata: mergeMetadata(baseMetadata, {
            delivery_status: "failed",
            provider_status: emailResult.providerStatus,
            provider_reason: emailResult.providerReason,
            provider_attempts: emailResult.attempts.map((attempt) => ({
              from: attempt.from,
              provider_status: attempt.providerStatus,
              provider_reason: attempt.providerReason,
            })),
          }),
        })
        .eq("id", otpId);
      return otpFailureResponse({
        error: "email_send_failed",
        providerReason: emailResult.providerReason,
        providerStatus: emailResult.providerStatus,
        requestId,
      });
    }

    const updateResult = await supabase
      .from("email_otp_verifications")
      .update({
        metadata: mergeMetadata(baseMetadata, {
          delivery_status: "sent",
          provider_from: emailResult.from,
          provider_attempt_count: emailResult.attempts.length + 1,
          provider_message_id:
            emailResult.providerPayload &&
            typeof emailResult.providerPayload === "object" &&
            "id" in emailResult.providerPayload
              ? String(emailResult.providerPayload.id)
              : null,
        }),
      })
      .eq("id", otpId);

    if (updateResult.error) {
      console.log("send-email-otp delivery metadata update failed", {
        requestId,
        email: maskEmail(email),
        purpose,
        salonCode,
        error: updateResult.error.message,
      });
    }

    return jsonResponse({ ok: true, expiresAt, requestId });
  } catch (error) {
    console.log("send-email-otp failed", error);
    return otpFailureResponse({ error: "unexpected_error" });
  }
});
