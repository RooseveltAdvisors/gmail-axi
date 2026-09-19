import { describe, expect, it } from "vitest";
import { accountHasCredentials, accountViews, clientCredentials, ConfigError, configPath, credentialSource, parseAccountsToml, validateAccountId } from "../src/config.js";
import { VaultError } from "../src/vault.js";
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
        clientIdRef: undefined,
        clientSecretRef: undefined,
        refreshTokenRef: undefined,
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
    await expect(clientCredentials(config.accounts[0], { ID: "id", SECRET: "secret" })).resolves.toEqual({ clientId: "id", clientSecret: "secret" });
    await expect(clientCredentials(config.accounts[0], {})).rejects.toBeInstanceOf(ConfigError);
    await expect(clientCredentials(config.accounts[0], {})).rejects.toMatchObject({ code: "not_authorized", help: ["Run `gmail-axi authorize --account work`", "Run `gmail-axi doctor`"] });
  });

  it("reports client credentials separately from full auth readiness", async () => {
    const config = { path: join(homedir(), ".config/gmail-axi/accounts.toml"), exists: true, accounts: [{ key: "work", email: "you@example.com", clientIdEnv: "ID", clientSecretEnv: "SECRET", accessTokenEnv: "ACCESS" }] };
    await expect(accountViews(config, { ID: "id", SECRET: "secret", ACCESS: "access" })).resolves.toEqual([
      { key: "work", email: "you@example.com", auth: "ready", credentials: "ready", source: "env" },
    ]);
    await expect(accountViews(config, { ID: "id", SECRET: "secret" })).resolves.toEqual([
      { key: "work", email: "you@example.com", auth: "missing", credentials: "ready", source: "env" },
    ]);
    await expect(accountViews(config, { ACCESS: "access" })).resolves.toEqual([
      { key: "work", email: "you@example.com", auth: "missing", credentials: "missing", source: "env" },
    ]);
  });

  it("accepts vault references in place of environment variable names", () => {
    const [account] = parseAccountsToml(`[accounts.work]\nemail = "you@example.com"\nclient_id_ref = "op://Example Vault/Example Gmail OAuth/client_id"\nclient_secret_ref = "op://Example Vault/Example Gmail OAuth/client_secret"\nrefresh_token_ref = "op://Example Vault/Example Gmail OAuth/refresh_token"`);
    expect(account.clientIdRef).toBe("op://Example Vault/Example Gmail OAuth/client_id");
    expect(account.clientIdEnv).toBeUndefined();
    expect(credentialSource(account)).toBe("vault");
  });

  it("refuses a credential that is neither named in the environment nor in the vault", () => {
    expect(() => parseAccountsToml(`[accounts.work]\nemail = "you@example.com"\nclient_secret_ref = "op://Vault/Item/client_secret"`)).toThrow(ConfigError);
  });

  it("refuses a reference that is a path or shell fragment rather than op://", () => {
    for (const value of ["~/.config/gmail-axi/credentials.env", "$(cat /etc/passwd)", "op://Vault/Item"]) {
      expect(() => parseAccountsToml(`[accounts.work]\nemail = "you@example.com"\nclient_id_ref = "${value}"\nclient_secret_ref = "op://Vault/Item/client_secret"`)).toThrow(ConfigError);
    }
  });

  it("resolves credentials from the vault and lets the environment override", async () => {
    const account = { key: "work", email: "you@example.com", clientIdEnv: "ID", clientSecretEnv: "SECRET", clientIdRef: "op://Vault/Item/client_id", clientSecretRef: "op://Vault/Item/client_secret" };
    const asked: string[] = [];
    const resolve = async (ref: string) => {
      asked.push(ref);
      return `vault-${ref.split("/").pop()}`;
    };

    await expect(clientCredentials(account, {}, resolve)).resolves.toEqual({ clientId: "vault-client_id", clientSecret: "vault-client_secret" });
    expect(asked).toEqual(["op://Vault/Item/client_id", "op://Vault/Item/client_secret"]);

    asked.length = 0;
    await expect(clientCredentials(account, { ID: "env-id", SECRET: "env-secret" }, resolve)).resolves.toEqual({ clientId: "env-id", clientSecret: "env-secret" });
    expect(asked).toEqual([]);
  });

  it("separates an unreachable vault from an unconfigured account", async () => {
    const path = join(homedir(), ".config/gmail-axi/accounts.toml");
    const vaultAccount = { key: "work", email: "you@example.com", clientIdRef: "op://Vault/Item/client_id", clientSecretRef: "op://Vault/Item/client_secret", accessTokenEnv: "ACCESS" };
    const down = async () => { throw new VaultError("vault is unreachable"); };

    await expect(accountViews({ path, exists: true, accounts: [vaultAccount] }, { ACCESS: "access" }, down)).resolves.toEqual([
      { key: "work", email: "you@example.com", auth: "missing", credentials: "unavailable", source: "vault" },
    ]);

    const up = async (ref: string) => `vault-${ref.split("/").pop()}`;
    await expect(accountViews({ path, exists: true, accounts: [vaultAccount] }, { ACCESS: "access" }, up)).resolves.toEqual([
      { key: "work", email: "you@example.com", auth: "ready", credentials: "ready", source: "vault" },
    ]);
    await expect(accountHasCredentials({ path, exists: true, accounts: [vaultAccount] }, vaultAccount, { ACCESS: "access" }, down)).resolves.toBe(false);
  });

  it("reports rather than throws when only the refresh token reference is unreachable", async () => {
    const path = join(homedir(), ".config/gmail-axi/accounts.toml");
    const account = { key: "work", email: "you@example.com", clientIdRef: "op://Vault/Item/client_id", clientSecretRef: "op://Vault/Item/client_secret", refreshTokenRef: "op://Vault/Item/refresh_token" };
    const resolve = async (ref: string) => {
      if (ref.endsWith("refresh_token")) throw new VaultError("field not found");
      return `vault-${ref.split("/").pop()}`;
    };
    await expect(accountViews({ path, exists: true, accounts: [account] }, {}, resolve)).resolves.toEqual([
      { key: "work", email: "you@example.com", auth: "missing", credentials: "ready", source: "vault" },
    ]);
  });
});
