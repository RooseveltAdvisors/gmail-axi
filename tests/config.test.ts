import { describe, expect, it } from "vitest";
import { accountHasCredentials, ConfigError, configPath, parseAccountsToml, validateAccountId } from "../src/config.js";
import { homedir } from "node:os";
import { join } from "node:path";

describe("account configuration", () => {
  it("parses only the documented identity-free account shape", () => {
    expect(parseAccountsToml(`[accounts.work]\nemail = "you@example.com"\nclient_id_env = "TEST_CLIENT_ID"\nclient_secret_env = "TEST_CLIENT_SECRET"\nrefresh_token_env = "TEST_REFRESH"`)).toEqual([
      {
        key: "work",
        email: "you@example.com",
        clientIdEnv: "TEST_CLIENT_ID",
        clientSecretEnv: "TEST_CLIENT_SECRET",
        refreshTokenEnv: "TEST_REFRESH",
        accessTokenEnv: undefined,
      },
    ]);
  });

  it("rejects unsafe account keys before they reach filesystem paths", () => {
    expect(() => validateAccountId("../personal")).toThrow(ConfigError);
    expect(() => parseAccountsToml(`[accounts.bad/key]\nemail = "you@example.com"\nclient_id_env = "ID"\nclient_secret_env = "SECRET"`)).toThrow(ConfigError);
  });

  it("keeps configured paths and token-backed auth user-local", async () => {
    expect(configPath({ GMAIL_AXI_CONFIG: "~/.config/gmail-axi/accounts.toml" })).toBe(join(homedir(), ".config/gmail-axi/accounts.toml"));
    expect(() => configPath({ GMAIL_AXI_CONFIG: "/tmp/accounts.toml" })).toThrow(ConfigError);
    const config = { path: join(homedir(), ".config/gmail-axi/accounts.toml"), exists: true, accounts: [{ key: "work", email: "you@example.com", clientIdEnv: "ID", clientSecretEnv: "SECRET", accessTokenEnv: "ACCESS" }] };
    await expect(accountHasCredentials(config, config.accounts[0], { ID: "id", SECRET: "secret", ACCESS: "access" })).resolves.toBe(true);
  });
});
