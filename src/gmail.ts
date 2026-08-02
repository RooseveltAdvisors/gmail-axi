import { authMaterial } from "./config.js";
import type { Account, ConfigState, DraftResult, GmailOperations, MessageDetail, MessageSummary, SearchOptions, ThreadDetail } from "./types.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TOKEN_API = "https://oauth2.googleapis.com/token";
const BODY_LIMIT = 1200;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export class GmailError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.name = "GmailError";
    this.code = code;
    this.status = status;
  }
}

type GmailHeader = { name?: string; value?: string };
type GmailPart = { filename?: string; mimeType?: string; body?: { data?: string; attachmentId?: string }; parts?: GmailPart[] };
type GmailMessage = {
  id?: string;
  threadId?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: GmailHeader[] };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function header(message: GmailMessage, name: string): string {
  return message.payload?.headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value || "";
}

function parts(payload?: GmailPart): GmailPart[] {
  if (!payload) return [];
  return [payload, ...(payload.parts || []).flatMap((part) => parts(part))];
}

function messageBody(message: GmailMessage): string {
  const allParts = parts(message.payload);
  const preferred = allParts.find((part) => part.mimeType === "text/plain" && part.body?.data);
  const fallback = allParts.find((part) => part.body?.data);
  return (preferred || fallback)?.body?.data ? decodeBase64Url((preferred || fallback)!.body!.data!) : "";
}

function hasAttachments(message: GmailMessage): boolean {
  return parts(message.payload).some((part) => Boolean(part.filename || part.body?.attachmentId));
}

function preview(value: string, full: boolean): { body: string; body_size: number } {
  if (full || value.length <= BODY_LIMIT) return { body: value, body_size: value.length };
  return {
    body: `${value.slice(0, BODY_LIMIT)}… (truncated, ${value.length} chars total — use --full to see complete body)`,
    body_size: value.length,
  };
}

function summary(message: GmailMessage): MessageSummary {
  return {
    id: message.id || "",
    thread_id: message.threadId || "",
    subject: header(message, "Subject"),
    from: header(message, "From"),
    date: header(message, "Date"),
    snippet: message.snippet || "",
    has_attachments: hasAttachments(message),
  };
}

function detail(message: GmailMessage, full: boolean): MessageDetail {
  const content = preview(messageBody(message), full);
  return {
    ...summary(message),
    to: header(message, "To"),
    labels: message.labelIds || [],
    body: content.body,
    body_size: content.body_size,
  };
}

async function jsonResponse(response: Response, operation: string): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new GmailError("invalid_response", `Google returned invalid JSON for ${operation}`, response.status);
  }
  if (!isRecord(value) || !Object.keys(value).length) {
    throw new GmailError("invalid_response", `Google returned an invalid response for ${operation}`, response.status);
  }
  return value;
}

function messageResponse(value: Record<string, unknown>): GmailMessage {
  if (typeof value.id !== "string" || !value.id) {
    throw new GmailError("invalid_response", "Google returned a message without an id");
  }
  return value as GmailMessage;
}

export function normalizeSince(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new GmailError("invalid_input", "--since must use YYYY-MM-DD");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (!daysInMonth || day < 1 || day > daysInMonth) throw new GmailError("invalid_input", "--since must be a valid YYYY-MM-DD date");
  return `${match[1]}/${match[2]}/${match[3]}`;
}

export class GmailClient implements GmailOperations {
  private accessToken?: string;

