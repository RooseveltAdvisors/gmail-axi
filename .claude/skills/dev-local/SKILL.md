---
name: dev-local
description: Prepare the local gmail-axi development environment and safe CLI smoke checks.
user_invocable: true
---

# /dev-local — prepare local development

gmail-axi is a TypeScript ESM CLI. It has no application server, database, or
required background service. The test suite uses mocked Gmail responses, so
Google credentials and a live mailbox are not required for development or
verification.

## Requirements

- Bun (the repository package manager; the lockfile is `bun.lock`)
- Node.js 20 or newer for the published CLI runtime
- Git

Do not replace Bun with npm, yarn, or pnpm, and do not install system packages
as part of local setup.

## Setup

Run from the repository root:

```sh
test "$(git rev-parse --show-toplevel)" = "$PWD"
bun install --frozen-lockfile
bun run build
```

## Configuration and secrets

No environment variables are needed for tests or the missing-configuration CLI
smoke check. For real Gmail access, set `GMAIL_AXI_CONFIG` to a config file
inside the current user's home directory, or use the default
`~/.config/gmail-axi/accounts.toml`. The account file names environment
variables for OAuth client and token values; provide those values only in the
local environment. Never commit account files, credentials, tokens, or raw
mail responses.

Use `accounts.example.toml` as the configuration template. The supported local
commands are documented in `README.md` and `skills/gmail-axi/SKILL.md`.

## Development loop

```sh
bun run test
bun run build
```

Use `/verify` for the complete proof. It runs the maintained build, test, and
CI secret-scan checks, then exercises the compiled CLI with an isolated HOME.
No service needs to be started or stopped.
