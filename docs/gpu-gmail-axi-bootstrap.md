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

The approved NeoMutt OAuth token source was
`/home/jon/.config/neomutt/tokens`; decryption used the authorized passphrase
file `/home/jon/.config/neomutt/.token-pass`. The only other authorized
NeoMutt source files were `/home/jon/.config/neomutt/mutt_oauth2.py`,
`/home/jon/.config/neomutt/neomuttrc`, and
`/home/jon/.config/neomutt/neomuttrc.20260826T011700Z`. Their Google client
values were written to `~/.config/gmail-axi/credentials.env` and the refresh
token to `~/.config/gmail-axi/tokens/jon-arcs.json`. No OAuth value is present
in this repository.

Verify those NeoMutt files remain unchanged without printing their contents:

```sh
sha256sum \
  /home/jon/.config/neomutt/.token-pass \
  /home/jon/.config/neomutt/mutt_oauth2.py \
  /home/jon/.config/neomutt/neomuttrc \
  /home/jon/.config/neomutt/neomuttrc.20260826T011700Z \
  /home/jon/.config/neomutt/tokens
```

Expected hashes are `49a87f0e4d1b7bcc60eaf2203027d92b87e0870850cc769ebf7bde1162ebb841`,
`fccb41cc9aaeb78c21d39669b7611cb9b3a3b14edb19c5d4f600a9c57c37de89`,
`48e3bcb29bce894c18f5deea3c2379132e621f5abed9ea0a9d5d73e6ad20fb8a`,
`4ab23e351b428ea70770d775621f73911138a69fc95630cdb17f041c090affa6`, and
`b0d9a3717851a6ea1aa1a4d93062c0c0c19bab89dbc40815a9023c033746b730`, in
the same order. Any mismatch means the source material changed and must not be
reused automatically.

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
