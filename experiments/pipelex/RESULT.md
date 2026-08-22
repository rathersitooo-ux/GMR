# Pipelex Current Evidence R1 — execution result

State: `ISOLATED_EVALUATION_PASS / NOT_PRODUCT_PROGRESS / NOT_FOR_MERGE_YET`

## Objective

Test whether Pipelex can encode a typed GAMEROAD CURRENT-evidence packet and fail closed on an invalid bundle without replacing Drive as authority.

## Pinned inputs

- GMR experiment base: `7cf15870dd3c8308edecde24100ddd39082ffc0a`
- Pipelex upstream revision: `42139f7588cd5ad594296a45f9e89caff6cbc639`
- Pipelex observed version in CI: `0.51.0`
- Python observed version in CI: `3.12.14`

## Execution evidence

GitHub Actions run: `32571532313`
Job: `97027560682`
Artifact: `9475444158`
Artifact digest: `sha256:41a886df030a36de14d7dc36853dca3c9b75d8c327acc550313826436f74dd6b`

Observed results:

1. Exact Pipelex upstream revision installed successfully and reported `pipelex 0.51.0` / `pipelex-agent 0.51.0`.
2. `current-evidence-packet.mthds` validation returned `success=true`, `is_valid=true`, `is_runnable=true`, one validated pipe, no pending signatures, and no warnings.
3. Deliberately broken `negative-missing-main.mthds` returned `ValidateBundleError`, `is_valid=false`, and process exit `1` because the declared main pipe did not exist.
4. Dry-run completed successfully without provider credentials and returned a structured `EvidencePacket` with all nine declared fields. The field values were synthetic mock strings, as expected for dry-run; this proves shape/data-flow execution, not semantic answer quality.

## First failure and repair

Initial run `32571498969` failed before Pipelex installation because `actions/setup-python` was configured with `cache: pip` while GMR has no root `requirements.txt` or `pyproject.toml`. The cache assumption was removed. The next Pipelex run passed.

## Separate repository gate

The normal GAMEROAD Required Gate failed because the temporary experiment workflow path `.github/workflows/pipelex-current-evidence-r1.yml` has no approved mapping in the required-gate path classifier. Its package provenance invariant passed; the failure is specifically the fail-closed unclassified-CI-path rule. The temporary executor should therefore be removed after preserving this result instead of broadening the production gate for an experiment.

## What this proves

- Pipelex can represent the proposed CURRENT-evidence packet as a typed `.mthds` contract.
- Its validator accepts the valid contract and rejects an intentionally invalid one.
- Its dry-run can execute the declared data flow without external AI credentials.
- The experiment can stay isolated from GAMEROAD runtime/game files.

## What this does not prove

- Live LLM semantic accuracy.
- Retrieval correctness from Google Drive/GitHub/Web.
- Lower latency, token/context use, tool calls, or cost than the current workflow.
- Safe authority replacement. Drive CURRENT remains authoritative.
- Any improvement to the playable game.

## Next acceptance gate before adoption

Run a read-only live A/B evaluation on the same real GAMEROAD decision cases: current workflow vs Pipelex-wrapped workflow. Compare evidence retention, contradiction detection, false-complete rate, retrieval misses, context size, tool calls, latency, and cost. Do not adopt or replace current authority paths unless that comparison is non-inferior on correctness/safety and materially better on execution cost or repeatability.
