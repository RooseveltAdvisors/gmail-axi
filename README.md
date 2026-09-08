# gmail-axi

Agent eXperience Interface ([AXI](https://axi.md)) CLI for **multi-account Gmail**.

Built for agents that drive tools over the shell: token-efficient [TOON](https://toonformat.dev/) output, content-first defaults, contextual next steps, and structured errors.

## What it does

- List configured accounts and auth health
- Search, read messages, and read threads
- Create drafts
- One-time OAuth authorize for Desktop clients

Accounts are **not** hard-coded. Operators configure mailboxes locally. Secrets never belong in git.

## Security

- Do not commit `.env`, token caches, or real account config
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
# edit accounts.toml — set emails and secret env var names
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

## AXI

Implements the [AXI](https://axi.md) design principles for agent-ergonomic CLIs.

## License

MIT
