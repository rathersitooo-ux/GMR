# GAMEROAD C2C Upstream Adoption CURRENT

## Decision

For new ChatGPT <-> Codex collaboration, GAMEROAD adopts the public upstream project:

- https://github.com/XiaoDuoYa/codex-with-chatgpt

Its installed Codex Skill and `c2c` CLI are the transport/data-plane authority for this use case. Do not extend the repository-local ChatGPT browser transport, Sol browser bridge, packet compressor, Sol RPC protocol, or Luna/Sol routing stack to reproduce capabilities already supplied upstream.

The upstream is consumed as an external tool. Do not vendor or fork it into GMR unless a concrete missing capability is first demonstrated and cannot be solved by configuration or a small upstream-compatible adapter.

## Why this replaces the local transport path

The upstream already provides the intended split:

- ChatGPT web: reasoning, planning, review and debug strategy.
- Codex: repository mutation, shell, git, tests and recovery.
- Data plane: ChatGPT reads the current workspace through an OAuth-protected read-only MCP bridge.
- Control plane: small `[C2C]` state messages, rather than copying repository files, diffs or logs into the chat.
- Review: after Codex executes, ChatGPT can independently inspect current diff/test evidence through the read-only connector.

That makes the repository-local browser-driver/response-correlation stack redundant as the primary route.

## GMR controls that remain authoritative outside C2C

Adopting C2C does **not** remove GAMEROAD execution safety or current-state authority. Before mutation, Codex must still obey the current GMR bootstrap and current authority, including:

- Drive CURRENT and the current operational rules;
- current TaskID / WorkUnitKey / AcquireKey and owner/lease collision checks;
- ExactMutableResources / DoNotChange boundaries;
- current branch/HEAD and actual target readback;
- PRE_ACTION / executor-bus / fail-closed mutation authorization where applicable;
- actual tests/evidence; pending, skipped, unknown and unrun are not PASS;
- HEAD adoption/readback before a result is promoted to current authority.

`AGENTS.md` and `CODEX_HANDOFF_CURRENT.md` remain the GMR execution/bootstrap authority. C2C is the reasoning/review connection, not a second product specification and not mutation permission.

## Legacy local stack status

The following repository-local family is now **FROZEN_LEGACY / NON-AUTHORITATIVE_FOR_NEW_C2C_WORK**:

- `tools/chatgpt-browser-transport-*`
- `tools/executor-bus-packet-compressor.mjs`
- `tools/luna-sol-codex-browser-bridge*`
- `tools/luna-sol-integration-core.mjs`
- `tools/luna-sol-router-*`
- `tools/sol-reasoning-protocol.mjs`
- their dedicated docs/tests

`.c2cignore` hides those legacy implementation details from ChatGPT so the upstream reasoning loop does not accidentally plan against a retired local transport.

They are **not deleted yet**. Existing CI/history may still reference them, and deleting them before a successful Windows live migration would create unnecessary risk. No new feature work should be added to them.

The existing outcome-evaluation assets under `tools/sol_bridge/evaluation/` may remain temporarily as measurement infrastructure. They are not transport authority.

## Live migration acceptance

The upstream route becomes live-verified for the GMR Windows workspace only after all of these are observed on the actual PC:

1. upstream checkout builds successfully with Node.js >= 20;
2. its Codex Skill is installed at the user's Codex skill location;
3. `c2c setup -w <GMR workspace>` starts the workspace bridge and secure connection;
4. ChatGPT's built-in-browser connector pairs successfully;
5. `workspace_info` plus a top-level file read returns the actual GMR workspace;
6. `c2c doctor -w <GMR workspace> --json` is healthy;
7. one saved long-lived C2C conversation is associated with the workspace;
8. one bounded **read-only/no-change** smoke task completes the C2C planning/review loop without product mutation;
9. no GMR ownership/mutation gate is bypassed.

Do not claim Windows/live completion before those observations exist.

## After live verification

Use the upstream route for subsequent tasks. In a separate cleanup WorkUnit, inspect actual references to the frozen local stack and remove only files/tests/docs/workflow hooks proven dead. Cleanup is not part of setup and must not be mixed with a live product WorkUnit.

## Cost rule for future infrastructure work

For infrastructure/tooling requests, use this order before custom implementation:

`SEARCH -> ADOPT -> ADAPT -> BUILD`

If an existing maintained tool satisfies the core requirement, adopt it and implement only the demonstrated missing delta. Do not rebuild a parallel system merely to gain local ownership of the same capability.
