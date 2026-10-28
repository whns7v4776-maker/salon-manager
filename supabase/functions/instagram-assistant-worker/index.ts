import {
  cleanText,
  createServiceClient,
  jsonResponse,
} from '../_shared/instagram-assistant.ts';

type JobRow = { id: string; inbound_message_id: string; attempts: number };
type SettingsRow = {
  automation_enabled: boolean;
  dry_run: boolean;
  model: string;
  confidence_threshold: number;
  max_history_messages: number;
  max_reply_chars: number;
  auto_reply_intents: string[];
  tone: string;
  business_context: string;
  handoff_message: string;
};

type KnowledgeRow = {
  category: string;
  title: string;
  content: string;
};

type AiDecision = {
  reply: string;
  should_handoff: boolean;
  handoff_reason: string;
  intent:
    | 'product_info'
    | 'onboarding'
    | 'trial_info'
    | 'pricing'
    | 'booking_help'
    | 'account_support'
    | 'technical_support'
    | 'billing'
    | 'privacy'
    | 'complaint'
    | 'human_request'
    | 'other';
  crm_stage: 'new' | 'interested' | 'trial' | 'customer' | 'subscriber' | 'support' | 'not_interested';
  conversation_summary: string;
  confidence: number;
};

const decisionSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'reply', 'should_handoff', 'handoff_reason', 'intent',
    'crm_stage', 'conversation_summary', 'confidence',
  ],
  properties: {
    reply: { type: 'string' },
    should_handoff: { type: 'boolean' },
    handoff_reason: { type: 'string' },
    intent: {
      type: 'string',
      enum: [
        'product_info',
        'onboarding',
        'trial_info',
        'pricing',
        'booking_help',
        'account_support',
        'technical_support',
        'billing',
        'privacy',
        'complaint',
        'human_request',
        'other',
      ],
    },
    crm_stage: {
      type: 'string',
      enum: ['new', 'interested', 'trial', 'customer', 'subscriber', 'support', 'not_interested'],
    },
    conversation_summary: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
};

const extractStructuredOutput = (payload: Record<string, unknown>): AiDecision => {
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: Array<Record<string, unknown>> }).content
      : [];
    for (const part of content) {
      if (part.type === 'output_text' && typeof part.text === 'string') {
        return JSON.parse(part.text) as AiDecision;
      }
      if (part.type === 'refusal' && typeof part.refusal === 'string') {
        throw new Error(`openai_refusal:${cleanText(part.refusal, 300)}`);
      }
    }
  }
  if (payload.status === 'incomplete') {
    const details = payload.incomplete_details as { reason?: unknown } | undefined;
    throw new Error(`openai_incomplete:${cleanText(details?.reason, 120) || 'unknown'}`);
  }
  throw new Error('openai_output_missing');
};

