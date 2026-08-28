# Executor Bus Packet Compressor R1

R1 is a **lossless schema compactor** for a validated `gameroad-executor-bus-v1` queue packet. It is intended for the GAMEROAD split-reasoning path:

`Codex/Luna -> bounded packet -> ChatGPT/Sol -> correlated result -> Codex/Luna`

It reduces repeated JSON field-name overhead while keeping every normalized task identity, mutable scope, do-not-change scope, goal, output target, acceptance clause, resume condition, and capability hint intact.

## Why R1 is lossless

A compressor that silently summarizes or truncates acceptance conditions can make a small packet look successful while changing the job. R1 refuses to do that. It first delegates validation and normalization to `tools/executor-bus-packet.mjs`, then maps the validated packet to short wire keys. Decompression rebuilds the normal queue packet, validates it again, and verifies a SHA-256 fingerprint.

The compact mapping is:

- `v`: compact schema (`gsc1`)
- `k`: packet kind (`q`)
- `i`: `[taskId, workUnitKey, acquireKey]`
- `b`: base ref
- `m`: exact mutable resources
- `x`: do-not-change resources
- `g`: user end state
- `o`: real output target
- `a`: acceptance clauses
- `r`: resume condition
- `h`: executor capability hint
- `f`: SHA-256 base64url fingerprint of the authoritative normalized packet

Unknown keys, malformed identity, invalid reconstructed queue packets, and fingerprint mismatch all fail closed.

## Budget behavior

`compressQueuePacket(input, { maxWireChars, maxWireBytes })` can enforce a hard transport budget. If the lossless packet does not fit, the function returns `wire_char_budget_exceeded` or `wire_byte_budget_exceeded`. It never clips a goal, scope entry, or acceptance clause just to meet the budget.

This distinction matters for the planned 1–3K reasoning packet. R1 safely removes schema overhead and measures the remaining size. A later semantic-context selector may decide which *external context* belongs in that 1–3K budget, but it must not rewrite the executor-bus contract behind the user's back.

## API

```js
import {
  compressQueuePacket,
  decompressQueuePacket,
  measureQueuePacketCompression,
} from './tools/executor-bus-packet-compressor.mjs';

const compressed = compressQueuePacket(queuePacket, { maxWireBytes: 3000 });
if (!compressed.ok) throw new Error(compressed.reason);

const restored = decompressQueuePacket(compressed.wire);
if (!restored.ok) throw new Error(restored.reason);
```

The compression result includes `wire` plus character/UTF-8 byte metrics. The compact object can also be passed directly to `decompressQueuePacket()`.

## CLI

The module reads one JSON value from stdin:

```sh
node tools/executor-bus-packet-compressor.mjs compress < queue.json
node tools/executor-bus-packet-compressor.mjs decompress < compact.json
node tools/executor-bus-packet-compressor.mjs measure < queue.json
```

## R1 acceptance

Focused test:

```sh
node --test tests/executor-bus-packet-compressor.test.mjs
```

The suite proves exact round-trip normalization, measurable size reduction, deterministic output, corruption detection, unknown-key rejection, inherited executor-bus validation, fail-closed budgets, UTF-8 byte budgeting, ordered scope/acceptance preservation, optional hint preservation, malformed identity rejection, and metric consistency.

## Explicitly out of scope

- semantic summarization of arbitrary project/search context;
- dropping acceptance clauses to force a packet under budget;
- Sol response-plan schema;
- Luna/Sol routing policy;
- browser-driver or Windows/Codex live transport proof;
- workflow or product-file changes.
