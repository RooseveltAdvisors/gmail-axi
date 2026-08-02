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

## Install

```sh
# skill (recommended for agents)
npx skills add RooseveltAdvisors/gmail-axi --skill gmail-axi -g

# or CLI
npm install -g gmail-axi
# or
npx -y gmail-axi
```

## Configure

```sh
mkdir -p ~/.config/gmail-axi
cp accounts.example.toml ~/.config/gmail-axi/accounts.toml
# edit accounts.toml — set emails and secret env var names
```

## Quick start

```sh
gmail-axi
gmail-axi accounts
gmail-axi search --account <key> --query "newer_than:7d"
gmail-axi get --account <key> <messageId>
gmail-axi --help
```

## AXI

Implements the [AXI](https://axi.md) design principles for agent-ergonomic CLIs.

## License

MIT
