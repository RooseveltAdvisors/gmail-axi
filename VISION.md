# Vision

`gmail-axi` exists so an agent working at a shell can bring Gmail into its work - search it, read it, draft from it - with no human shuttling text and no power to send.
It removes a specific pain: mail lives behind surfaces built for people, so an agent that needs a thread today either drags its operator into copy-and-paste duty or reaches for broad credentials and page-sized payloads that burn the context it works with.
It replaces both with one small, read-first CLI: token-efficient TOON output, content-first defaults, contextual next steps, and structured errors, built to the AXI standard for CLIs that agents drive.
It serves two parties with one surface: the agent that runs the commands and wants compact, parseable answers, and the operator who configures the accounts locally and keeps every secret on their own machine.
It deliberately does not serve anyone who wants a mail client for people, automated sending, or a path into a mailbox the operator has not configured on their own machine.

## The surface an agent calls

An agent asks in one command and receives an answer it can parse, not a page it must scrape.
Search returns summaries, echoes the query it ran, and reports both the total count and the messages actually returned, so coverage and pagination are never guesses.
Bodies arrive truncated unless `--full` widens them, and a thread reports its participants and message count before yielding its weight.
Every mail command names its account with `--account <key>`, so work across several configured mailboxes stays explicit rather than ambient.
`accounts` and `doctor` expose configuration and auth health before any mail command runs, so an agent can check the ground before it trips.
Queries pass Gmail's own search syntax through, including familiar operators like `newer_than:7d`, so what an agent already knows about Gmail search transfers directly.
Contextual next steps ride along with results: a lookup that needs a different command points at that command, ready to run.

## Reading and drafting, never sending

The command set stays deliberately small: `accounts`, `doctor`, `search`, `get`, `thread`, `draft`, `authorize`.
There is no send command, and none by accident: `gmail-axi send` fails with a `send_disabled` error whose help points straight at `draft`.
Drafts are the collaboration boundary: the agent prepares mail, and the human reviews and sends it through their own mail client.
The default posture is read plus draft, stated in v0.1 and intended to survive every later version.
OAuth asks only for `gmail.readonly` and `gmail.compose`, through a one-time desktop authorize that redirects to a loopback address on the operator's machine.
Secrets never sit in the repository: config references credentials by environment-variable names, and token material stays under the user's home directory.
CI enforces the posture mechanically: the build fails if a bearer token, refresh token, or client secret pattern appears anywhere in the tree.
Least power is load-bearing: scopes, surface, and defaults all assume the agent may see and prepare, never transmit.

## The operator owns identity

Accounts are not hard-coded; each operator writes a local `accounts.toml` listing their mailboxes and the env-var names that hold their credentials.
The repository never learns who uses it: no real account config, no token caches, no mailbox identities in git or in a prompt.
`accounts.example.toml` is the only account shape the repo carries, and it carries placeholders only.
The skill shipped with the package repeats the rule where agents will read it: account files, OAuth tokens, client secrets, and mailbox identities stay out of repositories and out of prompts.
That identity-free stance is what makes the package publishable: MIT-licensed, on npm, installable in one command by any operator without inheriting anyone's mail.

## Exact mechanics, tested contract

The surface is a contract, and the contract is tested: CLI dispatch, config parsing, Gmail operations, and TOON rendering each carry their own suite.
Dependencies are injected - config loaders, clients, fetchers, output streams - so tests exercise behavior without touching real mail.
What can be exact is code, not judgment: argument parsing, account-key validation, and output rendering are deterministic, and the tests hold them that way.
Help is data too: `--help` at the top level or on any command returns the same structured output as a result, never a prose wall.
A failure is data: every error normalizes to a machine code, a message, and help lines, with exit codes a script can branch on.
The whole thing is one small TypeScript binary that runs anywhere a current Node does.

## Scope

gmail-axi is the agent-facing Gmail boundary and nothing more: a CLI, its config and OAuth support, its Gmail API access, and its TOON rendering.
It is not a mail client for humans, not a daemon, not a credential store, and not a multi-provider abstraction; it is Gmail, read and draft, across locally configured accounts.
Its non-goals, stated plainly: sending mail, human-facing mail interfaces, stored credentials, hard-coded accounts, and OAuth scope beyond readonly and compose.
A change aligns when it keeps agent output leaner, makes failures easier to diagnose from their own messages, keeps operator identity and secrets further from the repository, or holds the tool at or below read-and-draft power.
A change should be resisted when it adds a send pathway in any form, widens OAuth scope, stores or transmits what belongs on the operator's machine, spends tokens on decoration, or grows the surface beyond what an agent at a shell can call in one command.

## A year out

Done well in a year means an agent that needs mail context reaches for `npx -y gmail-axi` first, and the one-command skill install remains the recommended path.
The no-send posture still holds as the tool's signature trust property: this CLI prepares mail and cannot transmit it.
Setup is minutes, verified by `doctor`, and auth health stays one command away for any configured account.
Output is still token-lean as the surface evolves, and every error still names its code and its next step.
The contract is still tested end to end, the secret scanner still stands guard in CI, and the package still installs and runs with a single command.
And the skill's own description remains true word for word: compact, read-first Gmail search, message and thread inspection, and draft creation across user-configured accounts.
