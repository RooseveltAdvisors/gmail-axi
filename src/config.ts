import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { Account, AccountView, ConfigState } from "./types.js";

export const ACCOUNT_ID = /^[a-zA-Z0-9_:\-]+$/;

export class ConfigError extends Error {
  constructor(message: string, readonly code = "config_invalid") {
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
    if (!record.client_id_env) throw new ConfigError(`Account ${key} is missing client_id_env`);
    if (!record.client_secret_env) throw new ConfigError(`Account ${key} is missing client_secret_env`);
    return {
      key,
      email: record.email,
      clientIdEnv: record.client_id_env,
      clientSecretEnv: record.client_secret_env,
      refreshTokenEnv: record.refresh_token_env,
      accessTokenEnv: record.access_token_env,
    } satisfies Account;
  });
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

async function refreshTokenFor(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv,
): Promise<string | undefined> {
  const configured = account.refreshTokenEnv ? env[account.refreshTokenEnv] : undefined;
  return configured || await cachedRefreshToken(config, account);
}

export async function accountHasCredentials(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const accessToken = account.accessTokenEnv ? env[account.accessTokenEnv] : undefined;
  const refreshToken = accessToken ? undefined : await refreshTokenFor(config, account, env);
  return Boolean(env[account.clientIdEnv] && env[account.clientSecretEnv] && (refreshToken || accessToken));
}

export async function accountViews(
  config: ConfigState,
  env: NodeJS.ProcessEnv = process.env,
): Promise<AccountView[]> {
  return Promise.all(
    config.accounts.map(async (account) => {
      const ready = await accountHasCredentials(config, account, env);
      return {
        key: account.key,
        email: account.email,
        auth: ready ? "ready" : "missing",
        credentials: ready ? "ready" : "missing",
      } satisfies AccountView;
    }),
  );
}

export function findAccount(config: ConfigState, key: string): Account {
  validateAccountId(key);
  const account = config.accounts.find((candidate) => candidate.key === key);
  if (!account) throw new ConfigError(`Account ${key} is not configured`);
  return account;
}

export async function authMaterial(
  config: ConfigState,
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ clientId: string; clientSecret: string; refreshToken?: string; accessToken?: string }> {
  const accessToken = account.accessTokenEnv ? env[account.accessTokenEnv] : undefined;
  const refreshToken = accessToken ? undefined : await refreshTokenFor(config, account, env);
  const clientId = env[account.clientIdEnv];
  const clientSecret = env[account.clientSecretEnv];
  if (!clientId || !clientSecret || (!refreshToken && !accessToken)) {
    throw new ConfigError(`Account ${account.key} is not authorized`, "not_authorized");
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
