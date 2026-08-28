# Luna-only vs Luna+Sol completion A/B evaluator R1

This evaluator measures whether the split-reasoning loop actually changes task completion outcomes. It is intentionally descriptive and does not execute Luna, Sol, Codex, a browser, or product code.

## Arms

- `LUNA_ONLY`: Codex/Luna performs the task without a Sol reasoning round trip.
- `LUNA_SOL`: the same benchmark case may use the compact-packet -> Sol -> Luna loop.

The evaluator never labels either arm "better". It reports paired outcomes and operational deltas.

## Fair-pair contract

A record is paired only when these fields are identical across both arms:

- `experimentId`
- `caseId`
- `caseVersion`
- `benchmarkFingerprint`

`benchmarkFingerprint` is an opaque caller-owned identity for the comparison conditions. It should encode or reference the same starting repository/project state, acceptance contract, time/work budget, tool permissions, and benchmark fixture revision. If any of those materially change, use a different fingerprint so the evaluator will refuse to compare the records as a pair.

There must be exactly one record per arm for a pair. Duplicate records for the same arm are rejected. Cases with only one arm are listed as unpaired and excluded from paired metrics rather than being silently treated as failures.

For an actual benchmark run, keep the two arms isolated from the same clean starting state. Do not let one arm inherit filesystem state, patches, conversation state, or caches produced by the other. Record the evidence used to judge acceptance.

## Completion criterion

Only:

`acceptance === "ACCEPTED_COMPLETE"`

counts as completion.

`PARTIAL`, `FAILED`, and `BLOCKED` do not count as complete, even if a narrow test happened to pass. This prevents a green unit test from being mistaken for task completion.

## Recorded metrics

Each run records:

- final acceptance
- test pass/fail
- rework cycles
- human interventions
- out-of-scope changes
- elapsed milliseconds
- Sol calls
- packet resends
- attempts
- evidence pointers

The paired report includes per-arm completion/test rates, means for operational counts, mean and median elapsed time, and `LUNA_SOL - LUNA_ONLY` deltas. Positive deltas do not have one universal meaning: positive completion-rate delta is favorable to treatment, while positive elapsed/rework/human-intervention deltas are additional cost. The report therefore does not collapse them into a single score.

## Completion wins

For each matched case:

- treatment win: Luna+Sol completes while Luna-only does not;
- baseline win: Luna-only completes while Luna+Sol does not;
- completion tie: both complete or both do not complete.

This is deliberately separate from time/cost metrics. A case can tie on completion while Luna+Sol is slower or more expensive.

## Inference limits

R1 produces `DESCRIPTIVE_ONLY` output. It performs no causal inference and no statistical significance test. Artifact existence, passing evaluator tests, or a small benchmark sample is not evidence that Luna+Sol improves GAMEROAD completion rate. The claim can only be evaluated from real paired task runs collected under a controlled benchmark contract.

## CLI

The runner reads JSON from stdin. Either an array of records or `{ "records": [...] }` is accepted.

```sh
node tools/sol_bridge/evaluation/completion-ab-evaluator-runner.mjs < experiment.json
```

Focused test:

```sh
node --test tests/sol_bridge/evaluation/completion-ab-evaluator.test.mjs
```

## Boundaries

This branch does not change:

- the browser transport implementation from branch 2;
- the Sol response schema from branch 3;
- Luna/Sol routing from branch 4;
- Windows/Codex actual execution from branch 6;
- `.github/workflows/**`;
- product/game files.

Branch 7 can later connect recorded outcomes from those components into this evaluator without changing the evaluator's fairness rules.
