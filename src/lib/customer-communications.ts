import { flushQueuedPushNotifications } from "./push/push-notifications";
import { publicSupabase, supabase } from "./supabase";

export type CustomerCommunicationTarget = {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type CustomerCommunicationResult = {
  communicationId: string;
  scheduled?: boolean;
  requestedCount: number;
  matchedCount: number;
  queuedCount: number;
  unavailableCount: number;
};

export type CustomerCommunicationTemplateIcon =
  | "bookmark"
  | "megaphone"
  | "pricetag"
  | "gift"
  | "calendar"
  | "umbrella"
  | "storefront"
  | "heart"
  | "sparkles"
  | "notifications";

const CUSTOMER_COMMUNICATION_TEMPLATE_ICONS = new Set<string>([
  "bookmark",
  "megaphone",
  "pricetag",
  "gift",
  "calendar",
  "umbrella",
  "storefront",
  "heart",
  "sparkles",
  "notifications",
]);

export type CustomerCommunicationTemplate = {
  id: string;
  title: string;
  body: string;
  icon: CustomerCommunicationTemplateIcon;
  createdAt: string;
  updatedAt: string;
};

type CustomerCommunicationTemplateRow = {
  id?: unknown;
  title?: unknown;
  body?: unknown;
  icon?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

const normalizeCustomerCommunicationTemplate = (
  row: CustomerCommunicationTemplateRow,
): CustomerCommunicationTemplate | null => {
  const id = String(row.id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const body = String(row.body ?? "").trim();
  const rawIcon = String(row.icon ?? "")
    .trim()
    .toLowerCase();
  const icon: CustomerCommunicationTemplateIcon =
    CUSTOMER_COMMUNICATION_TEMPLATE_ICONS.has(rawIcon)
      ? (rawIcon as CustomerCommunicationTemplateIcon)
      : "bookmark";

  if (!id || title.length < 2 || body.length < 2) {
    return null;
  }

  return {
    id,
    title,
    body,
    icon,
    createdAt: String(row.createdAt ?? "").trim(),
    updatedAt: String(row.updatedAt ?? "").trim(),
  };
};

export const fetchCustomerCommunicationTemplates = async (): Promise<
  CustomerCommunicationTemplate[]
> => {
  const { data, error } = await supabase.rpc(
    "list_owner_customer_communication_templates",
  );

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) =>
      normalizeCustomerCommunicationTemplate(
        row as CustomerCommunicationTemplateRow,
      ),
    )
    .filter(
      (template): template is CustomerCommunicationTemplate =>
        template !== null,
    );
};

export const saveCustomerCommunicationTemplate = async ({
  title,
  body,
  icon,
  templateId,
}: {
  title: string;
  body: string;
  icon: CustomerCommunicationTemplateIcon;
  templateId?: string | null;
}): Promise<CustomerCommunicationTemplate> => {
  const { data, error } = await supabase.rpc(
    "save_owner_customer_communication_template",
    {
      p_title: title.trim(),
      p_body: body.trim(),
      p_icon: icon,
      p_template_id: templateId?.trim() || null,
    },
  );

  if (error) {
    throw error;
  }

  const template = normalizeCustomerCommunicationTemplate(
    (data ?? {}) as CustomerCommunicationTemplateRow,
  );
  if (!template) {
    throw new Error("invalid_customer_communication_template_response");
  }

  return template;
};

export const deleteCustomerCommunicationTemplate = async (
  templateId: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc(
    "delete_owner_customer_communication_template",
    {
      p_template_id: templateId.trim(),
    },
  );

  if (error) {
    throw error;
  }

  return data === true;
};

export type PublicCustomerCommunication = {
  communicationId: string;
  imagePath?: string | null;
  kind: "custom" | "late_reminder";
  title: string;
  body: string;
  appointmentId: string | null;
  createdAt: string;
  readAt: string | null;
};

type PublicCustomerCommunicationRow = {
  image_path?: unknown;
  communication_id?: unknown;
  kind?: unknown;
  title?: unknown;
  body?: unknown;
  appointment_id?: unknown;
  created_at?: unknown;
  read_at?: unknown;
};

const PUBLIC_CUSTOMER_COMMUNICATION_PAGE_RPC =
  "get_public_customer_communications_page_v2";
const PUBLIC_CUSTOMER_COMMUNICATION_PAGE_SIZE = 100;
const PUBLIC_CUSTOMER_COMMUNICATION_MAX_PAGES = 250;

const isPublicCustomerCommunicationPageRpcUnavailable = (error: unknown) => {
  if (!error || typeof error !== "object") {
    return false;
  }

  const rpcError = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
    hint?: unknown;
  };
  const code = String(rpcError.code ?? "")
    .trim()
    .toUpperCase();
  const errorText = [rpcError.message, rpcError.details, rpcError.hint]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

  return (
    code === "PGRST202" ||
    code === "42883" ||
    (errorText.includes(PUBLIC_CUSTOMER_COMMUNICATION_PAGE_RPC) &&
      (errorText.includes("schema cache") ||
        errorText.includes("could not find the function") ||
        errorText.includes("does not exist")))
  );
};

