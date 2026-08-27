# GAMEROAD BRANCH 03 — SETUP / MATCH / SOCIAL
Prepared: 2026-08-27

## Current authority snapshot

- Repository: `rathersitooo-ux/GMR`
- Fresh main commit checked immediately before branch creation:
  `2bc5463b3d0ca967f68c04f3b2fad3abb152d356`
- Current main tree:
  `9f0e02554676b06e3caec3607f44c257f40fb33c`
- `CURRENT_ACTIVE_LEASES`: 0 active leases at the preflight read.
- Current Setup surface already exists.
- Friend Room server/runtime work is already implemented and covered by multiple DONE tasks.
- Production public Matchmaking enablement is **not** free to invent:
  `TASK-ONLINE-002P` is BACKLOG / `WAITING_EXTERNAL`.
  The branch may build the UI/state boundary and testable shell, but must not fake or self-invent the public matchmaking backend contract.

## Purpose

Finish the visible and interaction layer from:

`Setup → room/queue → ready/wait/cancel → match handoff`

without changing Battle, Home, global transition infrastructure, or authoritative matchmaking rules.

---

# Ownership split

## B03-A — SETUP ENTRY

### Owns
- Setup screen presentation.
- Mode/player/deck/Partner/opponent selection presentation.
- Validation feedback that already exists in authoritative state.
- Start / back / cancel affordances.
- Landscape 16:9 and 844×390 adaptation.
- Setup-specific tests and screenshots.
- Setup-specific art/reference packet.

### Does NOT own
- public matchmaking backend.
- Friend Room server.
- Battle entry internals after handoff.
- global transition API.
- Deck legality rules.
- Partner rules/data.
- common Reduced Motion / LowPerf infrastructure.

### Exit
Real Setup route reaches a formal target UI, preserves all current selections and legality, and hands the same authoritative payload to the next state.

---

## B03-B — FRIEND ROOM

### Owns
- Friend Room idle state.
- create/join presentation.
- host/member/ready/wait presentation.
- leave/cancel/error/timeout presentation.
- host-disconnect/successor presentation where the existing runtime exposes it.
- room-specific tests and screenshots.
- room-specific reference/target packet.

### Existing runtime authority to preserve
Known DONE work includes:
- `TASK-ONLINE-001` create/join/ready server.
- `TASK-ONLINE-001I` real-server integration smoke harness.
- `TASK-ONLINE-001T` real friend-room behavior integration tests.
- `TASK-ONLINE-001M` deterministic E2E / CI gate.
- `TASK-ONLINE-001N` lifecycle error/timeout coverage.
- `TASK-ONLINE-001O` host disconnect successor/remove semantics.
- `TASK-ONLINE-003D` explicit ready reset after rematch request.

### Does NOT own
- rewriting the server protocol.
- Battle rules.
- Home.
- shared/global networking abstractions unless an existing bug proves the branch cannot work without a separate foundation change.

### Exit
Every already-authoritative room state has one visible, cancel-safe UI representation and a deterministic screenshot/test state.

---

## B03-C — MATCH / SOCIAL SHELL

### Owns now
- Matchmaking queue/wait/cancel visual state.
- public-match entry state boundary.
- Friend Battle entry shell if it maps to existing authoritative behavior.
- Spectate entry architecture only where the existing consumer can be identified.
- AI-fill status presentation if exposed by current runtime.
- queue/error/retry/cancel presentation tests.

### Hard gate
`TASK-ONLINE-002P`:
public Matchmaking backend contract is `WAITING_EXTERNAL`.

Therefore B03-C may:
- define state interfaces;
- implement visual states against mocks/test fixtures that match *known* states;
- preserve a disabled/blocked production entry when the backend is unavailable;
- build cancellation/retry/failure UI;
- add deterministic tests for the shell.

B03-C may NOT:
- declare production public matchmaking complete;
- invent endpoint/schema/authority;
- fake a successful production match;
- change server-side matchmaking semantics to make the screen pass.

