#!/usr/bin/env node
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { accountViews, ConfigError, displayPath, findAccount, loadConfig } from "./config.js";
import { GmailClient, GmailError } from "./gmail.js";
import { authorizeAccount } from "./oauth.js";
import { toon } from "./toon.js";
import type { ConfigState, GmailOperations } from "./types.js";

const DESCRIPTION = "Read and draft mail across local Gmail accounts; sending is disabled.";
const EXAMPLE_CONFIG = resolve(dirname(fileURLToPath(import.meta.url)), "../accounts.example.toml");

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: 1 | 2 = 1,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "CliError";
  }
}

type Dependencies = {
  loadConfig: typeof loadConfig;
  createClient: (config: ConfigState, accountKey: string) => Promise<GmailOperations>;
  authorize: typeof authorizeAccount;
  env: NodeJS.ProcessEnv;
  executable: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

const defaultDependencies = (): Dependencies => ({
  loadConfig,
  createClient: async (config, accountKey) => new GmailClient(config, findAccount(config, accountKey)),
  authorize: authorizeAccount,
  env: process.env,
  executable: process.argv[1] || "gmail-axi",
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});

type OptionSpec = Record<string, "value" | "boolean">;

function parseArgs(args: string[], specs: OptionSpec): { options: Record<string, string | boolean>; positionals: string[] } {
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const separator = argument.indexOf("=");
    const name = separator === -1 ? argument.slice(2) : argument.slice(2, separator);
    const inline = separator === -1 ? undefined : argument.slice(separator + 1);
    const kind = specs[name];
    if (!kind) throw new CliError("unknown_flag", `Unknown flag --${name}`, 2, { flag: `--${name}` });
    if (kind === "boolean") {
      if (inline !== undefined) throw new CliError("invalid_flag", `Flag --${name} does not take a value`, 2);
      options[name] = true;
      continue;
    }
    const value = inline ?? args[++index];
    if (!value || value.startsWith("--")) throw new CliError("missing_value", `Flag --${name} requires a value`, 2);
    options[name] = value;
  }
  return { options, positionals };
}

function required(options: Record<string, string | boolean>, name: string): string {
  const value = options[name];
  if (typeof value !== "string" || !value) throw new CliError("missing_flag", `--${name} is required`, 2);
  return value;
}

