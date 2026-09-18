# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Credentials
- Credentials are resolved from vault references (`op://<vault>/<item>/<field>` in `accounts.toml`), with `*_env` variables as an override only. A `.env` file of exported secrets is never a source — see README "Credentials".
- The generated `~/.local/bin/gmail-axi` wrapper (`.github/workflows/deploy.yml`) must only `exec` the CLI. The deploy verify step fails if the wrapper sources any file; do not reintroduce credential sourcing there.
- `op` must be authenticated for the user that runs `gmail-axi` (for a service account, `OP_SERVICE_ACCOUNT_TOKEN` in that user's environment). When it is not, `doctor` reports `credentials: unavailable` rather than `missing` — that distinction is the first thing to check when auth breaks.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
