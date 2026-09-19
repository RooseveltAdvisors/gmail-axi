import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Account, AccountView, ConfigState, CredentialSource } from "./types.js";
import { isVaultRef, parseVaultRef, resolveVaultRef, VaultError, type SecretResolver } from "./vault.js";

export const ACCOUNT_ID = /^[a-zA-Z0-9_:\-]+$/;

export class ConfigError extends Error {
  constructor(message: string, readonly code = "config_invalid", readonly help?: string[]) {
    super(message);
    this.name = "ConfigError";
  }
}

export function validateAccountId(key: string): void {
  if (!ACCOUNT_ID.test(key)) {
    throw new ConfigError("Account keys may contain only letters, numbers, _, :, and -");
  }
}

function userLocalPath(value: string): string {
  const home = resolve(homedir());
  const candidate = value === "~"
    ? home
    : value.startsWith(`~${sep}`) || value.startsWith("~/")
      ? resolve(home, value.slice(2))
      : resolve(home, value);
  const relativePath = relative(home, candidate);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    throw new ConfigError("GMAIL_AXI_CONFIG must be inside the user home directory", "config_path_invalid");
  }
  return candidate;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GMAIL_AXI_CONFIG ? userLocalPath(env.GMAIL_AXI_CONFIG) : join(resolve(homedir()), ".config", "gmail-axi", "accounts.toml");
}

function parseString(value: string, line: number): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      throw new ConfigError(`Invalid quoted value on line ${line}`);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  if (!trimmed || trimmed.startsWith("[") || trimmed.startsWith("{")) {
    throw new ConfigError(`Expected a string value on line ${line}`);
  }
  return trimmed;
}

function parseKeyValue(value: string): { key: string; value: string } {
  let quote = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '"' && value[index - 1] !== "\\") quote = !quote;
    if (char === "=" && !quote) return { key: value.slice(0, index).trim(), value: value.slice(index + 1) };
  }
  return { key: "", value: "" };
}

export function parseAccountsToml(content: string): Account[] {
  const records = new Map<string, Record<string, string>>();
  let current: string | undefined;

  content.split(/\r?\n/).forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const section = line.match(/^\[accounts\.([^\]]+)\]$/);
    if (section) {
      validateAccountId(section[1]);
      current = section[1];
      if (!records.has(current)) records.set(current, {});
      return;
    }
    if (!current) throw new ConfigError(`Expected an [accounts.<key>] section on line ${lineNumber}`);
    const pair = parseKeyValue(line);
    if (!pair.key) throw new ConfigError(`Expected key = value on line ${lineNumber}`);
    records.get(current)![pair.key] = parseString(pair.value.replace(/\s+#.*$/, ""), lineNumber);
  });

  return [...records.entries()].map(([key, record]) => {
    if (!record.email) throw new ConfigError(`Account ${key} is missing email`);
    requireCredentialDeclaration(key, "client_id", record.client_id_env, record.client_id_ref);
    requireCredentialDeclaration(key, "client_secret", record.client_secret_env, record.client_secret_ref);
    return {
      key,
      email: record.email,
      clientIdEnv: record.client_id_env,
      clientSecretEnv: record.client_secret_env,
      refreshTokenEnv: record.refresh_token_env,
      accessTokenEnv: record.access_token_env,
      clientIdRef: vaultReference(key, "client_id_ref", record.client_id_ref),
      clientSecretRef: vaultReference(key, "client_secret_ref", record.client_secret_ref),
      refreshTokenRef: vaultReference(key, "refresh_token_ref", record.refresh_token_ref),
    } satisfies Account;
  });
}

function requireCredentialDeclaration(key: string, field: string, envName?: string, ref?: string): void {
  if (!envName && !ref) throw new ConfigError(`Account ${key} is missing ${field}_ref or ${field}_env`);
}

/**
 * References name a vault item; they never carry a value. Anything that is not a
 * well-formed `op://vault/item/field` reference is rejected at parse time so a
 * file path or shell fragment can never reach the resolver.
 */
function vaultReference(key: string, field: string, value?: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isVaultRef(value) || !parseVaultRef(value)) {
    throw new ConfigError(`Account ${key} has an invalid ${field}; expected op://<vault>/<item>/<field>`, "config_ref_invalid");
  }
  return value;
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<ConfigState> {
  const path = configPath(env);
  try {
    const content = await readFile(path, "utf8");
    return { path, exists: true, accounts: parseAccountsToml(content) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, exists: false, accounts: [] };
    if (error instanceof ConfigError) throw error;
    throw new ConfigError("Unable to read the account configuration");
  }
}

function tokenPath(config: ConfigState, account: Account): string {
  validateAccountId(account.key);
  return join(dirname(userLocalPath(config.path)), "tokens", `${account.key}.json`);
}

async function cachedRefreshToken(config: ConfigState, account: Account): Promise<string | undefined> {
  const path = tokenPath(config, account);
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new ConfigError(`Unable to read the cached OAuth token for account ${account.key}`, "config_cache_error");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ConfigError(`The cached OAuth token for account ${account.key} is invalid`, "config_cache_invalid");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || typeof (parsed as { refresh_token?: unknown }).refresh_token !== "string" || !(parsed as { refresh_token: string }).refresh_token) {
    throw new ConfigError(`The cached OAuth token for account ${account.key} is invalid`, "config_cache_invalid");
  }
  return (parsed as { refresh_token: string }).refresh_token;
}

