import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ConfigState, GmailOperations } from "../src/types.js";

const config: ConfigState = {
  path: join(homedir(), ".config/gmail-axi-test/accounts.toml"),
  exists: true,
  accounts: [{ key: "work", email: "you@example.com", clientIdEnv: "ID", clientSecretEnv: "SECRET", accessTokenEnv: "ACCESS" }],
};

function fakeClient(): GmailOperations {
  return {
    search: async () => ({ count: 0, returned: 0, query: "", messages: [] }),
    getMessage: async (id) => ({ id, thread_id: "thread-1", subject: "Subject", from: "you@example.com", to: "recipient@example.com", date: "", snippet: "", has_attachments: false, labels: [], body: "body", body_size: 4 }),
    getThread: async (id) => ({ thread_id: id, message_count: 0, subject: "", participants: [], messages: [] }),
    createDraft: async () => ({ draft_id: "draft-1", message_id: "message-1", thread_id: "thread-1", status: "draft" }),
  };
}

describe("CLI contracts", () => {
  it("shows a definitive empty search state and contextual commands", async () => {
    let output = "";
    const code = await run(["search", "--account", "work", "--query", "newer_than:7d"], {
      loadConfig: async () => config,
      createClient: async () => fakeClient(),
      env: {},
      stdout: (text) => { output += text; },
      executable: "/usr/local/bin/gmail-axi",
    });
    expect(code).toBe(0);
    expect(output).toContain("count: 0");
    expect(output).toContain("messages[0]");
    expect(output).toContain("gmail-axi search --account work");
  });

  it("refuses send without invoking a client", async () => {
    let output = "";
    const code = await run(["send"], { stdout: (text) => { output += text; } });
    expect(code).toBe(1);
    expect(output).toContain("code: send_disabled");
  });

  it("uses exit code 2 for unknown flags", async () => {
    let output = "";
    const code = await run(["search", "--account", "work", "--invented"], {
      stdout: (text) => { output += text; },
    });
    expect(code).toBe(2);
    expect(output).toContain("code: unknown_flag");
  });

  it("uses the created message id for draft follow-up", async () => {
    let output = "";
    const code = await run(["draft", "--account", "work", "--to", "recipient@example.com", "--subject", "Hello", "--body", "Draft body"], {
      loadConfig: async () => config,
      createClient: async () => fakeClient(),
      env: {},
      stdout: (text) => { output += text; },
    });
    expect(code).toBe(0);
    expect(output).toContain("message_id: message-1");
    expect(output).toContain("gmail-axi get --account work message-1");
  });

  it("adds contextual help after authorization", async () => {
    let output = "";
    const code = await run(["authorize", "--account", "work"], {
      loadConfig: async () => config,
      createClient: async () => fakeClient(),
      authorize: async () => ({ account: "work", status: "authorized", storage: "user-local" }),
      env: {},
      stdout: (text) => { output += text; },
    });
    expect(code).toBe(0);
    expect(output).toContain("gmail-axi search --account work");
  });
});
