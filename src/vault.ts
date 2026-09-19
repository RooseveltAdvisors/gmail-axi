import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * `op://<vault>/<item>/<field>` — the fleet-standard 1Password secret reference.
 * Item titles may contain spaces and colons, so only `/` and line breaks are
 * excluded from each segment.
 */
const VAULT_REF = /^op:\/\/([^/\r\n]+)\/([^/\r\n]+)\/([^/\r\n]+)$/;

export type SecretResolver = (ref: string) => Promise<string>;

export class VaultError extends Error {
  constructor(message: string, readonly code = "vault_unavailable", readonly help?: string[]) {
    super(message);
    this.name = "VaultError";
  }
}

export function isVaultRef(value: string): boolean {
  return value.startsWith("op://");
}

export function parseVaultRef(value: string): { vault: string; item: string; field: string } | undefined {
  const match = VAULT_REF.exec(value);
  return match ? { vault: match[1], item: match[2], field: match[3] } : undefined;
}

const pending = new Map<string, Promise<string>>();

/** Resolve one reference through the local `op` CLI. Memoized per process. */
export function resolveVaultRef(ref: string): Promise<string> {
  const cached = pending.get(ref);
  if (cached) return cached;
  const promise = readVaultRef(ref);
  pending.set(ref, promise);
  return promise;
}

async function readVaultRef(ref: string): Promise<string> {
  const parsed = parseVaultRef(ref);
  if (!parsed) throw new VaultError(`${ref} is not a valid op:// secret reference`, "vault_ref_invalid");
  let stdout: string;
  try {
    // `op item get`, not `op read`: item titles containing ":" break `op read`.
    // execFile (no shell) keeps reference text out of any command line parsing.
    ({ stdout } = await run("op", [
      "item",
      "get",
      parsed.item,
      "--vault",
      parsed.vault,
      "--fields",
      `label=${parsed.field}`,
      "--reveal",
    ], { encoding: "utf8" }));
  } catch (error) {
    throw new VaultError(`Unable to resolve ${ref} from the vault: ${vaultFailure(error)}`, "vault_unavailable", [
      "Confirm the `op` CLI is installed and authenticated for this user",
      "Run `gmail-axi doctor`",
    ]);
  }
  const value = stdout.trim();
  if (!value) throw new VaultError(`The vault returned an empty value for ${ref}`, "vault_empty");
  return value;
}

/** First diagnostic line from `op`. Never contains the resolved value. */
function vaultFailure(error: unknown): string {
  const stderr = typeof (error as { stderr?: unknown }).stderr === "string" ? (error as { stderr: string }).stderr : "";
  const line = stderr.split(/\r?\n/).map((entry) => entry.trim()).find(Boolean);
  if (line) return line;
  if ((error as NodeJS.ErrnoException).code === "ENOENT") return "the `op` CLI is not installed";
  return error instanceof Error ? error.message : "the vault lookup failed";
}
