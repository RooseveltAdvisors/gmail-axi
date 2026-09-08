# Project agent memory

This file is the project's committed home for project-intrinsic agent knowledge: build, test, release, architecture, and sharp-edge notes that should travel with the code.

- Add durable project-specific notes here as they are discovered through real work.

## Deploy sharp edge
- The generated `~/.local/bin/gmail-axi` wrapper (`.github/workflows/deploy.yml`) must source `~/.config/gmail-axi/credentials.env` before exec or `authorize` fails with "missing OAuth client credentials". The workflow verify step guards this via `gmail-axi doctor --json` requiring an account with `credentials: ready`; do not weaken that check or reuse `accounts` as the only verify.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
