# GAMEROAD Executor Bus

This is a transport layer, not a second task system, specification authority, or product-completion oracle.

## Purpose

Use GitHub Issues as a durable queue when ChatGPT HEAD and an external executor cannot talk through a direct native transport. GitHub Actions validates the packet identity and stores normalized queue/result artifacts. The executor never receives authority merely because a packet was accepted: current Drive CURRENT, current Task/owner/lease, exact mutable resources, current repository state, and acceptance evidence remain authoritative.

The bus does **not** execute arbitrary commands from an issue. `command`, `shell`, `script`, credential, token, password, and secret fields are rejected. Queue/result acceptance is transport acceptance only.

## Queue packet

Create an issue whose title begins with `[EXECUTOR]` and whose body contains exactly one fenced JSON packet:

```text
```executor-bus
{
  "schemaVersion": "gameroad-executor-bus-v1",
  "kind": "queue",
  "taskId": "CURRENT-TASK-ID",
  "workUnitKey": "CURRENT-WORKUNIT",
  "acquireKey": "CURRENT-ACQUIRE-KEY",
  "baseRef": "CURRENT-BASE-REF-OR-SHA",
  "exactMutableResources": ["exact/path/or/resource"],
  "doNotChange": ["explicit/non-target"],
  "userEndState": "What the user actually wants at the end.",
  "realOutputTarget": "The concrete artifact/state to return.",
  "acceptance": ["observable acceptance condition"],
  "resumeCondition": "Where HEAD resumes after return or block.",
  "executorCapabilityHint": "Optional capability hint; not authority"
}
```
```

The workflow serializes events per issue, validates fail-closed, uploads a normalized queue artifact, and writes `BUS_PACKET_ACCEPTED` or `BUS_PACKET_REJECTED` to the issue.

## Result packet

An executor returns through a new issue comment containing:

```text
```executor-result
{
  "schemaVersion": "gameroad-executor-bus-v1",
  "kind": "result",
  "taskId": "CURRENT-TASK-ID",
  "workUnitKey": "CURRENT-WORKUNIT",
  "acquireKey": "CURRENT-ACQUIRE-KEY",
  "status": "RETURNED",
  "evidence": ["durable evidence pointer"],
  "unresolved": [],
  "producedRefs": ["commit/PR/artifact reference"],
  "nextAction": "HEAD audit"
}
```
```

Allowed transport statuses are `RETURNED`, `BLOCKED`, `NO_CHANGE`, and `FAILED`. `SUCCESS` is intentionally not a bus status so transport acceptance cannot be confused with product/task completion.

The workflow verifies `taskId`, `workUnitKey`, and `acquireKey` against the original queue packet, uploads a normalized result artifact, and writes a transport-only result marker. A mismatched result is rejected.

## HEAD adoption

After `BUS_RESULT_ACCEPTED`, ChatGPT HEAD must still fresh-read the current Drive root, current owner/lease, repository actual, returned artifact/diff, consumer/use-site, and acceptance evidence. Existing GAMEROAD success-claim enforcement remains unchanged. Failed, pending, skipped, unknown, or merely transported results are not promoted to completion.

If a direct current executor transport exists, use it instead of this bus. The bus is the durable fallback that removes user copy/paste from indirect executor handoffs.
