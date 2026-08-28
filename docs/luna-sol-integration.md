# Luna + Sol static integration R1

This layer joins the already separated GAMEROAD reasoning components into one bounded orchestration seam without pretending that a live Windows/Codex browser driver has been proven.

## Flow

1. `routeLunaSol` decides `LOCAL_EXECUTE`, `HOLD`, or a Sol route.
2. Local execution can return mutation permission only when the router returns `LOCAL_EXECUTE` **and** the supplied executor queue packet passes the canonical queue validator. Missing or malformed mutation scope/identity fails closed before permission is returned.
3. A Sol route packs the current executor queue packet plus selected context into bounded `grp1` (default 3000 bytes).
4. `buildSolPrompt` creates the correlated structured Sol request.
5. The existing ChatGPT browser transport is instantiated only with an injected driver supplied by the actual executor environment.
6. The transport requires one new completed assistant turn and the exact packet/correlation marker.
7. `parseSolResponse` validates request identity, reasoning-packet fingerprint, mutable scope, protected scope, disposition, rollback/tests, and acceptance coverage.
8. A validated Sol response is returned to the executor as a reviewed proposal. **It never grants mutation permission automatically.**

## Safety invariants

- A local route without a valid queue identity and exact mutable-resource contract cannot grant mutation permission.
- No driver means a Sol-required route becomes `HOLD`; there is no fake browser fallback.
- A missing queue packet becomes `HOLD` before Sol dispatch.
- Packet-budget failure stops before browser submission.
- Transport timeout, stale response, wrong conversation, truncation, missing correlation marker, or driver error stops adoption.
- Protocol-invalid response stops adoption.
- `PLAN` is not execution authority. `mayMutate` remains false for every Sol-return path.
- `NO_CHANGE` remains non-mutating and still requires executor-side acceptance verification.
- Human-only and capability-blocked boundaries remain `HOLD`.
- The evaluator is separate: this integration does not infer that Luna+Sol is superior merely because the path exists.

## Driver boundary

R1 deliberately accepts the browser driver by dependency injection. The driver must implement:

- `inspectContext()`
- `submitMessage(...)`
- `waitForAssistantTurn(...)`

The static integration branch can therefore be checked without inventing a Windows automation API. A real black-box claim requires a later Windows/Codex run using an approved driver and durable round-trip evidence.

## Current integration status

The repository union can be assembled and statically checked now. It must remain `PRE_BLACKBOX` until the actual Windows/Codex consumer demonstrates a live request/response round trip and the result is recorded. Do not merge this branch merely to make the plumbing look complete when the current Required Gate has no classification for these new Ops-AI executable paths.
