import test from "node:test";
import assert from "node:assert/strict";

import {
  NEW_BASE_GOAL_BAND_KIND,
  NEW_BASE_GOAL_BAND_PLACEMENT,
  createNewBaseGoalBand,
} from "../browser/new-base-goal-band-core.mjs";

test("creates one immutable GOAL-band descriptor above Shields", () => {
  const band = createNewBaseGoalBand({ bandId: "NEW_BASE_GOAL_BAND" });

  assert.equal(NEW_BASE_GOAL_BAND_KIND, "GOAL_BAND");
  assert.equal(NEW_BASE_GOAL_BAND_PLACEMENT, "ABOVE_SHIELDS");
  assert.deepEqual(band, {
    bandId: "NEW_BASE_GOAL_BAND",
    kind: "GOAL_BAND",
    placement: "ABOVE_SHIELDS",
  });
  assert.equal(Object.isFrozen(band), true);
});

test("keeps GOAL identity caller-owned and deterministic", () => {
  const first = createNewBaseGoalBand({ bandId: "goal-band:alpha" });
  const second = createNewBaseGoalBand({ bandId: "goal-band:alpha" });

  assert.deepEqual(first, second);
  assert.equal(first.bandId, "goal-band:alpha");
});

test("does not invent GOAL positions, ownership, graph, opening, or win semantics", () => {
  const band = createNewBaseGoalBand({ bandId: "GOAL" });

  assert.deepEqual(Object.keys(band).sort(), ["bandId", "kind", "placement"]);
  for (const forbidden of [
    "cellCount",
    "positionIds",
    "goalIds",
    "shieldIds",
    "neighbors",
    "ownerPlayerId",
    "teamId",
    "open",
    "roadComplete",
    "winner",
    "result",
  ]) {
    assert.equal(forbidden in band, false);
  }
});

test("rejects missing, blank, or non-string GOAL band identities", () => {
  assert.throws(() => createNewBaseGoalBand(), /non-empty string/);
  assert.throws(() => createNewBaseGoalBand({ bandId: " " }), /non-empty string/);
  assert.throws(() => createNewBaseGoalBand({ bandId: 7 }), /non-empty string/);
});
