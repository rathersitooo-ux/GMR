# JIT Evidence Compiler R1

`tools/jit-evidence-compiler.mjs` is a pure selection/compiler layer for GAMEROAD's existing CURRENT and Codex JIT evidence rules. It is **not** a new authority, index, graph, cache, or retrieval backend.

## Purpose

The compiler accepts already-discovered evidence identities and material relation candidates, then produces the smallest deterministic context set needed for the current decision:

1. **HOT**: current authority, direct actual, named consumer/use-site, acceptance/test, and other required current evidence.
2. **WARM**: only evidence reached from a still-unresolved **material** issue. Expansion continues until no new material evidence is emitted.
3. **COLD**: considered only after the WARM frontier reaches a fixpoint while material issues remain unresolved.
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

## Output

`compileJitEvidencePacket(...)` returns:

- `contextItems`: `{ id, text, priority, required }[]`, compatible with the current `packReasoningPacket` context input shape;
- `selectedEvidence`: state/provenance metadata for audit/readback;
- `includedByTier`;
- `unresolvedIssues`;
- `nextRetrievalIds` for unavailable evidence on the remaining material frontier;
- budget/quarantine/not-reached omissions and byte metrics.

A `READY` result means only that the declared material evidence frontier is resolved for this compile. It does **not** mean the whole project is known or the product/task is complete.

## Integration boundary

R1 intentionally does not edit `executor-bus-packet.mjs`, the active packet compressor, Sol reasoning protocol, Luna/Sol integration, workflows, or product code. Once the current integration owner adopts this compiler, its `contextItems` can feed the existing reasoning-packet packer. Until then, R1 is an isolated implementation artifact with focused tests, not a live runtime integration claim.
