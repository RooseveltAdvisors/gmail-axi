# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Credentials
- Credentials are resolved from vault references (`op://<vault>/<item>/<field>` in `accounts.toml`), with `*_env` variables as an override only. A `.env` file of exported secrets is never a source — see README "Credentials".
- The generated `~/.local/bin/gmail-axi` wrapper (`.github/workflows/deploy.yml`) must never source a file; the deploy verify step fails if it does. On the deployed host it execs the CLI through a root-only helper that injects the `*_env` values and drops back to the consumer user, so that host's `accounts.toml` uses `*_env`, not `*_ref`, and the consumer holds no vault token.
- Without that helper, `op` must be authenticated for the user that runs `gmail-axi`. When a reference cannot be resolved, `doctor` reports `credentials: unavailable` rather than `missing` — that distinction is the first thing to check when auth breaks.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
