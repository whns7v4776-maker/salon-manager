import {
  cleanText,
  createServiceClient,
  jsonResponse,
  sha256Hex,
  verifyMetaSignature,
} from '../_shared/instagram-assistant.ts';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number | string;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: Array<{ type?: string }>;
  };
};

type MetaPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    messaging?: MessagingEvent[];
    changes?: Array<{
      field?: string;
      value?: MessagingEvent;
    }>;
  }>;
};

const eventTimestampIso = (value: MessagingEvent['timestamp']) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return new Date().toISOString();
  const milliseconds = parsed < 1_000_000_000_000 ? parsed * 1000 : parsed;
  return new Date(milliseconds).toISOString();
};

const queueInboundMessage = async (
  event: MessagingEvent,
  rawEvent: unknown,
) => {
  const senderId = cleanText(event.sender?.id, 200);
  const messageId = cleanText(event.message?.mid, 500);
  const body = cleanText(event.message?.text);
  const attachmentType = cleanText(event.message?.attachments?.[0]?.type, 80);
  if (!senderId || !messageId || event.message?.is_echo) return false;

  const supabase = createServiceClient();
  const now = eventTimestampIso(event.timestamp);
  const { data: contact, error: contactError } = await supabase
    .from('instagram_contacts')
    .upsert(
      {
        instagram_scoped_user_id: senderId,
        last_seen_at: now,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'instagram_scoped_user_id' },
    )
    .select('id')
    .single();
  if (contactError || !contact) throw new Error(contactError?.message ?? 'contact_upsert_failed');

  const { data: conversation, error: conversationError } = await supabase
    .from('instagram_conversations')
    .upsert(
      {
        contact_id: contact.id,
        last_message_at: now,
        last_inbound_at: now,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'contact_id' },
    )
    .select('id, status, ai_enabled, archived_at')
    .single();
  if (conversationError || !conversation) {
    throw new Error(conversationError?.message ?? 'conversation_upsert_failed');
  }
  if (conversation.status === 'closed' && !conversation.archived_at) {
    await supabase.from('instagram_conversations').update({
      status: 'open',
      ai_enabled: true,
      handoff_reason: null,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id);
  }

  const { data: inbound, error: messageError } = await supabase
    .from('instagram_messages')
    .upsert(
      {
        conversation_id: conversation.id,
        meta_message_id: messageId,
        direction: 'inbound',
        sender_type: 'customer',
        message_type: body ? 'text' : attachmentType || 'unsupported',
        body: body || null,
        status: 'received',
        raw_payload: rawEvent,
        created_at: now,
      },
      { onConflict: 'meta_message_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();
  if (messageError) throw new Error(messageError.message);
  if (!inbound) return false;

  const { error: queueError } = await supabase
    .from('instagram_inbox_jobs')
    .upsert(
      { inbound_message_id: inbound.id },
      { onConflict: 'inbound_message_id', ignoreDuplicates: true },
    );
  if (queueError) throw new Error(queueError.message);
  return true;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok');

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const expected = Deno.env.get('META_WEBHOOK_VERIFY_TOKEN')?.trim();
    if (mode === 'subscribe' && expected && token === expected && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return jsonResponse({ ok: false, error: 'webhook_verification_failed' }, 403);
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405);
  }

  const appSecret = Deno.env.get('META_APP_SECRET')?.trim();
  if (!appSecret) {
    return jsonResponse({ ok: false, error: 'missing_meta_app_secret' }, 500);
  }

  const rawBody = await request.text();
  const signatureOk = await verifyMetaSignature(
    rawBody,
    request.headers.get('x-hub-signature-256'),
    appSecret,
  );
  if (!signatureOk) {
    return jsonResponse({ ok: false, error: 'invalid_signature' }, 401);
  }

  const payload = JSON.parse(rawBody) as MetaPayload;
  const fingerprint = await sha256Hex(rawBody);
  const supabase = createServiceClient();
  const { error: eventError } = await supabase
    .from('instagram_webhook_events')
    .upsert(
      {
        event_fingerprint: fingerprint,
        object_type: cleanText(payload.object, 80) || null,
        payload,
      },
      { onConflict: 'event_fingerprint', ignoreDuplicates: true },
    );
  if (eventError) {
    return jsonResponse({ ok: false, error: 'event_store_failed' }, 500);
  }

  let queued = 0;
  let messageEvents = 0;
  for (const entry of payload.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      if (event.message) {
        messageEvents += 1;
        if (await queueInboundMessage(event, event)) queued += 1;
      }
    }
    for (const change of entry.changes ?? []) {
      if (change.field === 'messages' && change.value?.message) {
        messageEvents += 1;
        if (await queueInboundMessage(change.value, change)) queued += 1;
      }
    }
  }

  if (messageEvents > 0) {
    const url = Deno.env.get('SUPABASE_URL')?.trim();
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
    const workerCall = fetch(`${url}/functions/v1/instagram-assistant-worker`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ limit: Math.min(Math.max(queued, 1), 10) }),
    }).catch(() => undefined);
    // Supabase Edge Runtime keeps this request alive after the webhook response.
    EdgeRuntime.waitUntil(workerCall);
  }

  return jsonResponse({ ok: true, queued });
});
