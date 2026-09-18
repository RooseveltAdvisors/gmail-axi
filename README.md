# gmail-axi

Agent eXperience Interface ([AXI](https://axi.md)) CLI for **multi-account Gmail**.

Built for agents that drive tools over the shell: token-efficient [TOON](https://toonformat.dev/) output, content-first defaults, contextual next steps, and structured errors.

## What it does

- List configured accounts and auth health
- Search, read messages, and read threads
- Create drafts
- One-time OAuth authorize for Desktop clients

Accounts are **not** hard-coded. Operators configure mailboxes locally. Secrets never belong in git.

## Credentials

Each account **names** where its OAuth client credentials live; it never stores
them. A reference has the form `op://<vault>/<item>/<field>` and is resolved
through the local [`op`](https://developer.1password.com/docs/cli/) CLI at
invocation, so a rotation in the vault is picked up with no file to edit.

```toml
[accounts.work]
email = "you@example.com"
client_id_ref = "op://Example Vault/Example Gmail OAuth/client_id"
client_secret_ref = "op://Example Vault/Example Gmail OAuth/client_secret"
```

Resolution order per value:

1. The environment variable named by `client_id_env` / `client_secret_env` /
   `refresh_token_env`, when it is set. Use this for CI and one-off overrides.
2. The vault reference named by the matching `*_ref`.

There is no third source. **A `.env` file of exported credentials is deprecated
and is never read** — neither by the CLI nor by any launcher that wraps it.
Migrate by moving each value into a vault item and replacing `*_env` with the
matching `*_ref`; delete the `.env` file only once `gmail-axi doctor` reports
`credentials: ready` for every account.

`gmail-axi doctor` reports a per-account `source` (`vault` or `env`) and
distinguishes `credentials: unavailable` (the vault could not be reached) from
`credentials: missing` (nothing is configured). No value is ever printed.

The resolver invokes `op` directly with an argument list — never a shell — and
rejects any `*_ref` that is not a well-formed `op://` reference, so a file path
or shell fragment cannot reach it.

## Security

- Do not commit token caches or real account config
- Never store credentials in a `.env` file; use a vault reference
- Use `accounts.example.toml` as a template only
- Default posture is read + draft (no send in v0.1)
- Desktop OAuth requests only `gmail.readonly` and `gmail.compose`; the CLI never exposes a send operation.
- `GMAIL_AXI_CONFIG` and OAuth token caches must remain under the user home directory.

## Install

```sh
# skill (recommended for agents)
npx skills add RooseveltAdvisors/gmail-axi --skill gmail-axi -g

# or CLI
bun add -g gmail-axi
# or
npx -y gmail-axi
```

## Configure

```sh
gmail-axi doctor
# If config is missing, run the package-resolved copy command shown in help.
# edit accounts.toml — set emails and vault references
```

## Quick start

```sh
gmail-axi
gmail-axi accounts
gmail-axi search --account <key> --query "newer_than:7d"
gmail-axi get --account <key> <messageId>
gmail-axi get --mid 'neomd://mid/%3C...%3E' --account <key>
gmail-axi --help
```

`get` and `thread` also accept a bare or bracketed RFC Message-ID with `--mid`.
Without `--account`, configured accounts are searched and the matching account is
reported. Sending remains disabled; use `draft` for outbound mail preparation.

## Deployment

Merging to `main` deploys the built CLI to the GPU through the repository's
GitHub Action, which also generates the `gmail-axi` launcher. The launcher only
execs the CLI: it sources no credential file, and the deploy verifies that. The
`op` CLI must be authenticated for the user that runs `gmail-axi` (for a service
account, `OP_SERVICE_ACCOUNT_TOKEN` in that user's environment). Never rebuild
the installed copy by hand on the GPU.

## AXI

Implements the [AXI](https://axi.md) design principles for agent-ergonomic CLIs.

## License

MIT
