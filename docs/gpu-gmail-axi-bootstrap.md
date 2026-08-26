# GPU `gmail-axi` access map

This document records the safe, reproducible local bootstrap for the GPU agent
Gmail path. OAuth values and mailbox addresses stay on the machine in the
local config; none belong in this repository.

## Access map

| Account key | Role | State | Evidence / next action |
| --- | --- | --- | --- |
| `jon-arcs` | Canonical agent work mailbox | Repaired and live-proven | Active in `~/.config/gmail-axi/accounts.toml`; bounded `from:(whipple)` search passed with exit 0. |
| `jon-personal` | Consumer fallback | Quarantined | Live search returned `auth_failed` / `Google authorization failed`; token retained under `~/.config/gmail-axi/quarantine/tokens/`. |
| `rooseveltadvisors` | Consumer fallback | Quarantined | Live search returned `auth_failed` / `Google authorization failed`; token retained under `~/.config/gmail-axi/quarantine/tokens/`. |

The approved NeoMutt OAuth token was decrypted in memory using the authorized
`/home/jon/.config/neomutt/.token-pass` path. Its Google client values were
written to `~/.config/gmail-axi/credentials.env` and its refresh token to
`~/.config/gmail-axi/tokens/jon-arcs.json`; the authorized NeoMutt source files
were hash-verified unchanged. No OAuth value is present in this repository.

Do not use `gmail-axi authorize` for this bootstrap: it opens an OAuth browser
flow, which is outside the agent-mail safety policy. Use only an already
approved, operator-provisioned OAuth material path.

## Safe proof commands

Run on GPU, with output reviewed for secrets before sharing:

```sh
gmail-axi accounts
gmail-axi doctor
gmail-axi search --account jon-arcs --query 'from:(whipple)' --limit 1
```

The search is read-only, bounded, and uses metadata only. Do not follow it with
`get` or `thread` unless separately authorized.

Successful proof on GPU: `accounts` and `doctor` report `jon-arcs` as
`ready`; the bounded search returned `count: 201`, `returned: 1`, and exit 0.

## Re-enabling a quarantined consumer

Do not restore either account automatically. After fresh approved OAuth
material is provisioned, restore its account section and token file from the
local quarantine, then repeat `accounts`, `doctor`, and a bounded search. Keep
agt-2 `gws-axi` as fallback until the `jon-arcs` proof succeeds.
