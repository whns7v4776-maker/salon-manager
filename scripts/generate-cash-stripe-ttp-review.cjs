// Generates `supabase/functions/cash-stripe-ttp-review` from the live `cash-stripe` function.
// The copy exists only to record Apple's Tap to Pay review videos with Stripe TEST keys and a
// physical Stripe test card. It never runs with live keys, serves only allow-listed workspaces,
// and exposes no webhook, booking or public payment routes. Re-run after changing `cash-stripe`.
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/cash-stripe/index.ts'), 'utf8');
let out = source;
const swap = (from, to) => {
  if (!out.includes(from)) throw new Error(`Pattern not found: ${from}`);
  out = out.split(from).join(to);
};

// Separate configuration: nothing is shared with the production function.
for (const name of [
  'CASH_STRIPE_RETURN_URL', 'CASH_STRIPE_SECRET_KEY', 'CASH_STRIPE_CONNECT_CLIENT_ID',
  'CASH_STRIPE_WEBHOOK_SECRET', 'CASH_BOOKING_PAYMENTS_ENABLED', 'CASH_STRIPE_ROLLOUT_WORKSPACE_IDS',
  'CASH_STRIPE_PUBLIC_ENABLED', 'CASH_STRIPE_TEST_WORKSPACE_IDS', 'CASH_STRIPE_TERMINAL_ENABLED',
]) swap(`'${name}'`, `'TTP_REVIEW_${name}'`);
swap('/functions/v1/cash-stripe`', '/functions/v1/cash-stripe-ttp-review`');
// Reuse the Stripe sandbox key already stored on the server (set in September for the sandbox),
// so nobody has to copy a secret key by hand. The test-key gate below still applies.
swap("Deno.env.get('TTP_REVIEW_CASH_STRIPE_SECRET_KEY')", "(Deno.env.get('TTP_REVIEW_CASH_STRIPE_SECRET_KEY') || Deno.env.get('CASH_STRIPE_SANDBOX_KEY'))");
// The Connect client ID is only needed to link a brand-new salon (video 1); status and Terminal work without it.
swap("Deno.env.get('TTP_REVIEW_CASH_STRIPE_CONNECT_CLIENT_ID')", "(Deno.env.get('TTP_REVIEW_CASH_STRIPE_CONNECT_CLIENT_ID') || 'ca_ttp_review_oauth_not_configured')");
// No implicit tester default: the allow-list must be set explicitly on the server.
swap("|| 'd84f3211-d20f-45a3-9d7f-f551400690fd'", "|| ''");

// Video 1 (a brand-new salon): while TTP_REVIEW_OPEN_TO_NEW_SALONS=true any salon may use this
// TEST-only copy, so a salon registered on camera needs no allow-list change. Turn it off afterwards.
swap("const checked = ", "const openToNewSalons = Deno.env.get('TTP_REVIEW_OPEN_TO_NEW_SALONS') === 'true';\nconst checked = ");
swap("if (!publicEnabled && !rolloutWorkspaces.includes(workspaceId))", "if (!openToNewSalons && !publicEnabled && !rolloutWorkspaces.includes(workspaceId))");
swap("if (!live && !testWorkspaces.includes(workspaceId))", "if (!openToNewSalons && !live && !testWorkspaces.includes(workspaceId))");
// Without a test Connect client ID, a new salon gets a Stripe TEST account and Stripe's hosted
// onboarding (KYC) directly, instead of the OAuth page.
swap(
  "   if (account) return reply({ error: 'Stripe è già collegato. Verifica il collegamento.' });\n",
  `   if (account) return reply({ error: 'Stripe è già collegato. Verifica il collegamento.' });
   if (!Deno.env.get('TTP_REVIEW_CASH_STRIPE_CONNECT_CLIENT_ID')) {
    try {
     const metadata = { salonpro_workspace: workspaceId, purpose: 'apple-ttp-review' };
     // Standard first (like production OAuth); Express if the sandbox platform does not allow it.
     const created = await stripe.accounts.create({ type: 'standard', country: 'IT', metadata })
      .catch((e: unknown) => { console.error('ttp-review standard account', e); return stripe.accounts.create({ type: 'express', country: 'IT', metadata, capabilities: { card_payments: { requested: true }, transfers: { requested: true } } }); });
     checked(await admin.from('cash_stripe_accounts').insert({ workspace_id: workspaceId, account_id: created.id, livemode: false }));
     const link = await stripe.accountLinks.create({ account: created.id, type: 'account_onboarding', refresh_url: returnUrl!, return_url: returnUrl! });
     return reply({ url: link.url });
    } catch (e) {
     console.error('ttp-review connect', e);
     // Test-only copy: Stripe's reason is shown so a setup problem can be fixed on the spot.
     // Name the sandbox the server key belongs to, so the right one gets the dashboard setting.
     const platform = await stripe.accounts.retrieve().then((a: any) => (a.settings?.dashboard?.display_name || a.business_profile?.name || 'senza nome') + ' (' + a.id + ')').catch(() => 'non identificata');
     return reply({ error: 'Sandbox Stripe usata: ' + platform + '. Collegamento di prova non riuscito: ' + (e instanceof Error ? e.message : 'errore sconosciuto') }, 400);
    }
   }
`,
);

