# Luna/Sol deterministic router R1

This module decides **when Codex/Luna should keep executing locally and when it should stop and ask Sol for a heavier reasoning pass**. It is deliberately a small pure decision layer, not a new orchestration framework.

## Routes

- `LOCAL_EXECUTE` — bounded work has enough information to proceed locally.
- `SOL_PRECHECK` — unresolved design/spec/high-consequence uncertainty should be resolved before mutation.
- `SOL_FAILURE_REQUERY` — a first failed attempt needs a failure packet and fresh reasoning before retry.
- `SOL_ESCALATE` — the same failure class has repeated; do not continue the same local loop.
- `HOLD` — required human/capability/transport/packet prerequisite is missing.

## Deterministic policy

R1 does not score token price, model preference, or subjective task importance. It routes only from explicit execution facts: scope breadth, spec conflict, material unknowns, design decision requirement, implementation risk, reversibility, acceptance knowledge, failure count, root-cause knowledge, shared-resource risk, and prerequisite availability.

Important fail-closed rules:

1. Human-only work or a missing execution capability is `HOLD`; sending it to Sol does not magically make the action executable.
2. A Sol route is never claimed runnable if the Sol transport or required packet is unavailable. The router returns `HOLD` and records the intended Sol route.
3. A first failure with a known root cause may remain local only when the repair is low-risk, easily reversible, and free of spec/design/material uncertainty or shared-resource risk.
4. Two or more same-class failures escalate to Sol instead of repeating the same repair loop.
5. Safe bounded work remains local even if Sol transport is unavailable; Sol is not a mandatory tax on every task.

## Existing executor-bus seam

`luna-sol-router-runner.mjs` consumes the existing `gameroad-executor-bus-v1` queue packet through `normalizeQueuePacket()` from `tools/executor-bus-packet.mjs`. It preserves `taskId`, `workUnitKey`, and `acquireKey` in the routing decision. It does not change the executor-bus packet schema.

Input shape:

```json
{
  "action": "luna-sol-route",
  "queuePacket": { "schemaVersion": "gameroad-executor-bus-v1", "kind": "queue" },
  "signals": { "acceptanceKnown": true, "rootCauseKnown": true }
}
```

The real queue packet must still satisfy the existing executor-bus contract.

## Integration boundary

R1 emits a decision only. It does **not**:

- invoke ChatGPT/Sol;
- call the browser transport;
- build/compact the Sol packet;
- choose or automate a model selector;
- mutate product files or workflows;
- claim a Windows/Codex live round trip.

Those seams remain separate so branches 1, 2, 3, 5, and 6 can be developed without file conflicts and joined in branch 7.

## Focused test

```sh
node --test tests/luna-sol-router-core.test.mjs
```

The focused suite covers local routing, precheck triggers, failure requery/escalation, human/capability holds, fail-closed transport/packet prerequisites, normalization, and the existing executor-bus identity seam.
