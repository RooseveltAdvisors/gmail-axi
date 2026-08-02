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

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
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
    const data = await jsonResponse(response);
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
    return jsonResponse(response);
  }

  async search(options: SearchOptions): Promise<{ count: number; returned: number; query: string; messages: MessageSummary[] }> {
    const clauses = [options.query, options.from && `from:${options.from}`, options.since && `after:${options.since}`, options.newerThanDays && `newer_than:${options.newerThanDays}d`].filter(Boolean);
    const query = clauses.join(" ");
    const params = new URLSearchParams({ maxResults: String(options.limit) });
    if (query) params.set("q", query);
    const listed = await this.request(`/messages?${params}`);
    const ids = Array.isArray(listed.messages) ? (listed.messages as Array<{ id?: string }>) : [];
    const messages = await Promise.all(ids.filter((item) => item.id).map((item) => this.message(item.id!)));
    const estimate = typeof listed.resultSizeEstimate === "number" ? listed.resultSizeEstimate : messages.length;
    return { count: estimate, returned: messages.length, query, messages: messages.map(summary) };
  }

  private async message(id: string): Promise<GmailMessage> {
    const params = new URLSearchParams({ format: "metadata" });
    for (const field of ["Subject", "From", "Date"]) params.append("metadataHeaders", field);
    return (await this.request(`/messages/${encodeURIComponent(id)}?${params}`)) as GmailMessage;
  }

  async getMessage(id: string, full: boolean): Promise<MessageDetail> {
    const params = new URLSearchParams({ format: "full" });
    const message = (await this.request(`/messages/${encodeURIComponent(id)}?${params}`)) as GmailMessage;
    return detail(message, full);
  }

  async getThread(id: string, full: boolean): Promise<ThreadDetail> {
    const params = new URLSearchParams({ format: "full" });
    const thread = await this.request(`/threads/${encodeURIComponent(id)}?${params}`);
    const messages = Array.isArray(thread.messages) ? (thread.messages as GmailMessage[]) : [];
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
    const draft = (result as { id?: string; message?: { threadId?: string } });
    return { draft_id: draft.id || "", thread_id: draft.message?.threadId || "", status: "draft" };
  }
}