/**
 * An environment variable overrides the vault reference when it is set, so an
 * operator can pin one value for a single command. There is deliberately no
 * third source: gmail-axi never reads a file of exported secrets.
 */
async function resolveSecret(
  envName: string | undefined,
  ref: string | undefined,
  env: NodeJS.ProcessEnv,
  resolve: SecretResolver,
): Promise<string | undefined> {
  const fromEnv = envName ? env[envName] : undefined;
  if (fromEnv) return fromEnv;
  return ref ? resolve(ref) : undefined;
}

export function credentialSource(account: Account): CredentialSource {
  if (account.clientIdRef && account.clientSecretRef) return "vault";
  if (account.clientIdEnv && account.clientSecretEnv) return "env";
  return "none";
}

async function refreshTokenFor(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv,
  resolve: SecretResolver,
): Promise<string | undefined> {
  const configured = await resolveSecret(account.refreshTokenEnv, account.refreshTokenRef, env, resolve);
  return configured || await cachedRefreshToken(config, account);
}

export async function accountHasCredentials(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
  resolve: SecretResolver = resolveVaultRef,
): Promise<boolean> {
  const accessToken = account.accessTokenEnv ? env[account.accessTokenEnv] : undefined;
  // A status check reports an unreachable vault; it does not fail on it. A bad
  // token cache still raises, because that is a local fault worth surfacing.
  const refreshToken = accessToken ? undefined : await refreshTokenFor(config, account, env, resolve).catch((error) => {
    if (error instanceof VaultError) return undefined;
    throw error;
  });
  const client = await clientCredentials(account, env, resolve).catch(() => undefined);
  return Boolean(client && (refreshToken || accessToken));
}

export async function accountViews(
  config: ConfigState,
  env: NodeJS.ProcessEnv = process.env,
  resolve: SecretResolver = resolveVaultRef,
): Promise<AccountView[]> {
  return Promise.all(
    config.accounts.map(async (account) => {
      const credentials = await credentialStatus(account, env, resolve);
      const ready = credentials === "ready" && await accountHasCredentials(config, account, env, resolve);
      return {
        key: account.key,
        email: account.email,
        auth: ready ? "ready" : "missing",
        credentials,
        source: credentialSource(account),
      } satisfies AccountView;
    }),
  );
}

/** Live check: "unavailable" separates a broken vault from an unconfigured account. */
async function credentialStatus(
  account: Account,
  env: NodeJS.ProcessEnv,
  resolve: SecretResolver,
): Promise<AccountView["credentials"]> {
  try {
    await clientCredentials(account, env, resolve);
    return "ready";
  } catch (error) {
    return error instanceof VaultError ? "unavailable" : "missing";
  }
}

export function findAccount(config: ConfigState, key: string): Account {
  validateAccountId(key);
  const account = config.accounts.find((candidate) => candidate.key === key);
  if (!account) throw new ConfigError(`Account ${key} is not configured`);
  return account;
}

function authorizationHelp(account: Account): string[] {
  return [`Run \`gmail-axi authorize --account ${account.key}\``, "Run `gmail-axi doctor`"];
}

export async function clientCredentials(
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
  resolve: SecretResolver = resolveVaultRef,
): Promise<{ clientId: string; clientSecret: string }> {
  const clientId = await resolveSecret(account.clientIdEnv, account.clientIdRef, env, resolve);
  const clientSecret = await resolveSecret(account.clientSecretEnv, account.clientSecretRef, env, resolve);
  if (!clientId || !clientSecret) throw new ConfigError(`Account ${account.key} is missing OAuth client credentials`, "not_authorized", authorizationHelp(account));
  return { clientId, clientSecret };
}

export async function authMaterial(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
  resolve: SecretResolver = resolveVaultRef,
): Promise<{ clientId: string; clientSecret: string; refreshToken?: string; accessToken?: string }> {
  const accessToken = account.accessTokenEnv ? env[account.accessTokenEnv] : undefined;
  const refreshToken = accessToken ? undefined : await refreshTokenFor(config, account, env, resolve);
  const { clientId, clientSecret } = await clientCredentials(account, env, resolve);
  if (!refreshToken && !accessToken) {
    throw new ConfigError(`Account ${account.key} is not authorized`, "not_authorized", authorizationHelp(account));
  }
  return { clientId, clientSecret, refreshToken, accessToken };
}

export async function saveRefreshToken(config: ConfigState, account: Account, refreshToken: string): Promise<void> {
  if (!refreshToken) throw new ConfigError("Authorization did not return a refresh token");
  const path = tokenPath(config, account);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeFile(path, `${JSON.stringify({ refresh_token: refreshToken }, null, 2)}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

export function displayPath(path: string): string {
  const home = homedir();
  return path === home ? "~" : path.startsWith(`${home}/`) ? `~/${path.slice(home.length + 1)}` : path;
}
