# JIT Evidence Compiler R1

`tools/jit-evidence-compiler.mjs` is a pure selection/compiler layer for GAMEROAD's existing CURRENT and Codex JIT evidence rules. It is **not** a new authority, index, graph, cache, or retrieval backend.

## Purpose

The compiler accepts already-discovered evidence identities and material relation candidates, then produces the smallest deterministic context set needed for the current decision:

1. **HOT**: current authority, direct actual, named consumer/use-site, acceptance/test, and other required current evidence.
2. **WARM**: only evidence reached from a still-unresolved **material** issue. Expansion continues until no new material evidence is emitted.
3. **COLD**: considered only after the WARM frontier reaches a fixpoint while material issues remain unresolved. If a reached WARM item is still unavailable or budget-blocked, COLD is deferred instead of bypassing the unresolved WARM evidence.
4. **QUARANTINE**: never auto-included. `RETIRED` and `INPUT_PROHIBITED` are hard-quarantine states.

No fixed document count, source quota, or hop count is used as a quality target. The frontier is finite because it can only select declared evidence identities, and it stops when another pass selects nothing.

## Fail-closed rules

- Every ID listed in `requiredHotIds` must exist as HOT evidence.
- Required HOT evidence must be available, marked as a current claim, and have a current state (`CURRENT_AUTHORITY`, `CURRENT_ARTIFACT`, or `CURRENT_EXECUTION_EVIDENCE`).
- Required HOT evidence is never silently dropped for context budget. If it cannot fit, compilation fails.
- `HISTORICAL` and `ARCHIVED` evidence may only be COLD/QUARANTINE.
- `RETIRED` and `INPUT_PROHIBITED` evidence must be QUARANTINE.

## Material frontier

`issues` are the unresolved questions that can still change the decision. Only `material: true` unresolved issues emit retrieval/selection work.

`relations` connect an issue to evidence that can answer it. Selected evidence can:

- `resolves`: mark issues resolved;
- `emitsIssues`: surface another already-declared issue as unresolved.

This models FAN-IN/FAN-OUT style JIT expansion without making the compiler a source of dependency truth. Upstream authority/retrieval code is responsible for discovering and validating relation candidates.

## Canonical evidence context envelope

R1 now preserves the selected evidence identity inside the existing text-only reasoning context. Every selected `contextItems[].text` starts with a compiler-owned canonical envelope before the original evidence body.

The envelope carries:

- schema version and evidence ID;
- HOT/WARM/COLD tier;
- current/reference state and claim mode;
- role;
- authority class;
- source version;
- provenance;
- freshness.

The original evidence body follows the closing marker unchanged. Metadata is produced only from normalized structural evidence fields; it is never parsed from the body text. Therefore body text that contains a fake marker or fake metadata cannot overwrite the compiler-owned leading envelope.

The existing reasoning-packet packer remains unchanged: it already transports `contextItems[].text` opaquely. Focused coverage verifies that the canonical envelope survives pack/unpack byte-for-byte through that existing path.

Context budget accounting uses the exact transmitted `contextItems` representation, so metadata overhead is included. Required HOT evidence still fails closed rather than silently losing identity metadata to fit the budget.

## Output

`compileJitEvidencePacket(...)` returns:

- `contextItems`: `{ id, text, priority, required }[]`, compatible with the current `packReasoningPacket` context input shape; `text` contains the canonical metadata envelope plus the original evidence body;
- `selectedEvidence`: state/provenance metadata for audit/readback;
- `includedByTier`;
- `unresolvedIssues`;
- `nextRetrievalIds` for unavailable evidence on the remaining material frontier;
- budget/quarantine/not-reached omissions and byte metrics.

A `READY` result means only that the declared material evidence frontier is resolved for this compile. It does **not** mean the whole project is known or the product/task is complete.

## Integration boundary

This change intentionally does not edit `executor-bus-packet.mjs`, the packet compressor, Sol reasoning protocol, Luna/Sol integration/router, claim-gate logic, workflows, or product code. The JIT compiler preserves identity metadata inside the existing text field, so active downstream evidence-validation work can consume that identity later without requiring a competing packet format or a second evidence system.
