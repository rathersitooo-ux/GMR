<!--
GAMEROAD Pull Request evidence template.
An unmerged Pull Request is a change candidate, not CURRENT code and not a replacement for Drive CURRENT/specification records.
Do not mark an unrun/failed check as PASS. Leave unknown items explicitly UNVERIFIED.
-->

## Task connection

- TaskID:
- AcquireKey:
- Drive reason package / CURRENT record:
- Related Issue:

## GitHub basis

- Base branch:
- Base HEAD SHA checked immediately before implementation:
- Head branch:
- Head commit SHA:

## Change reason

Describe why this change is required and how it reduces the gap to the current GAMEROAD completion target.

## Intended scope

- Files/responsibilities intentionally changed:
- Explicit non-scope:

## Tests actually executed

List only tests that were actually run, with the commit/build they exercised and their result.

- Test / result:

## GitHub Actions / status checks

Record the actual state. Use UNRUN / NOT_APPLICABLE when no relevant check executed; do not convert absence into PASS.

- Check / state / target SHA:

## Unverified items

List every required runtime, device, visual, save/reload, Roblox/Unity/browser, or human acceptance item that was not verified.

- UNVERIFIED:

## Diff audit

Confirm against the final base...head diff before merge.

- [ ] Changed-file list matches the reason package.
- [ ] No unintended code or file changes.
- [ ] No unrelated formatting changes.
- [ ] No debug-only code or temporary constants.
- [ ] No placeholder/fake Asset IDs or secrets.
- [ ] No commented-out obsolete implementation left behind without reason.
- [ ] New dependencies, deleted code, and generated files are explicitly accounted for.

<!--
Merge/green checks/Issue closure alone do not prove the player-facing feature complete.
After merge, record the final main HEAD and re-read the current files/results required by the task.
-->
