# Codex browser bridge local mutation queue gate

This note records the fail-closed rule for the `LOCAL_EXECUTE` path in `prepareLunaSolCodexDispatch()`.

Routing confidence is not mutation authority. Before the bridge returns `mayMutate: true`, the caller must supply an executor queue packet that passes the canonical `normalizeQueuePacket()` validator. The validated packet is returned as `queuePacket` so the executor keeps the exact task, work-unit, acquire identity, mutable resources, protected resources, acceptance clauses, and resume condition attached to the local execution decision.

The local path therefore behaves as follows:

- valid canonical queue + `LOCAL_EXECUTE` route -> `LOCAL_EXECUTE`, `mayMutate: true`, canonical `queuePacket` returned;
- missing queue -> `PACKET_REJECTED`, `local_mutation_queue_required`, `mayMutate: false`;
- malformed queue -> `PACKET_REJECTED`, `queue_<validator reason>`, `mayMutate: false`.

This is deliberately separate from the Sol/browser path. Sol responses and browser round-trip receipts remain non-mutating proposals/evidence. The durable receipt logic added to the bridge is preserved unchanged by this repair.

Focused regression target:

```text
node --test tests/luna-sol-codex-browser-bridge-local-queue-gate.test.mjs
```

A passing static test does not establish a live Windows/Codex browser black-box pass. The existing `PRE_BLACKBOX` boundary remains in force until real browser evidence is recorded and verified.
