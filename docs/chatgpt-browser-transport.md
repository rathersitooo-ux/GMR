# ChatGPT browser transport R1

This module is the minimal transport seam for the GAMEROAD split-reasoning loop:

`Codex/Luna -> compact packet -> ChatGPT/Sol -> correlated response -> Codex/Luna`

It deliberately does **not** implement a browser automation framework. Existing executor-bus identity/correlation concepts remain the owner. R1 adds a browser-driver-agnostic round-trip state machine that can be backed later by the actual Codex built-in browser/Windows consumer, Playwright, or another approved native driver.

## Success definition

A click or a submitted prompt is not success. R1 returns `COMPLETED` only when all of the following are true:

1. the intended conversation is ready and the composer is usable;
2. the packet is submitted exactly once for one idempotency key;
3. the assistant turn is newer than the pre-submit assistant turn;
4. generation reaches a completed state;
5. the response is not marked partial/truncated;
6. the exact packet/correlation marker is present in the response.

The required marker is:

`[GAMEROAD_SOL_RESPONSE packetId="<packetId>" correlationId="<correlationId>"]`

`buildTransportMessage()` tells the reasoning side to echo that marker. Branch 3 may add a stricter response schema later without changing this transport correlation rule.

## Driver contract

A live driver supplies three async methods:

- `inspectContext()` -> page readiness, composer readiness, conversation id, last assistant turn id, app error if any.
- `submitMessage({ text, idempotencyKey, packetId, correlationId })` -> submission acceptance and optional user turn id.
- `waitForAssistantTurn({ afterTurnId, conversationId, packetId, correlationId, timeoutMs })` -> completed/error/timeout state and assistant turn evidence.

The core never assumes DOM selectors or a particular browser engine.

## Retry / duplicate behavior

`ChatGptBrowserTransport` remembers submitted idempotency keys in-process. If a wait times out after submission, repeating `run()` with the same key resumes the wait and does not submit a duplicate prompt. Reusing that key with a different packet/correlation identity fails as `DUPLICATE_SEND`.

A process restart requires the real driver/consumer to provide durable submission evidence before automatic resend. R1 intentionally fails closed rather than claiming exactly-once semantics across process loss.

## Executor-bus seam

`createExecutorBusChatGptHandler()` accepts commands whose `payload.action` is `chatgpt-browser-roundtrip`. By default:

- executor `commandId` becomes the transport idempotency key;
- executor `correlationId` becomes the transport correlation id.

No driver is bundled. A command without an injected live driver returns `DRIVER_REQUIRED`; therefore repository tests cannot be mistaken for proof that the Windows/Codex browser actually conducted a round trip.

## R1 acceptance

Focused test:

```sh
node --test tests/chatgpt-browser-transport-core.test.mjs
```

The fake-driver suite covers happy path, stale reply, wrong conversation, timeout-and-resume without resend, duplicate idempotency misuse, app error, correlation mismatch, truncation, executor-bus mapping, and fail-closed no-driver behavior.

## Explicitly out of scope

- DOM selectors and browser-specific automation;
- login/session acquisition;
- model-selection UI automation;
- Sol response-plan schema (branch 3);
- Luna/Sol routing policy (branch 4);
- Windows/Codex actual consumer proof (branch 6);
- workflow or product-file changes.