  constructor(
    private readonly config: ConfigState,
    private readonly account: Account,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  private async token(): Promise<string> {
    if (this.accessToken) return this.accessToken;
    const material = await authMaterial(this.config, this.account, this.env);
    if (material.accessToken) {
      this.accessToken = material.accessToken;
      return material.accessToken;
    }
    const response = await this.fetcher(TOKEN_API, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: material.clientId,
        client_secret: material.clientSecret,
        refresh_token: material.refreshToken!,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) throw new GmailError("auth_failed", "Google authorization failed", response.status);
    const data = await jsonResponse(response, "the authorization response");
    if (typeof data.access_token !== "string") throw new GmailError("auth_failed", "Google authorization returned no access token");
    this.accessToken = data.access_token;
    return data.access_token;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
    const token = await this.token();
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await this.fetcher(`${GMAIL_API}${path}`, { ...init, headers });
    if (!response.ok) {
      if (response.status === 401) throw new GmailError("auth_expired", "Google authorization expired", response.status);
      if (response.status === 404) throw new GmailError("not_found", "Gmail item was not found", response.status);
      throw new GmailError("gmail_api_error", "Gmail request failed", response.status);
    }
    return jsonResponse(response, "the Gmail response");
  }

  async search(options: SearchOptions): Promise<{ count: number; returned: number; query: string; messages: MessageSummary[] }> {
    const since = options.since === undefined ? undefined : normalizeSince(options.since);
    const clauses = [options.query, options.from && `from:${options.from}`, since && `after:${since}`, options.newerThanDays !== undefined && `newer_than:${options.newerThanDays}d`].filter(Boolean);
    const query = clauses.join(" ");
    const params = new URLSearchParams({ maxResults: String(options.limit) });
    if (query) params.set("q", query);
    const listed = await this.request(`/messages?${params}`);
    if (listed.messages !== undefined && !Array.isArray(listed.messages)) {
      throw new GmailError("invalid_response", "Google returned an invalid message list");
    }
    if (listed.messages === undefined && typeof listed.resultSizeEstimate !== "number") {
      throw new GmailError("invalid_response", "Google returned an invalid message list");
    }
    const ids = (listed.messages || []) as unknown[];
    const messages = await Promise.all(ids.map((item) => {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id) throw new GmailError("invalid_response", "Google returned a message without an id");
      return this.message(item.id);
    }));
    const estimate = typeof listed.resultSizeEstimate === "number" ? listed.resultSizeEstimate : messages.length;
    return { count: estimate, returned: messages.length, query, messages: messages.map(summary) };
  }

  private async message(id: string): Promise<GmailMessage> {
    const params = new URLSearchParams({ format: "metadata" });
    for (const field of ["Subject", "From", "Date"]) params.append("metadataHeaders", field);
    return messageResponse(await this.request(`/messages/${encodeURIComponent(id)}?${params}`));
  }

  async getMessage(id: string, full: boolean): Promise<MessageDetail> {
    const params = new URLSearchParams({ format: "full" });
    const message = messageResponse(await this.request(`/messages/${encodeURIComponent(id)}?${params}`));
    return detail(message, full);
  }

  async getThread(id: string, full: boolean): Promise<ThreadDetail> {
    const params = new URLSearchParams({ format: full ? "full" : "metadata" });
    if (!full) for (const field of ["Subject", "From", "Date"]) params.append("metadataHeaders", field);
    const thread = await this.request(`/threads/${encodeURIComponent(id)}?${params}`);
    if (typeof thread.id !== "string" || !thread.id || (thread.messages !== undefined && !Array.isArray(thread.messages))) {
      throw new GmailError("invalid_response", "Google returned an invalid thread");
    }
    const messages = ((thread.messages || []) as unknown[]).map((message) => {
      if (!isRecord(message) || typeof message.id !== "string" || !message.id) throw new GmailError("invalid_response", "Google returned a thread message without an id");
      return message as GmailMessage;
    });
    const mapped = messages.map((message) => (full ? detail(message, true) : summary(message)));
    const participants = [...new Set(messages.map((message) => header(message, "From")).filter(Boolean))];
    return {
      thread_id: (thread.id as string) || id,
      message_count: mapped.length,
      subject: header(messages[0] || {}, "Subject"),
      participants,
      messages: mapped,
    };
  }

  async createDraft(to: string, subject: string, body: string): Promise<DraftResult> {
    if (/[\r\n]/.test(to) || /[\r\n]/.test(subject)) throw new GmailError("invalid_input", "Recipient and subject cannot contain newlines");
    const raw = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', "", body].join("\r\n");
    const result = await this.request("/drafts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: { raw: base64Url(raw) } }),
    });
    const draft = result as { id?: unknown; message?: unknown };
    const message = isRecord(draft.message) ? draft.message : undefined;
    if (typeof draft.id !== "string" || !draft.id || !message || typeof message.id !== "string" || !message.id || typeof message.threadId !== "string" || !message.threadId) {
      throw new GmailError("invalid_response", "Google returned a draft without the required ids");
    }
    return { draft_id: draft.id, message_id: message.id, thread_id: message.threadId, status: "draft" };
  }
}