### Runtime pieces already known as DONE
- `TASK-MULTI-010`: matchmaking AI fill / server-side random behavior.
- `TASK-MULTI-015`: terminal match-state reject for AI fill.

These may be consumed if they are actually on the current path, but not rewritten by this UI branch.

### Exit
The public-match UI contract is integration-ready and honest about backend availability; no fake production success path exists.

---

# B03-Z — BRANCH-LOCAL INTEGRATION

Run only after A/B/C have stable outputs.

### Owns
- route continuity across Setup → Friend Room / Queue → match handoff.
- duplicate component removal *inside Branch 03 only*.
- Branch 03 regression tests.
- Branch 03 screenshot matrix.
- conflicts among A/B/C.

### Does NOT own
- global branch integration.
- Battle implementation.
- Home implementation.
- Branch 0 shared transition/motion infrastructure.

---

# Non-overlap contract

Branch 03 may consume but not own:

- Branch 0:
  - Menu Transition Director
  - common overlay lifecycle
  - Reduced Motion infrastructure
  - LowPerf infrastructure
  - asset-failure fallback

- Branch 1:
  - Home / Boot

- Branch 2:
  - Cards / Deck / Quick Deck

- Branch 4:
  - Battle core

- Branch 5:
  - Battle presentation / Result

- Branch 6:
  - Partner / Costume

- Branch 7:
  - Gacha / Shop

If Branch 03 discovers a required change in another owner's scope:
1. record the required interface/change;
2. do not edit the foreign owner;
3. create a handoff item for that branch;
4. keep Branch 03 on a stub/adaptor only if that adaptor is locally owned.

---

# Verified mutable ownership / collision result

Fresh main inspection shows **Setup and Friend Room presentation + Friend Room runtime are currently embedded in the same `browser/GAMEROAD.html` monolith**.

Evidence:
- Setup markup: `<section class="screen setup" data-screen="setup">...`
- Friend Room markup: `<section class="screen friendroom" data-screen="friendroom">...`
- Friend Room render/runtime functions (`renderLobby`, room join/ready/start/leave) are in the same file.
- Setup CSS and Friend Room entry wiring are also in the same file.
- Public matchmaking does not have an independently verified current browser owner in this inspection, and its production backend remains externally gated.

Therefore **three concurrent code writers must NOT edit the monolith**.

## Safe branch layout

Create one code-owner branch only:

- `ui/b03-setup-match-social`

Inside the branch, A/B/C remain separate *work lanes*, but their monolith edits are serialized through one code owner.

Parallel work is still allowed for non-overlapping outputs:
- A: Setup target/reference/component-map/tests design
- B: Friend Room target/state/reference/component-map/tests design
- C: Match/Social shell contract/fixtures/reference/tests design

If/when presentation is extracted into independently imported modules with stable ownership, later code edits may split again. Do not modularize merely to create artificial parallelism unless the extraction itself is behavior-preserving and independently tested.

Branch 12 remains the only project-wide final integration owner.

---

# Work / Codex estimate

| Unit | Visual/Work | Codex | Blocking |
|---|---:|---:|---|
| B03-A Setup | 0.5–1 | 1 | none |
| B03-B Friend Room | 0.75–1 | 1–1.5 | none |
| B03-C Match/Social shell | 0.5–1 | 0.5–1 | production public matchmaking backend blocked |
| B03-Z Integration | 0.25–0.5 | 0.5–1 | A/B/C outputs |
| **Total immediate work** | **2–3.5** | **3–4.5** | backend gate excluded |

The external matchmaking backend completion is **not included** in this estimate because its current task is explicitly `WAITING_EXTERNAL`.

---

# Parallel execution waves

## Wave 1 — immediate, parallel

### Worker A
Setup current-state capture → reference packet → settled target → responsive target → screenshot-to-code component map.

