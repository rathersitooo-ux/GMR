# GAMEROAD bounded patch

`tools/gameroad-bounded-patch.mjs` is the fail-closed mutation boundary for very large text artifacts such as `browser/GAMEROAD.html` when a full-file connector replacement is unsafe.

It does not decide game rules and does not authorize a mutation. CURRENT Task/lease/PRE_ACTION and exact repository base remain mandatory.

## Contract

A patch spec uses `gameroad-bounded-patch-v1` and must pin the complete source with SHA-256. Every operation must provide an exact `before` anchor, exact `after` replacement, and `expectedCount: 1`.

The tool rejects the operation when:

- the complete source SHA-256 moved;
- an anchor is missing or occurs more than once;
- two anchor ranges overlap;
- a replacement is a no-op;
- the optional expected output SHA-256 does not match.

All anchors are located against the same original source before any replacement is made. Replacements are then applied from the end of the file toward the beginning, so an earlier replacement cannot move or manufacture a later anchor.

## Spec example

```json
{
  "schemaVersion": "gameroad-bounded-patch-v1",
  "expectedSourceSha256": "<64 hex characters>",
  "expectedOutputSha256": "<optional 64 hex characters>",
  "operations": [
    {
      "id": "replace-one-authorized-seam",
      "before": "<exact unique current text>",
      "after": "<exact replacement text>",
      "expectedCount": 1
    }
  ]
}
```

## Use

Validate without writing:

```bash
node tools/gameroad-bounded-patch.mjs --source browser/GAMEROAD.html --spec /tmp/patch.json --check
```

Apply atomically in place after the same spec passes validation:

```bash
node tools/gameroad-bounded-patch.mjs --source browser/GAMEROAD.html --spec /tmp/patch.json --out browser/GAMEROAD.html
```

The CLI prints source/output SHA-256 values and the exact operation IDs applied. A rejected guard exits non-zero and writes no output.

## Intended GAMEROAD flow

1. Fresh-read CURRENT and acquire the exact mutable resource.
2. Pin the current repository SHA and source SHA-256.
3. Inspect the current producer/use-site and build exact unique anchors.
4. Run `--check` first.
5. Apply only the approved patch spec.
6. Run focused tests plus the existing required gates and player-facing acceptance.
7. Re-read the resulting diff and current main before promotion.

This tool exists to remove the recurring giant-text local-mutation blocker. It is not a second Battle engine, task system, or success oracle.
