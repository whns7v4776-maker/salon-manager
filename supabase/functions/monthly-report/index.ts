import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sections, reportEmail } from "./report.ts";
import { base64, reportFiles } from "./files.ts";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Content-Type": "application/json",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return reply({ error: "Metodo non consentito" }, 405);
  try {
    const body = await req.json();
    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    if (body.action === "dispatch") {
      // Public dispatch cannot select a salon, recipient, or report. Only due, opted-in
      // rows can be claimed, atomically, by the service-only RPC.
      const key = Deno.env.get("RESEND_API_KEY"),
        from = Deno.env.get("EMAIL_FROM") || Deno.env.get("RESEND_FROM");
      if (!key || !from)
        return reply({ error: "Invio email non configurato" }, 503);
      const claimed = await db.rpc("claim_monthly_financial_reports");
      if (claimed.error) throw claimed.error;
      const logo = await Deno.readFile("./salon-pro-email-otp-logo.png");
      let sent = 0;
      for (const report of claimed.data || []) {
        try {
          let payload = report.email_payload;
          if (!payload) {
            const files = await reportFiles(report.snapshot, logo);
            payload = {
              from,
              to: [report.recipient],
              subject: `${report.snapshot.salon} · Resoconto ${report.month.slice(0, 7)} · SalonPro`,
              html: reportEmail(report.snapshot),
              attachments: [
                {
                  filename: "salonpro-logo.png",
                  content_id: "salonpro-app-logo",
                  content: base64(logo),
                },
                ...files,
              ],
            };
            const saved = await db
              .from("monthly_financial_reports")
              .update({ email_payload: payload })
              .eq("id", report.id)
              .eq("attempts", report.attempts);
            if (saved.error) throw saved.error;
          }
          const response = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `monthly-report/${report.id}`,
            },
            body: JSON.stringify(payload),
          });
          if (!response.ok) throw Error("Invio non riuscito");
          const saved = await db
            .from("monthly_financial_reports")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              lease_until: null,
            })
            .eq("id", report.id)
            .eq("status", "sending")
            .eq("attempts", report.attempts);
          if (saved.error) throw saved.error;
          sent++;
        } catch {
          await db
            .from("monthly_financial_reports")
            .update({
              status: "failed",
              lease_until: new Date(Date.now() + 3600000).toISOString(),
            })
            .eq("id", report.id)
            .eq("attempts", report.attempts);
        }
      }
      return reply({ sent });
    }
    const owner = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") || "" },
        },
        auth: { persistSession: false },
      },
    );
    const auth = await owner.auth.getUser();
    if (auth.error || !auth.data.user)
      return reply({ error: "Accesso richiesto" }, 401);
    const workspace = await owner.rpc("financial_report_workspace");
    if (workspace.error || !workspace.data)
      return reply({ error: "Accesso non consentito" }, 403);
    if (
      typeof body.reportId !== "string" ||
      !/^[a-f0-9-]{36}$/i.test(body.reportId)
    )
      return reply({ error: "Report non valido" }, 400);
    const result = await db
      .from("monthly_financial_reports")
      .select("*")
      .eq("id", body.reportId)
      .eq("workspace_id", workspace.data)
      .single();
    if (result.error) return reply({ error: "Report non disponibile" }, 404);
    const only =
      sections.includes(body.section) &&
      ["pdf", "xlsx"].includes(body.extension)
        ? { section: body.section, extension: body.extension }
        : undefined;
    if (result.data.email_payload)
      return reply({
        files: result.data.email_payload.attachments.filter(
          (f: any) =>
            !f.content_id &&
            (!only ||
              f.filename.endsWith(`-${only.section}.${only.extension}`)),
        ),
      });
    const logo = await Deno.readFile("./salon-pro-email-otp-logo.png");
    return reply({
      files: await reportFiles(result.data.snapshot, logo, only),
    });
  } catch (error) {
    console.error(
      "monthly_report_failed",
      error instanceof Error ? error.message : "unknown",
    );
    return reply({ error: "Impossibile preparare il report. Riprova." }, 500);
  }
});
