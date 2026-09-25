// Server-only. Asks the Scout Genie space (the judge-facing "why" tool over
// scout.core) one natural-language question through the Genie Conversation
// API and returns the SQL Genie wrote, its text reply, and the result rows.
//
// Endpoints confirmed 2026-09-19 via Context7 (Databricks API docs,
// /websites/databricks_api):
//   - POST /api/2.0/genie/spaces/{space_id}/start-conversation
//     body { content } -> { conversation_id, message_id, message }
//     (docs.databricks.com/api/genie/v1/genie-start-conversation.md)
//   - GET  /api/2.0/genie/spaces/{space_id}/conversations/{cid}/messages/{mid}
//     -> { status, error, attachments: [{ attachment_id, text: { content } |
//        query: { query, description } | suggested_questions }] }
//     (docs.databricks.com/api/genie/v1/genie-create-conversation-message.md
//      shows the IN_PROGRESS and COMPLETED message shapes)
//   - GET  .../messages/{mid}/attachments/{attachment_id}/query-result
//     -> { statement_response: { manifest: { schema: { columns } },
//        result: { data_array } } }
//     (docs.databricks.com/api/genie/v1/genie-get-message-attachment-query-result.md)
// Poll loop and terminal states (COMPLETED / FAILED / CANCELLED, with
// SUBMITTED / FILTERING_CONTEXT / ASKING_AI / EXECUTING_QUERY in between) per
// the AI Dev Kit skill `databricks-genie-agents`
// references/query-genie-agent.md (github.com/databricks/databricks-agent-skills).

if (typeof window !== "undefined") {
  throw new Error("lib/genie.ts must never reach the client bundle");
}

export type GenieAnswer = {
  conversationId: string;
  messageId: string;
  /** The SQL Genie generated, or null when it answered in text only (e.g. a clarifying question). */
  sql: string | null;
  description: string | null;
  text: string | null;
  columns: string[];
  rows: unknown[][];
};

type GenieAttachment = {
  attachment_id?: string;
  text?: { content?: string };
  query?: { query?: string; description?: string };
};

export type GenieMessage = {
  status?: string;
  error?: { error?: string; type?: string } | null;
  attachments?: GenieAttachment[] | null;
};

const POLL_INTERVAL_MS = 2000;
// note: the kit quotes ~30 s simple / 60-120 s joins; 3 min ceiling fails loud instead of hanging.
const MAX_WAIT_MS = 3 * 60 * 1000;
const TERMINAL = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function callApi(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const host = requiredEnv("DATABRICKS_HOST").replace(/\/$/, "");
  const token = requiredEnv("DATABRICKS_TOKEN");
  const res = await fetch(`${host}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof body.message === "string" ? body.message : JSON.stringify(body);
    throw new Error(`GENIE_API_ERROR: ${res.status} ${message}`);
  }
  return body;
}

/**
 * Pure: pulls the SQL, description and text reply out of a terminal Genie
 * message, plus the attachment id whose query-result to fetch. Throws
 * GENIE_QUESTION_FAILED on FAILED/CANCELLED (naming Genie's error), never
 * returns an empty answer for a failure.
 */
export function parseGenieMessage(message: GenieMessage): {
  sql: string | null;
  description: string | null;
  text: string | null;
  queryAttachmentId: string | null;
} {
  if (message.status !== "COMPLETED") {
    const detail = message.error?.error ?? `status ${message.status ?? "unknown"}`;
    throw new Error(`GENIE_QUESTION_FAILED: ${message.error?.type ?? "no type"}: ${detail}`);
  }
  const attachments = message.attachments ?? [];
  const query = attachments.find((a) => a.query?.query);
  const text = attachments.find((a) => a.text?.content);
  return {
    sql: query?.query?.query ?? null,
    description: query?.query?.description ?? null,
    text: text?.text?.content ?? null,
    queryAttachmentId: query?.attachment_id ?? null,
  };
}

/** Asks one question of the space in DATABRICKS_GENIE_SPACE_ID and waits for the answer. Throws named errors; never swallows. */
export async function askGenie(question: string): Promise<GenieAnswer> {
  const spaceId = requiredEnv("DATABRICKS_GENIE_SPACE_ID");
  const base = `/api/2.0/genie/spaces/${encodeURIComponent(spaceId)}`;

  const started = await callApi(`${base}/start-conversation`, {
    method: "POST",
    body: JSON.stringify({ content: question }),
  });
  const conversationId = started.conversation_id as string | undefined;
  const messageId = started.message_id as string | undefined;
  if (!conversationId || !messageId) {
    throw new Error(`GENIE_API_ERROR: start-conversation returned no ids: ${JSON.stringify(started).slice(0, 300)}`);
  }

  const messagePath = `${base}/conversations/${conversationId}/messages/${messageId}`;
  const startedAt = Date.now();
  let message = (started.message as GenieMessage | undefined) ?? {};
  while (!TERMINAL.has(message.status ?? "")) {
    if (Date.now() - startedAt > MAX_WAIT_MS) {
      throw new Error(`GENIE_TIMEOUT: message ${messageId} still ${message.status} after ${MAX_WAIT_MS}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    message = (await callApi(messagePath)) as GenieMessage;
  }

  const parsed = parseGenieMessage(message);
  let columns: string[] = [];
  let rows: unknown[][] = [];
  if (parsed.queryAttachmentId) {
    const result = await callApi(`${messagePath}/attachments/${parsed.queryAttachmentId}/query-result`);
    const statement = result.statement_response as
      | { manifest?: { schema?: { columns?: Array<{ name: string }> } }; result?: { data_array?: unknown[][] } }
      | undefined;
    columns = statement?.manifest?.schema?.columns?.map((c) => c.name) ?? [];
    rows = statement?.result?.data_array ?? [];
  }

  return { conversationId, messageId, sql: parsed.sql, description: parsed.description, text: parsed.text, columns, rows };
}
