---
name: verify
description: Prove gmail-axi through its real build, tests, CI checks, and compiled CLI runtime.
user_invocable: true
---

# /verify — prove the change before the PR

Run this from the repository root on a feature branch. This is the proof layer
ahead of the existing no-mistakes review and CI gates; it does not replace or
weaken them. Keep logs and temporary proof under the gitignored `evidence/`
directory. Never record credentials, tokens, or mailbox contents.

## Preconditions

Use `/dev-local` first when dependencies are not installed. Confirm the
checkout and branch before running validation:

```sh
set -euo pipefail
repo="$(git rev-parse --show-toplevel)"
test "$repo" = "$PWD"
branch="$(git branch --show-current)"
test "$branch" != main
test "$branch" != master
mkdir -p evidence
git check-ignore -q evidence/verify.log
```

This repository has no required background service or live Gmail credentials
for its tests and local runtime probe.

## 1. Run the maintained build, tests, and CI secret scan

Run the substantive checks already maintained by `package.json` and
`.github/workflows/ci.yml`, saving their output as proof:

```sh
set -o pipefail
{
  echo '=== bun install --frozen-lockfile ==='
  bun install --frozen-lockfile
  echo '=== bun run build ==='
  bun run build
  echo '=== bun run test ==='
  bun run test
  echo '=== CI secret scan ==='
  test -z "$(rg -n -i '(authorization: bearer|refresh_token\s*=\s*[^\s<]|client_secret\s*=\s*[^\s<])' --glob '!bun.lock' --glob '!README.md' --glob '!accounts.example.toml' . || true)"
} 2>&1 | tee evidence/verify.log
```

Do not turn a failed check into a pass by skipping it or weakening an
assertion. Fix task-caused failures, then run `/verify` again.

## 2. Exercise the real compiled CLI

Use the built entry point, not a test helper or mocked client. The probe uses a
temporary HOME and a missing config, so it is read-only and cannot access a
real mailbox:

```sh
set -euo pipefail
repo="$(git rev-parse --show-toplevel)"
runtime_home="$(mktemp -d "$repo/evidence/runtime-home.XXXXXX")"

node "$repo/dist/cli.js" --help | tee evidence/verify-runtime-help.log

HOME="$runtime_home" GMAIL_AXI_CONFIG="$runtime_home/.config/gmail-axi/accounts.toml" \
  node "$repo/dist/cli.js" doctor > evidence/verify-runtime-doctor.toon
rg -q 'status: missing' evidence/verify-runtime-doctor.toon

set +e
HOME="$runtime_home" GMAIL_AXI_CONFIG="$runtime_home/.config/gmail-axi/accounts.toml" \
  node "$repo/dist/cli.js" send > evidence/verify-runtime-send.toon 2> evidence/verify-runtime-send.stderr
exit_code=$?
set -e
test "$exit_code" -eq 1
rg -q 'code: send_disabled' evidence/verify-runtime-send.toon
```

The help, missing-config doctor response, and refusal of the disabled send
operation prove the compiled executable starts and preserves its documented
runtime safety contract without requiring OAuth. Inspect stderr if a probe
fails; it must not contain secrets or raw provider data.

## Result

Report the exact commands, pass/fail status, and evidence paths. Only claim
success when the full maintained suite and the real compiled CLI probe pass.
Afterward, run `/no-mistakes` with the complete task intent; no-mistakes
remains authoritative for review, fixes, push, PR, and CI.
