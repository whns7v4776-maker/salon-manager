/* global __dirname */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(
  path.join(root, "src/lib/customer-communications.ts"),
  "utf8",
);
const unreadBadgesSource = fs.readFileSync(
  path.join(root, "src/lib/badges/unread-badges.ts"),
  "utf8",
);
const sendPushSource = fs.readFileSync(
  path.join(root, "supabase/functions/send-push/index.ts"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260829213000_paginate_public_customer_communication_history.sql",
  ),
  "utf8",
);

const requirePattern = (value, pattern, message) => {
  if (!pattern.test(value)) {
    throw new Error(message);
  }
};

requirePattern(
  source,
  /export const fetchPublicCustomerCommunications = async \(\{[\s\S]*?salonCode,[\s\S]*?customerEmail,[\s\S]*?customerPhone,[\s\S]*?\}: \{[\s\S]*?salonCode: string;[\s\S]*?customerEmail\?: string \| null;[\s\S]*?customerPhone\?: string \| null;[\s\S]*?\}\): Promise<PublicCustomerCommunication\[\]>/,
  "The public fetch API signature must remain unchanged.",
);
requirePattern(
  source,
  /PUBLIC_CUSTOMER_COMMUNICATION_PAGE_SIZE = 100[\s\S]*?PUBLIC_CUSTOMER_COMMUNICATION_MAX_PAGES = 250/,
  "The client must use a bounded page size and a hard page guard.",
);
requirePattern(
  source,
  /get_public_customer_communications_page_v2[\s\S]*?p_before_created_at: beforeCreatedAt[\s\S]*?p_before_communication_id: beforeCommunicationId[\s\S]*?p_limit: PUBLIC_CUSTOMER_COMMUNICATION_PAGE_SIZE/,
  "Every page must continue with the composite server cursor.",
);
requirePattern(
  source,
  /import \{ publicSupabase, supabase \} from "\.\/supabase"[\s\S]*?publicSupabase\.rpc\([\s\S]*?PUBLIC_CUSTOMER_COMMUNICATION_PAGE_RPC/,
  "Public communication history must use the stateless anonymous client.",
);
requirePattern(
  source,
  /for \([\s\S]*?pageIndex < PUBLIC_CUSTOMER_COMMUNICATION_MAX_PAGES[\s\S]*?pageRows\.length < PUBLIC_CUSTOMER_COMMUNICATION_PAGE_SIZE[\s\S]*?completed = true/,
  "The client must read pages until the server returns a short page.",
);
requirePattern(
  source,
  /new Map<string, PublicCustomerCommunication>[\s\S]*?byCommunicationId\.get\(item\.communicationId\)[\s\S]*?byCommunicationId\.set\(item\.communicationId, item\)/,
  "Pages must be deduplicated by communication id.",
);
requirePattern(
  source,
  /seenCursors\.has\(nextCursorKey\)[\s\S]*?stalled_public_customer_communications_cursor[\s\S]*?public_customer_communications_page_guard_exceeded/,
  "A repeated cursor or exhausted page budget must fail instead of looping forever.",
);
requirePattern(
  source,
  /pageIndex === 0[\s\S]*?isPublicCustomerCommunicationPageRpcUnavailable\(error\)[\s\S]*?get_public_customer_communications/,
  "An unavailable paged RPC must fall back to the legacy RPC only before pagination starts.",
);
requirePattern(
  source,
  /code === "PGRST202"[\s\S]*?code === "42883"[\s\S]*?errorText\.includes\(PUBLIC_CUSTOMER_COMMUNICATION_PAGE_RPC\)[\s\S]*?schema cache[\s\S]*?could not find the function/,
  "Fallback messages must name the paged RPC unless PostgREST returned a missing-function code.",
);
requirePattern(
  source,
  /publicSupabase\.rpc\([\s\S]*?"mark_public_customer_communication_read"/,
  "Public read receipts must not inherit an owner or stale authenticated session.",
);
requirePattern(
  source,
  /Date\.parse\(right\.createdAt\) - Date\.parse\(left\.createdAt\)[\s\S]*?right\.createdAt\.localeCompare\(left\.createdAt\)[\s\S]*?right\.communicationId\.localeCompare\(left\.communicationId\)/,
  "The merged archive must remain deterministically newest-first.",
);

requirePattern(
  migration,
  /create or replace function public\.get_public_customer_communications_page_v1\([\s\S]*?p_before_created_at timestamptz default null[\s\S]*?p_before_communication_id uuid default null[\s\S]*?p_limit integer default 100/,
  "The server must expose a versioned composite-cursor RPC.",
);
requirePattern(
  migration,
  /least\(greatest\(coalesce\(p_limit, 100\), 1\), 200\)/,
  "The server must clamp hostile or accidental page sizes.",
);
requirePattern(
  migration,
  /\(p_before_created_at is null\) <> \(p_before_communication_id is null\)[\s\S]*?invalid_public_customer_communications_cursor/,
  "A cursor must always contain both timestamp and communication id.",
);
requirePattern(
  migration,
  /v_customer_email is null[\s\S]*?customer\.email[\s\S]*?\)\s*and \([\s\S]*?v_customer_phone is null[\s\S]*?customer\.phone/,
  "The paged RPC must preserve the existing exact email-and-phone identity contract.",
);
requirePattern(
  migration,
  /\(communication\.created_at, communication\.id\) <[\s\S]*?\(p_before_created_at, p_before_communication_id\)/,
  "Pagination must use keyset comparison rather than offsets.",
);
requirePattern(
  migration,
  /with candidate_communications as \([\s\S]*?order by communication\.created_at desc, communication\.id desc[\s\S]*?limit v_limit[\s\S]*?cross join lateral \([\s\S]*?count\(\*\) filter \(where recipient\.read_at is null\)/,
  "Duplicate matching customer rows must collapse to one communication, unread if any recipient is unread.",
);
requirePattern(
  migration,
  /order by candidate\.created_at desc, candidate\.communication_id desc/,
  "The SQL order must match the composite cursor exactly.",
);
requirePattern(
  migration,
  /revoke all on function public\.get_public_customer_communications_page_v1\([\s\S]*?from public;[\s\S]*?grant execute on function public\.get_public_customer_communications_page_v1\([\s\S]*?to anon, authenticated, service_role;/,
  "Public clients and the server worker must be explicitly granted the paged RPC.",
);
requirePattern(
  migration,
  /create or replace function public\.get_public_customer_unread_communication_count_v1\([\s\S]*?returns bigint[\s\S]*?count\(distinct communication\.id\)[\s\S]*?recipient\.read_at is null/,
  "Badge polling must have an authoritative count-only unread RPC.",
);
requirePattern(
  migration,
  /grant execute on function public\.get_public_customer_unread_communication_count_v1\([\s\S]*?to anon, authenticated, service_role;/,
  "Public clients and the server worker must be allowed to call the unread count RPC.",
);

requirePattern(
  unreadBadgesSource,
  /publicSupabase\.rpc\([\s\S]*?CLIENT_COMMUNICATION_UNREAD_COUNT_RPC[\s\S]*?normalizeCount\(Number\(data \?\? 0\)\)/,
  "Badge polling must use the count-only RPC through the stateless public client.",
);
requirePattern(
  unreadBadgesSource,
  /isMissingClientCommunicationUnreadCountRpc\(error\)[\s\S]*?get_public_customer_communications[\s\S]*?unreadCommunicationIds/,
  "Legacy history fallback must run only when the count RPC is unavailable.",
);
assert.equal(
  unreadBadgesSource.includes("fetchPublicCustomerCommunications"),
  false,
  "Badge polling must never download the complete communications archive.",
);
requirePattern(
  sendPushSource,
  /supabase\.rpc\('get_public_customer_unread_communication_count_v1',[\s\S]*?const clientCommunicationsUnread = Math\.max\([\s\S]*?Number\(communicationsResult\.data \?\? 0\)/,
  "Push badge calculation must use the authoritative count-only RPC.",
);
assert.equal(
  /supabase\.rpc\('get_public_customer_communications'/.test(sendPushSource),
  false,
  "The push worker must never derive unread count from the legacy 100-row history RPC.",
);

// Executable keyset fixture: equal timestamps must not skip or duplicate rows.
const fixtureRows = Array.from({ length: 205 }, (_, index) => ({
  communicationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  createdAt:
    index < 125
      ? "2026-08-29T10:00:00.000Z"
      : "2026-07-01T10:00:00.000Z",
})).sort(
  (left, right) =>
    right.createdAt.localeCompare(left.createdAt) ||
    right.communicationId.localeCompare(left.communicationId),
);
const collectedIds = [];
let fixtureCursor = null;

for (let page = 0; page < 10; page += 1) {
  const candidates = fixtureCursor
    ? fixtureRows.filter(
        (row) =>
          row.createdAt < fixtureCursor.createdAt ||
          (row.createdAt === fixtureCursor.createdAt &&
            row.communicationId < fixtureCursor.communicationId),
      )
    : fixtureRows;
  const pageRows = candidates.slice(0, 100);
  collectedIds.push(...pageRows.map((row) => row.communicationId));
  if (pageRows.length < 100) {
    break;
  }
  fixtureCursor = pageRows[pageRows.length - 1];
}

assert.equal(collectedIds.length, fixtureRows.length);
assert.equal(new Set(collectedIds).size, fixtureRows.length);

console.log("Public customer communication pagination contracts: OK");