// Hard gates at the top of every request.
swap(
  " if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });\n",
  ` if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
 // Review copy: TEST keys only, owner actions and the OAuth callback only.
 if (!secret?.startsWith('sk_test_')) return reply({ error: 'ttp_review_requires_test_key' }, 503);
 const reviewAction = new URL(request.url).searchParams.get('action');
 if (reviewAction && reviewAction !== 'callback' && reviewAction !== 'return') return reply({ error: 'ttp_review_scope_only' }, 404);
`,
);

// The shared Terminal gate refuses TEST mode; the review copy alone opts in.
swap("enabled:Deno.env.get('TTP_REVIEW_CASH_STRIPE_TERMINAL_ENABLED')==='true'})", "enabled:Deno.env.get('TTP_REVIEW_CASH_STRIPE_TERMINAL_ENABLED')==='true',allowTest:true})");

// Review copy: show Stripe's own message for Terminal errors, so setup problems are diagnosable.
swap("catch(e) { return reply({error:e instanceof Error && !('type' in e) ? e.message : 'Contactless non disponibile. Verifica lo stato prima di riprovare.'},400); }",
 "catch(e) { console.error('ttp-review terminal', e); return reply({error:terminalErrorText(e)},400); }");
// Plain Italian for the merchant; Stripe's technical text stays in the server log only.
swap("Deno.serve(async request => {", `const terminalErrorText = (e: unknown) => {
 const m = e instanceof Error ? e.message.toLowerCase() : '';
 if (!(e instanceof Error) || !('type' in e)) return e instanceof Error ? e.message : 'Contactless non disponibile. Riprova tra poco.';
 if (m.includes('address') || m.includes('location')) return 'La sede del salone su Stripe è incompleta. Controlla indirizzo e provincia in Stripe → Terminal → Sedi.';
 if (m.includes('no such account') || m.includes('permission') || m.includes('not have access')) return 'Il collegamento Stripe del salone non permette ancora Tap to Pay. Ricollega Stripe dalla Cassa.';
 if (m.includes('rate limit')) return 'Troppe richieste in poco tempo. Attendi qualche secondo e riprova.';
 return 'Tap to Pay non è disponibile in questo momento. Riprova tra poco; QR e link restano disponibili.';
};
Deno.serve(async request => {`);

const header = `// GENERATED by scripts/generate-cash-stripe-ttp-review.cjs from supabase/functions/cash-stripe/index.ts.
// Do not edit by hand. Apple Tap to Pay review recordings only (Stripe TEST mode).
`;
const target = path.join(root, 'supabase/functions/cash-stripe-ttp-review/index.ts');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, header + out);
console.log('Wrote', path.relative(root, target));
