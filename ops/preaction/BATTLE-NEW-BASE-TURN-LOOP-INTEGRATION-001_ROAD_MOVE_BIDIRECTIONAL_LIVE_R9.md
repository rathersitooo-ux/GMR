# PREACTION — ROAD_MOVE_BIDIRECTIONAL_LIVE_R9

TaskID: `BATTLE-NEW-BASE-TURN-LOOP-INTEGRATION-001`
WorkUnitID: `ROAD_MOVE_BIDIRECTIONAL_LIVE_R9`
AcquireKey: `ROAD-MOVE-RUNTIME-R9-20260907T1245-SOL-N7Q4V8`
Owner: `ChatGPT GPT-5.6 Sol / current conversation`
Branch: `sol/road-move-bidirectional-live-r9-20260907`
BaseMainSHA: `469e6b800fb420369db9bc0c09c565c43fc2845c`
PrepToken: `ROAD-R9-A-D-LIVE-GREEN-MAIN-PUBLIC`
PreparedAt: `2026-09-07 12:48 JST`
ExpiresAt: `2026-09-07 13:44 JST`

## Allowed write targets

- `browser/GAMEROAD.html`
- `tests/road-move-bidirectional-live-r9.spec.mjs`
- this bounded preaction manifest
- branch-local focused validation plumbing only when required to execute the named Road acceptance; temporary validation plumbing must not be merged as product residue unless independently justified.

## Expected product diff

Connect the existing Road-card compatibility/draft semantics to the live movement consumer so Road-card selection and route construction are symmetric inputs to one draft plan. Support card-first, move-first, Elastic Focus, path retention on card changes, undo/cancel candidate recomputation, Road1–6 as movement upper bounds, multiple compatible cards without automatic choice, and sole-candidate soft focus without automatic submission.

## Explicit non-write boundaries

- Battle-card selection, reservation, submission, ordering, resolution, attack, or victory semantics
- 109-position topology, adjacency, reachable, stoppability, existing board geometry
- gameplay rules outside Road movement matching
- save/network/economy contracts
- Road1–6 copy-paste handlers or CARD_FIRST/MOVE_FIRST duplicate state machines

## Expected tests / acceptance

- player cases A–D from the current Road bidirectional specification
- parameterized Road1–6 upper-bound semantics
- multi-candidate automatic selection = 0
- undo/cancel recomputes from current path
- `NORMAL / COMPATIBLE / FOCUSED / INVALID_FOCUS` live display semantics without color-only differentiation
- 390×844, 844×390, 1280×720
- Reduced Motion and actual LowPerf path
- 109-board regression
- current authority/stale/dedupe validation where the existing contract applies
- Battle-card semantic diff = 0
- PR/checks/merged main SHA/public consumer readback before product-complete claim

## Changed causal route

Road R8 repeatedly used a CI-generated implementation followed by a focused test and self-commit. Three terminal runs generated successfully but failed focused live acceptance before the product commit step. R9 does not repeat that route: it starts from fresh main and commits the product consumer diff directly, using R8/R6 only as donor/reference, then validates the branch itself.