const callOpenAi = async (
  settings: SettingsRow,
  history: Array<{ direction: string; sender_type: string; body: string | null }>,
  knowledge: KnowledgeRow[],
) => {
  const apiKey = Deno.env.get('OPENAI_API_KEY')?.trim();
  if (!apiKey) throw new Error('missing_openai_api_key');

  const messages = history
    .filter((message) => message.body)
    .map((message) => ({
      role: message.direction === 'inbound' ? 'user' : 'assistant',
      content: cleanText(message.body),
    }));
  const groundedKnowledge = knowledge
    .map((item) => `[${item.category}] ${item.title}: ${item.content}`)
    .join('\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: settings.model,
      store: false,
      instructions: [
        'Sei l’assistente Instagram di SalonPro, un prodotto italiano per saloni.',
        settings.tone,
        settings.business_context,
        'CONOSCENZA APPROVATA SALONPRO:',
        groundedKnowledge || 'Nessuna informazione aggiuntiva disponibile.',
        'Rispondi soltanto con informazioni presenti nel contesto o nella conversazione.',
        'Non inventare prezzi, promozioni, link, scadenze, stato abbonamenti o soluzioni tecniche.',
        'Per domande generiche su cos’è SalonPro, come iniziare, agenda, operatori, servizi, clienti, prenotazioni o prova gratuita usa la conoscenza approvata e non chiedere il passaggio umano.',
        'Classifica le domande generali su funzioni, configurazione e utilizzo dell’app come product_info, onboarding o booking_help. Usa account_support soltanto per un problema reale di accesso, recupero o stato di uno specifico account.',
        'Usa should_handoff=true per pagamenti/rimborsi, dati personali, problemi di account, reclami, bug non banali, richieste legali, cancellazioni, richiesta esplicita di una persona o quando la conoscenza non basta.',
        'confidence misura quanto la risposta è coperta dalla conoscenza approvata: usa almeno 0.90 quando la risposta deriva direttamente da essa.',
        'handoff_reason deve essere vuoto quando should_handoff=false.',
        'Non chiedere password, codici OTP, carte di pagamento o altri segreti.',
        `Mantieni la risposta entro ${settings.max_reply_chars} caratteri, breve e utile, con una sola domanda alla volta.`,
      ].join('\n'),
      input: messages,
      text: {
        format: {
          type: 'json_schema',
          name: 'instagram_support_decision',
          strict: true,
          schema: decisionSchema,
        },
      },
      reasoning: { effort: 'minimal' },
      max_output_tokens: 1200,
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`openai_${response.status}:${cleanText(payload.error, 300)}`);
  }
  return {
    responseId: cleanText(payload.id, 200) || null,
    decision: extractStructuredOutput(payload),
  };
};

const sendInstagramText = async (recipientId: string, text: string) => {
  const accessToken = Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN')?.trim();
  const accountId = Deno.env.get('META_INSTAGRAM_ACCOUNT_ID')?.trim();
  const graphVersion = Deno.env.get('META_GRAPH_API_VERSION')?.trim();
  if (!accessToken || !accountId || !graphVersion) {
    throw new Error('missing_meta_send_configuration');
  }
  if (!/^v\d+\.\d+$/.test(graphVersion)) throw new Error('invalid_meta_graph_api_version');

  const response = await fetch(
    `https://graph.instagram.com/${graphVersion}/${encodeURIComponent(accountId)}/messages`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    },
  );
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(`meta_send_${response.status}:${cleanText(payload.error, 300)}`);
  }
  return cleanText(payload.message_id ?? payload.id, 500) || null;
};

const fetchInstagramProfile = async (scopedUserId: string) => {
  const accessToken = Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN')?.trim();
  const graphVersion = Deno.env.get('META_GRAPH_API_VERSION')?.trim();
  if (!accessToken || !graphVersion || !/^v\d+\.\d+$/.test(graphVersion)) {
    return { profile: null, error: 'missing_meta_profile_configuration' };
  }

  const url = new URL(
    `https://graph.instagram.com/${graphVersion}/${encodeURIComponent(scopedUserId)}`,
  );
  url.searchParams.set('fields', 'name,username');
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) {
    const metaError = payload.error && typeof payload.error === 'object'
      ? payload.error as Record<string, unknown>
      : {};
    return {
      profile: null,
      error: `meta_profile_${response.status}:${cleanText(JSON.stringify({
        message: metaError.message,
        type: metaError.type,
        code: metaError.code,
        error_subcode: metaError.error_subcode,
      }), 500)}`,
    };
  }
  return {
    profile: {
      username: cleanText(payload.username, 120) || null,
      displayName: cleanText(payload.name, 200) || null,
    },
    error: null,
  };
};

