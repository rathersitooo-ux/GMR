# Codex browser bridge for Luna + Sol R1

This branch adds the missing executor-facing bridge between the static Luna/Sol integration and the browser that Codex can operate in the ChatGPT desktop app.

It deliberately does **not** pretend that a Node process can directly invoke Codex's private browser tool. Instead it uses a two-phase agent protocol:

1. repository code prepares a bounded Sol packet and a browser action;
2. Codex performs the browser action with its approved browser capability;
3. Codex returns durable browser evidence to repository code;
4. repository code validates correlation, freshness, completeness, scope, and the Sol response schema before the proposal can be reviewed.

A validated Sol response is still a proposal. It never grants mutation permission automatically.

## Why this shape

Codex can use the ChatGPT desktop app's in-app browser on Windows. OpenAI also documents a Developer mode option that gives Codex controlled Chrome DevTools Protocol access for deeper page-state inspection. The repository should consume that capability through Codex, rather than inventing an undocumented localhost CDP endpoint or embedding brittle external browser automation.

Official product references:

- https://help.openai.com/en/articles/20001277-using-the-built-in-browser-in-the-chatgpt-desktop-app
- https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan

The bridge does not require full CDP when Codex can already provide stable conversation and assistant-turn identity. If those identities are not observable, enable Browser Developer mode / full CDP access only after the required user approval and use it to capture stable page-state evidence.

## Phase A: prepare

Call `prepareLunaSolCodexDispatch(...)` from `tools/luna-sol-codex-browser-bridge.mjs`.

For a local decision it returns `LOCAL_EXECUTE` and does not touch the browser path.

For a Sol-required decision the caller must first confirm that the Codex browser capability is actually available and provide a browser preflight snapshot:

- page is ready and not loading;
- composer is ready;
- stable `conversationId` for the current ChatGPT conversation;
- stable `lastAssistantTurnId` captured before submit.

If any of these are absent the bridge returns `BROWSER_PREFLIGHT_REQUIRED` and remains non-mutating.

When preflight succeeds, the bridge returns `BROWSER_ACTION_REQUIRED` with:

- the exact message to submit once;
- expected conversation identity;
- baseline assistant-turn identity;
- a serializable correlation bundle needed by Phase B;
- the browser evidence that must be captured.

## Phase B: Codex browser action

Codex performs exactly one send into the approved ChatGPT conversation and waits for a completed assistant response.

Required evidence:

- submit accepted exactly once;
- same conversation as preflight;
- new assistant turn different from the baseline turn;
- completed state;
- response not truncated;
- full response text including the exact GAMEROAD packet/correlation marker.

If submit was confirmed but response collection becomes uncertain, do **not** resend immediately. Inspect the same conversation first. This prevents duplicate Sol requests caused by collector uncertainty.

## Phase C: resume and validate

Call `resumeLunaSolCodexDispatch(preparedBundle, browserEvidence)`.

The bridge rejects:

- stale turns;
- wrong conversations;
- incomplete or truncated responses;
- missing correlation markers;
- malformed Sol response envelopes;
- mismatched task/work-unit/acquire identity;
- out-of-scope files;
- protected-file overlap;
- incomplete acceptance coverage.

Successful validation returns `SOL_RESPONSE_VALIDATED` with `mayMutate: false`.

The executor must still review the proposal, preserve the active WorkUnit/AcquireKey, perform the actual mutation itself, run acceptance tests, collect use-site/runtime evidence, sync CURRENT, read back the saved state, and release/checkpoint according to the normal GAMEROAD workflow.

## Windows/Codex operating sequence

1. Open the GAMEROAD project in Codex on Windows.
2. Open the ChatGPT desktop in-app browser from Codex/Work (Ctrl+Shift+B is the documented Windows shortcut).
3. Sign in inside the browser itself. Do not copy credentials into task packets or chat prompts.
4. Keep one dedicated ChatGPT conversation for the active Sol request.
5. Capture the preflight conversation/assistant-turn identity.
6. Run Phase A and obtain the bounded browser action.
7. Submit the generated message once using Codex browser use.
8. Wait for the completed assistant turn and capture the required evidence.
9. Run Phase C.
10. Only after validated review may the executor decide whether a bounded implementation attempt is authorized by the existing GAMEROAD execution rules.

## Status boundary

The static bridge can be unit-tested in the repository, but that is not proof of a real black-box browser round trip.

Until a Windows/Codex run records real preflight identity, one actual submit, one new completed ChatGPT assistant turn, the exact correlation marker, validated Sol response, and downstream acceptance evidence, the end-to-end system remains `PRE_BLACKBOX`.
