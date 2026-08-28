# Executor Bus Packet Compressor R1

R1 is the bounded packet builder for the GAMEROAD split-reasoning path:

`Codex/Luna -> 1–3K reasoning packet -> ChatGPT/Sol -> correlated result -> Codex/Luna`

It has two deliberately separate layers:

1. a **lossless queue-schema compactor** for the authoritative `gameroad-executor-bus-v1` contract;
2. a **bounded context selector** that packs declared context candidates by required/priority order without rewriting their text.

This keeps task identity and completion conditions exact while still allowing a hard 3,000-byte reasoning packet.

## Lossless queue compaction

A compressor that silently summarizes or truncates acceptance conditions can make a small packet look successful while changing the job. R1 refuses to do that. It first delegates validation and normalization to `tools/executor-bus-packet.mjs`, maps the validated packet to short wire keys, then verifies a SHA-256 fingerprint on decompression.

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

`compressQueuePacket(input, { maxWireChars, maxWireBytes })` can enforce a hard budget. If the lossless queue itself does not fit, it returns `wire_char_budget_exceeded` or `wire_byte_budget_exceeded`; it never clips a goal, scope entry, or acceptance clause.

## Bounded reasoning packet

`packReasoningPacket(queuePacket, contextItems, { maxWireBytes: 3000 })` adds selected project/search context around the compact queue.

Each context candidate has:

```js
{ id, text, priority, required }
```

Packing rules are deterministic:

- required items are considered first, preserving their input order;
- optional items follow by higher priority, then original order;
- text is carried verbatim after outer whitespace normalization; there is no AI rewrite in this layer;
- optional items that do not fit are omitted and reported in metrics;
- a required item that does not fit fails the whole pack operation;
- the final queue + selected context is fingerprinted as `grp1` and must remain at or below the byte budget.

This makes the 1–3K boundary enforceable without pretending arbitrary project material can be losslessly summarized into 3K. Luna/search/project readers can produce small candidate facts; R1 decides exactly which declared candidates fit and records what was omitted.

## API

```js
import {
  compressQueuePacket,
  decompressQueuePacket,
  packReasoningPacket,
  unpackReasoningPacket,
} from './tools/executor-bus-packet-compressor.mjs';

const packed = packReasoningPacket(queuePacket, [
  { id: 'current-state', text: '...', required: true },
  { id: 'search-1', text: '...', priority: 80 },
  { id: 'search-2', text: '...', priority: 40 },
], { maxWireBytes: 3000 });

if (!packed.ok) throw new Error(packed.reason);

const restored = unpackReasoningPacket(packed.wire);
if (!restored.ok) throw new Error(restored.reason);
```

The result reports `wireBytes`, included context IDs, and omitted context IDs, so orchestration can see whether the budget dropped optional evidence.

## CLI

The module reads one JSON value from stdin:

```sh
node tools/executor-bus-packet-compressor.mjs compress < queue.json
node tools/executor-bus-packet-compressor.mjs decompress < compact.json
node tools/executor-bus-packet-compressor.mjs measure < queue.json
node tools/executor-bus-packet-compressor.mjs pack-reasoning < reasoning-input.json
node tools/executor-bus-packet-compressor.mjs unpack-reasoning < reasoning-packet.json
```

`reasoning-input.json` has `{ "queue": {...}, "context": [...], "maxWireBytes": 3000 }`.

## R1 acceptance

Focused test:

```sh
node --test tests/executor-bus-packet-compressor.test.mjs
```

The suite covers exact queue round-trip, measurable schema reduction, deterministic output, corruption detection, unknown-key rejection, inherited executor-bus validation, fail-closed byte/character budgets, UTF-8 budgeting, exact ordered scope/acceptance preservation, malformed identity, 3K context selection, required-context overflow, whole-reasoning-packet tamper detection, and required-before-optional ordering.

## Explicitly out of scope

- AI-written semantic summaries of arbitrary project/search text;
- silently dropping or rewriting queue acceptance/scope to force a packet under budget;
- deciding the priority of project/search facts (the caller/Luna supplies that signal);
- Sol response-plan schema;
- Luna/Sol routing policy;
- browser-driver or Windows/Codex live transport proof;
- workflow or product-file changes.