const normalizePublicCustomerCommunication = (
  row: PublicCustomerCommunicationRow,
): PublicCustomerCommunication | null => {
  const communicationId = String(row.communication_id ?? "").trim();
  const title = String(row.title ?? "").trim();
  const body = String(row.body ?? "").trim();
  const createdAt = String(row.created_at ?? "").trim();

  if (!communicationId || !title || !body || !createdAt) {
    return null;
  }

  return {
    communicationId,
    kind:
      String(row.kind ?? "")
        .trim()
        .toLowerCase() === "late_reminder"
        ? "late_reminder"
        : "custom",
    title,
    body,
    imagePath: typeof row.image_path === "string" ? row.image_path : null,
    appointmentId: String(row.appointment_id ?? "").trim() || null,
    createdAt,
    readAt: String(row.read_at ?? "").trim() || null,
  };
};

export const fetchPublicCustomerCommunications = async ({
  salonCode,
  customerEmail,
  customerPhone,
}: {
  salonCode: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
}): Promise<PublicCustomerCommunication[]> => {
  const normalizedSalonCode = salonCode.trim().toLowerCase();
  const normalizedCustomerEmail =
    customerEmail?.trim().toLowerCase() || null;
  const normalizedCustomerPhone = customerPhone?.trim() || null;
  const byCommunicationId = new Map<string, PublicCustomerCommunication>();
  const seenCursors = new Set<string>();
  let beforeCreatedAt: string | null = null;
  let beforeCommunicationId: string | null = null;
  let completed = false;

  const mergeRows = (rows: unknown[]) => {
    rows
      .map((row) =>
        normalizePublicCustomerCommunication(
          row as PublicCustomerCommunicationRow,
        ),
      )
      .filter((item): item is PublicCustomerCommunication => item !== null)
      .forEach((item) => {
        const current = byCommunicationId.get(item.communicationId);
        if (!current || (current.readAt !== null && item.readAt === null)) {
          byCommunicationId.set(item.communicationId, item);
        }
      });
  };

  for (
    let pageIndex = 0;
    pageIndex < PUBLIC_CUSTOMER_COMMUNICATION_MAX_PAGES;
    pageIndex += 1
  ) {
    const { data, error } = await publicSupabase.rpc(
      PUBLIC_CUSTOMER_COMMUNICATION_PAGE_RPC,
      {
        p_salon_code: normalizedSalonCode,
        p_customer_email: normalizedCustomerEmail,
        p_customer_phone: normalizedCustomerPhone,
        p_before_created_at: beforeCreatedAt,
        p_before_communication_id: beforeCommunicationId,
        p_limit: PUBLIC_CUSTOMER_COMMUNICATION_PAGE_SIZE,
      },
    );

    if (error) {
      if (
        pageIndex === 0 &&
        isPublicCustomerCommunicationPageRpcUnavailable(error)
      ) {
        const { data: legacyData, error: legacyError } = await publicSupabase.rpc(
          "get_public_customer_communications",
          {
            p_salon_code: normalizedSalonCode,
            p_customer_email: normalizedCustomerEmail,
            p_customer_phone: normalizedCustomerPhone,
          },
        );

        if (legacyError) {
          throw legacyError;
        }

        mergeRows(Array.isArray(legacyData) ? legacyData : []);
        completed = true;
        break;
      }

      throw error;
    }

    const pageRows = Array.isArray(data) ? data : [];
    mergeRows(pageRows);

    if (pageRows.length < PUBLIC_CUSTOMER_COMMUNICATION_PAGE_SIZE) {
      completed = true;
      break;
    }

    const lastRow = pageRows.at(-1) as
      | PublicCustomerCommunicationRow
      | undefined;
    const nextBeforeCreatedAt = String(lastRow?.created_at ?? "").trim();
    const nextBeforeCommunicationId = String(
      lastRow?.communication_id ?? "",
    ).trim();
    if (!nextBeforeCreatedAt || !nextBeforeCommunicationId) {
      throw new Error("invalid_public_customer_communications_cursor");
    }

    const nextCursorKey = `${nextBeforeCreatedAt}|${nextBeforeCommunicationId}`;
    if (seenCursors.has(nextCursorKey)) {
      throw new Error("stalled_public_customer_communications_cursor");
    }

    seenCursors.add(nextCursorKey);
    beforeCreatedAt = nextBeforeCreatedAt;
    beforeCommunicationId = nextBeforeCommunicationId;
  }

  if (!completed) {
    throw new Error("public_customer_communications_page_guard_exceeded");
  }

  return Array.from(byCommunicationId.values()).sort(
    (left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.createdAt.localeCompare(left.createdAt) ||
      right.communicationId.localeCompare(left.communicationId),
  );
};

export const markPublicCustomerCommunicationRead = async ({
  communicationId,
  salonCode,
  customerEmail,
  customerPhone,
}: {
  communicationId: string;
  salonCode: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
}) => {
  const { data, error } = await publicSupabase.rpc(
    "mark_public_customer_communication_read",
    {
      p_communication_id: communicationId,
      p_salon_code: salonCode.trim().toLowerCase(),
      p_customer_email: customerEmail?.trim().toLowerCase() || null,
      p_customer_phone: customerPhone?.trim() || null,
    },
  );

  if (error) {
    throw error;
  }

  return data === true;
};

export const sendCustomerCommunication = async ({
  title,
  body,
  targets,
  kind = "custom",
  appointmentId,
  reminder,
  requestKey,
  sendLocal,
  imagePath,
}: {
  title: string;
  body: string;
  targets: CustomerCommunicationTarget[];
  kind?: "custom" | "late_reminder";
  appointmentId?: string | null;
  reminder?: { startsLocal: string | null; endsLocal: string | null; title?: string | null; body?: string | null };
  requestKey?: string;
  sendLocal?: string | null;
  imagePath?: string | null;
}): Promise<CustomerCommunicationResult> => {
  const { data, error } = await supabase.rpc(
    requestKey ? "send_owner_customer_communication_v4" : "send_owner_customer_communication",
    {
      p_title: title.trim(),
      p_body: body.trim(),
      p_targets: targets.map((target) => ({
        id: target.id?.trim() || null,
        email: target.email?.trim().toLowerCase() || null,
        phone: target.phone?.replace(/\D+/g, "") || null,
      })),
      ...(requestKey ? { p_image_path: imagePath ?? null, p_request_key: requestKey, p_reminder_title: reminder?.title ?? null, p_reminder_body: reminder?.body ?? null, p_send_local: sendLocal ?? null, p_starts_local: reminder?.startsLocal ?? null, p_ends_local: reminder?.endsLocal ?? null } : { p_kind: kind, p_appointment_id: appointmentId?.trim() || null }),
    },
  );

  if (error) {
    throw error;
  }

  const payload = (data ?? {}) as Partial<CustomerCommunicationResult>;
  const result: CustomerCommunicationResult = {
    communicationId: String(payload.communicationId ?? ""),
    scheduled: payload.scheduled === true,
    requestedCount: Number(payload.requestedCount ?? targets.length),
    matchedCount: Number(payload.matchedCount ?? 0),
    queuedCount: Number(payload.queuedCount ?? 0),
    unavailableCount: Number(payload.unavailableCount ?? targets.length),
  };

  if (result.queuedCount > 0) {
    await flushQueuedPushNotifications(
      Math.min(Math.max(result.queuedCount, 1), 200),
    ).catch(() => false);
  }

  return result;
};

export async function fetchLatestAppointmentLateReminder(workspaceId:string,appointmentId:string):Promise<string|null>{
  if(!workspaceId.trim()||!appointmentId.trim())return null;
  const {data,error}=await supabase.from('customer_communications').select('created_at').eq('workspace_id',workspaceId).eq('appointment_id',appointmentId).eq('kind','late_reminder').gt('queued_count',0).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  return typeof data?.created_at==='string'?data.created_at:null;
}
