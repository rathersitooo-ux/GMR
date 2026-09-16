# GAMEROAD Executor Bus

This is a transport/execution layer, not a second task system, specification authority, planner, or product-completion oracle.

## Purpose

Use GitHub Issues as a durable queue when ChatGPT HEAD and an external executor cannot talk through a direct native transport. GitHub Actions validates the packet identity and stores normalized queue/result artifacts. The executor never receives authority merely because a packet was accepted: current Drive CURRENT, current Task/owner/lease, exact mutable resources, current repository state, and acceptance evidence remain authoritative.

The bus does **not** execute arbitrary commands from an issue. `command`, `shell`, `script`, credential, token, password, and secret fields are rejected. Queue/result acceptance is transport acceptance only.

Every executable queue is **procedure-first**. Sol/HEAD must finish the reasoning work before dispatch: executor choice, exact inputs, fixed assumptions, ordered procedure, no-inference boundaries, acceptance, stop/fail-close conditions, and return payload requirements are part of the packet. GitHub/Free Local Coder executes that packet; it does not choose the task, invent specification, reprioritize work, resolve semantic ambiguity, or declare product completion.

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
  "executorClass": "GITHUB_AUTOMATION or FREE_LOCAL_CODER",
  "exactInputs": ["fresh CURRENT/task/actual input used by this bounded unit"],
  "exactMutableResources": ["exact/path/or/resource"],
  "readOnlyResources": ["context that may be read but never changed"],
  "doNotChange": ["explicit/non-target"],
  "fixedAssumptions": ["decision already closed by Sol/HEAD"],
  "procedure": ["ordered step 1", "ordered step 2"],
  "noInferenceBoundary": ["decision or value the executor must not invent"],
  "userEndState": "What the user actually wants at the end.",
  "realOutputTarget": "The concrete artifact/state to return.",
  "acceptance": ["observable acceptance condition"],
  "stopConditions": ["stale/ambiguous/out-of-scope condition that must stop execution"],
  "returnPayload": ["status", "evidence", "unresolved", "producedRefs", "nextAction"],
  "resumeCondition": "Where HEAD resumes after return or block.",
  "executorCapabilityHint": "Optional capability hint; not authority"
}
```
```

`exactMutableResources` may not overlap `readOnlyResources` or `doNotChange`. The procedure-first fields are required and fail closed when absent. The workflow serializes events per issue, validates fail-closed, uploads a normalized queue artifact, and writes `BUS_PACKET_ACCEPTED` or `BUS_PACKET_REJECTED` to the issue.

For `FREE_LOCAL_CODER`, the normalized procedure-first fields are copied into the model prompt. The model is explicitly an executor rather than a planner; ambiguity, missing context, stale inputs, no-inference boundary hits, and stop conditions must block instead of being guessed through.

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
