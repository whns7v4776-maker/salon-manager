import { supabase } from "./supabase";
const bytes = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
const base64 = (value: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(value)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export async function requestCashAccess(body: Record<string, unknown>) {
  const result = await supabase.functions.invoke("cash-passkey", { body });
  if (result.error || result.data?.error || !result.data) {
    let message = result.data?.error;
    if (!message && result.error?.context) {
      try {
        message = (await result.error.context.json()).error;
      } catch {}
    }
    throw new Error(
      message || "Verifica del titolare non disponibile. Riprova tra poco.",
    );
  }
  return result.data;
}
export async function cashPasskeyStatus() {
  if (
    typeof window === "undefined" ||
    !window.isSecureContext ||
    typeof PublicKeyCredential === "undefined"
  )
    return { supported: false, ready: false, registered: false };
  const supported =
    await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(
      () => false,
    );
  if (!supported) return { supported: false, ready: false, registered: false };
  try {
    return { supported, ...(await requestCashAccess({ action: "status" })) };
  } catch {
    return { supported, ready: false, registered: false };
  }
}
function serialize(credential: PublicKeyCredential) {
  const response = credential.response;
  const common = {
    id: credential.id,
    rawId: base64(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credential.authenticatorAttachment,
  };
  if ("attestationObject" in response) {
    const r = response as AuthenticatorAttestationResponse;
    return {
      ...common,
      response: {
        clientDataJSON: base64(r.clientDataJSON),
        attestationObject: base64(r.attestationObject),
        transports: r.getTransports?.() ?? [],
      },
    };
  }
  const r = response as AuthenticatorAssertionResponse;
  return {
    ...common,
    response: {
      clientDataJSON: base64(r.clientDataJSON),
      authenticatorData: base64(r.authenticatorData),
      signature: base64(r.signature),
      userHandle: r.userHandle ? base64(r.userHandle) : undefined,
    },
  };
}
export async function verifyCashPasskey(register = false, password?: string) {
  const begin = await requestCashAccess({
    action: register ? "register-begin" : "authenticate-begin",
    ...(register ? { password } : {}),
  });
  const options = begin.options;
  let credential: Credential | null;
  if (register) {
    credential = await navigator.credentials.create({
      publicKey: {
        ...options,
        challenge: bytes(options.challenge),
        user: { ...options.user, id: bytes(options.user.id) },
        excludeCredentials: options.excludeCredentials?.map((c: any) => ({
          ...c,
          id: bytes(c.id),
        })),
      },
    });
  } else {
    credential = await navigator.credentials.get({
      publicKey: {
        ...options,
        challenge: bytes(options.challenge),
        allowCredentials: options.allowCredentials?.map((c: any) => ({
          ...c,
          id: bytes(c.id),
        })),
      },
    });
  }
  if (!credential) throw new Error("Sblocco annullato.");
  const result = await requestCashAccess({
    action: register ? "register-finish" : "authenticate-finish",
    challengeId: begin.challengeId,
    credential: serialize(credential as PublicKeyCredential),
  });
  if (result.verified !== true) throw new Error("Verifica non riuscita.");
}
