---
name: gmail-axi
description: Use gmail-axi for compact, read-first Gmail search, message and thread inspection, and draft creation across user-configured accounts.
user-invocable: false
---

# gmail-axi

Run the CLI through `npx -y gmail-axi`. It reads account configuration from the
user's machine at `~/.config/gmail-axi/accounts.toml` or `GMAIL_AXI_CONFIG`.
Never put account files, OAuth tokens, client secrets, or mailbox identities in
the repository or in a prompt.

Start with live state:

```sh
npx -y gmail-axi
npx -y gmail-axi doctor
```

Carry `--account <key>` on mail operations:

```sh
npx -y gmail-axi search --account <key> --query "newer_than:7d" --limit 20
npx -y gmail-axi get --account <key> <message-id>
npx -y gmail-axi thread --account <key> <thread-id> --full
npx -y gmail-axi draft --account <key> --to <address> --subject "<subject>" --body "<body>"
```

Bodies are truncated unless `--full` is passed. `gmail-axi` creates drafts but
deliberately has no send operation. Use `npx -y gmail-axi <command> --help`
when a command's flags or examples are needed.
