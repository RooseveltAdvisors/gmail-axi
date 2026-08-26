# GPU `gmail-axi` access map

This document records the safe, reproducible local bootstrap for the GPU agent
Gmail path. OAuth values and mailbox addresses stay on the machine in the
local config; none belong in this repository.

## Access map

| Account key | Role | State | Evidence / next action |
| --- | --- | --- | --- |
| `jon-arcs` | Canonical agent work mailbox | Pending approved OAuth material | Active in `~/.config/gmail-axi/accounts.toml`; provision `GMAIL_AXI_ARCS_CLIENT_ID`, `GMAIL_AXI_ARCS_CLIENT_SECRET`, and `GMAIL_AXI_ARCS_REFRESH_TOKEN` locally, then run the proof commands below. |
| `jon-personal` | Consumer fallback | Quarantined | Live search returned `auth_failed` / `Google authorization failed`; token retained under `~/.config/gmail-axi/quarantine/tokens/`. |
| `rooseveltadvisors` | Consumer fallback | Quarantined | Live search returned `auth_failed` / `Google authorization failed`; token retained under `~/.config/gmail-axi/quarantine/tokens/`. |

The approved local fallback client file was inspected only for structure at
`~/.config/gws-axi/credentials.json`; it contains an installed-client object,
not a refresh token. The exact missing approved material for `jon-arcs` is:

- client values available to the launcher as `GMAIL_AXI_ARCS_CLIENT_ID` and
  `GMAIL_AXI_ARCS_CLIENT_SECRET` in `~/.config/gmail-axi/credentials.env`;
- a refresh token either as `GMAIL_AXI_ARCS_REFRESH_TOKEN` in that same file or
  in `~/.config/gmail-axi/tokens/jon-arcs.json`.

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

## Re-enabling a quarantined consumer

Do not restore either account automatically. After fresh approved OAuth
material is provisioned, restore its account section and token file from the
local quarantine, then repeat `accounts`, `doctor`, and a bounded search. Keep
agt-2 `gws-axi` as fallback until the `jon-arcs` proof succeeds.