### Worker B
Friend Room state inventory → idle/create/join/ready/wait/error targets → component map → runtime integration.

### Worker C
Queue/public-match shell state inventory → target states → disabled/blocked production behavior → fixture-driven tests.

No worker edits another worker's target.

## Wave 2 — branch integration
B03-Z combines route/state continuity and runs Branch 03 regression.

## Wave 3 — later
Branch 12 performs project-wide integration.

---

# UI requirements

## Setup
The screen must answer immediately:
1. What mode am I entering?
2. Which deck is selected?
3. Which Partner is selected?
4. Who/what am I matching against?
5. Is the current setup legal?
6. What happens if I press Start?
7. How do I back out?

Do not present all choices as equal visual cards if that destroys hierarchy.
The selected match configuration is the visual focus; Start is the primary action.

## Friend Room
The visual focus is current party state:
- room identity;
- host;
- members;
- ready/not-ready;
- wait/start condition;
- leave/cancel.

Transient network states must not look like success.

## Matchmaking queue
The visual focus is:
- current requested match type;
- waiting state;
- cancel;
- connection/error/retry;
- backend unavailable state when applicable.

Do not manufacture a fake progress percentage unless the server actually owns one.

---

# Motion contract

Permitted:
- selection feedback;
- ready-state acknowledgement;
- participant enter/leave;
- queue waiting ambience;
- short connection bridge;
- error/cancel feedback.

Not permitted:
- video owning ready state;
- animation determining whether a room joined successfully;
- fake matchmaking progress;
- animation blocking cancel;
- large transition that hides authoritative error/state changes.

Reduced Motion must land on the exact same state with minimal movement.

---

# Acceptance matrix

## B03-A
- [ ] Setup real route reachable.
- [ ] Existing selections survive visual redesign.
- [ ] Illegal state cannot become visually “ready”.
- [ ] Start/back/cancel are reachable at 1280×720 and 844×390.
- [ ] No horizontal overflow.
- [ ] Reduced Motion / LowPerf preserve semantic state.
- [ ] Runtime screenshot captured.

## B03-B
- [ ] create/join/ready/wait/leave states map to real authoritative room state.
- [ ] host/member identity is not inferred from presentation.
- [ ] ready reset is visible when authoritative state resets.
- [ ] timeout/error cannot masquerade as ready.
- [ ] repeated enter/leave does not leave stale UI/input owner.
- [ ] runtime screenshots captured for deterministic states.

## B03-C
- [ ] queue cancel always works.
- [ ] backend-unavailable state is explicit.
- [ ] no fake production-success path.
- [ ] shell does not invent endpoint/schema.
- [ ] any AI-fill status comes only from existing authoritative state.
- [ ] Friend Battle/Spectate only activate where a real current consumer is found.

## B03-Z
- [ ] Setup→Friend Room / Queue route continuity.
- [ ] no foreign-owner files modified.
- [ ] no duplicated room/match state machine.
- [ ] Branch 03 tests pass.
- [ ] Branch 03 screenshot matrix attached.
- [ ] remaining external/backend gate reported explicitly.

---

# Codex preflight for each worker

Before editing:
1. read current main/branch HEAD;
2. map the current DOM/runtime owner for the assigned surface;
3. check git status and same-file active work;
4. claim only assigned paths;
5. preserve server/state contracts;
6. if exact code ownership is unclear, resolve it before making a broad edit;
7. do not edit the 11.8MB monolith blindly if a narrower owner/component already exists;
8. keep changes isolated so the branch can be reverted independently.

---

# Stop conditions

Stop that sublane and report a gate if:
- required current state does not actually exist;
- backend authority is unresolved;
- implementation would require changing Battle/Home/Foundation;
- current owner cannot be determined safely;
- visual target requires an invented gameplay rule/value;
- another live writer owns the same mutable target.

Other B03 sublanes continue; one gate must not block the whole branch.
