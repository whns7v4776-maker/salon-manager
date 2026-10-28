import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13.2.2";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const origins = (Deno.env.get("CASH_PASSKEY_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const checked = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw new Error("database");
  return result.data;
};
const to64 = (value: Uint8Array) =>
  btoa(String.fromCharCode(...value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const from64 = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
Deno.serve(async (request) => {
  const origin = request.headers.get("Origin") || "";
  const allowed = origins.includes(origin);
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    Vary: "Origin",
    ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
  };
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers });
  if (request.method === "OPTIONS")
    return new Response(null, { status: allowed ? 204 : 403, headers });
  if (request.method !== "POST") return reply({ error: "method" }, 405);
  if (!allowed)
    return reply(
      {
        ready: false,
        error: "Sblocco con passkey non ancora attivato su questo dominio.",
      },
      503,
    );
  const authorization = request.headers.get("Authorization") || "";
  const owner = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const identity = await owner.auth.getUser();
  const user = identity.data.user;
  if (identity.error || !user?.email)
    return reply({ error: "Accedi con l’account del titolare." }, 401);
  const workspace = await owner.rpc("current_workspace_id");
  const access = await owner.rpc("workspace_access_allowed");
  if (workspace.error || !workspace.data || access.error || !access.data)
    return reply({ error: "Accesso al salone non disponibile." }, 403);
  const workspaceId = workspace.data;
  const rpID = new URL(origin).hostname;
  const membership = await admin
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("role", "owner")
    .maybeSingle();
  if (membership.error || !membership.data)
    return reply(
      { error: "Lo sblocco è riservato al titolare del salone." },
      403,
    );
  try {
    const body = await request.json();
    const verifyPassword = async () => {
      if (typeof body.password !== "string" || !body.password) return false;
      const verifier = createClient(url, anon, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
      try {
        const result = await verifier.auth.signInWithPassword({
          email: user.email!,
          password: body.password,
        });
        return !result.error && result.data.user?.id === user.id;
      } finally {
        await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
      }
    };
    if (body.action === "verify-password") {
      if (!(await verifyPassword()))
        return reply({ error: "Password del titolare non valida." }, 403);
      return reply({ verified: true });
    }
    const credentials =
      checked(
        await admin
          .from("cash_owner_passkeys")
          .select("*")
          .eq("user_id", user.id)
          .eq("workspace_id", workspaceId)
          .eq("rp_id", rpID),
      ) ?? [];
    if (body.action === "status")
      return reply({ ready: true, registered: credentials.length > 0 });
    if (
      body.action === "register-begin" ||
      body.action === "authenticate-begin"
    ) {
      const kind =
        body.action === "register-begin" ? "register" : "authenticate";
      if (kind === "register") {
        if (!(await verifyPassword()))
          return reply({ error: "Password del titolare non valida." }, 403);
      } else if (!credentials.length)
        return reply(
          { error: "Registra prima una passkey in Accesso e privacy." },
          400,
        );
      const recent =
        checked(
          await admin
            .from("cash_owner_passkey_challenges")
            .select("id")
            .eq("user_id", user.id)
            .eq("workspace_id", workspaceId)
            .gte("created_at", new Date(Date.now() - 300000).toISOString()),
        ) ?? [];
      if (recent.length >= 10)
        return reply(
          { error: "Attendi qualche minuto prima di riprovare." },
          429,
        );
      checked(
        await admin
          .from("cash_owner_passkey_challenges")
          .delete()
          .eq("user_id", user.id)
          .lt("expires_at", new Date().toISOString()),
      );
      const options =
        kind === "register"
          ? await generateRegistrationOptions({
              rpName: "SalonPro · Cassa",
              rpID,
              userName: user.email,
              userID: new TextEncoder().encode(user.id),
              attestationType: "none",
              excludeCredentials: credentials.map((c) => ({
                id: c.credential_id,
              })),
              authenticatorSelection: {
                authenticatorAttachment: "platform",
                residentKey: "preferred",
                userVerification: "required",
              },
            })
          : await generateAuthenticationOptions({
              rpID,
              allowCredentials: credentials.map((c) => ({
                id: c.credential_id,
                transports: c.transports,
              })),
              userVerification: "required",
            });
      const challenge = checked(
        await admin
          .from("cash_owner_passkey_challenges")
          .insert({
            user_id: user.id,
            workspace_id: workspaceId,
            kind,
            challenge: options.challenge,
            origin,
            rp_id: rpID,
          })
          .select("id")
          .single(),
      );
      if (!challenge) throw new Error("challenge");
      return reply({ options, challengeId: challenge.id });
    }
    if (
      body.action === "register-finish" ||
      body.action === "authenticate-finish"
    ) {
      const kind =
        body.action === "register-finish" ? "register" : "authenticate";
      // Atomic delete consumes the challenge before verification, including failed attempts.
      const challenge = checked(
        await admin
          .from("cash_owner_passkey_challenges")
          .delete()
          .eq("id", body.challengeId)
          .eq("user_id", user.id)
          .eq("workspace_id", workspaceId)
          .eq("kind", kind)
          .eq("origin", origin)
          .eq("rp_id", rpID)
          .gt("expires_at", new Date().toISOString())
          .select()
          .maybeSingle(),
      );
      if (!challenge)
        return reply({ error: "Verifica scaduta o già usata. Riprova." }, 403);
      if (kind === "register") {
        const result = await verifyRegistrationResponse({
          response: body.credential,
          expectedChallenge: challenge.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
        });
        if (!result.verified || !result.registrationInfo)
          return reply({ error: "Registrazione non verificata." }, 403);
        const c = result.registrationInfo.credential;
        checked(
          await admin.from("cash_owner_passkeys").insert({
            credential_id: c.id,
            user_id: user.id,
            workspace_id: workspaceId,
            rp_id: rpID,
            public_key: to64(c.publicKey),
            counter: c.counter,
            transports: c.transports || [],
          }),
        );
      } else {
        const c = credentials.find(
          (c) => c.credential_id === body.credential?.id,
        );
        if (!c)
          return reply(
            { error: "Passkey non riconosciuta per questo titolare." },
            403,
          );
        const result = await verifyAuthenticationResponse({
          response: body.credential,
          expectedChallenge: challenge.challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          requireUserVerification: true,
          credential: {
            id: c.credential_id,
            publicKey: from64(c.public_key),
            counter: Number(c.counter),
            transports: c.transports,
          },
        });
        if (!result.verified)
          return reply({ error: "Sblocco non verificato." }, 403);
        checked(
          await admin
            .from("cash_owner_passkeys")
            .update({ counter: result.authenticationInfo.newCounter })
            .eq("credential_id", c.credential_id)
            .eq("counter", c.counter)
            .select("credential_id")
            .single(),
        );
      }
      return reply({ verified: true });
    }
    return reply({ error: "Azione non disponibile." }, 400);
  } catch {
    return reply(
      { error: "Verifica non riuscita. Riprova con la password." },
      400,
    );
  }
});