const sendManualReply = async (
  conversationId: string,
  text: string,
  draftId?: string,
) => {
  const supabase = createServiceClient();
  const { data: conversation, error: conversationError } = await supabase
    .from('instagram_conversations')
    .select('id, contact_id')
    .eq('id', conversationId)
    .single();
  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? 'conversation_not_found');
  }
  const { data: contact, error: contactError } = await supabase
    .from('instagram_contacts')
    .select('instagram_scoped_user_id')
    .eq('id', conversation.contact_id)
    .single();
  if (contactError || !contact) {
    throw new Error(contactError?.message ?? 'contact_not_found');
  }

  const safeText = cleanText(text, 1000);
  if (!safeText) throw new Error('empty_manual_reply');
  if (draftId) {
    const { data: draft, error: draftLookupError } = await supabase
      .from('instagram_messages')
      .select('id')
      .eq('id', draftId)
      .eq('conversation_id', conversationId)
      .eq('status', 'draft')
      .maybeSingle();
    if (draftLookupError || !draft) {
      throw new Error(draftLookupError?.message ?? 'draft_not_found');
    }
  }
  const metaMessageId = await sendInstagramText(contact.instagram_scoped_user_id, safeText);
  const now = new Date().toISOString();

  if (draftId) {
    const { data: updatedDraft, error: draftError } = await supabase
      .from('instagram_messages')
      .update({
        body: safeText,
        sender_type: 'human',
        status: 'sent',
        meta_message_id: metaMessageId,
        sent_at: now,
        reviewed_at: now,
        reviewed_by: 'admin',
      })
      .eq('id', draftId)
      .eq('conversation_id', conversationId)
      .eq('status', 'draft')
      .select('id')
      .maybeSingle();
    if (draftError || !updatedDraft) {
      throw new Error(draftError?.message ?? 'draft_not_found');
    }
  } else {
    const { error: insertError } = await supabase.from('instagram_messages').insert({
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'human',
      message_type: 'text',
      body: safeText,
      status: 'sent',
      meta_message_id: metaMessageId,
      sent_at: now,
      reviewed_at: now,
      reviewed_by: 'admin',
    });
    if (insertError) throw new Error(insertError.message);
  }

  const { error: updateError } = await supabase
    .from('instagram_conversations')
    .update({
      status: 'human_active',
      ai_enabled: false,
      handoff_reason: null,
      last_outbound_at: now,
      last_message_at: now,
      updated_at: now,
    })
    .eq('id', conversationId);
  if (updateError) throw new Error(updateError.message);
  return { metaMessageId };
};

const isAuthorizedServiceRequest = async (request: Request) => {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  const configuredServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!token) return false;
  if (configuredServiceKey && token === configuredServiceKey) return true;

  const url = Deno.env.get('SUPABASE_URL')?.trim();
  if (!url) return false;
  const response = await fetch(
    `${url}/rest/v1/instagram_assistant_settings?select=singleton&limit=1`,
    {
      headers: {
        apikey: token,
        authorization: `Bearer ${token}`,
      },
    },
  ).catch(() => null);
  return Boolean(response?.ok);
};

