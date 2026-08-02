import { describe, expect, it } from "vitest";
import { GmailClient } from "../src/gmail.js";
import type { ConfigState } from "../src/types.js";

const config: ConfigState = {
  path: "/tmp/gmail-axi-test/accounts.toml",
  exists: true,
  accounts: [{ key: "work", email: "you@example.com", clientIdEnv: "ID", clientSecretEnv: "SECRET", accessTokenEnv: "ACCESS" }],
};

const message = {
  id: "message-1",
  threadId: "thread-1",
  snippet: "A short snippet",
  labelIds: ["INBOX"],
  payload: {
    mimeType: "text/plain",
    headers: [
      { name: "Subject", value: "Hello" },
      { name: "From", value: "you@example.com" },
      { name: "Date", value: "2026-01-01" },
    ],
    body: { data: Buffer.from("A body that is long enough for the detail response.").toString("base64url") },
  },
};

describe("Gmail client", () => {
  it("adds Gmail search filters and truncates detail bodies", async () => {
    const requests: string[] = [];
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      requests.push(String(input));
      if (String(input).includes("/messages?")) return new Response(JSON.stringify({ resultSizeEstimate: 1, messages: [{ id: "message-1" }] }), { status: 200 });
      return new Response(JSON.stringify(message), { status: 200 });
    };
    const client = new GmailClient(config, config.accounts[0], { ID: "id", SECRET: "secret", ACCESS: "x" }, fetcher);
    const result = await client.search({ from: "you@example.com", newerThanDays: 7, limit: 10 });
    expect(result.query).toBe("from:you@example.com newer_than:7d");
    expect(result.messages[0]).toMatchObject({ id: "message-1", subject: "Hello", has_attachments: false });
    const detail = await client.getMessage("message-1", false);
    expect(detail.body).toContain("body");
    expect(detail.body_size).toBeGreaterThan(0);
    expect(requests[0]).toContain("q=from%3Ayou%40example.com+newer_than%3A7d");
  });

  it("creates drafts through the drafts endpoint", async () => {
    let request: RequestInit | undefined;
    const fetcher = async (input: string | URL, init?: RequestInit) => {
      request = init;
      expect(String(input)).toContain("/drafts");
      return new Response(JSON.stringify({ id: "draft-1", message: { threadId: "thread-1" } }), { status: 200 });
    };
    const client = new GmailClient(config, config.accounts[0], { ID: "id", SECRET: "secret", ACCESS: "x" }, fetcher);
    await expect(client.createDraft("recipient@example.com", "Hello", "Draft body")).resolves.toEqual({ draft_id: "draft-1", thread_id: "thread-1", status: "draft" });
    expect(String(request?.body)).toContain("raw");
  });
});
