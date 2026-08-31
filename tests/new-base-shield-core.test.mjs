import test from "node:test";
import assert from "node:assert/strict";

import {
  NEW_BASE_PARTICIPANT_COUNT,
  NEW_BASE_SHIELD_COUNT,
  NEW_BASE_SHIELDS_PER_PARTICIPANT,
  createNewBaseShieldAnchors,
} from "../browser/new-base-shield-core.mjs";

const participants = () => [
  { id: "P1", team: "TEAM_A", label: "ignored presentation label" },
  { id: "P2", team: "TEAM_B" },
  { id: "P3", team: "TEAM_A" },
  { id: "P4", team: "TEAM_B" },
];

test("creates exactly four participant identities x three Shield anchors", () => {
  const out = createNewBaseShieldAnchors({ participants: participants() });

  assert.equal(NEW_BASE_PARTICIPANT_COUNT, 4);
  assert.equal(NEW_BASE_SHIELDS_PER_PARTICIPANT, 3);
  assert.equal(NEW_BASE_SHIELD_COUNT, 12);
  assert.equal(out.participants.length, 4);
  assert.equal(out.shields.length, 12);
  assert.equal(out.shieldIds.length, 12);
  assert.equal(new Set(out.shieldIds).size, 12);

  assert.deepEqual(out.shieldIds, [
    "SHIELD:P1:1", "SHIELD:P1:2", "SHIELD:P1:3",
    "SHIELD:P2:1", "SHIELD:P2:2", "SHIELD:P2:3",
    "SHIELD:P3:1", "SHIELD:P3:2", "SHIELD:P3:3",
    "SHIELD:P4:1", "SHIELD:P4:2", "SHIELD:P4:3",
  ]);

  for (const [participantIndex, row] of out.participants.entries()) {
    assert.equal(row.participantIndex, participantIndex);
    assert.equal(row.participantId, `P${participantIndex + 1}`);
    assert.equal(row.shieldIds.length, 3);
  }
  assert.deepEqual(out.shields.map((shield) => shield.shieldIndex), [
    1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3,
  ]);
});

test("preserves caller participant and team identity without deriving team topology", () => {
  const input = [
    { id: "north", team: "alpha" },
    { id: "east" },
    { id: "south", team: "alpha" },
    { id: "west", team: "solo-tag" },
  ];
  const out = createNewBaseShieldAnchors({ participants: input });

  assert.deepEqual(
    out.participants.map(({ participantId, team }) => ({ participantId, team })),
    [
      { participantId: "north", team: "alpha" },
      { participantId: "east", team: null },
      { participantId: "south", team: "alpha" },
      { participantId: "west", team: "solo-tag" },
    ],
  );
  assert.equal(out.shields[3].participantId, "east");
  assert.equal(out.shields[3].team, null);
});

test("emits the exact opaque Shield-id boundary required by the 12x7 Road consumer", () => {
  const out = createNewBaseShieldAnchors({ participants: participants() });

  assert.equal(out.shieldIds.length, 12);
  assert.equal(new Set(out.shieldIds).size, 12);
  for (const shieldId of out.shieldIds) {
    assert.equal(typeof shieldId, "string");
    assert.notEqual(shieldId.trim(), "");
  }
});

test("supports a caller-owned Shield id factory and percent-encodes default participant identity", () => {
  const encoded = createNewBaseShieldAnchors({
    participants: [
      { id: "P 1" },
      { id: "P/2" },
      { id: "P?3" },
      { id: "P#4" },
    ],
  });
  assert.equal(encoded.shieldIds[0], "SHIELD:P%201:1");
  assert.equal(encoded.shieldIds[3], "SHIELD:P%2F2:1");

  const custom = createNewBaseShieldAnchors({
    participants: participants(),
    makeShieldId: ({ participantId, shieldIndex }) => `${participantId}/SHIELD/${shieldIndex}`,
  });
  assert.equal(custom.shieldIds[7], "P3/SHIELD/2");
});

test("does not add Shield gameplay, topology, Road, GOAL, FIELD, or win semantics", () => {
  const out = createNewBaseShieldAnchors({ participants: participants() });
  const forbidden = [
    "cardId",
    "shieldState",
    "active",
    "hp",
    "neighbors",
    "roadSlots",
    "goal",
    "field",
    "complete",
    "winner",
  ];

  for (const shield of out.shields) {
    for (const key of forbidden) assert.equal(key in shield, false, key);
  }
  for (const row of out.participants) {
    for (const key of forbidden) assert.equal(key in row, false, key);
  }
});

test("rejects non-four, malformed, duplicate, or non-canonical participant identity", () => {
  assert.throws(
    () => createNewBaseShieldAnchors({ participants: participants().slice(0, 3) }),
    /exactly 4/,
  );
  assert.throws(
    () => createNewBaseShieldAnchors({ participants: [...participants(), { id: "P5" }] }),
    /exactly 4/,
  );

  const duplicate = participants();
  duplicate[3] = { id: "P1", team: "TEAM_B" };
  assert.throws(() => createNewBaseShieldAnchors({ participants: duplicate }), /duplicate participant id/);

  const blank = participants();
  blank[0] = { id: "" };
  assert.throws(() => createNewBaseShieldAnchors({ participants: blank }), /canonical string/);

  const padded = participants();
  padded[0] = { id: " P1" };
  assert.throws(() => createNewBaseShieldAnchors({ participants: padded }), /canonical string/);

  const invalidTeam = participants();
  invalidTeam[0] = { id: "P1", team: " " };
  assert.throws(() => createNewBaseShieldAnchors({ participants: invalidTeam }), /canonical string/);
});

test("rejects invalid or duplicate caller-owned Shield ids", () => {
  assert.throws(
    () => createNewBaseShieldAnchors({ participants: participants(), makeShieldId: null }),
    /makeShieldId must be a function/,
  );
  assert.throws(
    () => createNewBaseShieldAnchors({ participants: participants(), makeShieldId: () => "" }),
    /non-empty string/,
  );
  assert.throws(
    () => createNewBaseShieldAnchors({ participants: participants(), makeShieldId: () => "same" }),
    /duplicate Shield id/,
  );
});

test("returns immutable structural data", () => {
  const out = createNewBaseShieldAnchors({ participants: participants() });
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.shieldIds), true);
  assert.equal(Object.isFrozen(out.shields), true);
  assert.equal(Object.isFrozen(out.participants), true);
  assert.equal(Object.isFrozen(out.shields[0]), true);
  assert.equal(Object.isFrozen(out.participants[0]), true);
  assert.equal(Object.isFrozen(out.participants[0].shieldIds), true);
});
