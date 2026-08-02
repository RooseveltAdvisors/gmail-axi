export type Account = {
  key: string;
  email: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  refreshTokenEnv?: string;
  accessTokenEnv?: string;
};

export type AccountView = {
  key: string;
  email: string;
  auth: "ready" | "missing";
  credentials: "ready" | "missing";
};

export type ConfigState = {
  path: string;
  exists: boolean;
  accounts: Account[];
};

export type MessageSummary = {
  id: string;
  thread_id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  has_attachments: boolean;
};

export type MessageDetail = MessageSummary & {
  to: string;
  labels: string[];
  body: string;
  body_size: number;
};

export type ThreadDetail = {
  thread_id: string;
  message_count: number;
  subject: string;
  participants: string[];
  messages: Array<MessageDetail | MessageSummary>;
};

export type SearchOptions = {
  query?: string;
  from?: string;
  since?: string;
  newerThanDays?: number;
  limit: number;
};

export type DraftResult = {
  draft_id: string;
  thread_id: string;
  status: "draft";
};

export type GmailOperations = {
  search(options: SearchOptions): Promise<{
    count: number;
    returned: number;
    query: string;
    messages: MessageSummary[];
  }>;
  getMessage(id: string, full: boolean): Promise<MessageDetail>;
  getThread(id: string, full: boolean): Promise<ThreadDetail>;
  createDraft(to: string, subject: string, body: string): Promise<DraftResult>;
};