function integerOption(options: Record<string, string | boolean>, name: string, fallback: number): number {
  const value = options[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new CliError("invalid_value", `--${name} must be a positive integer`, 2);
  return parsed;
}

function commandHelp(command: string): Record<string, unknown> {
  const helps: Record<string, Record<string, unknown>> = {
    accounts: {
      command: "accounts",
      description: "Show configured accounts and live authorization status.",
      flags: ["--help"],
      examples: ["gmail-axi accounts", "gmail-axi doctor"],
    },
    doctor: {
      command: "doctor",
      description: "Check local configuration and account authorization without exposing secrets.",
      flags: ["--help"],
      examples: ["gmail-axi doctor", "GMAIL_AXI_CONFIG=~/.config/gmail-axi/accounts.toml gmail-axi doctor"],
    },
    search: {
      command: "search",
      description: "Search Gmail and return compact message summaries.",
      flags: ["--account <key> (required)", "--query <gmail-query>", "--from <address>", "--since <YYYY-MM-DD>", "--newer-than-days <n>", "--limit <n> (default 50)", "--help"],
      examples: ["gmail-axi search --account <key> --query \"from:you@example.com\"", "gmail-axi search --account <key> --newer-than-days 7 --limit 20", "gmail-axi search --account <key> --from you@example.com --since 2026-01-01"],
    },
    get: {
      command: "get",
      description: "Read one Gmail message with a truncated body by default.",
      flags: ["--account <key> (required)", "--full", "--help"],
      examples: ["gmail-axi get --account <key> <message-id>", "gmail-axi get --account <key> <message-id> --full"],
    },
    thread: {
      command: "thread",
      description: "Read one Gmail thread with compact messages by default.",
      flags: ["--account <key> (required)", "--full", "--help"],
      examples: ["gmail-axi thread --account <key> <thread-id>", "gmail-axi thread --account <key> <thread-id> --full"],
    },
    draft: {
      command: "draft",
      description: "Create a Gmail draft; messages are never sent.",
      flags: ["--account <key> (required)", "--to <address> (required)", "--subject <text> (required)", "--body <text> (required)", "--help"],
      examples: ["gmail-axi draft --account <key> --to recipient@example.com --subject \"Hello\" --body \"Draft text\"", "gmail-axi get --account <key> <message-id>"],
    },
    authorize: {
      command: "authorize",
      description: "Authorize one account through a local Desktop OAuth callback using gmail.readonly and gmail.compose.",
      flags: ["--account <key> (required)", "--help"],
      examples: ["gmail-axi authorize --account <key>", "gmail-axi doctor"],
    },
  };
  return helps[command] || { command, description: "Unknown command", flags: ["--help"], examples: ["gmail-axi --help"] };
}

function globalHelp(): Record<string, unknown> {
  return {
    command: "gmail-axi",
    description: DESCRIPTION,
    commands: ["accounts", "doctor", "search", "get", "thread", "draft", "authorize"],
    flags: ["--help"],
    examples: ["gmail-axi", "gmail-axi search --account <key> --query \"newer_than:7d\"", "gmail-axi draft --account <key> --to recipient@example.com --subject \"Hello\" --body \"Draft\""],
    note: "There is deliberately no send command.",
  };
}

function accountHelp(command: string, account: string, messageId?: string): string[] {
  const prefix = `gmail-axi ${command} --account ${account}`;
  if (command !== "search") return [hint(`gmail-axi search --account ${account} --query "in:anywhere"`)];
  const next = [hint(`${prefix} --query "newer_than:7d"`)];
  if (messageId) next.push(hint(`gmail-axi get --account ${account} ${messageId}`));
  return next;
}

function hint(command: string): string {
  return `Run \`${command}\``;
}

function missingConfigHelp(): string[] {
  return [`Run \`mkdir -p ~/.config/gmail-axi && cp ${shellPath(EXAMPLE_CONFIG)} ~/.config/gmail-axi/accounts.toml\``, "Run `gmail-axi doctor`"];
}

function shellPath(path: string): string {
  return `'${path.replaceAll("'", "'\"'\"'")}'`;
}

async function home(deps: Dependencies, doctor = false): Promise<Record<string, unknown>> {
  const config = await deps.loadConfig(deps.env);
  const views = await accountViews(config, deps.env);
  if (doctor) {
    return {
      config: { path: displayPath(config.path), status: config.exists ? "ok" : "missing" },
      accounts: views,
      checks: [
        { name: "config", status: config.exists ? "ok" : "missing" },
        { name: "accounts", status: views.length ? "ok" : "missing" },
        { name: "secrets", status: "local-only" },
      ],
      help: config.exists ? ["Run `gmail-axi accounts`", "Run `gmail-axi authorize --account <key>`"] : missingConfigHelp(),
    };
  }
  return {
    bin: executablePath(deps.executable),
    description: DESCRIPTION,
    config: { path: displayPath(config.path), status: config.exists ? "ok" : "missing" },
    count: views.length,
    accounts: views.map(({ key, email, auth }) => ({ key, email, auth })),
    help: config.exists && views.length ? ["Run `gmail-axi doctor`", "Run `gmail-axi search --account <key> --query \"newer_than:7d\"`"] : missingConfigHelp(),
  };
}

function executablePath(path: string): string {
  const absolute = resolve(path);
  return absolute.startsWith(`${homedir()}/`) ? `~/${absolute.slice(homedir().length + 1)}` : absolute;
}

async function accountClient(deps: Dependencies, accountKey: string): Promise<{ config: ConfigState; client: GmailOperations }> {
  const config = await deps.loadConfig(deps.env);
  if (!config.exists) throw new CliError("config_missing", "Account configuration was not found", 1, { path: displayPath(config.path), help: missingConfigHelp() });
  try {
    findAccount(config, accountKey);
  } catch (error) {
    if (error instanceof ConfigError) throw new CliError(error.code, error.message, 1, { help: [hint("gmail-axi accounts"), hint(`gmail-axi authorize --account ${accountKey}`)] });
    throw error;
  }
  const client = await deps.createClient(config, accountKey);
  return { config, client };
}

async function dispatch(command: string, args: string[], deps: Dependencies): Promise<Record<string, unknown>> {
  if (command === "accounts") {
    if (args.includes("--help")) return commandHelp(command);
    const parsed = parseArgs(args, {});
    if (parsed.positionals.length) throw new CliError("unexpected_argument", `Unexpected argument ${parsed.positionals[0]}`, 2);
    return home(deps);
  }
  if (command === "doctor") {
    if (args.includes("--help")) return commandHelp(command);
    const parsed = parseArgs(args, {});
    if (parsed.positionals.length) throw new CliError("unexpected_argument", `Unexpected argument ${parsed.positionals[0]}`, 2);
    return home(deps, true);
  }
  if (command === "send") throw new CliError("send_disabled", "Sending mail is disabled in gmail-axi", 1, { help: ["Use `gmail-axi draft --account <key> ...` to create a draft"] });
  if (!["search", "get", "thread", "draft", "authorize"].includes(command)) throw new CliError("unknown_command", `Unknown command ${command}`, 2, { help: ["Run `gmail-axi --help`"] });
  if (args.includes("--help")) return commandHelp(command);

  const specs: OptionSpec = command === "search"
    ? { account: "value", query: "value", from: "value", since: "value", "newer-than-days": "value", limit: "value" }
    : command === "draft"
      ? { account: "value", to: "value", subject: "value", body: "value" }
      : { account: "value", full: "boolean" };
  const parsed = parseArgs(args, specs);
  const account = required(parsed.options, "account");
  if (command === "authorize" && parsed.positionals.length) throw new CliError("unexpected_argument", "authorize does not accept positional arguments", 2);
  if (command === "search" && parsed.positionals.length) throw new CliError("unexpected_argument", "search does not accept positional arguments", 2);
  if (command === "draft" && parsed.positionals.length) throw new CliError("unexpected_argument", "draft does not accept positional arguments", 2);
  const id = parsed.positionals[0];
  if ((command === "get" || command === "thread") && (!id || parsed.positionals.length > 1)) {
    throw new CliError("missing_id", `${command} requires exactly one message or thread id`, 2);
  }
  const { config, client } = await accountClient(deps, account);
  if (command === "authorize") {
    const accountConfig = findAccount(config, account);
    try {
      const result = await deps.authorize(config, accountConfig, deps.env);
      return { ...result, help: [hint("gmail-axi accounts"), hint(`gmail-axi search --account ${account} --query \"newer_than:7d\"`)] };
    } catch (error) {
      throw new CliError("authorization_failed", error instanceof Error ? error.message : "Authorization failed", 1, { help: [hint(`gmail-axi authorize --account ${account}`)] });
    }
  }
  if (command === "search") {
    const limit = integerOption(parsed.options, "limit", 50);
    if (limit > 100) throw new CliError("invalid_value", "--limit cannot exceed 100", 2);
    const newerThan = parsed.options["newer-than-days"] === undefined ? undefined : integerOption(parsed.options, "newer-than-days", 1);
    const result = await client.search({
      query: typeof parsed.options.query === "string" ? parsed.options.query : undefined,
      from: typeof parsed.options.from === "string" ? parsed.options.from : undefined,
      since: typeof parsed.options.since === "string" ? parsed.options.since : undefined,
      newerThanDays: newerThan,
      limit,
    });
    return { account, count: result.count, returned: result.returned, query: result.query || "(all mail)", messages: result.messages, help: result.returned ? accountHelp("search", account, result.messages[0]?.id) : [hint(`gmail-axi search --account ${account} --query "in:anywhere"`)] };
  }
  if (command === "get") {
    const output: Record<string, unknown> = { account, message: await client.getMessage(id!, parsed.options.full === true) };
    if (parsed.options.full !== true) output.help = [hint(`gmail-axi get --account ${account} ${id} --full`)];
    return output;
  }
  if (command === "thread") {
    const output: Record<string, unknown> = { account, thread: await client.getThread(id!, parsed.options.full === true) };
    if (parsed.options.full !== true) output.help = [hint(`gmail-axi thread --account ${account} ${id} --full`)];
    return output;
  }
  const to = required(parsed.options, "to");
  const subject = required(parsed.options, "subject");
  const body = required(parsed.options, "body");
  const draft = await client.createDraft(to, subject, body);
  return { account, draft, help: [hint(`gmail-axi get --account ${account} ${draft.message_id}`), hint(`gmail-axi thread --account ${account} ${draft.thread_id}`)] };
}

function errorOutput(error: CliError): Record<string, unknown> {
  const { help, ...details } = error.extra;
  const output: Record<string, unknown> = { error: { code: error.code, message: error.message, ...details } };
  if (help) output.help = help;
  return output;
}

export async function run(argv: string[], overrides: Partial<Dependencies> = {}): Promise<number> {
  const deps = { ...defaultDependencies(), ...overrides };
  try {
    if (!argv.length) {
      deps.stdout(toon(await home(deps)));
      return 0;
    }
    if (argv[0] === "--help" || argv[0] === "-h") {
      deps.stdout(toon(globalHelp()));
      return 0;
    }
    const [command, ...args] = argv;
    deps.stdout(toon(await dispatch(command, args, deps)));
    return 0;
  } catch (error) {
    const normalized = error instanceof CliError
      ? error
      : error instanceof ConfigError
        ? new CliError(error.code, error.message, 1, { help: error.help })
        : error instanceof GmailError
          ? new CliError(error.code, error.message, 1, { help: error.help })
          : new CliError("internal_error", "Command failed");
    deps.stderr(normalized.code === "internal_error" ? "[gmail-axi] command failed\n" : "");
    deps.stdout(toon(errorOutput(normalized)));
    return normalized.exitCode;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((code) => process.exitCode = code);
}
