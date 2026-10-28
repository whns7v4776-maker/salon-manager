import { giftEmail } from "./template.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers, status });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return reply({ error: "Metodo non consentito" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const owner = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: {
        headers: { Authorization: req.headers.get("Authorization") || "" },
      },
      auth: { persistSession: false },
    });
    const auth = await owner.auth.getUser();
    if (auth.error || !auth.data.user)
      return reply({ error: "Accesso richiesto" }, 401);
    const [workspace, access] = await Promise.all([
      owner.rpc("current_workspace_id"),
      owner.rpc("workspace_access_allowed"),
    ]);
    if (workspace.error || !workspace.data || access.error || !access.data)
      return reply({ error: "Accesso non consentito" }, 403);
    const { giftId } = await req.json();
    if (typeof giftId !== "string" || !/^[a-f0-9-]{36}$/i.test(giftId))
      return reply({ error: "Buono non valido" }, 400);
    const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const gift = await db
      .from("customer_gift_cards")
      .select("*")
      .eq("id", giftId)
      .eq("workspace_id", workspace.data)
      .single();
    if (gift.error || !gift.data)
      return reply({ error: "Buono non trovato" }, 404);
    const g = gift.data;
    const customer = await db
      .from("customers")
      .select("email,full_name")
      .eq("id", g.customer_id)
      .eq("workspace_id", workspace.data)
      .single();
    const email = customer.data?.email?.trim();
    if (customer.error || !email || !/^\S+@\S+\.\S+$/.test(email))
      return reply(
        {
          error:
            "Aggiungi prima una email valida alla scheda del destinatario.",
        },
        400,
      );
    const prior = await db
      .from("gift_card_deliveries")
      .select("*")
      .eq("gift_card_id", giftId)
      .maybeSingle();
    if (prior.error) throw Error("storage");
    if (prior.data?.status === "accepted")
      return reply({ status: "accepted", recipient: prior.data.recipient });
    // A retry uses the same recipient, content and provider idempotency key. Beyond
    // the provider's 24-hour deduplication window, never automatically resend uncertain mail.
    if (
      prior.data &&
      Date.now() - Date.parse(prior.data.updated_at) > 23 * 3600000
    )
      return reply(
        {
          error:
            "Invio precedente da verificare. Puoi scaricare e condividere il buono.",
        },
        409,
      );
    const key = Deno.env.get("RESEND_API_KEY"),
      from = Deno.env.get("EMAIL_FROM") || Deno.env.get("RESEND_FROM");
    if (!key || !from)
      return reply(
        { error: "Invio email non configurato. Il buono resta scaricabile." },
        503,
      );
    const recipient = prior.data?.recipient || email;
    const money = (g.amount_cents / 100).toLocaleString("it-IT", {
      style: "currency",
      currency: "EUR",
    });
    const salon = await db
      .from("workspaces")
      .select("salon_name,slug")
      .eq("id", workspace.data)
      .single();
    if (salon.error || !salon.data) throw Error("salon");
    const html = giftEmail({
      salon: salon.data.salon_name || "Il tuo salone",
      customer: customer.data.full_name || "a te",
      amount: money,
      sender: g.sender_name,
      message: g.message,
      code: g.code,
      expiry: g.expires_on ? g.expires_on.split("-").reverse().join("/") : null,
      url: `https://salonpro.dev/join/${encodeURIComponent(salon.data.slug)}`,
    });
    const bytes = await Deno.readFile("./salon-pro-email-otp-logo.png");
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const payload = prior.data?.payload || {
      from,
      to: [recipient],
      subject: `Un regalo ti aspetta da ${salon.data.salon_name || "il tuo salone"} · SalonPro`,
      html,
      attachments: [
        {
          filename: "salonpro-logo.png",
          content_id: "salonpro-app-logo",
          content: btoa(binary),
        },
      ],
    };
    if (!prior.data) {
      const claim = await db
        .from("gift_card_deliveries")
        .insert({
          gift_card_id: giftId,
          workspace_id: workspace.data,
          recipient,
          status: "sending",
          payload,
        });
      if (claim.error)
        return reply({ error: "Invio già in corso. Riprova fra poco." }, 409);
    }
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `gift-card/${giftId}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw Error("provider");
      const result = await response.json();
      if (!result.id) throw Error("provider");
      const saved = await db
        .from("gift_card_deliveries")
        .update({ status: "accepted", provider_id: result.id })
        .eq("gift_card_id", giftId);
      if (saved.error) throw Error("storage");
      return reply({ status: "accepted", recipient });
    } catch {
      await db
        .from("gift_card_deliveries")
        .update({ status: "uncertain" })
        .eq("gift_card_id", giftId);
      return reply(
        {
          error:
            "Esito email da verificare. Riprova per controllare senza duplicare il buono.",
        },
        502,
      );
    }
  } catch {
    return reply({ error: "Invio non disponibile. Riprova." }, 500);
  }
});