const processJob = async (job: JobRow) => {
  const supabase = createServiceClient();
  const { data: inbound, error: inboundError } = await supabase
    .from('instagram_messages')
    .select('id, conversation_id, body, message_type')
    .eq('id', job.inbound_message_id)
    .single();
  if (inboundError || !inbound) throw new Error(inboundError?.message ?? 'inbound_not_found');

  const [{ data: conversation }, { data: settings }, { data: knowledge }] = await Promise.all([
    supabase
      .from('instagram_conversations')
      .select('id, contact_id, status, ai_enabled')
      .eq('id', inbound.conversation_id)
      .single(),
    supabase.from('instagram_assistant_settings').select('*').eq('singleton', true).single(),
    supabase
      .from('instagram_knowledge_items')
      .select('category, title, content')
      .eq('enabled', true)
      .order('priority', { ascending: true })
      .limit(100),
  ]);
  if (!conversation || !settings) throw new Error('assistant_state_missing');

  if (!conversation.ai_enabled || ['human_required', 'human_active'].includes(conversation.status)) {
    await supabase.from('instagram_inbox_jobs').update({
      status: 'skipped',
      last_error: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return;
  }

  if (inbound.message_type !== 'text' || !inbound.body) {
    await supabase.from('instagram_conversations').update({
      status: 'human_required',
      ai_enabled: false,
      handoff_reason: 'Messaggio non testuale da controllare',
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);
    await supabase.from('instagram_inbox_jobs').update({
      status: 'completed',
      last_error: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', job.id);
    return;
  }

  const { data: contact } = await supabase
    .from('instagram_contacts')
    .select('instagram_scoped_user_id, username, display_name')
    .eq('id', conversation.contact_id)
    .single();
  if (!contact) throw new Error('contact_not_found');
  if (!contact.username || !contact.display_name) {
    const profileResult = await fetchInstagramProfile(contact.instagram_scoped_user_id);
    const profile = profileResult.profile;
    if (profile?.username || profile?.displayName) {
      await supabase.from('instagram_contacts').update({
        username: profile.username ?? contact.username,
        display_name: profile.displayName ?? contact.display_name,
        updated_at: new Date().toISOString(),
      }).eq('id', conversation.contact_id);
    }
  }

  const { data: descendingHistory, error: historyError } = await supabase
    .from('instagram_messages')
    .select('direction, sender_type, body')
    .eq('conversation_id', conversation.id)
    .not('body', 'is', null)
    .order('created_at', { ascending: false })
    .limit(settings.max_history_messages);
  if (historyError) throw new Error(historyError.message);
  const history = [...(descendingHistory ?? [])].reverse();

  const typedSettings = settings as SettingsRow;
  const { decision, responseId } = await callOpenAi(
    typedSettings,
    history,
    (knowledge ?? []) as KnowledgeRow[],
  );
  const thresholdHandoff = decision.confidence < Number(settings.confidence_threshold);
  const allowedIntent = (settings.auto_reply_intents ?? []).includes(decision.intent);
  const shouldHandoff = decision.should_handoff || thresholdHandoff || !allowedIntent;
  const handoffReason = shouldHandoff
    ? cleanText(
      decision.handoff_reason
        || (!allowedIntent ? `Intento non abilitato: ${decision.intent}` : '')
        || 'Confidenza insufficiente',
      500,
    )
    : null;
  const responseText = cleanText(
    shouldHandoff ? settings.handoff_message : decision.reply,
    Number(settings.max_reply_chars) || 700,
  );
  if (!responseText) throw new Error('empty_assistant_reply');

  const sendNow = settings.automation_enabled && !settings.dry_run;
  const outboundPayload = {
    conversation_id: conversation.id,
    direction: 'outbound',
    sender_type: 'assistant',
    message_type: 'text',
    body: responseText,
    status: sendNow ? 'queued' : 'draft',
    reply_to_message_id: inbound.id,
    openai_response_id: responseId,
    ai_confidence: decision.confidence,
    detected_intent: decision.intent,
    handoff_reason: handoffReason,
  };
  const { data: existingOutbound, error: existingError } = await supabase
    .from('instagram_messages')
    .select('id, status, meta_message_id')
    .eq('reply_to_message_id', inbound.id)
    .eq('direction', 'outbound')
    .eq('sender_type', 'assistant')
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  let outbound = existingOutbound;
  if (!outbound) {
    const { data: inserted, error: outboundError } = await supabase
      .from('instagram_messages')
      .insert(outboundPayload)
      .select('id, status, meta_message_id')
      .single();
    if (outboundError || !inserted) {
      throw new Error(outboundError?.message ?? 'draft_store_failed');
    }
    outbound = inserted;
  } else if (outbound.status !== 'sent') {
    const { data: updated, error: updateOutboundError } = await supabase
      .from('instagram_messages')
      .update(outboundPayload)
      .eq('id', outbound.id)
      .select('id, status, meta_message_id')
      .single();
    if (updateOutboundError || !updated) {
      throw new Error(updateOutboundError?.message ?? 'draft_update_failed');
    }
    outbound = updated;
  }

  let metaMessageId: string | null = outbound.meta_message_id ?? null;
  if (sendNow && outbound.status !== 'sent') {
    metaMessageId = await sendInstagramText(contact.instagram_scoped_user_id, responseText);
    await supabase.from('instagram_messages').update({
      meta_message_id: metaMessageId,
      status: 'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', outbound.id);
  }

  const now = new Date().toISOString();
  await Promise.all([
    supabase.from('instagram_contacts').update({
      crm_stage: decision.crm_stage,
      updated_at: now,
    }).eq('id', conversation.contact_id),
    supabase.from('instagram_conversations').update({
      status: shouldHandoff ? 'human_required' : 'open',
      ai_enabled: !shouldHandoff,
      summary: cleanText(decision.conversation_summary, 2000),
      detected_intent: cleanText(decision.intent, 120),
      handoff_reason: handoffReason,
      ai_confidence: decision.confidence,
      last_outbound_at: sendNow ? now : null,
      last_message_at: now,
      updated_at: now,
    }).eq('id', conversation.id),
    supabase.from('instagram_inbox_jobs').update({
      status: 'completed',
      last_error: null,
      completed_at: now,
      updated_at: now,
    }).eq('id', job.id),
  ]);
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok');
  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }

  if (!(await isAuthorizedServiceRequest(request))) {
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
  }

  const body = await request.json().catch(() => ({})) as {
    limit?: number;
    action?:
      | 'health'
      | 'preview_reply'
      | 'refresh_profile'
      | 'send_manual_reply'
      | 'send_draft';
    conversation_id?: string;
    message_id?: string;
    text?: string;
  };
  if (body.action === 'health') {
    return jsonResponse({
      ok: true,
      configuration: {
        metaAppSecret: Boolean(Deno.env.get('META_APP_SECRET')?.trim()),
        metaVerifyToken: Boolean(Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')?.trim()),
        metaAccessToken: Boolean(Deno.env.get('META_INSTAGRAM_ACCESS_TOKEN')?.trim()),
        metaAccountId: Boolean(Deno.env.get('META_INSTAGRAM_ACCOUNT_ID')?.trim()),
        metaGraphVersion: /^v\d+\.\d+$/.test(
          Deno.env.get('META_GRAPH_API_VERSION')?.trim() ?? '',
        ),
        openaiApiKey: Boolean(Deno.env.get('OPENAI_API_KEY')?.trim()),
      },
    });
  }
  if (body.action === 'preview_reply') {
    const text = cleanText(body.text, 1000);
    if (!text) return jsonResponse({ ok: false, error: 'empty_preview' }, 400);
    const supabase = createServiceClient();
    const [{ data: settings }, { data: knowledge }] = await Promise.all([
      supabase.from('instagram_assistant_settings').select('*').eq('singleton', true).single(),
      supabase
        .from('instagram_knowledge_items')
        .select('category, title, content')
        .eq('enabled', true)
        .order('priority', { ascending: true })
        .limit(100),
    ]);
    if (!settings) return jsonResponse({ ok: false, error: 'assistant_state_missing' }, 500);
    try {
      const result = await callOpenAi(
        settings as SettingsRow,
        [{ direction: 'inbound', sender_type: 'customer', body: text }],
        (knowledge ?? []) as KnowledgeRow[],
      );
      const allowedIntent = (settings.auto_reply_intents ?? []).includes(
        result.decision.intent,
      );
      return jsonResponse({
        ok: true,
        decision: result.decision,
        policy: {
          allowedIntent,
          passesConfidence:
            result.decision.confidence >= Number(settings.confidence_threshold),
          wouldSend:
            settings.automation_enabled
            && !settings.dry_run
            && allowedIntent
            && !result.decision.should_handoff
            && result.decision.confidence >= Number(settings.confidence_threshold),
        },
      });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: cleanText(error instanceof Error ? error.message : 'preview_failed', 500),
      }, 502);
    }
  }
  if (body.action === 'refresh_profile') {
    const conversationId = cleanText(body.conversation_id, 36);
    if (!/^[0-9a-f-]{36}$/i.test(conversationId)) {
      return jsonResponse({ ok: false, error: 'invalid_conversation' }, 400);
    }
    const supabase = createServiceClient();
    const { data: conversation } = await supabase
      .from('instagram_conversations')
      .select('contact_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (!conversation) {
      return jsonResponse({ ok: false, error: 'conversation_not_found' }, 404);
    }
    const { data: contact } = await supabase
      .from('instagram_contacts')
      .select('instagram_scoped_user_id')
      .eq('id', conversation.contact_id)
      .maybeSingle();
    if (!contact) return jsonResponse({ ok: false, error: 'contact_not_found' }, 404);

    const result = await fetchInstagramProfile(contact.instagram_scoped_user_id);
    if (!result.profile) {
      return jsonResponse({ ok: false, error: result.error ?? 'profile_not_available' }, 502);
    }
    await supabase.from('instagram_contacts').update({
      username: result.profile.username,
      display_name: result.profile.displayName,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.contact_id);
    return jsonResponse({
      ok: true,
      profile: {
        hasUsername: Boolean(result.profile.username),
        hasDisplayName: Boolean(result.profile.displayName),
      },
    });
  }
  if (body.action === 'send_manual_reply') {
    const conversationId = cleanText(body.conversation_id, 36);
    const text = cleanText(body.text, 1000);
    if (!/^[0-9a-f-]{36}$/i.test(conversationId) || !text) {
      return jsonResponse({ ok: false, error: 'invalid_manual_reply' }, 400);
    }
    try {
      const result = await sendManualReply(conversationId, text);
      return jsonResponse({ ok: true, sent: true, messageId: result.metaMessageId });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: cleanText(error instanceof Error ? error.message : 'manual_send_failed', 500),
      }, 502);
    }
  }
  if (body.action === 'send_draft') {
    const conversationId = cleanText(body.conversation_id, 36);
    const messageId = cleanText(body.message_id, 36);
    if (
      !/^[0-9a-f-]{36}$/i.test(conversationId)
      || !/^[0-9a-f-]{36}$/i.test(messageId)
    ) {
      return jsonResponse({ ok: false, error: 'invalid_draft_send' }, 400);
    }
    const supabase = createServiceClient();
    const { data: draft, error: draftError } = await supabase
      .from('instagram_messages')
      .select('body')
      .eq('id', messageId)
      .eq('conversation_id', conversationId)
      .eq('status', 'draft')
      .maybeSingle();
    if (draftError || !draft?.body) {
      return jsonResponse({ ok: false, error: 'draft_not_found' }, 404);
    }
    try {
      const result = await sendManualReply(conversationId, draft.body, messageId);
      return jsonResponse({ ok: true, sent: true, messageId: result.metaMessageId });
    } catch (error) {
      return jsonResponse({
        ok: false,
        error: cleanText(error instanceof Error ? error.message : 'draft_send_failed', 500),
      }, 502);
    }
  }

  const limit = Math.max(1, Math.min(Number(body.limit) || 5, 20));
  const supabase = createServiceClient();
  const { data: jobs, error } = await supabase.rpc('claim_instagram_inbox_jobs', {
    p_limit: limit,
  });
  if (error) return jsonResponse({ ok: false, error: 'claim_failed' }, 500);

  const results = [];
  for (const job of (jobs ?? []) as JobRow[]) {
    try {
      await processJob(job);
      results.push({ id: job.id, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      await supabase.from('instagram_inbox_jobs').update({
        status: job.attempts >= 5 ? 'failed' : 'pending',
        available_at: new Date(Date.now() + Math.min(job.attempts, 5) * 60_000).toISOString(),
        last_error: cleanText(message, 1000),
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
      results.push({ id: job.id, ok: false, error: message });
    }
  }

  return jsonResponse({ ok: true, processed: results.length, results });
});
