# GAMEROAD Codex C2C PC Handoff CURRENT

## Purpose

This file is only for the part that must run on the user's Windows PC / Codex desktop environment. Repository-side adoption has already been decided in `docs/C2C_UPSTREAM_ADOPTION_CURRENT.md`.

Do **not** research, design, extend or revive a custom ChatGPT browser bridge. Install and verify the upstream implementation as-is, then stop and report evidence.

## Non-negotiable boundary

- Upstream: `https://github.com/XiaoDuoYa/codex-with-chatgpt`
- GMR workspace: the current local checkout of `rathersitooo-ux/GMR` opened in Codex.
- Browser: Codex/ChatGPT built-in browser only, except a Cloudflare login may use the user's browser only if the user explicitly requires it.
- Do not modify GMR product/game files during setup or smoke verification.
- Do not switch/rebase/reset a user's current GMR worktree just to perform setup.
- Do not delete the frozen legacy local C2C files during this run.
- Do not touch another active WorkUnit's files.
- Only interrupt the user for login, CAPTCHA, 2FA, or an explicit consent screen; give exactly one action at a time.

Before doing anything, read:

1. `AGENTS.md`
2. `CODEX_HANDOFF_CURRENT.md`
3. `docs/C2C_UPSTREAM_ADOPTION_CURRENT.md`
4. the upstream `README.md` and `skill/SKILL.md`

## Execute

### 1. Detect the workspace and prerequisites

Treat the current GMR repository root as `<GMR_WORKSPACE>`.

Check `git` and `node --version`. Node must be >= 20. Check `cloudflared`.

Install only missing prerequisites yourself:

- Windows Node/git: use `winget` when installation is actually needed.
- Cloudflare: `winget install Cloudflare.cloudflared` when missing.

Do not ask the user to run terminal commands for you.

### 2. Install/update upstream

Use a normal user-home checkout, not a directory inside GMR:

- target: `~/codex-with-chatgpt`
- if absent: clone `https://github.com/XiaoDuoYa/codex-with-chatgpt`
- if present: `git pull --ff-only`

Inside that checkout run:

```text
corepack pnpm install
corepack pnpm build
```

Do not patch upstream unless its documented install is proven broken on this machine. If it fails, run the upstream troubleshooting/doctor route first and report the exact blocker rather than building a replacement.

### 3. Install the Codex Skill

Copy upstream `skill/SKILL.md` to:

`~/.codex/skills/codex-with-chatgpt/SKILL.md`

In the installed copy, update `The codex-with-chatgpt checkout lives at:` to the actual local checkout path.

### 4. First-time C2C setup for GMR

Follow the installed Skill's first-time setup exactly.

Run the upstream CLI against the actual GMR root:

```text
c2c setup -w <GMR_WORKSPACE> --json
```

If `c2c` is not globally linked, invoke `node <UPSTREAM_CHECKOUT>/bin/c2c.js ...` as the Skill documents.

Use the returned `mcpUrl` and one-time `pairingCode` only through the built-in browser:

1. open ChatGPT in the built-in browser;
2. enable Developer Mode under Apps/Connectors advanced settings if connector creation is hidden;
3. create connector `Codex with ChatGPT`;
4. use the returned server URL and OAuth authentication;
5. authorize with the one-time pairing code;
6. wait until the connector exposes its read-only tools.

Never copy OAuth tokens/cookies/session storage. Never expose the pairing code in the final report.

### 5. Prove workspace read access

Run the upstream verification from the Skill. ChatGPT must use the `Codex with ChatGPT` connector to call `workspace_info` and read a small top-level GMR file such as `README.md`.

The returned workspace must be the actual GMR workspace. A connector existing in settings is not enough.

### 6. Prove health

Run:

```text
c2c doctor -w <GMR_WORKSPACE> --json
c2c status -w <GMR_WORKSPACE> --json
```

Repair automatically when the upstream doctor can repair. Do not build a local replacement.

### 7. Establish the one persistent GMR C2C conversation

Follow upstream Conversation management:

- reuse an existing saved GMR C2C conversation if present;
- otherwise create one, send the upstream boot prompt, and save its ChatGPT conversation URL with `c2c session set`;
- do not create one chat per task.

### 8. Run one no-change end-to-end smoke

Use the C2C coding-task workflow, but the goal is deliberately read-only:

```text
Review the currently connected GAMEROAD workspace. Confirm that docs/C2C_UPSTREAM_ADOPTION_CURRENT.md exists, inspect current git status, and identify the current branch/HEAD. Do not edit, install into, commit, reset, switch, rebase, or otherwise mutate the GMR repository. Return DONE only after independently reviewing the workspace through the Codex with ChatGPT connector.
```

Requirements:

- complete the upstream `INIT -> PLAN -> EXECUTED -> REVIEW -> DONE` loop;
- Codex execution for this smoke is read-only only;
- record the execution with `c2c record` as a zero-product-change/read-only run;
- ChatGPT must independently inspect workspace/git evidence through MCP before DONE;
- if the worktree already had unrelated changes, do not clean or alter them; report that as pre-existing state.

### 9. Stop after proof

Do not start a product mutation merely to prove C2C works. Product work continues under fresh GMR CURRENT/lease/ExactMutableResources authority after setup.

Do not revive these frozen local paths for the C2C route:

- `tools/chatgpt-browser-transport-*`
- `tools/executor-bus-packet-compressor.mjs`
- `tools/luna-sol-codex-browser-bridge*`
- `tools/luna-sol-integration-core.mjs`
- `tools/luna-sol-router-*`
- `tools/sol-reasoning-protocol.mjs`

## Required final report

Return a compact evidence report containing:

- upstream checkout path and upstream commit SHA installed;
- Node version;
- Skill installed: PASS/FAIL;
- `c2c setup`: PASS/FAIL;
- workspace_info + top-level file read: PASS/FAIL;
- `c2c doctor`: PASS/FAIL and non-secret status summary;
- persistent GMR conversation saved: PASS/FAIL;
- read-only C2C smoke reached DONE: PASS/FAIL;
- GMR files changed by setup/smoke: must be `0` (pre-existing unrelated changes listed separately, not modified);
- any unresolved blocker.

Never include pairing codes, OAuth tokens, cookies, or other credentials.

Success is the live evidence above, not installation files merely existing.
